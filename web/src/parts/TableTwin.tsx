import { useMemo, useState } from "react";
import "./TableTwin.css";

export interface Column<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null;
  format?: (row: T) => string;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  /** Start collapsed behind a "Show table" control. */
  collapsible?: boolean;
  maxHeight?: number;
}

/** The table twin every chart has: same numbers, sortable, readable by a screen reader. */
export function TableTwin<T>({ caption, columns, rows, collapsible = false, maxHeight = 420 }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState(!collapsible);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const x = col.value(a);
      const y = col.value(b);
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, columns, sort]);

  const table = (
    <div className="table-twin-scroll" style={{ maxHeight }} tabIndex={0} role="region" aria-label={caption}>
      <table className="data">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const dir = sort?.key === c.key ? sort.dir : 0;
              return (
                <th key={c.key} scope="col" aria-sort={dir === 1 ? "ascending" : dir === -1 ? "descending" : "none"}>
                  <button type="button" onClick={() => setSort({ key: c.key, dir: dir === 1 ? -1 : 1 })}>
                    {c.label}
                    <span className="table-twin-dir">{dir === 1 ? " (low first)" : dir === -1 ? " (high first)" : ""}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const v = c.value(row);
                return <td key={c.key} className={typeof v === "number" ? "telemetry" : undefined}>{c.format ? c.format(row) : v == null ? "" : String(v)}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (!collapsible) return table;
  return (
    <div className="table-twin">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide table" : "Show table"}
      </button>
      {open && table}
    </div>
  );
}
