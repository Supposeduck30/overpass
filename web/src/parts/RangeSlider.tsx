import "./RangeSlider.css";

interface Props {
  min: number;
  max: number;
  from: number;
  to: number;
  onChange: (from: number, to: number) => void;
}

/** Two thumbs on one track choosing the first and last year shown. */
export function RangeSlider({ min, max, from, to, onChange }: Props) {
  const pct = (v: number) => ((v - min) / Math.max(1, max - min)) * 100;
  return (
    <div className="range" role="group" aria-label="Years shown">
      <span className="range-end">{from}</span>
      <div className="range-track">
        <div className="range-fill" style={{ left: `${pct(from)}%`, right: `${100 - pct(to)}%` }} />
        <input type="range" min={min} max={max} value={from} aria-label="First year shown"
          onChange={(e) => onChange(Math.min(Number(e.target.value), to), to)} />
        <input type="range" min={min} max={max} value={to} aria-label="Last year shown"
          onChange={(e) => onChange(from, Math.max(Number(e.target.value), from))} />
      </div>
      <span className="range-end">{to}</span>
    </div>
  );
}
