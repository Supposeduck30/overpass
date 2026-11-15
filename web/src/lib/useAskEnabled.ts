import { useEffect, useState } from "react";

let enabled: Promise<boolean> | null = null;

/** Whether this site has Ask configured. Off in local development, where no serverless function runs. */
export function useAskEnabled(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    enabled ??= fetch("/api/chat")
      .then(async (r) => r.ok && (r.headers.get("content-type") ?? "").includes("json") && Boolean(((await r.json()) as { enabled?: boolean }).enabled))
      .catch(() => false);
    let live = true;
    enabled.then((v) => live && setOn(v));
    return () => {
      live = false;
    };
  }, []);
  return on;
}
