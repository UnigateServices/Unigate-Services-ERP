'use client';

export type ChartType =
  | 'bar'
  | 'groupedBar'
  | 'stackedBar'
  | 'horizontalBar'
  | 'line'
  | 'area'
  | 'pie'
  | 'doughnut';

export type ReportChart = {
  id: string;
  title: string;
  type: ChartType;
  labels: string[];
  series: { name: string; values: number[] }[];
  unit?: string;
};

const PALETTE = ['#7D9BA1', '#C4A35A', '#C45C4A', '#DECFB0', '#5F8F7A', '#8B6B4A', '#4A6B8B', '#A67C52'];

function maxAbs(series: { values: number[] }[]) {
  let max = 1;
  for (const row of series) {
    for (const value of row.values) max = Math.max(max, Math.abs(value));
  }
  return max || 1;
}

function fmt(value: number) {
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function ReportChartCard({ chart }: { chart: ReportChart }) {
  const empty = !chart.labels.length || chart.series.every((row) => row.values.every((value) => !value));
  return (
    <article className="rpt-chart-card">
      <header>
        <h3>{chart.title}</h3>
        <span>{typeLabel(chart.type)}</span>
      </header>
      {empty ? <p className="muted">لا بيانات كافية لهذا الرسم.</p> : renderChart(chart)}
    </article>
  );
}

function typeLabel(type: ChartType) {
  if (type === 'line') return 'خط';
  if (type === 'area') return 'مساحي';
  if (type === 'pie') return 'دائري';
  if (type === 'doughnut') return 'حلقي';
  if (type === 'stackedBar') return 'أعمدة مكدّسة';
  if (type === 'groupedBar') return 'أعمدة مجمّعة';
  if (type === 'horizontalBar') return 'أعمدة أفقية';
  return 'أعمدة';
}

function renderChart(chart: ReportChart) {
  if (chart.type === 'pie' || chart.type === 'doughnut') return <PieChart chart={chart} />;
  if (chart.type === 'line' || chart.type === 'area') return <LineChart chart={chart} fill={chart.type === 'area'} />;
  if (chart.type === 'horizontalBar') return <HBarChart chart={chart} />;
  return <VBarChart chart={chart} stacked={chart.type === 'stackedBar'} grouped={chart.type === 'groupedBar' || chart.type === 'bar'} />;
}

function Legend({ series }: { series: { name: string }[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="rpt-legend">
      {series.map((row, index) => (
        <li key={row.name}>
          <i style={{ background: PALETTE[index % PALETTE.length] }} />
          {row.name}
        </li>
      ))}
    </ul>
  );
}

function VBarChart({ chart, stacked, grouped }: { chart: ReportChart; stacked?: boolean; grouped?: boolean }) {
  const w = 520;
  const h = 220;
  const pad = { t: 16, r: 12, b: 48, l: 48 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(chart.labels.length, 1);
  const seriesCount = Math.max(chart.series.length, 1);
  const peak = stacked
    ? Math.max(
        1,
        ...chart.labels.map((_, i) => chart.series.reduce((sum, row) => sum + Math.max(0, row.values[i] || 0), 0)),
      )
    : maxAbs(chart.series);
  const groupW = innerW / n;
  return (
    <div className="rpt-chart-plot" dir="ltr">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={chart.title}>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = pad.t + innerH * (1 - tick);
          return (
            <g key={tick}>
              <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="currentColor" opacity="0.12" />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.7">
                {fmt(peak * tick)}
              </text>
            </g>
          );
        })}
        {chart.labels.map((label, i) => {
          const x0 = pad.l + i * groupW;
          if (stacked) {
            let acc = 0;
            return (
              <g key={label}>
                {chart.series.map((row, s) => {
                  const value = Math.max(0, row.values[i] || 0);
                  const bh = (value / peak) * innerH;
                  const y = pad.t + innerH - acc - bh;
                  acc += bh;
                  return (
                    <rect
                      key={row.name}
                      x={x0 + groupW * 0.2}
                      y={y}
                      width={groupW * 0.6}
                      height={bh}
                      rx="3"
                      fill={PALETTE[s % PALETTE.length]}
                    >
                      <title>{`${row.name}: ${fmt(value)}`}</title>
                    </rect>
                  );
                })}
                <text x={x0 + groupW / 2} y={h - 14} textAnchor="middle" fontSize="10" fill="currentColor">
                  {short(label)}
                </text>
              </g>
            );
          }
          const barW = grouped ? (groupW * 0.7) / seriesCount : groupW * 0.55;
          return (
            <g key={label}>
              {chart.series.map((row, s) => {
                const value = row.values[i] || 0;
                const bh = (Math.abs(value) / peak) * innerH;
                const x = grouped ? x0 + groupW * 0.15 + s * barW : x0 + (groupW - barW) / 2;
                const y = pad.t + innerH - bh;
                return (
                  <rect key={row.name} x={x} y={y} width={barW} height={bh} rx="3" fill={PALETTE[s % PALETTE.length]}>
                    <title>{`${label} — ${row.name}: ${fmt(value)}`}</title>
                  </rect>
                );
              })}
              <text x={x0 + groupW / 2} y={h - 14} textAnchor="middle" fontSize="10" fill="currentColor">
                {short(label)}
              </text>
            </g>
          );
        })}
      </svg>
      <Legend series={chart.series} />
    </div>
  );
}

function HBarChart({ chart }: { chart: ReportChart }) {
  const values = chart.series[0]?.values || [];
  const peak = Math.max(1, ...values.map((value) => Math.abs(value)));
  return (
    <div className="rpt-hbar">
      {chart.labels.map((label, i) => (
        <div key={label} className="rpt-hbar-row">
          <span title={label}>{label}</span>
          <div>
            <b style={{ width: `${(Math.abs(values[i] || 0) / peak) * 100}%` }} />
          </div>
          <em>{fmt(values[i] || 0)}</em>
        </div>
      ))}
    </div>
  );
}

function LineChart({ chart, fill }: { chart: ReportChart; fill?: boolean }) {
  const w = 520;
  const h = 220;
  const pad = { t: 16, r: 12, b: 48, l: 48 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const n = Math.max(chart.labels.length, 1);
  const all = chart.series.flatMap((row) => row.values);
  const min = Math.min(0, ...all);
  const max = Math.max(1, ...all, 0);
  const span = max - min || 1;
  const xAt = (i: number) => pad.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (value: number) => pad.t + innerH - ((value - min) / span) * innerH;
  return (
    <div className="rpt-chart-plot" dir="ltr">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={chart.title}>
        {[0, 0.5, 1].map((tick) => {
          const y = pad.t + innerH * (1 - tick);
          return (
            <g key={tick}>
              <line x1={pad.l} y1={y} x2={w - pad.r} y2={y} stroke="currentColor" opacity="0.12" />
              <text x={pad.l - 8} y={y + 4} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.7">
                {fmt(min + span * tick)}
              </text>
            </g>
          );
        })}
        {chart.series.map((row, s) => {
          const pts = row.values.map((value, i) => `${xAt(i)},${yAt(value)}`).join(' ');
          const area = `${xAt(0)},${pad.t + innerH} ${pts} ${xAt(n - 1)},${pad.t + innerH}`;
          return (
            <g key={row.name}>
              {fill ? <polygon points={area} fill={PALETTE[s % PALETTE.length]} opacity="0.22" /> : null}
              <polyline points={pts} fill="none" stroke={PALETTE[s % PALETTE.length]} strokeWidth="2.4" />
              {row.values.map((value, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(value)} r="3.2" fill={PALETTE[s % PALETTE.length]}>
                  <title>{`${chart.labels[i]} — ${row.name}: ${fmt(value)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {chart.labels.map((label, i) => (
          <text key={label} x={xAt(i)} y={h - 14} textAnchor="middle" fontSize="10" fill="currentColor">
            {short(label)}
          </text>
        ))}
      </svg>
      <Legend series={chart.series} />
    </div>
  );
}

function PieChart({ chart }: { chart: ReportChart }) {
  const values = chart.series[0]?.values || [];
  const total = values.reduce((sum, value) => sum + Math.abs(value), 0) || 1;
  const cx = 90;
  const cy = 90;
  const r = 68;
  const inner = chart.type === 'doughnut' ? 38 : 0;
  let angle = -Math.PI / 2;
  const slices = values.map((value, i) => {
    const slice = (Math.abs(value) / total) * Math.PI * 2;
    const start = angle;
    angle += slice;
    return { start, end: angle, color: PALETTE[i % PALETTE.length], label: chart.labels[i], value };
  });
  return (
    <div className="rpt-pie">
      <svg viewBox="0 0 180 180" role="img" aria-label={chart.title}>
        {slices.map((slice) => (
          <path key={slice.label} d={donutPath(cx, cy, r, inner, slice.start, slice.end)} fill={slice.color}>
            <title>{`${slice.label}: ${fmt(slice.value)}`}</title>
          </path>
        ))}
      </svg>
      <ul className="rpt-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ background: slice.color }} />
            {slice.label} · {fmt(slice.value)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function donutPath(cx: number, cy: number, r: number, inner: number, start: number, end: number) {
  const large = end - start > Math.PI ? 1 : 0;
  const p = (radius: number, a: number) => [cx + radius * Math.cos(a), cy + radius * Math.sin(a)];
  const [x1, y1] = p(r, start);
  const [x2, y2] = p(r, end);
  if (!inner) {
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }
  const [ix1, iy1] = p(inner, end);
  const [ix2, iy2] = p(inner, start);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${inner} ${inner} 0 ${large} 0 ${ix2} ${iy2} Z`;
}

function short(label: string) {
  return label.length > 10 ? `${label.slice(0, 9)}…` : label;
}
