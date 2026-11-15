import Anthropic from "@anthropic-ai/sdk";

/**
 * GET  /api/chat                   { enabled } - whether Ask is configured on this site
 * POST /api/chat { region, question, history? }  an answer built only from the site's own data files
 *
 * Tools read the same JSON the app draws from. The key stays on the server.
 */

const MODEL = process.env.LLM_MODEL || "claude-opus-5-5";
const MAX_TOKENS = 2000;
const MAX_ROUNDS = 6;
const MAX_QUESTION = 500;
const MAX_HISTORY = 6;
/** Questions per address per window, per running instance. */
const RATE = { limit: 12, windowMs: 10 * 60_000 };

const VIEW_OF_TOOL: Record<string, string> = {
  get_monthly: "calendar",
  get_month_status: "month",
  get_season_clock: "season",
  get_validation: "evidence",
};

const SYSTEM = `You answer questions about Overpass, a record of monthly fire activity built from NASA FIRMS satellite detections.
The unit is the fire-day: one 0.25° grid cell on one local solar date with at least one fire detection. Months measured by S-NPP VIIRS have no interval. Months from Terra or Aqua MODIS (before February 2012) and from NOAA-20 VIIRS (from November 2026) are translated into S-NPP fire-days and carry a 90% interval.

Rules:
- Use only numbers that appear in tool results. Never estimate, round loosely or fill gaps from general knowledge. If the tools do not hold the answer, say so.
- When you give a value, give its interval when there is one and say which satellite it comes from, measured or translated.
- Name the view that shows the answer: Calendar, This month, Season, Evidence or Scenes.
- Do not make forecasts of your own. The record holds a tested forecast for the month after the current one only where it beat the normal month; report that one as it is, with its range, or say none is shown.
- Do not give safety instructions or say whether anyone is in danger. For that, point to local fire authorities.
- Answer in two to five plain sentences. No headings, lists, emoji or exclamation marks.`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "list_regions",
    description: "The prepared regions: id, name, bounding box and the months the record covers.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_monthly",
    description: "Monthly harmonized fire-days for a region between two months (at most 120 months), with interval, source satellite and the count that satellite recorded. Also yearly totals for full years and the median of each calendar month.",
    input_schema: {
      type: "object",
      properties: {
        region: { type: "string", description: "Region id from list_regions" },
        from: { type: "string", description: "First month, YYYY-MM" },
        to: { type: "string", description: "Last month, YYYY-MM" },
      },
      required: ["region", "from", "to"],
      additionalProperties: false,
    },
  },
  {
    name: "get_month_status",
    description: "The current month so far against the same days of every past same-month, and the fire year so far against past fire years. Includes the tested forecast for the next month if one is shown.",
    input_schema: {
      type: "object",
      properties: { region: { type: "string" } },
      required: ["region"],
      additionalProperties: false,
    },
  },
  {
    name: "get_season_clock",
    description: "Fire-season timing per fire year (onset, peak and end as day of the fire year) and their trends, including the Aqua-only control.",
    input_schema: {
      type: "object",
      properties: { region: { type: "string" } },
      required: ["region"],
      additionalProperties: false,
    },
  },
  {
    name: "get_validation",
    description: "How well the translation between satellites was tested: model choice and errors, hold-out tests, interval coverage, the step at each satellite change, Aqua drift, forecast skill, and the list of caveats.",
    input_schema: {
      type: "object",
      properties: { region: { type: "string" } },
      required: ["region"],
      additionalProperties: false,
    },
  },
];

type Json = Record<string, unknown>;
type MonthRow = { ym: string; harmonized: number; lo: number; hi: number; source: string; partial: boolean; raw: Record<string, number | null>; median: number | null };

const seen = new Map<string, number[]>();

function limited(address: string): boolean {
  const now = Date.now();
  const recent = (seen.get(address) ?? []).filter((t) => now - t < RATE.windowMs);
  recent.push(now);
  seen.set(address, recent);
  return recent.length > RATE.limit;
}

async function site<T>(origin: string, path: string): Promise<T> {
  const res = await fetch(`${origin}${path}`);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  return (await res.json()) as T;
}

const sat = (source: string) => (source === "snpp" ? "snpp" : source.replace("-translated", ""));
const round = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

export async function runTool(origin: string, name: string, input: Json): Promise<unknown> {
  const region = String(input.region ?? "");
  if (name !== "list_regions" && !/^[a-z0-9_]+$/.test(region)) throw new Error("Unknown region id.");
  switch (name) {
    case "list_regions": {
      const regions = await site<Json[]>(origin, "/data/regions.json");
      return regions.map((r) => ({ id: r.id, name: r.name, bbox: r.bbox }));
    }
    case "get_monthly": {
      const monthly = await site<{ months: MonthRow[]; normals: (number | null)[] }>(origin, `/data/${region}/monthly.json`);
      const from = String(input.from ?? ""), to = String(input.to ?? "");
      const rows = monthly.months.filter((m) => m.ym >= from && m.ym <= to).slice(0, 120);
      const years = new Map<string, { total: number; months: number }>();
      for (const m of monthly.months) {
        if (m.partial) continue;
        const y = years.get(m.ym.slice(0, 4)) ?? { total: 0, months: 0 };
        years.set(m.ym.slice(0, 4), { total: y.total + m.harmonized, months: y.months + 1 });
      }
      return {
        recordStarts: monthly.months[0].ym, recordEnds: monthly.months[monthly.months.length - 1].ym,
        months: rows.map((m) => ({
          ym: m.ym, harmonized: round(m.harmonized), lo: round(m.lo), hi: round(m.hi), partial: m.partial,
          source: m.source, recordedBySourceSatellite: m.raw[sat(m.source)], medianOfPastSameMonths: round(m.median),
        })),
        fullYearTotals: [...years].filter(([, y]) => y.months === 12).map(([year, y]) => ({ year, total: round(y.total) })),
        calendarMonthMedians: monthly.normals.map(round),
      };
    }
    case "get_month_status": {
      const [current, mtd, season, forecast] = await Promise.all([
        fetch(`${origin}/api/firms?region=${region}`).then((r) => (r.ok ? r.json() : site(origin, `/data/current/${region}.json`))),
        site<{ byMonth: Record<string, Record<string, number[]>> }>(origin, `/data/${region}/mtd.json`),
        site<{ fireYearStartMonth: number; years: Record<string, number[]>; envelope: Record<string, number[]> }>(origin, `/data/${region}/season.json`),
        site<Json>(origin, `/data/${region}/forecast.json`),
      ]) as [Json, { byMonth: Record<string, Record<string, number[]>> }, { fireYearStartMonth: number; years: Record<string, number[]>; envelope: Record<string, number[]> }, Json];
      const ym = String(current.ym), day = Number(current.day), year = Number(ym.slice(0, 4));
      const past = Object.entries(mtd.byMonth[String(Number(ym.slice(5)))] ?? {})
        .filter(([y, days]) => Number(y) < year && days.length >= day)
        .map(([y, days]) => ({ year: Number(y), byThisDay: round(days[day - 1]), wholeMonth: round(days[days.length - 1]) }));
      const fireYears = Object.keys(season.years).map(Number);
      const thisFireYear = season.years[String(Math.max(...fireYears))] ?? [];
      const d = Math.min(thisFireYear.length, 365) - 1;
      return {
        current: { ...current, harmonizedToDate: round(Number(current.harmonizedToDate)) },
        pastSameMonths: past,
        fireYear: {
          startMonth: season.fireYearStartMonth, daysSoFar: thisFireYear.length, totalSoFar: round(thisFireYear[thisFireYear.length - 1] ?? null),
          pastYearsAtThisDate: Object.fromEntries(Object.entries(season.envelope).map(([k, v]) => [k, round(v[d])])),
        },
        forecast: forecast.shown ? forecast.next : { shown: false, skill: forecast.skill },
      };
    }
    case "get_season_clock":
      return site(origin, `/data/${region}/clock.json`);
    case "get_validation": {
      const [v, forecast] = await Promise.all([site<Json>(origin, `/data/${region}/validation.json`), site<Json>(origin, `/data/${region}/forecast.json`)]);
      const strip = ({ points: _points, ...rest }: Json) => rest;
      return {
        ...v,
        forward: strip(v.forward as Json), backward: strip(v.backward as Json), handoff: strip(v.handoff as Json),
        forecastSkill: forecast.skill, forecastShown: forecast.shown,
      };
    }
    default:
      throw new Error(`No tool named ${name}.`);
  }
}

interface Body {
  region?: unknown;
  question?: unknown;
  history?: unknown;
}

export async function GET(): Promise<Response> {
  return Response.json({ enabled: Boolean(process.env.LLM_API_KEY) });
}

export async function POST(request: Request): Promise<Response> {
  const key = process.env.LLM_API_KEY;
  if (!key) return new Response("Ask is not configured on this site.", { status: 503 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (limited(address)) return new Response("Too many questions from this address. Try again in a few minutes.", { status: 429 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response("Send JSON with region and question.", { status: 400 });
  }
  const region = typeof body.region === "string" ? body.region : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!/^[a-z0-9_]+$/.test(region) || !question) return new Response("Send JSON with region and question.", { status: 400 });
  if (question.length > MAX_QUESTION) return new Response(`Keep questions under ${MAX_QUESTION} characters.`, { status: 400 });
  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((t): t is { role: "user" | "assistant"; text: string } =>
      typeof t === "object" && t != null && (t.role === "user" || t.role === "assistant") && typeof t.text === "string")
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, content: t.text.slice(0, 2000) }));

  const origin = new URL(request.url).origin;
  const client = new Anthropic({ apiKey: key });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: "user", content: `The region open in the app is "${region}". Question: ${question}` },
  ];
  const used = new Set<string>();

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        tools: TOOLS,
        messages,
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (response.stop_reason === "refusal") {
        return Response.json({ answer: "Ask cannot answer that question. The views and the Methods drawer hold everything in the record.", views: [] });
      }
      const calls = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || !calls.length) {
        const answer = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
        return Response.json({ answer: answer || "Ask did not find an answer in the record.", views: [...used] });
      }
      messages.push({ role: "assistant", content: response.content });
      const results = await Promise.all(calls.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        try {
          const out = await runTool(origin, call.name, call.input as Json);
          if (VIEW_OF_TOOL[call.name]) used.add(VIEW_OF_TOOL[call.name]);
          return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out) };
        } catch (e) {
          return { type: "tool_result", tool_use_id: call.id, content: e instanceof Error ? e.message : "The tool failed.", is_error: true };
        }
      }));
      messages.push({ role: "user", content: results });
    }
    return Response.json({ answer: "Ask needed too many steps for that question. Try asking about one thing at a time.", views: [...used] });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return new Response("Ask is busy. Try again in a minute.", { status: 503 });
    if (e instanceof Anthropic.APIError) return new Response(`Ask could not reach the model (${e.status ?? "no status"}).`, { status: 502 });
    return new Response("Ask failed while reading the record.", { status: 500 });
  }
}
