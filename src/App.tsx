import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingState } from '@/components/ui/states';
import { RequireAuth, RequirePermission } from '@/auth/guards';
import type { Permission } from '@/lib/domain/permissions';
import { LoginPage } from '@/features/auth/LoginPage';
import { NotFoundPage } from '@/features/errors/ErrorPages';
import { RouteErrorBoundary } from '@/features/errors/RouteErrorBoundary';

const page = <M, K extends keyof M>(loader: () => Promise<M>, name: K) =>
  lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));

const LandingPage = page(() => import('@/features/landing/LandingPage'), 'LandingPage');
const DashboardPage = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const StudentsPage = page(() => import('@/features/students/StudentsPage'), 'StudentsPage');
const StudentDetailPage = page(() => import('@/features/students/StudentDetailPage'), 'StudentDetailPage');
const ClassesPage = page(() => import('@/features/classes/ClassesPage'), 'ClassesPage');
const ClassDetailPage = page(() => import('@/features/classes/ClassDetailPage'), 'ClassDetailPage');
const AttendancePage = page(() => import('@/features/attendance/AttendancePage'), 'AttendancePage');
const TakeAttendancePage = page(() => import('@/features/attendance/TakeAttendancePage'), 'TakeAttendancePage');
const ExcusesPage = page(() => import('@/features/attendance/ExcusesPage'), 'ExcusesPage');
const IncidentsPage = page(() => import('@/features/behavior/IncidentsPage'), 'IncidentsPage');
const NewIncidentPage = page(() => import('@/features/behavior/NewIncidentPage'), 'NewIncidentPage');
const IncidentDetailPage = page(() => import('@/features/behavior/IncidentDetailPage'), 'IncidentDetailPage');
const FollowUpsPage = page(() => import('@/features/followups/FollowUpsPage'), 'FollowUpsPage');
const FollowUpDetailPage = page(() => import('@/features/followups/FollowUpDetailPage'), 'FollowUpDetailPage');
const NotificationsPage = page(() => import('@/features/notifications/NotificationsPage'), 'NotificationsPage');
const ReportsPage = page(() => import('@/features/reports/ReportsPage'), 'ReportsPage');
const UsersPage = page(() => import('@/features/users/UsersPage'), 'UsersPage');
const SettingsPage = page(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const AuditLogPage = page(() => import('@/features/audit/AuditLogPage'), 'AuditLogPage');

function guarded(permission: Permission, element: ReactNode) {
  return (
    <RequirePermission permission={permission}>
      <Suspense fallback={<LoadingState rows={6} />}>{element}</Suspense>
    </RequirePermission>
  );
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorBoundary /> },
  {
    path: '/welcome',
    element: (
      <Suspense fallback={null}>
        <LandingPage />
      </Suspense>
    ),
    errorElement: <RouteErrorBoundary />,
  },
  {
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        errorElement: <RouteErrorBoundary />,
        children: [
          { index: true, handle: { section: 'لوحة التحكم' }, element: guarded('dashboard.view', <DashboardPage />) },
          {
            path: 'students',
            handle: { section: 'الطلاب' },
            element: <Outlet />,
            children: [
              { index: true, element: guarded('students.view', <StudentsPage />) },
              { path: ':studentId', element: guarded('students.view', <StudentDetailPage />) },
            ],
          },
          {
            path: 'classes',
            handle: { section: 'الصفوف والفصول' },
            children: [
              { index: true, element: guarded('classes.view', <ClassesPage />) },
              { path: ':classId', element: guarded('classes.view', <ClassDetailPage />) },
            ],
          },
          {
            path: 'attendance',
            handle: { section: 'الحضور والغياب' },
            children: [
              { index: true, element: guarded('attendance.take', <AttendancePage />) },
              { path: 'take', element: guarded('attendance.take', <TakeAttendancePage />) },
              { path: 'excuses', element: guarded('excuses.submit', <ExcusesPage />) },
            ],
          },
          {
            path: 'behavior',
            handle: { section: 'السلوك الطلابي' },
            children: [
              { index: true, element: guarded('behavior.report', <IncidentsPage />) },
              { path: 'new', element: guarded('behavior.report', <NewIncidentPage />) },
              { path: ':incidentId', element: guarded('behavior.report', <IncidentDetailPage />) },
            ],
          },
          {
            path: 'follow-ups',
            handle: { section: 'المتابعة' },
            children: [
              { index: true, element: guarded('followups.view', <FollowUpsPage />) },
              { path: ':taskId', element: guarded('followups.view', <FollowUpDetailPage />) },
            ],
          },
          { path: 'notifications', handle: { section: 'الإشعارات' }, element: guarded('notifications.view', <NotificationsPage />) },
          { path: 'reports', handle: { section: 'التقارير' }, element: guarded('reports.view', <ReportsPage />) },
          { path: 'users', handle: { section: 'المستخدمون والصلاحيات' }, element: guarded('users.manage', <UsersPage />) },
          { path: 'settings', handle: { section: 'الإعدادات' }, element: guarded('settings.manage', <SettingsPage />) },
          { path: 'audit', handle: { section: 'سجل التدقيق' }, element: guarded('audit.view', <AuditLogPage />) },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}

