import * as React from 'react';
import { Link, NavLink, useLocation, useMatches, useOutlet } from 'react-router';
import { Dialog as D } from 'radix-ui';
import { AnimatePresence, m, useDragControls } from 'motion/react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Bell, CalendarCheck2, Flag, History, LayoutDashboard, ListChecks, LogOut, Menu, Moon, MoreHorizontal, School, Settings,
  Sun, UserCog, UserRound, Users, WifiOff, X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import type { Permission } from '@/lib/domain/permissions';
import { ROLE_LABELS } from '@/lib/domain/permissions';
import { useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { useOnline } from '@/lib/hooks';
import { pageVariants, spring } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useInstallPrompt } from '@/pwa/PwaPrompts';
import { Logo } from './Logo';

type NavItem = { to: string; label: string; short?: string; icon: React.ElementType; permission: Permission; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: 'الرئيسية', items: [{ to: '/', label: 'لوحة التحكم', short: 'الرئيسية', icon: LayoutDashboard, permission: 'dashboard.view', end: true }] },
  {
    label: 'العمل اليومي',
    items: [
      { to: '/students', label: 'الطلاب', icon: Users, permission: 'students.view' },
      { to: '/classes', label: 'الصفوف والفصول', short: 'الفصول', icon: School, permission: 'classes.view' },
      { to: '/attendance', label: 'الحضور والغياب', short: 'الحضور', icon: CalendarCheck2, permission: 'attendance.take' },
      { to: '/behavior', label: 'السلوك الطلابي', short: 'السلوك', icon: Flag, permission: 'behavior.report' },
      { to: '/follow-ups', label: 'المتابعة', icon: ListChecks, permission: 'followups.view' },
    ],
  },
  {
    label: 'التحليل والتواصل',
    items: [
      { to: '/reports', label: 'التقارير', icon: BarChart3, permission: 'reports.view' },
      { to: '/notifications', label: 'الإشعارات', icon: Bell, permission: 'notifications.view' },
    ],
  },
  {
    label: 'الإدارة',
    items: [
      { to: '/users', label: 'المستخدمون والصلاحيات', icon: UserCog, permission: 'users.manage' },
      { to: '/settings', label: 'الإعدادات', icon: Settings, permission: 'settings.manage' },
      { to: '/audit', label: 'سجل التدقيق', icon: History, permission: 'audit.view' },
    ],
  },
];

/** Bottom-bar tabs for phones, in priority order (first four permitted are shown). */
const TAB_PRIORITY = ['/', '/attendance', '/students', '/behavior', '/follow-ups'];

function useUnreadCount() {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: Boolean(session),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  // Installed app: mirror unread notifications on the home-screen icon.
  React.useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (query.data === undefined || !nav.setAppBadge) return;
    void (query.data > 0 ? nav.setAppBadge(query.data) : nav.clearAppBadge?.())?.catch(() => {});
  }, [query.data]);
  return query;
}

function CountBadge({ value, className }: { value: number; className?: string }) {
  return (
    <AnimatePresence>
      {value > 0 && (
        <m.span
          key="badge"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
          transition={spring.pop}
          className={cn('tabular rounded-full bg-danger text-center font-bold text-white dark:text-slate-950', className)}
        >
          {value > 99 ? '99+' : formatNumber(value)}
          <span className="sr-only"> غير مقروءة</span>
        </m.span>
      )}
    </AnimatePresence>
  );
}

function SidebarNav({ onNavigate, layoutId }: { onNavigate?: () => void; layoutId: string }) {
  const { can } = useAuth();
  const unread = useUnreadCount();
  return (
    <nav aria-label="القائمة الرئيسية" className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => can(i.permission));
        if (!items.length) return null;
        return (
          <div key={group.label}>
            <p className="mb-1.5 px-3 text-2xs font-bold tracking-wide text-fg-subtle">{group.label}</p>
            <ul className="space-y-0.5">
              {items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors duration-200',
                        isActive ? 'text-brand dark:text-link' : 'text-fg-muted hover:bg-surface/60 hover:text-fg dark:hover:bg-surface-hover',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Shared-layout pill glides between items on navigation */}
                        {isActive && (
                          <m.span
                            layoutId={layoutId}
                            transition={spring.indicator}
                            className="absolute inset-0 rounded-md bg-surface shadow-sm dark:bg-surface-selected"
                            aria-hidden
                          >
                            <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-leaf" />
                          </m.span>
                        )}
                        <item.icon className="relative size-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" aria-hidden />
                        <span className="relative truncate">{item.label}</span>
                        {item.to === '/notifications' && <CountBadge value={unread.data ?? 0} className="relative ms-auto px-1.5 text-2xs" />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarBrand() {
  const settings = useSchoolSettings();
  const year = useCurrentYear();
  const { isAdmin } = useAuth();
  return (
    <div className="px-5 pb-5 pt-6">
      <Link to="/" className="flex items-center gap-3 rounded-lg" aria-label="لوحة التحكم">
        <Logo className="h-14" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[0.9375rem] font-bold text-fg-strong">{settings.data?.school_name_ar ?? 'ثانوية النجاة بنين – حولي'}</p>
          <p className="mt-0.5 text-xs text-fg-muted">نظام الإدارة المدرسية</p>
        </div>
      </Link>
      {year.data || !isAdmin ? (
        <div className="mt-4 flex items-center justify-between rounded-md px-3 py-2 text-xs text-white shadow-sm [background:var(--brand-gradient)]">
          <span className="font-semibold">العام الدراسي</span>
          <span className="tabular font-bold">{year.data?.name ?? '—'}</span>
        </div>
      ) : (
        <Link to="/settings" className="mt-4 flex items-center justify-between rounded-md border border-dashed border-teal px-3 py-2 text-xs font-semibold text-teal transition-colors hover:bg-surface">
          حدّد العام الدراسي الحالي ←
        </Link>
      )}
    </div>
  );
}

function UserMenu() {
  const { profile, roles, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const install = useInstallPrompt();
  const [busy, setBusy] = React.useState(false);
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-surface-hover" aria-label="قائمة الحساب">
          <span className="grid size-8 place-items-center rounded-full bg-brand text-sm font-bold text-white">
            {profile?.full_name.replace(/^أ\.\s*/, '').charAt(0) ?? <UserRound className="size-4" />}
          </span>
          <span className="hidden min-w-0 leading-tight md:block">
            <span className="block max-w-40 truncate text-[0.8125rem] font-bold text-fg">{profile?.full_name}</span>
            <span className="block text-2xs text-fg-muted">{roles.map((r) => ROLE_LABELS[r]).join('، ')}</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>
          <span className="block font-bold text-fg">{profile?.full_name}</span>
          <span className="ltr block text-end">{profile?.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggle}>
          {theme === 'dark' ? <Sun /> : <Moon />}
          {theme === 'dark' ? 'الوضع الفاتح' : 'الوضع الداكن'}
        </DropdownMenuItem>
        {install.available && (
          <DropdownMenuItem onSelect={() => install.prompt()}>
            <School /> تثبيت التطبيق على الجهاز
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-danger [&_svg]:text-danger"
          disabled={busy}
          onSelect={async () => {
            setBusy(true);
            await signOut();
          }}
        >
          <LogOut /> تسجيل الخروج
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const matches = useMatches();
  const section = [...matches].reverse().find((r) => (r.handle as { section?: string } | undefined)?.section);
  const title = (section?.handle as { section?: string } | undefined)?.section;
  const unread = useUnreadCount();
  const { signOut } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <header className="glass no-print pt-safe sticky top-0 z-30 border-b">
      <div className="flex h-16 items-center gap-2 px-3 sm:px-6">
        <Button variant="ghost" size="icon" className="hidden sm:inline-flex lg:hidden" onClick={onOpenMenu} aria-label="فتح القائمة">
          <Menu className="size-5" />
        </Button>
        <Link to="/" className="lg:hidden" aria-label="لوحة التحكم">
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
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} className="hidden sm:inline-flex">
            <m.span key={theme} initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={spring.pop} className="grid">
              {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
            </m.span>
          </Button>
          <Button asChild variant="ghost" size="icon" className="relative">
            <Link to="/notifications" aria-label={`الإشعارات${unread.data ? `، ${unread.data} غير مقروءة` : ''}`}>
              <Bell className="size-[18px]" />
              <CountBadge value={unread.data ?? 0} className="absolute -top-0.5 end-0.5 min-w-4 px-1 text-[0.625rem] leading-4 ring-2 ring-surface" />
            </Link>
          </Button>
          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
          <UserMenu />
          <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="تسجيل الخروج" title="تسجيل الخروج" className="hidden text-fg-muted sm:inline-flex">
            <LogOut className="size-[18px]" />
          </Button>
        </div>
      </div>
    </header>
  );
}

/** Phone tab bar: four most-used permitted sections + "more" (drawer). */
function BottomTabs({ onMore, moreOpen }: { onMore: () => void; moreOpen: boolean }) {
  const { can } = useAuth();
  const items = NAV.flatMap((g) => g.items)
    .filter((i) => TAB_PRIORITY.includes(i.to) && can(i.permission))
    .sort((a, b) => TAB_PRIORITY.indexOf(a.to) - TAB_PRIORITY.indexOf(b.to))
    .slice(0, 4);
  return (
    <nav aria-label="التنقل السريع" className="glass no-print pb-safe fixed inset-x-0 bottom-0 z-30 border-t sm:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className="relative flex h-16 flex-col items-center justify-center gap-1 text-2xs font-semibold">
              {({ isActive }) => (
                <>
                  {isActive && !moreOpen && (
                    <m.span layoutId="tab-pill" transition={spring.indicator} className="absolute inset-x-3 top-1.5 h-9 rounded-full bg-brand-soft" aria-hidden />
                  )}
                  <m.span className="relative" animate={{ y: isActive ? -1 : 0, scale: isActive ? 1.08 : 1 }} transition={spring.pop}>
                    <item.icon className={cn('size-[22px]', isActive ? 'text-brand dark:text-link' : 'text-fg-muted')} aria-hidden />
                  </m.span>
                  <span className={cn('relative', isActive ? 'text-brand dark:text-link' : 'text-fg-muted')}>{item.short ?? item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button type="button" onClick={onMore} className="relative flex h-16 w-full flex-col items-center justify-center gap-1 text-2xs font-semibold text-fg-muted" aria-label="المزيد من الأقسام" aria-expanded={moreOpen}>
            {moreOpen && <m.span layoutId="tab-pill" transition={spring.indicator} className="absolute inset-x-3 top-1.5 h-9 rounded-full bg-brand-soft" aria-hidden />}
            <MoreHorizontal className={cn('relative size-[22px]', moreOpen && 'text-brand dark:text-link')} aria-hidden />
            <span className="relative">المزيد</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}

function SidebarFooter() {
  const { signOut } = useAuth();
  return (
    <div className="pb-safe border-t border-line/70 p-3">
      <Button variant="ghost" className="w-full justify-start text-fg-muted hover:text-danger" onClick={() => void signOut()}>
        <LogOut /> تسجيل الخروج
      </Button>
    </div>
  );
}

function MobileDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const drag = useDragControls();
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <D.Portal forceMount>
            <D.Overlay asChild forceMount>
              <m.div className="fixed inset-0 z-40 bg-overlay lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </D.Overlay>
            <D.Content asChild forceMount>
              {/* inset-inline-start = right edge in RTL; slides in from there */}
              <m.div
                className="pt-safe fixed inset-y-0 start-0 z-50 flex w-[min(19rem,86vw)] flex-col bg-canvas shadow-lg outline-none [background-image:var(--canvas-gradient)] lg:hidden"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%', transition: { duration: 0.22, ease: [0.65, 0, 0.35, 1] } }}
                transition={spring.sheet}
                drag="x"
                dragListener={false}
                dragControls={drag}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0, right: 0.6 }}
                onDragEnd={(_, info) => {
                  if (info.offset.x > 90 || info.velocity.x > 600) onOpenChange(false);
                }}
                onPointerDown={(e) => {
                  // Drag from anywhere except interactive children.
                  if (!(e.target as HTMLElement).closest('a,button')) drag.start(e);
                }}
              >
                <D.Title className="sr-only">القائمة الرئيسية</D.Title>
                <D.Description className="sr-only">التنقل بين أقسام النظام</D.Description>
                <D.Close className="absolute end-3 top-[calc(env(safe-area-inset-top)+0.75rem)] rounded-md p-2 text-fg-muted hover:bg-surface-hover" aria-label="إغلاق القائمة">
                  <X className="size-5" />
                </D.Close>
                <SidebarBrand />
                <SidebarNav layoutId="nav-pill-drawer" onNavigate={() => onOpenChange(false)} />
                <SidebarFooter />
              </m.div>
            </D.Content>
          </D.Portal>
        )}
      </AnimatePresence>
    </D.Root>
  );
}

function OfflineBanner() {
  const online = useOnline();
  return (
    <AnimatePresence>
      {!online && (
        <m.div
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="no-print overflow-hidden bg-warning text-white dark:text-slate-950"
        >
          <p className="flex items-center justify-center gap-2 px-4 py-1.5 text-xs font-semibold">
            <WifiOff className="size-3.5" aria-hidden /> لا يوجد اتصال بالإنترنت — تُعرض آخر بيانات محمّلة، والحفظ متوقف حتى يعود الاتصال.
          </p>
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Route transition. useOutlet() returns an element bound to its own route
 * match, and AnimatePresence keeps the exiting element as last rendered,
 * so the old page animates out with its own content. Keyed by pathname so
 * filter/query-string changes don't re-animate the page.
 */
function AnimatedOutlet() {
  const location = useLocation();
  const outlet = useOutlet();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div key={location.pathname} variants={pageVariants} initial="initial" animate="enter" exit="exit">
        {outlet}
      </m.div>
    </AnimatePresence>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();

  // Generate due-soon follow-up reminders once per session.
  React.useEffect(() => {
    void supabase.rpc('refresh_due_soon_notifications');
  }, []);

  React.useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#main" className="sr-only z-50 rounded-md bg-brand px-4 py-2 text-white focus:not-sr-only focus:fixed focus:start-4 focus:top-4">
        تخطَّ إلى المحتوى
      </a>

      {/* Desktop sidebar (inline-start = right in RTL) */}
      <aside className="glass no-print sticky top-0 hidden h-dvh flex-col border-e lg:flex">
        <SidebarBrand />
        <SidebarNav layoutId="nav-pill" />
        <SidebarFooter />
      </aside>

      <MobileDrawer open={menuOpen} onOpenChange={setMenuOpen} />

      <div className="flex min-w-0 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <OfflineBanner />
        <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[90rem] flex-1 px-3 pb-24 pt-5 outline-none sm:px-6 sm:py-6">
          <AnimatedOutlet />
        </main>
        <footer className="web-only no-print hidden px-6 pb-5 text-center text-2xs text-fg-subtle sm:block">
          ثانوية النجاة بنين – حولي · نظام الإدارة المدرسية
        </footer>
      </div>

      <BottomTabs onMore={() => setMenuOpen(true)} moreOpen={menuOpen} />
    </div>
  );
}
