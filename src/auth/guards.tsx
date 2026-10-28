import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './AuthProvider';
import type { Permission } from '@/lib/domain/permissions';
import { FullPageLoader } from '@/components/layout/FullPageLoader';
import { UnauthorizedPage } from '@/features/errors/ErrorPages';

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.status === 'loading') return <FullPageLoader />;
  if (auth.status === 'signed_out') {
    // Only return to the previous page after an expired session — never after
    // an explicit sign-out (the next person at this computer may be someone else).
    return <Navigate to="/login" replace state={auth.sessionExpired ? { from: location.pathname + location.search } : null} />;
  }
  return <>{children}</>;
}

/** UI-level gate. The database enforces the same rule independently. */
export function RequirePermission({ permission, children }: { permission: Permission; children: ReactNode }) {
  const auth = useAuth();
  if (!auth.can(permission)) return <UnauthorizedPage />;
  return <>{children}</>;
}
