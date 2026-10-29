/**
 * Workflow integration tests against a local Supabase (see rls.test.ts for setup).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, CLASS, localEnv, PASSWORD, serviceClient, signIn, STUDENT } from './helpers';

let admin: SupabaseClient, affairs: SupabaseClient, t1: SupabaseClient;

beforeAll(async () => {
  [admin, affairs, t1] = await Promise.all([signIn('admin@najat.test'), signIn('affairs@najat.test'), signIn('teacher1@najat.test')]);
});

async function invokeAdmin(client: SupabaseClient, body: Record<string, unknown>) {
  const { data } = await client.auth.getSession();
  const res = await fetch(`${localEnv().url}/functions/v1/admin-users`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${data.session!.access_token}`, apikey: localEnv().anon, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as { id?: string; error?: string } };
}

describe('absence excuse approval', () => {
  it('converts covered absences to excused with a correction trail', async () => {
    const svc = serviceClient();
    const { data: rec } = await svc.from('attendance_records')
      .select('id, student_id, attendance_sessions!inner(session_date)').eq('status', 'absent').limit(1).single();
    const day = (rec as unknown as { attendance_sessions: { session_date: string } }).attendance_sessions.session_date;
    const { data: me } = await affairs.auth.getUser();
    const { data: excuse, error } = await affairs.from('absence_excuses')
      .insert({ student_id: rec!.student_id, from_date: day, to_date: day, reason_type: 'medical', submitted_by: me.user!.id, status: 'pending' })
      .select('id').single();
    expect(error).toBeNull();
    const t1Review = await t1.rpc('review_absence_excuse', { p_excuse_id: excuse!.id, p_decision: 'approved' });
    expect(t1Review.error?.code).toBe('42501');
    const { data: converted, error: e2 } = await affairs.rpc('review_absence_excuse', { p_excuse_id: excuse!.id, p_decision: 'approved', p_note: 'تقرير طبي' });
    expect(e2).toBeNull();
    expect(converted).toBeGreaterThanOrEqual(1);
    const { data: after } = await svc.from('attendance_records').select('status').eq('id', rec!.id).single();
    expect(after!.status).toBe('excused');
    const { data: corr } = await svc.from('attendance_corrections').select('source').eq('record_id', rec!.id);
    expect(corr!.some((c) => c.source === 'excuse_approval')).toBe(true);
    const again = await affairs.rpc('review_absence_excuse', { p_excuse_id: excuse!.id, p_decision: 'rejected', p_note: 'مكرر' });
    expect(again.error?.message).toContain('مسبقًا');
  });
  it('teachers cannot file excuses for other classes', async () => {
    const { data: me } = await t1.auth.getUser();
    const { error } = await t1.from('absence_excuses').insert({ student_id: STUDENT(140), from_date: '2026-10-20', to_date: '2026-10-20', reason_type: 'other', submitted_by: me.user!.id, status: 'pending' });
    expect(error).toBeTruthy();
  });
});

describe('attendance reopen', () => {
  it('managers reopen with a reason and notify the teacher; teachers cannot', async () => {
    const { data: s } = await affairs.from('attendance_sessions').select('id, taken_by').eq('class_id', CLASS(10, 1)).eq('status', 'submitted').order('session_date', { ascending: false }).limit(1).single();
    expect((await t1.rpc('reopen_attendance_session', { p_session_id: s!.id, p_reason: 'محاولة' })).error?.code).toBe('42501');
    expect((await affairs.rpc('reopen_attendance_session', { p_session_id: s!.id, p_reason: '' })).error).toBeTruthy();
    expect((await affairs.rpc('reopen_attendance_session', { p_session_id: s!.id, p_reason: 'استكمال الرصد' })).error).toBeNull();
    const { data: n } = await t1.from('notifications').select('type').eq('type', 'attendance_reopened');
    expect(n!.length).toBeGreaterThan(0);
    const { data: audit } = await admin.from('audit_logs').select('action, reason').eq('record_id', s!.id).eq('action', 'attendance_reopened');
    expect(audit![0].reason).toBe('استكمال الرصد');
  });
});

describe('enrollment history', () => {
  it('transfers keep the previous enrollment instead of deleting it', async () => {
    const { data: created, error } = await affairs.rpc('create_student', {
      p_student_number: `T-${Date.now().toString().slice(-8)}`, p_full_name: 'طالب نقل تجريبي',
      p_date_of_birth: null as unknown as string, p_guardian_name: null as unknown as string, p_guardian_phone: null as unknown as string,
      p_notes: null as unknown as string, p_class_id: CLASS(11, 1),
    });
    expect(error).toBeNull();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(new Date());
    expect((await affairs.rpc('enroll_student', { p_student_id: created, p_class_id: CLASS(11, 1), p_date: today })).error?.message).toContain('بالفعل');
    expect((await affairs.rpc('enroll_student', { p_student_id: created, p_class_id: CLASS(11, 2), p_date: today })).error).toBeNull();
    const { data: rows } = await affairs.from('enrollments').select('class_id, status').eq('student_id', created as string).order('created_at');
    expect(rows).toEqual([{ class_id: CLASS(11, 1), status: 'transferred' }, { class_id: CLASS(11, 2), status: 'active' }]);
  });
  it('rejects duplicate student numbers (case-insensitive)', async () => {
    const { error } = await affairs.rpc('create_student', {
      p_student_number: 'nj-2027-0001', p_full_name: 'مكرر', p_date_of_birth: null as unknown as string, p_guardian_name: null as unknown as string,
      p_guardian_phone: null as unknown as string, p_notes: null as unknown as string, p_class_id: null as unknown as string,
    });
    expect(error?.code).toBe('23505');
  });
  it('search is scoped by RLS and Arabic-normalised', async () => {
    const { data: all } = await affairs.rpc('search_students', { p_search: 'احمد', p_limit: 200 });
    const { data: mine } = await t1.rpc('search_students', { p_search: 'احمد', p_limit: 200 });
    expect(all!.length).toBeGreaterThan(mine!.length);
    expect(mine!.every((r: { class_id: string }) => [CLASS(10, 1), CLASS(10, 2), CLASS(11, 2), CLASS(11, 3)].includes(r.class_id))).toBe(true);
  });
});

describe('admin-users edge function', () => {
  const email = `staff${Date.now()}@najat.test`;
  let newId: string;
  it('rejects non-admin callers', async () => {
    const r = await invokeAdmin(affairs, { action: 'create', email, full_name: 'x', password: 'Abcdef12345', roles: ['teacher'] });
    expect(r.status).toBe(403);
  });
  it('validates input', async () => {
    const r = await invokeAdmin(admin, { action: 'create', email, full_name: 'معلم', password: 'short', roles: ['teacher'] });
    expect(r.status).toBe(400);
    const r2 = await invokeAdmin(admin, { action: 'create', email, full_name: 'معلم', password: 'Abcdef12345', roles: ['superuser'] });
    expect(r2.status).toBe(400);
  });
  it('creates a staff account with roles from the database', async () => {
    const r = await invokeAdmin(admin, { action: 'create', email, full_name: 'معلم تجريبي جديد', password: 'Abcdef12345', roles: ['teacher'] });
    expect(r.status).toBe(200);
    newId = r.body.id!;
    const c = anonClient();
    expect((await c.auth.signInWithPassword({ email, password: 'Abcdef12345' })).error).toBeNull();
    expect((await c.rpc('my_roles')).data).toEqual(['teacher']);
    const dup = await invokeAdmin(admin, { action: 'create', email, full_name: 'مكرر', password: 'Abcdef12345', roles: ['teacher'] });
    expect(dup.status).toBe(409);
  });
  it('a new account must replace its temporary password, and cannot skip that', async () => {
    const c = anonClient();
    await c.auth.signInWithPassword({ email, password: 'Abcdef12345' });
    const flag = async () => (await c.from('profiles').select('must_change_password').eq('id', newId).single()).data?.must_change_password;
    expect(await flag()).toBe(true);
    // Clearing the flag directly is refused by guard_profile_update.
    expect((await c.from('profiles').update({ must_change_password: false }).eq('id', newId)).error).toBeTruthy();
    expect((await c.auth.updateUser({ password: 'NewPassw0rd99' })).error).toBeNull();
    expect((await c.rpc('password_changed')).error).toBeNull();
    expect(await flag()).toBe(false);
    // An admin reset makes it temporary again.
    expect((await invokeAdmin(admin, { action: 'reset_password', user_id: newId, password: 'Abcdef12345' })).status).toBe(200);
    expect(await flag()).toBe(true);
  });
  it('deactivation blocks sign-in and data access', async () => {
    const c = anonClient();
    await c.auth.signInWithPassword({ email, password: 'Abcdef12345' });
    const r = await invokeAdmin(admin, { action: 'set_active', user_id: newId, active: false });
    expect(r.status).toBe(200);
    // Existing session: RLS denies everything because the profile is inactive.
    expect((await c.rpc('my_roles')).data).toEqual([]);
    // Only their own profile (needed to show the "account inactive" message); no school data.
    expect((await c.from('profiles').select('id')).data).toEqual([{ id: newId }]);
    expect((await c.from('students').select('id').limit(1)).data).toEqual([]);
    const again = await anonClient().auth.signInWithPassword({ email, password: 'Abcdef12345' });
    expect(again.error?.message).toMatch(/banned/i);
  });
  it('admin cannot deactivate themselves', async () => {
    const { data } = await admin.auth.getUser();
    expect((await invokeAdmin(admin, { action: 'set_active', user_id: data.user!.id, active: false })).status).toBe(400);
  });
  void PASSWORD;
});
