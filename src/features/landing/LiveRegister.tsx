import * as React from 'react';
import { AnimatePresence, m } from 'motion/react';
import { Check, Clock, FileText, Lock, RotateCcw, X } from 'lucide-react';
import { formatNumber } from '@/lib/format';

/**
 * The hero's live thing: a working miniature of the real attendance sheet,
 * with the system's real rules (unmarked is not absent; the sheet cannot be
 * submitted until every student is marked). Fictional names, no network.
 */
type Status = 'present' | 'absent' | 'late' | 'excused';
const STATUSES: { id: Status; label: string; Icon: typeof Check }[] = [
  { id: 'present', label: 'حاضر', Icon: Check },
  { id: 'absent', label: 'غائب', Icon: X },
  { id: 'late', label: 'متأخر', Icon: Clock },
  { id: 'excused', label: 'بعذر', Icon: FileText },
];
const STUDENTS = ['أحمد هاني المرجان', 'إبراهيم باسم البيان', 'بدر سامي الساحل', 'جاسم نبيل الضياء', 'حسين وليد الهدى', 'خالد هاني المرجان'];
const EXPO = [0.16, 1, 0.3, 1] as const;

export function LiveRegister() {
  const [marks, setMarks] = React.useState<Record<number, Status>>({ 0: 'present', 2: 'late' });
  const [submitted, setSubmitted] = React.useState(false);
  const marked = Object.keys(marks).length;
  const left = STUDENTS.length - marked;
  const count = (s: Status) => Object.values(marks).filter((v) => v === s).length;

  const restPresent = () =>
    setMarks((prev) => {
      const next = { ...prev };
      STUDENTS.forEach((_, i) => (next[i] ??= 'present'));
      return next;
    });

  return (
    <div className="lp-reg" data-ui aria-label="كشف حضور تجريبي يمكنك تجربته">
      <div className="lp-reg-head">
        <div>
          <p className="lp-reg-title">فصل 10/1</p>
          <p className="lp-reg-sub">كشف تجريبي · الحضور اليومي</p>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span
            key={submitted ? 'done' : left ? 'part' : 'ready'}
            className="lp-reg-state"
            data-tone={submitted ? 'done' : left ? 'part' : 'ready'}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: EXPO }}
          >
            {submitted ? <><Lock aria-hidden /> معتمد</> : left ? `لم يُرصد ${formatNumber(left)}` : 'جاهز للاعتماد'}
          </m.span>
        </AnimatePresence>
      </div>

      <dl className="lp-reg-counts" aria-live="polite">
        {STATUSES.map((s) => (
          <div key={s.id}>
            <dt>{s.label}</dt>
            <dd>{formatNumber(count(s.id))}</dd>
          </div>
        ))}
      </dl>
      <div className="lp-reg-bar" aria-hidden>
        <m.span animate={{ scaleX: marked / STUDENTS.length }} transition={{ type: 'spring', stiffness: 260, damping: 32 }} />
      </div>

      <ol className="lp-reg-list">
        {STUDENTS.map((name, i) => (
          <m.li
            key={name}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EXPO, delay: 0.45 + i * 0.07 }}
          >
            <span className="lp-reg-name">{name}</span>
            <div role="radiogroup" aria-label={`حالة ${name}`} className="lp-reg-chips">
              {STATUSES.map(({ id, label, Icon }) => {
                const on = marks[i] === id;
                return (
                  <m.button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={submitted}
                    data-status={id}
                    whileTap={submitted ? undefined : { scale: 0.93 }}
                    onClick={() => setMarks((prev) => ({ ...prev, [i]: id }))}
                  >
                    {on && <m.span layoutId={`lp-chip-${i}`} className="lp-chip-fill" transition={{ type: 'spring', stiffness: 520, damping: 38 }} aria-hidden />}
                    <Icon aria-hidden />
                    <span>{label}</span>
                  </m.button>
                );
              })}
            </div>
          </m.li>
        ))}
      </ol>

      <div className="lp-reg-foot">
        {submitted ? (
          <>
            <p>اعتُمد الكشف. أي تعديل الآن يُحفظ كتصحيح موثّق بسببه.</p>
            <button
              type="button"
              className="lp-reg-link"
              onClick={() => {
                setSubmitted(false);
                setMarks({});
              }}
            >
              <RotateCcw aria-hidden /> جرّب من جديد
            </button>
          </>
        ) : (
          <>
            <p>{left ? 'الطالب غير المرصود لا يُحتسب غائبًا، ولا يُعتمد الكشف قبل رصد الجميع.' : 'اكتمل الرصد. يمكنك اعتماد الكشف.'}</p>
            <div className="lp-reg-actions">
              <m.button type="button" className="lp-btn lp-btn-quiet" whileTap={{ scale: 0.97 }} onClick={restPresent} disabled={!left}>
                تحديد الباقين حاضرين
              </m.button>
              <m.button type="button" className="lp-btn lp-btn-ink" whileTap={{ scale: 0.97 }} disabled={left > 0} onClick={() => setSubmitted(true)}>
                اعتماد الكشف
              </m.button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
