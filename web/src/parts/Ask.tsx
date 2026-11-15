import { useState } from "react";
import { useData } from "../data/context";
import { useUrl, type View } from "../state/url";
import "./Ask.css";

const VIEW_NAMES: Record<string, string> = { calendar: "Calendar", month: "This month", season: "Season", evidence: "Evidence" };

interface Turn {
  question: string;
  answer: string | null;
  views: string[];
  error?: string;
}

export function Ask() {
  const { region } = useData();
  const [, setUrl] = useUrl();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const busy = turns.some((t) => t.answer == null && !t.error);

  const send = async () => {
    const question = draft.trim();
    if (!question || busy) return;
    setDraft("");
    const history = turns.filter((t) => t.answer).flatMap((t) => [{ role: "user", text: t.question }, { role: "assistant", text: t.answer! }]);
    setTurns((all) => [...all, { question, answer: null, views: [] }]);
    const settle = (patch: Partial<Turn>) => setTurns((all) => all.map((t, i) => (i === all.length - 1 ? { ...t, ...patch } : t)));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ region: region.id, question, history }),
      });
      if (!res.ok) return settle({ error: (await res.text()) || `Ask answered ${res.status}.` });
      const out = (await res.json()) as { answer: string; views: string[] };
      settle({ answer: out.answer, views: out.views });
    } catch {
      settle({ error: "Ask could not be reached. Check the connection and try again." });
    }
  };

  return (
    <div className="ask">
      <p className="fine">
        Ask answers from the same files the views draw, for {region.name}. It does not forecast and does not give safety advice; for that, follow local fire authorities.
      </p>
      <ol className="ask-turns" aria-live="polite">
        {turns.map((t, i) => (
          <li key={i}>
            <p className="ask-question">{t.question}</p>
            {t.error ? (
              <p role="alert">{t.error}</p>
            ) : t.answer == null ? (
              <p className="fine">Reading the record.</p>
            ) : (
              <div className="ask-answer">
                <p className="ask-label">AI-generated answer</p>
                <p>{t.answer}</p>
                {t.views.map((v) => (
                  <button key={v} type="button" className="btn btn-quiet" onClick={() => setUrl({ v: v as View, panel: null })}>
                    Show the data in {VIEW_NAMES[v] ?? v}
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
      <form className="ask-form" onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}>
        <label>
          <span className="label">Your question</span>
          <textarea className="field" rows={3} maxLength={500} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder="Which year burned most, and how sure is that number?" />
        </label>
        <button type="submit" className="btn" disabled={busy || !draft.trim()}>{busy ? "Asking" : "Ask"}</button>
      </form>
    </div>
  );
}
