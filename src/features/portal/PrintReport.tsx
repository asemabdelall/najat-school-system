import { Logo } from '@/components/layout/Logo';
import { formatDate, formatDateTime, formatNumber, formatPercent, formatWeekday, kuwaitToday } from '@/lib/format';
import { careerLabel } from '@/lib/domain/career';
import { EXCUSE_REASON_LABELS } from '@/lib/domain/attendance';
import { SEVERITY_LABELS } from '@/lib/domain/behavior';
import { DISCIPLINE_TYPE_LABELS, returnDate } from '@/lib/domain/discipline';
import { ATTENDANCE_TONE_TEXT, EXCUSE_STATUS_TEXT, attendanceTone, summarizeDay, type PortalData } from '@/lib/domain/portal';
import { SCHOOL } from './ui';

const th = 'border border-slate-400 bg-slate-100 px-2 py-1 text-start font-bold';
const td = 'border border-slate-400 px-2 py-1 align-top';

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1.5 mt-5 border-b-2 border-slate-800 pb-1 text-[12pt] font-bold text-black">{children}</h2>;
}

/** Formal A4 report, printed from any portal page (screen content is hidden in print). */
export function PrintReport({ d }: { d: PortalData }) {
  const s = d.student;
  const a = d.attendance;
  return (
    <div className="print-only text-[10pt] leading-relaxed text-black" dir="rtl">
      <header className="flex items-center gap-4 border-b-2 border-slate-800 pb-3">
        <Logo className="h-16" />
        <div className="flex-1">
          <p className="text-[14pt] font-bold">{d.school ?? SCHOOL}</p>
          <p className="text-[12pt] font-bold">تقرير الطالب · العام الدراسي {s.year_name}</p>
        </div>
        <p className="text-[9pt]">تاريخ الطباعة: {formatDate(kuwaitToday())}</p>
      </header>

      <H>بيانات الطالب</H>
      <table className="w-full border-collapse">
        <tbody>
          <tr><th className={th}>الاسم</th><td className={td}>{s.full_name}</td><th className={th}>الصف</th><td className={td}>{s.class_name ?? '—'}</td></tr>
          <tr><th className={th}>الرقم الطلابي</th><td className={td}><span className="ltr">{s.student_number}</span></td><th className={th}>الرقم المدني</th><td className={td}><span className="ltr">•••• {s.civil_id_last4}</span></td></tr>
          {(s.guardian_name || s.guardian_phone) && (
            <tr><th className={th}>ولي الأمر</th><td className={td}>{s.guardian_name ?? '—'}</td><th className={th}>هاتف ولي الأمر</th><td className={td}><span className="ltr">{s.guardian_phone ?? '—'}</span></td></tr>
          )}
        </tbody>
      </table>

      <H>الحضور والغياب</H>
      <p className="mb-1.5">نسبة الحضور: <b>{a.rate == null ? '—' : formatPercent(a.rate)}</b> · {ATTENDANCE_TONE_TEXT[attendanceTone(a.rate)]}</p>
      <table className="w-full border-collapse text-center">
        <thead><tr><th className={th}>أيام مرصودة</th><th className={th}>أيام فيها غياب</th><th className={th}>حصص حضور</th><th className={th}>حصص غياب</th><th className={th}>تأخر</th><th className={th}>غياب بعذر</th></tr></thead>
        <tbody><tr>{[a.recorded_days, a.absent_days, a.present, a.absent, a.late, a.excused].map((v, i) => <td key={i} className={td}>{formatNumber(v)}</td>)}</tr></tbody>
      </table>
      {d.days.length > 0 && (
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>اليوم</th><th className={th}>التاريخ</th><th className={th}>التفاصيل</th></tr></thead>
          <tbody>
            {d.days.map((x) => (
              <tr key={x.day}>
                <td className={td}>{formatWeekday(x.day)}</td>
                <td className={td}>{formatDate(x.day)}</td>
                <td className={td}>{summarizeDay(x, formatNumber).map((p) => `${p.status === 'absent' ? 'غياب' : p.status === 'late' ? 'تأخر' : 'غياب بعذر'}: ${p.periods}`).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {d.excuses.length > 0 && (
        <table className="mt-2 w-full border-collapse">
          <thead><tr><th className={th}>العذر</th><th className={th}>الفترة</th><th className={th}>القرار</th></tr></thead>
          <tbody>
            {d.excuses.map((x, i) => (
              <tr key={i}><td className={td}>{EXCUSE_REASON_LABELS[x.reason_type] ?? x.reason_type}</td><td className={td}>{x.from === x.to ? formatDate(x.from) : `${formatDate(x.from)} – ${formatDate(x.to)}`}</td><td className={td}>{EXCUSE_STATUS_TEXT[x.status]}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <H>السلوك</H>
      {d.behavior.length === 0 ? <p>لا توجد ملاحظات سلوكية.</p> : (
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>التاريخ</th><th className={th}>الملاحظة</th><th className={th}>الدرجة</th><th className={th}>الحالة</th></tr></thead>
          <tbody>
            {d.behavior.map((b, i) => (
              <tr key={i}><td className={td}>{formatDate(b.date)}</td><td className={td}>{b.category}</td><td className={td}>{SEVERITY_LABELS[b.severity]}</td><td className={td}>{b.status === 'resolved' ? 'تمت معالجتها' : 'تمت مراجعتها'}</td></tr>
            ))}
          </tbody>
        </table>
      )}

      <H>الإجراءات والجزاءات</H>
      {d.discipline.length === 0 ? <p>لا توجد إجراءات أو جزاءات.</p> : (
        <table className="w-full border-collapse">
          <thead><tr><th className={th}>التاريخ</th><th className={th}>الإجراء</th><th className={th}>السبب</th><th className={th}>التفاصيل</th></tr></thead>
          <tbody>
            {d.discipline.map((x, i) => (
              <tr key={i}>
                <td className={td}>{formatDate(x.date.slice(0, 10))}</td>
                <td className={td}>{DISCIPLINE_TYPE_LABELS[x.type]}</td>
                <td className={td}>{x.reason}</td>
                <td className={td}>
                  {x.type === 'guardian_summons' && x.meeting_at && <>موعد: {formatDateTime(x.meeting_at)}{x.meeting_with && ` مع ${x.meeting_with}`}{x.status === 'attended' ? ' · تم الحضور' : x.status === 'no_show' ? ' · لم يتم الحضور' : ''}</>}
                  {x.type === 'suspension' && x.suspension_from && x.suspension_to && <>من {formatDate(x.suspension_from)} إلى {formatDate(x.suspension_to)} · العودة {formatDate(returnDate(x.suspension_to))}{x.decision_number && ` · قرار ${x.decision_number}`}</>}
                  {x.type === 'pledge' && (x.signed_on ? `موقّع بتاريخ ${formatDate(x.signed_on)}` : 'بانتظار التوقيع')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <H>الميول المهنية</H>
      {d.career ? (
        <p>الأول: <b>{careerLabel(d.career.top_1)}</b> · الثاني: <b>{careerLabel(d.career.top_2)}</b> · الثالث: <b>{careerLabel(d.career.top_3)}</b> (اختبار {formatDate(d.career.submitted_at.slice(0, 10))})</p>
      ) : <p>لم يؤدِّ الطالب اختبار الميول المهنية بعد.</p>}

      <p className="mt-6 border-t border-slate-400 pt-2 text-[8.5pt]">صادر من بوابة ولي الأمر والطالب · {d.school ?? SCHOOL}. البيانات كما سجلتها المدرسة حتى تاريخ الطباعة.</p>
    </div>
  );
}
