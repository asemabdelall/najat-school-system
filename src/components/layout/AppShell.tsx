import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useMatches } from 'react-router';
import { Dialog as D } from 'radix-ui';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Bell, CalendarCheck2, Flag, History, LayoutDashboard, ListChecks, LogOut, Menu, Moon, School, Settings, Sun,
  UserCog, UserRound, Users, X,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import type { Permission } from '@/lib/domain/permissions';
import { ROLE_LABELS } from '@/lib/domain/permissions';
import { useCurrentYear, useSchoolSettings } from '@/lib/queries';
import { supabase } from '@/lib/supabase';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTheme } from '@/lib/theme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Logo } from './Logo';

type NavItem = { to: string; label: string; icon: React.ElementType; permission: Permission; end?: boolean };
type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  { label: 'الرئيسية', items: [{ to: '/', label: 'لوحة التحكم', icon: LayoutDashboard, permission: 'dashboard.view', end: true }] },
  {
    label: 'العمل اليومي',
    items: [
      { to: '/students', label: 'الطلاب', icon: Users, permission: 'students.view' },
      { to: '/classes', label: 'الصفوف والفصول', icon: School, permission: 'classes.view' },
      { to: '/attendance', label: 'الحضور والغياب', icon: CalendarCheck2, permission: 'attendance.take' },
      { to: '/behavior', label: 'السلوك الطلابي', icon: Flag, permission: 'behavior.report' },
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

function useUnreadCount() {
  const { session } = useAuth();
  return useQuery({
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
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
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
                        'group relative flex h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-surface text-brand shadow-sm dark:bg-surface-selected dark:text-link'
                          : 'text-fg-muted hover:bg-surface/70 hover:text-fg dark:hover:bg-surface-hover',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* Leaf-green indicator echoing the logo accent */}
                        <span
                          aria-hidden
                          className={cn(
                            'absolute inset-y-2 start-0 w-1 rounded-full bg-leaf transition-opacity',
                            isActive ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <item.icon className="size-[18px] shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        {item.to === '/notifications' && (unread.data ?? 0) > 0 && (
                          <span className="tabular ms-auto rounded-full bg-danger px-1.5 text-2xs font-bold text-white dark:text-slate-950">
                            {formatNumber(unread.data)}
                            <span className="sr-only"> غير مقروءة</span>
                          </span>
                        )}
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
  return (
    <div className="px-5 pb-5 pt-6">
      <Link to="/" className="flex items-center gap-3 rounded-lg" aria-label="لوحة التحكم">
        <Logo className="h-14" />
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[0.9375rem] font-bold text-fg-strong">{settings.data?.school_name_ar ?? 'ثانوية النجاة بنين – حولي'}</p>
          <p className="mt-0.5 text-xs text-fg-muted">نظام الإدارة المدرسية</p>
        </div>
      </Link>
      <div className="mt-4 flex items-center justify-between rounded-md px-3 py-2 text-xs text-white shadow-sm [background:var(--brand-gradient)]">
        <span className="font-semibold">العام الدراسي</span>
        <span className="tabular font-bold">{year.data?.name ?? '—'}</span>
      </div>
    </div>
  );
}

function UserMenu() {
  const { profile, roles, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const [busy, setBusy] = React.useState(false);
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-md px-1.5 py-1 text-start hover:bg-surface-hover" aria-label="قائمة الحساب">
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
        <DropdownMenuItem asChild>
          <Link to="/notifications">
            <Bell /> الإشعارات
          </Link>
        </DropdownMenuItem>
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
  const section = [...matches].reverse().find((m) => (m.handle as { section?: string } | undefined)?.section);
  const title = (section?.handle as { section?: string } | undefined)?.section;
  const unread = useUnreadCount();
  const { signOut } = useAuth();
  const { theme, toggle } = useTheme();
  return (
    <header className="glass no-print sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-3 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="فتح القائمة">
        <Menu className="size-5" />
      </Button>
      <Link to="/" className="lg:hidden" aria-label="لوحة التحكم">
        <Logo variant="mark" className="h-9" />
      </Link>
      <p className="min-w-0 truncate text-sm font-bold text-fg-muted">{title}</p>
      <div className="ms-auto flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} className="hidden sm:inline-flex">
          {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
        </Button>
        <Button asChild variant="ghost" size="icon" className="relative">
          <Link to="/notifications" aria-label={`الإشعارات${unread.data ? `، ${unread.data} غير مقروءة` : ''}`}>
            <Bell className="size-[18px]" />
            {(unread.data ?? 0) > 0 && (
              <span className="tabular absolute -top-0.5 end-0.5 min-w-4 rounded-full bg-danger px-1 text-center text-[0.625rem] font-bold leading-4 text-white ring-2 ring-surface dark:text-slate-950">
                {unread.data! > 99 ? '99+' : formatNumber(unread.data)}
              </span>
            )}
          </Link>
        </Button>
        <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />
        <UserMenu />
        <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="تسجيل الخروج" title="تسجيل الخروج" className="text-fg-muted">
          <LogOut className="size-[18px]" />
        </Button>
      </div>
    </header>
  );
}

function SidebarFooter() {
  const { signOut } = useAuth();
  return (
    <div className="border-t border-line/70 p-3">
      <Button variant="ghost" className="w-full justify-start text-fg-muted hover:text-danger" onClick={() => void signOut()}>
        <LogOut /> تسجيل الخروج
      </Button>
    </div>
  );
}

export function AppShell() {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const location = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);

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
        <SidebarNav />
        <SidebarFooter />
      </aside>

      {/* Mobile / tablet drawer */}
      <D.Root open={menuOpen} onOpenChange={setMenuOpen}>
        <D.Portal>
          <D.Overlay className="fixed inset-0 z-40 bg-overlay data-[state=open]:animate-fade-in lg:hidden" />
          <D.Content className="fixed inset-y-0 start-0 z-50 flex w-[min(19rem,88vw)] flex-col bg-canvas shadow-lg [background-image:var(--canvas-gradient)] data-[state=open]:animate-slide-in lg:hidden">
            <D.Title className="sr-only">القائمة الرئيسية</D.Title>
            <D.Description className="sr-only">التنقل بين أقسام النظام</D.Description>
            <D.Close className="absolute end-3 top-3 rounded-md p-2 text-fg-muted hover:bg-surface-hover" aria-label="إغلاق القائمة">
              <X className="size-5" />
            </D.Close>
            <SidebarBrand />
            <SidebarNav onNavigate={() => setMenuOpen(false)} />
            <SidebarFooter />
          </D.Content>
        </D.Portal>
      </D.Root>

      <div className="flex min-w-0 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[90rem] flex-1 px-3 py-5 outline-none sm:px-6 sm:py-6">
          <Outlet />
        </main>
        <footer className="no-print px-6 pb-5 text-center text-2xs text-fg-subtle">
          ثانوية النجاة بنين – حولي · نظام الإدارة المدرسية
        </footer>
      </div>
    </div>
  );
}
