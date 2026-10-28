// Edge Function: privileged staff-account operations (admin only).
// The service-role key is available ONLY inside the Edge runtime; it is
// never sent to or bundled for the browser.
// Uses the Auth/PostgREST HTTP APIs directly so the function has no
// third-party dependencies to download at boot.

const ROLES = ['admin', 'student_affairs', 'teacher'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function validPassword(p: unknown): p is string {
  return typeof p === 'string' && p.length >= 10 && p.length <= 72 && /[A-Za-z]/.test(p) && /[0-9]/.test(p);
}

type ApiResult = { ok: boolean; status: number; data: any };

async function api(path: string, init: RequestInit & { token: string; apikey: string; prefer?: string }): Promise<ApiResult> {
  const headers: Record<string, string> = {
    apikey: init.apikey,
    Authorization: `Bearer ${init.token}`,
    'Content-Type': 'application/json',
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const res = await fetch(`${SUPABASE_URL}${path}`, { method: init.method ?? 'GET', body: init.body, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

const asService = (path: string, init: RequestInit & { prefer?: string } = {}) =>
  api(path, { ...init, token: SERVICE_KEY, apikey: SERVICE_KEY });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'طريقة غير مدعومة' });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return reply(401, { error: 'يجب تسجيل الدخول' });
  const callerToken = authHeader.slice(7);

  // 1. Identify the caller with THEIR token and check the admin role in
  //    the database (roles in JWT/user metadata are never trusted).
  const me = await api('/auth/v1/user', { token: callerToken, apikey: ANON_KEY });
  if (!me.ok || !me.data?.id) return reply(401, { error: 'الجلسة غير صالحة' });
  const roles = await api('/rest/v1/rpc/my_roles', { method: 'POST', body: '{}', token: callerToken, apikey: ANON_KEY });
  if (!roles.ok || !Array.isArray(roles.data) || !roles.data.includes('admin')) {
    return reply(403, { error: 'هذه العملية متاحة لمدير النظام فقط' });
  }
  const callerId: string = me.data.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return reply(400, { error: 'طلب غير صالح' });
  }

  const audit = (action: string, recordId: string, changes: Record<string, unknown>) =>
    asService('/rest/v1/audit_logs', {
      method: 'POST', prefer: 'return=minimal',
      body: JSON.stringify({ actor_id: callerId, action, table_name: 'auth.users', record_id: recordId, changes }),
    });

  switch (body.action) {
    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const fullName = String(body.full_name ?? '').trim();
      const roleList = Array.isArray(body.roles) ? body.roles.map(String) : [];
      if (!EMAIL_RE.test(email)) return reply(400, { error: 'البريد الإلكتروني غير صالح' });
      if (fullName.length < 2 || fullName.length > 120) return reply(400, { error: 'الاسم غير صالح' });
      if (!validPassword(body.password)) return reply(400, { error: 'كلمة المرور يجب أن تكون ١٠ أحرف على الأقل وتحتوي حروفًا وأرقامًا' });
      if (roleList.length === 0 || !roleList.every((r) => ROLES.includes(r))) {
        return reply(400, { error: 'يجب اختيار صلاحية واحدة صالحة على الأقل' });
      }
      const created = await asService('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({ email, password: body.password, email_confirm: true, user_metadata: { full_name: fullName } }),
      });
      if (!created.ok || !created.data?.id) {
        const msg = JSON.stringify(created.data ?? '');
        const exists = created.status === 422 || /already|registered|exists/i.test(msg);
        return reply(exists ? 409 : 400, { error: exists ? 'البريد الإلكتروني مسجل مسبقًا' : 'تعذر إنشاء الحساب' });
      }
      const id: string = created.data.id;
      await asService('/rest/v1/profiles?on_conflict=id', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: JSON.stringify({ id, full_name: fullName, email }),
      });
      const granted = await asService('/rest/v1/user_roles', {
        method: 'POST', prefer: 'return=minimal',
        body: JSON.stringify(roleList.map((role) => ({ user_id: id, role, granted_by: callerId }))),
      });
      if (!granted.ok) {
        await asService(`/auth/v1/admin/users/${id}`, { method: 'DELETE' });
        return reply(400, { error: 'تعذر منح الصلاحيات' });
      }
      await audit('create_user', id, { email, roles: roleList });
      return reply(200, { id });
    }

    case 'set_active': {
      const userId = String(body.user_id ?? '');
      const active = body.active === true;
      if (!UUID_RE.test(userId)) return reply(400, { error: 'معرف غير صالح' });
      if (userId === callerId) return reply(400, { error: 'لا يمكنك تعطيل حسابك بنفسك' });
      if (!active) {
        const admins = await asService('/rest/v1/user_roles?select=user_id&role=eq.admin');
        const adminIds: string[] = (admins.data ?? []).map((r: { user_id: string }) => r.user_id);
        if (adminIds.includes(userId)) {
          const others = adminIds.filter((a) => a !== userId);
          const active = others.length
            ? await asService(`/rest/v1/profiles?select=id&is_active=eq.true&id=in.(${others.join(',')})`)
            : { data: [] };
          if (!active.data?.length) return reply(400, { error: 'يجب أن يبقى مدير نشط واحد على الأقل' });
        }
      }
      const upd = await asService(`/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH', prefer: 'return=representation', body: JSON.stringify({ is_active: active }),
      });
      if (!upd.ok || !upd.data?.length) return reply(400, { error: 'تعذر تحديث الحساب' });
      // Ban/unban in Auth too so deactivated staff cannot sign in at all.
      const ban = await asService(`/auth/v1/admin/users/${userId}`, {
        method: 'PUT', body: JSON.stringify({ ban_duration: active ? 'none' : '876000h' }),
      });
      if (!ban.ok) return reply(500, { error: 'تم تعطيل الصلاحيات لكن تعذر إيقاف تسجيل الدخول' });
      await audit(active ? 'activate_user' : 'deactivate_user', userId, { is_active: active });
      return reply(200, { ok: true });
    }

    case 'reset_password': {
      const userId = String(body.user_id ?? '');
      if (!UUID_RE.test(userId)) return reply(400, { error: 'معرف غير صالح' });
      if (!validPassword(body.password)) return reply(400, { error: 'كلمة المرور يجب أن تكون ١٠ أحرف على الأقل وتحتوي حروفًا وأرقامًا' });
      const res = await asService(`/auth/v1/admin/users/${userId}`, {
        method: 'PUT', body: JSON.stringify({ password: body.password }),
      });
      if (!res.ok) return reply(400, { error: 'تعذر تعيين كلمة المرور' });
      await audit('reset_password', userId, {});
      return reply(200, { ok: true });
    }

    default:
      return reply(400, { error: 'عملية غير معروفة' });
  }
});
