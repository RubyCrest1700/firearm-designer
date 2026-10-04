import { useRef, useState } from 'react';
import { money } from './engine';
import type { Point } from './data/history';

const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/**
 * Price over time as a step line: prices hold until the night they change. Hover or touch shows the
 * price on that day. One series, so no legend; the caption names it.
 */
export function PriceChart({ points, label, height = 56 }: { points: Point[]; label: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return null;
  const W = 300;
  const H = height;
  const pad = { t: 6, b: 4, l: 2, r: 2 };
  const t = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  const t0 = t(points[0][0]);
  const t1 = Math.max(t(points[points.length - 1][0]), t0 + 864e5);
  const prices = points.map(([, p]) => p);
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  if (hi - lo < hi * 0.02) { lo -= hi * 0.01 + 1; hi += hi * 0.01 + 1; } // flat lines sit mid-chart
  const x = (d: string) => pad.l + ((t(d) - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (p: number) => pad.t + (1 - (p - lo) / (hi - lo)) * (H - pad.t - pad.b);
  let d = `M${x(points[0][0])},${y(points[0][1])}`;
  for (let i = 1; i < points.length; i++) d += `H${x(points[i][0])}V${y(points[i][1])}`;

  const first = points[0][1];
  const last = points[points.length - 1][1];
  const trend = last < first ? 'down' : last > first ? 'up' : 'flat';
  const onMove = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const at = t0 + ((clientX - box.left) / box.width) * (t1 - t0);
    let i = 0;
    while (i + 1 < points.length && t(points[i + 1][0]) <= at) i++;
    setHover(i);
  };
  const h = hover !== null ? points[hover] : null;
  return (
    <figure className={'price-chart ' + trend}>
      <figcaption>
        <span>{label}</span>
        <span className="pc-read">{h ? <>{fmtDay(h[0])}: <b>{money(h[1])}</b></> : <>{money(first)} → <b>{money(last)}</b></>}</span>
      </figcaption>
      <div className="pc-plot">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`${label}: ${money(first)} on ${fmtDay(points[0][0])}, ${money(last)} now`}
        onPointerMove={(e) => onMove(e.clientX)} onPointerLeave={() => setHover(null)}>
        <line className="pc-base" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
        <path className="pc-line" d={d} vectorEffect="non-scaling-stroke" />
        {h && <line className="pc-cross" x1={x(h[0])} x2={x(h[0])} y1={pad.t - 4} y2={H - pad.b} vectorEffect="non-scaling-stroke" />}
      </svg>
      <span className="pc-dot" style={{ left: `${(x(points[points.length - 1][0]) / W) * 100}%`, top: `${(y(last) / H) * 100}%` }} aria-hidden="true" />
      </div>
      <div className="pc-axis"><span>{fmtDay(points[0][0])}</span><span>Today</span></div>
    </figure>
  );
}
