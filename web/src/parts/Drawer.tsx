import { useEffect, useRef, type ReactNode } from "react";
import "./Drawer.css";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "side" is a right-hand drawer; "sheet" is a wide panel for the map. Both are bottom sheets on a phone. */
  kind?: "side" | "sheet";
}

export function Drawer({ title, onClose, children, kind = "side" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    opener.current = document.activeElement;
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => (opener.current as HTMLElement | null)?.focus?.();
  }, []);

  return (
    <>
      <div className="drawer-scrim" onClick={onClose} />
      <div ref={ref} className={`drawer drawer-${kind}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}
