// Hand-rolled SVG charts (no chart library). Server-renderable; each has a text alternative (legend/values or <title>s).
import { formatMoney, formatShort } from "@/lib/format";
import { t } from "@/lib/i18n";

export interface Slice { label: string; value: number; color: string }

export function Donut({ items }: { items: Slice[] }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  const R = 62, C = 2 * Math.PI * R;
  // start of each arc = sum of the lengths before it
  const arcs = items.map((i) => (total > 0 ? (i.value / total) * C : 0));
  const starts = arcs.map((_, k) => arcs.slice(0, k).reduce((a, b) => a + b, 0));
  return (
    <svg className="donut" viewBox="0 0 176 176" role="img" aria-label={t("chart.allocation")}>
      <circle cx="88" cy="88" r={R} fill="none" stroke="var(--surface2)" strokeWidth="26" />
      {items.map((i, k) => (
        <circle key={i.label + i.color} cx="88" cy="88" r={R} fill="none" stroke={i.color} strokeWidth="26"
          strokeDasharray={`${arcs[k]} ${C - arcs[k]}`} strokeDashoffset={-starts[k]} transform="rotate(-90 88 88)">
          <title>{`${i.label} ${formatMoney(i.value)}`}</title>
        </circle>
      ))}
      <text x="88" y="84" textAnchor="middle" fontSize="11" fill="var(--muted)">{t("chart.total")}</text>
      <text x="88" y="102" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink)" fontFamily="var(--font-num)">{formatShort(total)} €</text>
    </svg>
  );
}

const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
};

export interface LineSeries { color: string; points: number[]; area?: boolean; dash?: boolean }

export function LineChart({ labels, series, aria }: { labels: string[]; series: LineSeries[]; aria: string }) {
  const w = 640, h = 240, L = 46, B = 26, T = 10, R = 12, n = labels.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.points)) * 1.05);
  const X = (i: number) => (n === 1 ? L + (w - L - R) / 2 : L + (i * (w - L - R)) / (n - 1));
  const Y = (v: number) => T + (h - T - B) * (1 - v / max);
  const step = Math.max(1, Math.ceil(n / 8));
  return (
    <div className="chart-line">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={aria}>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max * k) / 4;
          return (
            <g key={k}>
              <line x1={L} x2={w - R} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
              <text x={L - 6} y={Y(v) + 4} textAnchor="end" fontSize="11" fill="var(--muted)" fontFamily="var(--font-num)">{formatShort(v)}</text>
            </g>
          );
        })}
        {labels.map((lb, i) => (i % step === 0 || i === n - 1) && (
          <text key={i} x={X(i)} y={h - 7} fontSize="11" fill="var(--muted)" textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>{lb}</text>
        ))}
        {series.map((s, si) => {
          const pts = s.points.map((v, i) => [X(i), Y(v)]);
          const poly = pts.map((p) => p.join(",")).join(" ");
          return (
            <g key={si}>
              {s.area && pts.length > 1 && <path d={`M${pts[0][0]},${Y(0)} L${pts.map((p) => p.join(",")).join(" L")} L${pts[pts.length - 1][0]},${Y(0)} Z`} fill={s.color} opacity=".14" />}
              {pts.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeDasharray={s.dash ? "5 4" : undefined} points={poly} />}
              {!s.dash && pts.map((p, i) => (n <= 14 || i === pts.length - 1) && (
                <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 4.5 : 3} fill={s.color} stroke={i === pts.length - 1 ? "var(--surface)" : undefined} strokeWidth="2">
                  <title>{`${labels[i]}: ${formatMoney(s.points[i])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
