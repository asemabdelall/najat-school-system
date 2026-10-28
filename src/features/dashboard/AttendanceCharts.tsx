import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts';
import { formatNumber, formatPercent, formatShortDate, formatWeekday } from '@/lib/format';

export type TrendRow = { day: string; present: number; late: number; absent: number; excused: number; rate: number | null };

const axis = { stroke: 'var(--chart-axis)', fontSize: 11, fontFamily: 'inherit' };
const SERIES = [
  { key: 'absent', label: 'غياب', color: 'var(--chart-absent)' },
  { key: 'late', label: 'تأخر', color: 'var(--chart-late)' },
  { key: 'excused', label: 'غياب بعذر', color: 'var(--chart-excused)' },
] as const;

function TooltipBox({ active, payload, label, rate }: Partial<TooltipContentProps<number, string>> & { rate?: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as TrendRow;
  return (
    <div className="rounded-md border border-line bg-surface-raised px-3 py-2 text-xs shadow-md" dir="rtl">
      <p className="mb-1 font-bold text-fg">{formatWeekday(String(label))} {formatShortDate(String(label))}</p>
      {rate ? (
        <p className="text-fg">نسبة الحضور: <span className="tabular font-bold">{formatPercent(row.rate)}</span></p>
      ) : (
        SERIES.map((s) => (
          <p key={s.key} className="flex items-center gap-2 text-fg">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}: <span className="tabular font-bold">{formatNumber(row[s.key])}</span>
          </p>
        ))
      )}
      <p className="mt-1 text-fg-muted">المرصود: {formatNumber(row.present + row.late + row.absent + row.excused)}</p>
    </div>
  );
}

/** Single-series line: attendance rate per day (time flows right→left in RTL). */
export function RateChart({ data }: { data: TrendRow[] }) {
  return (
    <div className="h-56" role="img" aria-label="منحنى نسبة الحضور اليومية">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" reversed tickFormatter={(d: string) => formatShortDate(d)} tick={axis} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} minTickGap={16} />
          <YAxis orientation="right" domain={[(min: number) => Math.max(0, Math.floor(min / 5) * 5 - 5), 100]} tickFormatter={(v: number) => `${formatNumber(v)}٪`} tick={axis} tickLine={false} axisLine={false} width={44} />
          <Tooltip content={<TooltipBox rate />} cursor={{ stroke: 'var(--chart-axis)', strokeDasharray: '3 3' }} />
          <Line type="monotone" dataKey="rate" stroke="var(--chart-rate)" strokeWidth={2} dot={false} activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--surface)' }} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Stacked bars of non-present marks per day, with legend (colour is never the only cue). */
export function AbsenceChart({ data }: { data: TrendRow[] }) {
  return (
    <div>
      <ul className="mb-2 flex flex-wrap gap-4 text-xs text-fg-muted" aria-label="مفتاح الألوان">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.label}</li>
        ))}
      </ul>
      <div className="h-52" role="img" aria-label="أعمدة الغياب والتأخر اليومية">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis dataKey="day" reversed tickFormatter={(d: string) => formatShortDate(d)} tick={axis} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} minTickGap={16} />
            <YAxis orientation="right" allowDecimals={false} tickFormatter={(v: number) => formatNumber(v)} tick={axis} tickLine={false} axisLine={false} width={36} />
            <Tooltip content={<TooltipBox />} cursor={{ fill: 'var(--surface-hover)' }} />
            {SERIES.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="var(--surface)" strokeWidth={1} radius={i === SERIES.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
