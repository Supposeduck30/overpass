import type { ReactNode } from "react";
import "./Finding.css";

interface Props {
  /** The view's one finding, written from the data. */
  children: ReactNode;
  /** One line on how to read the chart below. */
  how: ReactNode;
  level?: "h1" | "h2";
  title?: string;
}

export function Finding({ children, how, level = "h1", title }: Props) {
  const Tag = level;
  return (
    <header className="finding">
      {title ? (
        <>
          <Tag className="finding-title">{title}</Tag>
          <p className="finding-sentence">{children}</p>
        </>
      ) : <Tag className="finding-sentence">{children}</Tag>}
      <details className="finding-how">
        <summary>How to read this</summary>
        <p>{how}</p>
      </details>
    </header>
  );
}

/** Stands in for a view while its files load, at the same height so nothing jumps. */
export function Waiting({ what, error }: { what: string; error?: string }) {
  return (
    <div className="waiting" role={error ? "alert" : "status"}>
      {error ? (
        <>
          <p className="finding-sentence">{what} could not be shown.</p>
          <p>{error}</p>
        </>
      ) : (
        <p className="fine">Loading {what.toLowerCase()}</p>
      )}
    </div>
  );
}
