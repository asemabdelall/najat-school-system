import * as React from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { can as canDo, isManagerRole, ROLES, type Permission, type Role } from '@/lib/domain/permissions';

export type Profile = { id: string; full_name: string; email: string | null; phone: string | null; is_active: boolean };

type AuthState = {
  status: 'loading' | 'signed_out' | 'signed_in';
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  /** True when the account exists but has no active role (deactivated). */
  inactive: boolean;
  sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  can: (p: Permission) => boolean;
  isManager: boolean;
  isAdmin: boolean;
};

const AuthContext = React.createContext<AuthState | null>(null);

async function loadIdentity(userId: string) {
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, phone, is_active').eq('id', userId).maybeSingle(),
    supabase.rpc('my_roles'),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (rolesRes.error) throw rolesRes.error;
  // Roles come from the database (user_roles), never from JWT metadata.
  const roles = (rolesRes.data ?? []).filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  return { profile: profileRes.data as Profile | null, roles };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<AuthState['status']>('loading');
  const [profile, setProfile] = React.useState<Profile | null>(null);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [sessionExpired, setSessionExpired] = React.useState(false);
  const explicitSignOut = React.useRef(false);

  const applySession = React.useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      setProfile(null);
      setRoles([]);
      setStatus('signed_out');
      return;
    }
    try {
      const identity = await loadIdentity(next.user.id);
      setProfile(identity.profile);
      setRoles(identity.roles);
      setStatus('signed_in');
    } catch {
      // Token rejected (expired/revoked) — treat as signed out.
      await supabase.auth.signOut({ scope: 'local' });
      setSessionExpired(true);
      setStatus('signed_out');
    }
  }, []);

  React.useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) void applySession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') {
        if (!explicitSignOut.current) setSessionExpired(true);
        explicitSignOut.current = false;
        queryClient.clear();
        setSession(null);
        setProfile(null);
        setRoles([]);
        setStatus('signed_out');
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(next);
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Defer to avoid calling Supabase inside the auth callback.
        setTimeout(() => void applySession(next), 0);
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession, queryClient]);

  const value = React.useMemo<AuthState>(() => {
    const active = Boolean(profile?.is_active) && roles.length > 0;
    const effectiveRoles = active ? roles : [];
    return {
      status,
      session,
      profile,
      roles: effectiveRoles,
      inactive: status === 'signed_in' && !active,
      sessionExpired,
      async signIn(email, password) {
        setSessionExpired(false);
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        await applySession(data.session);
      },
      async signOut() {
        explicitSignOut.current = true;
        setSessionExpired(false);
        await supabase.auth.signOut();
      },
      async refreshProfile() {
        if (session) await applySession(session);
      },
      can: (p) => canDo(effectiveRoles, p),
      isManager: isManagerRole(effectiveRoles),
      isAdmin: effectiveRoles.includes('admin'),
    };
  }, [status, session, profile, roles, sessionExpired, applySession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
