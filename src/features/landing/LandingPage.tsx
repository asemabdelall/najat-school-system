import * as React from 'react';
import { Link } from 'react-router';
import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react';
import { useDocumentTitle } from '@/lib/hooks';
import { useInstallPrompt } from '@/pwa/PwaPrompts';
import { LiveRegister } from './LiveRegister';
import './landing.css';

/*
 * Public landing page. The page is one school day at Al-Najat: the scroll
 * runs from the first period to the end-of-day report, each chapter on its
 * own ground, and every picture is the system itself (fictional data).
 */

const EXPO = [0.16, 1, 0.3, 1] as const;

function Reveal({ children, i = 0, className, as = 'div' }: { children: React.ReactNode; i?: number; className?: string; as?: 'div' | 'li' | 'p' | 'figure' }) {
  const C = m[as];
  return (
    <C
      className={className}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.85, ease: EXPO, delay: i * 0.08 }}
    >
      {children}
    </C>
  );
}

/** Heading whose lines rise out of a mask, once, as the heading enters. */
const lineVariants = {
  hidden: { y: '108%' },
  show: (i: number) => ({ y: '0%', transition: { duration: 0.95, ease: EXPO, delay: i * 0.09 } }),
};
function Lines({ lines, as = 'h2', className = 'lp-h2', id, onLoad }: { lines: string[]; as?: 'h1' | 'h2' | 'h3'; className?: string; id?: string; onLoad?: boolean }) {
  const Tag = m[as];
  return (
    <Tag
      className={className}
      id={id}
      initial="hidden"
      {...(onLoad ? { animate: 'show' } : { whileInView: 'show', viewport: { once: true, amount: 0.4 } })}
    >
      {lines.map((l, i) => (
        <span key={l} className="lp-line">
          <m.span variants={lineVariants} custom={onLoad ? i + 1 : i}>
            {l}
          </m.span>
        </span>
      ))}
    </Tag>
  );
}

function Shot({ src, alt, w, h, className, style }: { src: string; alt: string; w: number; h: number; className?: string; style?: React.ComponentProps<typeof m.img>['style'] }) {
  return <m.img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" className={className} style={style} />;
}

/** The school's name set to the full width of the frame, by measurement. */
function FittedName({ text }: { text: string }) {
  const box = React.useRef<HTMLParagraphElement>(null);
  const span = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = box.current;
    const sp = span.current;
    if (!el || !sp) return;
    const fit = () => {
      sp.style.fontSize = '100px';
      const ratio = el.clientWidth / sp.scrollWidth;
      sp.style.fontSize = `${Math.floor(100 * ratio * 0.995)}px`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    void document.fonts?.ready.then(fit);
    return () => ro.disconnect();
  }, []);
  return (
    <p ref={box} className="lp-fit" aria-label={text}>
      <span ref={span} aria-hidden>
        {text}
      </span>
    </p>
  );
}

const STATES = [
  { name: 'مرفوع', body: 'يرفعه المعلم من الجوال: الطالب، التصنيف، الخطورة، ووصف ما حدث.' },
  { name: 'قيد المراجعة', body: 'تستلمه شؤون الطلبة. لا يراجع أحد بلاغًا رفعه بنفسه.' },
  { name: 'معتمد أو مرفوض', body: 'القرار مكتوب بسببه، ويصل إشعار لمقدّم البلاغ.' },
  { name: 'مغلق', body: 'بعد المعالجة، مع سجل زمني كامل لكل خطوة.' },
];

const ROLES: [string, string, string, string][] = [
  ['رصد الحضور', 'أي فصل', 'أي فصل', 'فصوله المسندة'],
  ['تصحيح كشف معتمد', 'بسبب موثّق', 'بسبب موثّق', 'كشفه، في اليوم نفسه'],
  ['رفع بلاغ سلوكي', 'نعم', 'نعم', 'لطلابه'],
  ['مراجعة البلاغات واعتمادها', 'إلا بلاغه', 'إلا بلاغه', 'لا'],
  ['مهام المتابعة', 'للجميع', 'للجميع', 'المسندة إليه'],
  ['التقارير وتصدير CSV', 'المدرسة', 'المدرسة', 'فصوله'],
  ['المستخدمون والإعدادات', 'نعم', 'لا', 'لا'],
  ['سجل التدقيق', 'قراءة', 'لا', 'لا'],
];

function useDrift(target: React.RefObject<HTMLElement | null>, from: number, to: number): MotionValue<number> | number {
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target, offset: ['start end', 'end start'] });
  const v = useTransform(scrollYProgress, [0, 1], [from, to]);
  return reduce ? 0 : v;
}

export function LandingPage() {
  useDocumentTitle('نظام النجاة المدرسي');
  const install = useInstallPrompt();
  const reduce = useReducedMotion();

  // Behaviour track: the bar fills with the scroll, locked to the scrollbar.
  const trackRef = React.useRef<HTMLOListElement>(null);
  const { scrollYProgress: trackP } = useScroll({ target: trackRef, offset: ['start 85%', 'end 45%'] });
  const trackScale = useTransform(trackP, [0, 1], [0, 1]);

  // End of day: the dashboard opens from an inset window to the full frame.
  const windowRef = React.useRef<HTMLDivElement>(null);
  const { scrollYProgress: winP } = useScroll({ target: windowRef, offset: ['start end', 'start 15%'] });
  const winScale = useTransform(winP, [0, 1], [0.74, 1]);

  const phonesRef = React.useRef<HTMLDivElement>(null);
  const driftA = useDrift(phonesRef, 32, -32);
  const driftB = useDrift(phonesRef, -24, 36);

  const followRef = React.useRef<HTMLDivElement>(null);
  const followX = useDrift(followRef, 36, -24);

  return (
    <div className="lp" dir="rtl">
      <header className="lp-nav lp-wrap">
        <Link to="/welcome" className="lp-mark" aria-label="نظام النجاة المدرسي">
          <img src="/brand/alnajat-mark.png" alt="" width={28} height={36} />
          <span>النجاة</span>
        </Link>
        <nav aria-label="أقسام الصفحة" className="lp-links">
          <a href="#attendance">الحضور</a>
          <a href="#behavior">السلوك</a>
          <a href="#followups">المتابعة</a>
          <a href="#reports">التقارير</a>
          <a href="#app">التطبيق</a>
        </nav>
        <Link to="/login" className="lp-btn lp-btn-quiet lp-btn-sm">
          تسجيل الدخول
        </Link>
      </header>

      <main>
        {/* First screen: what this is, the action, and the live register. */}
        <section className="lp-hero lp-wrap lp-grid" aria-labelledby="lp-title">
          <div className="lp-hero-text">
            <Lines as="h1" id="lp-title" className="lp-display" lines={['دفتر الحضور،', 'صار في الجوال']} onLoad />
            <m.p className="lp-lead" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EXPO, delay: 0.3 }}>
              نظام ثانوية النجاة بنين – حولي لرصد الحضور والغياب، ومراجعة البلاغات السلوكية، ومتابعة الطلاب. للإدارة وشؤون الطلبة والمعلمين.
            </m.p>
            <m.div className="lp-hero-actions" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EXPO, delay: 0.4 }}>
              <Link to="/login" className="lp-btn lp-btn-ink">
                تسجيل الدخول
              </Link>
              <a href="#app" className="lp-textlink">
                ثبّته على جوالك
              </a>
            </m.div>
            <m.p className="lp-note" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.6 }}>
              جرّب كشف الحضور التجريبي: اختر حالة كل طالب، ثم اعتمده.
            </m.p>
          </div>
          <m.div className="lp-hero-live" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EXPO, delay: 0.2 }}>
            <LiveRegister />
          </m.div>
        </section>

        {/* 7:30 — attendance */}
        <section id="attendance" className="lp-ch lp-ch-navy" aria-labelledby="h-att">
          <div className="lp-wrap lp-grid">
            <div className="lp-att-text">
              <Lines id="h-att" lines={['الحصة الأولى، ٧:٣٠']} />
              <Reveal i={1} as="p" className="lp-body">
                يفتح المعلم فصله من الجوال ويرصد طالبًا طالبًا، أو يحدد الباقين حاضرين بضغطة. يُحفظ الكشف مسودة إن انقطع، ويُعتمد حين يكتمل.
              </Reveal>
              <ul className="lp-rules">
                {[
                  'الطالب غير المرصود لا يُحتسب غائبًا.',
                  'لا يُعتمد الكشف قبل رصد جميع الطلاب.',
                  'أي تعديل بعد الاعتماد يُحفظ تصحيحًا موثّقًا بسببه ومن قام به.',
                  'يومي أو بالحصة، بحسب إعداد المدرسة. والجمعة والسبت مغلقان للرصد.',
                  'تعتمد شؤون الطلبة أعذار الغياب، فتتحول الأيام المشمولة إلى «بعذر».',
                ].map((r, i) => (
                  <Reveal key={r} as="li" i={i + 2}>
                    {r}
                  </Reveal>
                ))}
              </ul>
            </div>
            <Reveal i={1} className="lp-phone" as="figure">
              <video src="/landing/take.mp4" poster="/landing/take-poster.webp" autoPlay={!reduce} muted loop playsInline preload="metadata" aria-label="معلم يرصد حضور فصل 10/1 من الجوال" />
              <figcaption>رصد فصل 10/1 من الجوال، ببيانات تجريبية.</figcaption>
            </Reveal>
          </div>
        </section>

        {/* 10:15 — behaviour */}
        <section id="behavior" className="lp-ch lp-ch-green" aria-labelledby="h-beh">
          <div className="lp-wrap">
            <div className="lp-grid lp-beh-head">
              <Lines id="h-beh" className="lp-h2 lp-beh-title" lines={['الفسحة، ١٠:١٥']} />
              <Reveal i={1} as="p" className="lp-body lp-beh-lead">
                يرفع المعلم البلاغ من الساحة، وتراجعه شؤون الطلبة. النظام يوثّق كل خطوة، ولا يتخذ أي عقوبة أو قرار تلقائيًا.
              </Reveal>
            </div>
            <div className="lp-track-wrap">
              <div className="lp-track-bar" aria-hidden>
                <m.span style={{ scaleX: reduce ? 1 : trackScale }} />
              </div>
              <ol ref={trackRef} className="lp-track">
                {STATES.map((s, i) => (
                  <Reveal key={s.name} as="li" i={i}>
                    <h3>{s.name}</h3>
                    <p>{s.body}</p>
                  </Reveal>
                ))}
              </ol>
            </div>
            <Reveal className="lp-shot lp-beh-shot" as="figure">
              <Shot src="/landing/desk-incidents.webp" alt="قائمة البلاغات السلوكية بحالاتها: مرفوع بانتظار المراجعة، وقيد المراجعة" w={1800} h={680} />
            </Reveal>
          </div>
        </section>

        {/* 12:40 — follow-ups */}
        <section id="followups" className="lp-ch lp-ch-paper" aria-labelledby="h-fu">
          <div className="lp-wrap lp-grid lp-fu">
            <div className="lp-fu-text">
              <Lines id="h-fu" className="lp-h2" lines={['بعد الحصة', 'السادسة، ١٢:٤٠']} />
              <Reveal i={1} as="p" className="lp-body">
                ما يُكتشف في الصباح لا يضيع بعد الظهر. تُسند مهمة المتابعة لشخص بعينه، بموعد وأولوية، مرتبطة بالطالب أو بالبلاغ الذي نشأت منه.
              </Reveal>
              <dl className="lp-facts">
                {[
                  ['الموعد', 'المهمة المتأخرة تظهر بالكلمة والأيقونة، لا باللون وحده.'],
                  ['الإشعار', 'يصل للمسؤول عند الإسناد وعند اقتراب الموعد.'],
                  ['النتيجة', 'تُغلق المهمة بنتيجة مكتوبة تبقى في ملف الطالب.'],
                ].map(([t, d], i) => (
                  <Reveal key={t} i={i + 2}>
                    <dt>{t}</dt>
                    <dd>{d}</dd>
                  </Reveal>
                ))}
              </dl>
            </div>
            <div ref={followRef} className="lp-fu-shot">
              <Reveal as="figure" className="lp-shot">
                <Shot src="/landing/desk-followups.webp" alt="قائمة مهام المتابعة: المهمة، الطالب، المسؤول، الموعد والحالة" w={1800} h={789} style={{ x: followX }} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* 1:30 — end of day */}
        <section id="reports" className="lp-ch lp-ch-night" aria-labelledby="h-rep">
          <div className="lp-wrap">
            <div className="lp-center">
              <Lines id="h-rep" className="lp-h2" lines={['نهاية اليوم، ١:٣٠']} />
              <Reveal i={1} as="p" className="lp-body">
                لوحة الإدارة تجمع اليوم كله: نسبة الحضور، الكشوف التي لم تُعتمد، البلاغات بانتظار القرار، والمهام المتأخرة.
              </Reveal>
            </div>
            <div ref={windowRef} className="lp-window">
              <m.img
                src="/landing/desk-dash.webp"
                alt="لوحة تحكم شؤون الطلبة: مؤشرات الحضور لآخر سبعة أيام، والغياب والتأخر اليومي"
                width={1800}
                height={1188}
                loading="lazy"
                style={{ scale: reduce ? 1 : winScale }}
              />
            </div>
            <div className="lp-grid lp-rep">
              <Reveal as="figure" className="lp-shot lp-rep-shot">
                <Shot src="/landing/desk-reports.webp" alt="تقرير حضور الطلاب لشهر أكتوبر مع أزرار الطباعة وتصدير CSV" w={1800} h={1070} />
              </Reveal>
              <div className="lp-rep-text">
                <Reveal as="div">
                  <h3 className="lp-h3">التقارير تطابق الكشوف</h3>
                </Reveal>
                <Reveal i={1} as="p" className="lp-body">
                  حضور كل طالب، ملخص الفصول، الاتجاه اليومي، السلوك، والمتابعة. ما يظهر على الشاشة هو نفسه ما يُصدَّر في ملف CSV يفتح في Excel بالعربية، وما يُطبع.
                </Reveal>
                <Reveal i={2} as="p" className="lp-body">
                  وكل تقرير يلتزم بصلاحيات من يطلبه: المعلم يرى فصوله فقط.
                </Reveal>
              </div>
            </div>
          </div>
        </section>

        {/* Roles */}
        <section className="lp-ch lp-ch-white" aria-labelledby="h-roles">
          <div className="lp-wrap lp-grid lp-roles">
            <div className="lp-roles-text">
              <Lines id="h-roles" className="lp-h2" lines={['لكل دور ما يخصه']} />
              <Reveal i={1} as="p" className="lp-body">
                قاعدة البيانات تفرض هذه الصلاحيات بمعزل عن الواجهة، وكل تعديل يُسجَّل في سجل تدقيق لا يُحذف.
              </Reveal>
            </div>
            <Reveal i={1} className="lp-table-wrap">
              <table className="lp-table">
                <thead>
                  <tr>
                    <th scope="col">العمل</th>
                    <th scope="col">الإدارة</th>
                    <th scope="col">شؤون الطلبة</th>
                    <th scope="col">المعلم</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map(([what, ...cells]) => (
                    <tr key={what}>
                      <th scope="row">{what}</th>
                      {cells.map((c, i) => (
                        <td key={i} data-no={c === 'لا' || undefined}>
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
          </div>
        </section>

        {/* The app */}
        <section id="app" className="lp-ch lp-ch-mist" aria-labelledby="h-app">
          <div className="lp-wrap lp-grid lp-app">
            <div className="lp-app-text">
              <Lines id="h-app" className="lp-h2" lines={['ثبّته على جوالك']} />
              <Reveal i={1} as="p" className="lp-body">
                يفتح من الشاشة الرئيسية بملء الشاشة كأي تطبيق، مع اختصارات لرصد الحضور ورفع بلاغ. بلا متجر تطبيقات، ويتحدث بنفسه.
              </Reveal>
              <dl className="lp-facts">
                {[
                  ['iPhone', 'من Safari: زر المشاركة، ثم «إضافة إلى الشاشة الرئيسية».'],
                  ['Android والحاسوب', 'زر «تثبيت» في المتصفح، أو من قائمة الحساب داخل النظام.'],
                  ['الخصوصية', 'بيانات الطلاب لا تُحفظ على الجهاز، فأجهزة المدرسة المشتركة آمنة.'],
                ].map(([t, d], i) => (
                  <Reveal key={t} i={i + 2}>
                    <dt>{t}</dt>
                    <dd>{d}</dd>
                  </Reveal>
                ))}
              </dl>
              {install.available && (
                <Reveal i={5}>
                  <m.button type="button" className="lp-btn lp-btn-ink" whileTap={{ scale: 0.97 }} onClick={() => void install.prompt()}>
                    ثبّت التطبيق
                  </m.button>
                </Reveal>
              )}
            </div>
            <div ref={phonesRef} className="lp-phones">
              <m.img className="lp-ph lp-ph-a" src="/landing/phone-dash.webp" alt="لوحة المعلم على الجوال: رصد اليوم لكل فصل" width={780} height={1688} loading="lazy" style={{ y: driftA }} />
              <m.img className="lp-ph lp-ph-b" src="/landing/phone-dash-dark.webp" alt="لوحة شؤون الطلبة على الجوال في الوضع الداكن" width={780} height={1688} loading="lazy" style={{ y: driftB }} />
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <FittedName text="ثانوية النجاة بنين – حولي" />
          <div className="lp-foot-row">
            <p>نظام داخلي لمنسوبي المدرسة في حولي، دولة الكويت. الحسابات تُنشئها إدارة المدرسة.</p>
            <Link to="/login" className="lp-btn lp-btn-paper">
              تسجيل الدخول
            </Link>
          </div>
          <p className="lp-credit">الصور والفيديو من النظام نفسه، ببيانات طلاب ومعلمين تجريبية.</p>
        </div>
      </footer>
    </div>
  );
}
