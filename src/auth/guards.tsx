import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import type { Permission } from '@/lib/domain/permissions';
import { FullPageLoader } from '@/components/layout/FullPageLoader';
import { UnauthorizedPage } from '@/features/errors/ErrorPages';
import { isStandalone } from '@/pwa/standalone';
import { ForcePasswordChangePage } from '@/features/auth/ChangePassword';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <FullPageLoader />;
  if (auth.status === 'signed_out') {
    // A first visit to the site root in a browser shows the public landing
    // page; the installed app goes straight to sign-in.
    if (location.pathname === '/' && !auth.sessionExpired && !isStandalone()) return <Navigate to="/welcome" replace />;
    // Only return to the previous page after an expired session — never after
    // an explicit sign-out (the next person at this computer may be someone else).
    return <Navigate to="/login" replace state={auth.sessionExpired ? { from: location.pathname + location.search } : null} />;
  }
  // An admin-set temporary password must be replaced before anything else.
  if (auth.profile?.must_change_password && !auth.inactive) return <ForcePasswordChangePage />;
  return <>{children}</>;
}

/** UI-level gate. The database enforces the same rule independently. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const auth = useAuth();
  if (!auth.can(permission)) return <UnauthorizedPage />;
  return <>{children}</>;
}
