import * as React from 'react';
import { m } from 'motion/react';
import { Compass, FileText, IdCard, KeyRound, Moon, Printer, ShieldCheck, Sun, Trophy } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { careerLabel } from '@/lib/domain/career';
import { initials } from '@/lib/domain/portal';
import { ChangePasswordDialog } from '@/features/auth/ChangePassword';
import { PageTitle, Panel, usePortalData } from './ui';

const STATUS_TEXT: Record<string, string> = { active: 'منتظم', transferred: 'منقول', graduated: 'متخرج', archived: 'مؤرشف' };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="text-end text-sm font-bold">{children}</dd>
    </div>
  );
}

export function PortalProfile() {
  const d = usePortalData();
  const s = d.student;
  const { session } = useAuth();
  const { theme, toggle } = useTheme();
  const [pwOpen, setPwOpen] = React.useState(false);
  const c = d.career;

  return (
    <div>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      <PageTitle title="الملف والتقرير" subtitle="بيانات الطالب ونتيجة الميول وتقرير قابل للطباعة" />

      <div className="grid gap-5 lg:grid-cols-5">
        <div className="min-w-0 space-y-5 lg:col-span-3">
          <Panel>
            <div className="flex items-center gap-4">
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white shadow-md [background:var(--brand-gradient-deep)]" aria-hidden>
                {initials(s.full_name)}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-extrabold leading-snug">{s.full_name}</p>
                <p className="text-sm text-fg-muted">{s.class_name ? `الصف ${s.class_name}` : '—'} · العام الدراسي <span className="tabular">{s.year_name}</span></p>
              </div>
            </div>
            <dl className="mt-4 divide-y divide-line/70 border-t border-line">
              <Row label="الرقم الطلابي"><span className="ltr tabular">{s.student_number}</span></Row>
              <Row label="الرقم المدني"><span className="ltr tabular">•••• •••• {s.civil_id_last4}</span></Row>
              {s.date_of_birth && <Row label="تاريخ الميلاد"><span className="tabular">{formatDate(s.date_of_birth)}</span></Row>}
              <Row label="الحالة">{STATUS_TEXT[s.status] ?? s.status}</Row>
              {s.enrolled_on && <Row label="تاريخ التسجيل في الفصل"><span className="tabular">{formatDate(s.enrolled_on)}</span></Row>}
              {s.guardian_name && <Row label="ولي الأمر">{s.guardian_name}</Row>}
              {s.guardian_phone && <Row label="هاتف ولي الأمر المسجل"><span className="ltr tabular">{s.guardian_phone}</span></Row>}
            </dl>
            <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-fg-muted">إذا كانت هناك بيانات غير صحيحة، أبلغ شؤون الطلبة لتحديثها.</p>
          </Panel>

          <Panel title="الميول المهنية" subtitle={c ? `نتيجة اختبار يوم ${formatDate(c.submitted_at.slice(0, 10))}` : undefined} icon={Compass}>
            {!c ? (
              <p className="rounded-lg bg-surface-sunken px-4 py-3 text-sm text-fg-muted">لم يؤدِّ الطالب اختبار الميول المهنية بعد. تنظّمه المدرسة لطلاب الصف الثاني عشر.</p>
            ) : (
              <>
                <ol className="grid items-end gap-3 sm:grid-cols-3">
                  {[{ k: c.top_2, rank: 2, h: 'sm:h-28' }, { k: c.top_1, rank: 1, h: 'sm:h-36' }, { k: c.top_3, rank: 3, h: 'sm:h-24' }].map((x, i) => (
                    <m.li
                      key={x.rank}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.08, duration: 0.4 }}
                      className={cn(
                        'flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-4 text-center',
                        x.rank === 1 ? 'text-white shadow-md [background:var(--brand-gradient)] max-sm:order-first' : 'border border-line bg-surface-sunken',
                        x.h,
                      )}
                    >
                      {x.rank === 1 && <Trophy className="size-5" aria-hidden />}
                      <span className={cn('text-xs font-bold', x.rank === 1 ? 'text-white/85' : 'text-fg-muted')}>الميل {x.rank === 1 ? 'الأول' : x.rank === 2 ? 'الثاني' : 'الثالث'}</span>
                      <span className="text-base font-extrabold">{careerLabel(x.k)}</span>
                    </m.li>
                  ))}
                </ol>
                <p className="mt-4 text-xs text-fg-muted">الميول مؤشر يساعد في اختيار التخصص، وللنقاش حول التوجيه المهني تواصل مع المرشد الطلابي.</p>
              </>
            )}
          </Panel>
        </div>

        <div className="min-w-0 space-y-5 lg:col-span-2">
          <Panel title="تقرير الطالب" icon={FileText}>
            <p className="text-sm text-fg-muted">تقرير شامل يضم البيانات والحضور والسلوك والإجراءات ونتيجة الميول، جاهز للطباعة أو الحفظ PDF.</p>
            <Button className="mt-4 w-full" onClick={() => window.print()}><Printer /> طباعة التقرير</Button>
          </Panel>

          <Panel title="الحساب" icon={IdCard}>
            <dl className="divide-y divide-line/70">
              <div className="py-2">
                <dt className="text-xs text-fg-muted">اسم الدخول</dt>
                <dd className="ltr tabular break-all text-end text-sm font-bold">{session?.user.email}</dd>
              </div>
              <div className="py-2">
                <dt className="text-xs text-fg-muted">نوع الحساب</dt>
                <dd className="text-sm font-bold">حساب الطالب وولي الأمر</dd>
              </div>
            </dl>
            <div className="mt-3 grid gap-2">
              <Button variant="secondary" onClick={() => setPwOpen(true)}><KeyRound /> تغيير كلمة المرور</Button>
              <Button variant="ghost" onClick={toggle}>{theme === 'dark' ? <Sun /> : <Moon />} {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}</Button>
            </div>
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden /> ننصح بتغيير كلمة المرور الموحدة إلى كلمة خاصة بك، لا يراها غيرك.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
