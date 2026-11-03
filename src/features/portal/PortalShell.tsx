import * as React from 'react';
import { Link, NavLink, useLocation, useMatches, useOutlet } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, m } from 'motion/react';
import {
  CalendarCheck2, FileSignature, Flag, Home, KeyRound, LogOut, Moon, Printer, Sun, UserRound, UserX, WifiOff,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { unwrap } from '@/lib/errors';
import { useDocumentTitle, useOnline } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { pageVariants, spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { initials, shortName, type PortalData } from '@/lib/domain/portal';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/states';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Logo } from '@/components/layout/Logo';
import { ChangePasswordDialog } from '@/features/auth/ChangePassword';
import { PrintReport } from './PrintReport';
import { SCHOOL, type PortalContext } from './ui';

const NAV = [
  { to: '/portal', label: 'الرئيسية', icon: Home, end: true },
  { to: '/portal/attendance', label: 'الحضور والغياب', short: 'الحضور', icon: CalendarCheck2 },
  { to: '/portal/behavior', label: 'السلوك', icon: Flag },
  { to: '/portal/actions', label: 'الإجراءات والجزاءات', short: 'الإجراءات', icon: FileSignature },
  { to: '/portal/profile', label: 'الملف والتقرير', short: 'الملف', icon: UserRound },
] as const;

export function usePortalQuery() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['portal', session?.user.id],
    queryFn: async () => (unwrap(await supabase.rpc('portal_my_data')) as unknown as PortalData | null) ?? null,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full font-bold text-white [background:var(--brand-gradient-deep)]', className)} aria-hidden>
      {initials(name)}
    </span>
  );
}

function SidebarNav() {
  return (
    <nav aria-label="أقسام البوابة" className="flex-1 overflow-y-auto px-3 pb-4">
      <ul className="space-y-0.5">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={'end' in item ? item.end : undefined}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors duration-200',
                  isActive ? 'text-brand dark:text-link' : 'text-fg-muted hover:bg-surface/60 hover:text-fg dark:hover:bg-surface-hover',
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <m.span layoutId="portal-nav-pill" transition={spring.indicator} className="absolute inset-0 rounded-md bg-surface shadow-sm dark:bg-surface-selected" aria-hidden>
                      <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-leaf" />
                    </m.span>
                  )}
                  <item.icon className="relative size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                  <span className="relative truncate">{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function StudentCard({ d }: { d: PortalData }) {
  const s = d.student;
  return (
    <div className="relative mx-4 mb-5 overflow-hidden rounded-xl p-4 text-white shadow-md [background:var(--brand-gradient-deep)]">
      <span className="arch pointer-events-none absolute -bottom-10 -end-6 h-28 w-20 border-2 border-white/15" aria-hidden />
      <span className="arch pointer-events-none absolute -bottom-12 end-6 h-24 w-14 bg-white/[0.06]" aria-hidden />
      <div className="relative flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 text-base font-bold ring-2 ring-white/30" aria-hidden>{initials(s.full_name)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold" title={s.full_name}>{shortName(s.full_name)}</p>
          <p className="text-xs text-white/75">{s.class_name ? `الصف ${s.class_name}` : 'طالب'}</p>
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-between rounded-md bg-white/10 px-3 py-1.5 text-xs">
        <span>العام الدراسي</span>
        <span className="tabular font-bold">{s.year_name ?? '—'}</span>
      </div>
    </div>
  );
}

function AccountMenu({ d, onPassword }: { d: PortalData; onPassword: () => void }) {
  const { session, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-surface-hover sm:rounded-md sm:px-1.5 sm:py-1" aria-label="قائمة الحساب">
          <Avatar name={d.student.full_name} className="size-8 text-xs" />
          <span className="hidden min-w-0 text-start leading-tight md:block">
            <span className="block max-w-40 truncate text-[0.8125rem] font-bold text-fg">{shortName(d.student.full_name)}</span>
            <span className="block text-2xs text-fg-muted">طالب وولي أمر</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block font-bold text-fg">{d.student.full_name}</span>
          <span className="ltr block text-end">{session?.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggle}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPassword}>
          <KeyRound /> تغيير كلمة المرور
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => window.print()}>
          <Printer /> طباعة تقرير الطالب
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-danger [&_svg]:text-danger" onSelect={() => void signOut()}>
          <LogOut /> تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar({ d, onPassword }: { d: PortalData; onPassword: () => void }) {
  const matches = useMatches();
  const title = [...matches].reverse().map((r) => (r.handle as { title?: string } | undefined)?.title).find(Boolean);
  const { theme, toggle } = useTheme();
  return (
    <header className="glass no-print pt-safe sticky top-0 z-30 border-b max-sm:border-line max-sm:bg-surface max-sm:[-webkit-backdrop-filter:none] max-sm:[backdrop-filter:none]">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
        <Link to="/portal" className="lg:hidden" aria-label="الرئيسية">
          <Logo variant="mark" className="h-9" />
        </Link>
        <AnimatePresence mode="wait" initial={false}>
          <m.p
            key={title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="min-w-0 truncate text-sm font-bold text-fg-muted"
          >
            {title}
          </m.p>
        </AnimatePresence>
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => window.print()} className="hidden text-fg-muted md:inline-flex">
            <Printer /> طباعة التقرير
          </Button>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} className="hidden sm:inline-flex">
            <m.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={spring.pop} className="grid">
              {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </m.span>
          </Button>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
          <AccountMenu d={d} onPassword={onPassword} />
        </div>
      </div>
    </header>
  );
}

function BottomTabs() {
  return (
    <nav aria-label="التنقل السريع" className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface sm:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={'end' in item ? item.end : undefined} className="relative flex h-16 flex-col items-center justify-center gap-1 text-2xs font-semibold">
              {({ isActive }) => (
                <>
                  {isActive && <m.span layoutId="portal-tab-pill" transition={spring.indicator} className="absolute inset-x-2.5 top-1.5 h-9 rounded-full bg-brand-soft" aria-hidden />}
                  <m.span className="relative" animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }} transition={spring.pop}>
                    <item.icon className={cn('size-[22px]', isActive ? 'text-brand dark:text-link' : 'text-fg-muted')} aria-hidden />
                  </m.span>
                  <span className={cn('relative', isActive ? 'text-brand dark:text-link' : 'text-fg-muted')}>{'short' in item ? item.short : item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function OfflineBanner() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <m.div role="status" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="no-print overflow-hidden bg-warning text-white dark:text-slate-950">
          <p className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold">
            <WifiOff className="size-3.5" aria-hidden /> لا يوجد اتصال بالإنترنت — تُعرض آخر بيانات محمّلة.
          </p>
        </m.div>
      )}
    </AnimatePresence>
  );
}

function AnimatedOutlet({ context }: { context: PortalContext }) {
  const location = useLocation();
  const outlet = useOutlet(context);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div key={location.pathname} variants={pageVariants} initial="initial" animate="enter" exit="exit">
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}

function ShellSkeleton() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]" aria-busy="true" aria-label="جارٍ التحميل">
      <aside className="glass hidden h-dvh flex-col gap-4 border-e p-5 lg:flex">
        <Skeleton className="h-14 w-40" />
        <Skeleton className="h-28 w-full rounded-xl" />
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </aside>
      <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pt-6 sm:px-6">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    </div>
  );
}

function Unavailable() {
  const { signOut } = useAuth();
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-lg sm:p-8">
        <Logo className="mx-auto h-20" />
        <span className="mx-auto mt-5 grid size-12 place-items-center rounded-full bg-warning-soft text-warning"><UserX className="size-6" aria-hidden /></span>
        <h1 className="mt-3 text-lg font-bold">لا تتوفر بيانات لهذا الحساب حاليًا</h1>
        <p className="mt-1 text-sm text-fg-muted">قد يكون الطالب منقولًا أو أن الحساب غير مرتبط بسجل طالب. تواصل مع شؤون الطلبة في {SCHOOL}.</p>
        <Button variant="secondary" className="mt-5" onClick={() => void signOut()}><LogOut /> تسجيل الخروج</Button>
      </div>
    </main>
  );
}

export function PortalShell() {
  useDocumentTitle('بوابة ولي الأمر والطالب');
  const query = usePortalQuery();
  const { signOut } = useAuth();
  const [pwOpen, setPwOpen] = React.useState(false);
  const location = useLocation();

  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  if (query.isPending) return <ShellSkeleton />;
  if (query.isError) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-16">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
        <div className="mt-4 text-center"><Button variant="ghost" onClick={() => void signOut()}><LogOut /> تسجيل الخروج</Button></div>
      </div>
    );
  }
  if (!query.data) return <Unavailable />;
  const d = query.data;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr] print:!block">
      <a href="#portal-main" className="sr-only z-50 rounded-md bg-brand px-4 py-2 text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        تخطَّ إلى المحتوى
      </a>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />

      <aside className="glass no-print sticky top-0 hidden h-dvh flex-col border-e lg:flex">
        <div className="px-5 pb-5 pt-6">
          <Link to="/portal" className="flex items-center gap-3 rounded-lg" aria-label="الرئيسية">
            <Logo className="h-14" />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[0.9375rem] font-bold text-fg-strong">{d.school ?? SCHOOL}</p>
              <p className="mt-0.5 text-xs text-fg-muted">بوابة ولي الأمر والطالب</p>
            </div>
          </Link>
        </div>
        <StudentCard d={d} />
        <SidebarNav />
        <div className="pb-safe border-t border-line/70 p-3">
          <Button variant="ghost" className="w-full justify-start text-fg-muted hover:text-danger" onClick={() => void signOut()}>
            <LogOut /> تسجيل الخروج
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <TopBar d={d} onPassword={() => setPwOpen(true)} />
        <OfflineBanner />
        <main id="portal-main" tabIndex={-1} className="no-print mx-auto w-full max-w-5xl flex-1 px-3 pb-28 pt-5 outline-none sm:px-6 sm:pb-10 sm:pt-7">
          <AnimatedOutlet context={{ data: d }} />
        </main>
        <footer className="web-only no-print hidden px-6 pb-5 text-center text-2xs text-fg-subtle sm:block">
          {d.school ?? SCHOOL} · بوابة ولي الأمر والطالب
        </footer>
      </div>

      <BottomTabs />
      <PrintReport d={d} />
    </div>
  );
}
