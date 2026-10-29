/**
 * API-level authorization tests. These talk to a local Supabase through
 * the public (anon) key exactly like the browser does, so they prove the
 * database — not just the UI — enforces the permission matrix.
 *
 * Prerequisite: `npx supabase start && npx supabase db reset && npm run seed:dev`
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anonClient, CLASS, isSchoolDay, kwToday, serviceClient, signIn, STUDENT } from './helpers';

let admin: SupabaseClient, affairs: SupabaseClient, affairs2: SupabaseClient;
let t1: SupabaseClient, t4: SupabaseClient;
let ids: Record<string, string>;

beforeAll(async () => {
  [admin, affairs, affairs2, t1, t4] = await Promise.all([
    signIn('admin@najat.test'), signIn('affairs@najat.test'), signIn('affairs2@najat.test'),
    signIn('teacher1@najat.test'), signIn('teacher4@najat.test'),
  ]);
  const { data } = await serviceClient().from('profiles').select('id, email');
  ids = Object.fromEntries((data ?? []).map((p) => [p.email as string, p.id as string]));
});

const today = kwToday();
// Most recent school day on or before today.
function lastSchoolDay() {
  const d = new Date(`${today}T00:00:00Z`);
  while (!isSchoolDay(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

describe('anonymous access', () => {
  it('cannot read any school data', async () => {
    const anon = anonClient();
    for (const table of ['students', 'profiles', 'attendance_records', 'behavior_incidents', 'audit_logs', 'school_settings']) {
      const { data, error } = await anon.from(table).select('*').limit(1);
      expect(error ?? (data && data.length === 0 ? 'empty' : null), table).toBeTruthy();
    }
  });
  it('cannot self-register an account', async () => {
    const { data, error } = await anonClient().auth.signUp({ email: `intruder${Date.now()}@example.com`, password: 'Sup3r-Secret-pass' });
    expect(error?.message ?? '').toMatch(/not allowed|disabled/i);
    expect(data.user).toBeNull();
  });
  it('rejects auth users not created as staff, even through the admin API', async () => {
    // guard_auth_user_insert: the defence behind a mis-set "allow sign-ups".
    const svc = serviceClient();
    const plain = await svc.auth.admin.createUser({ email: `nostaff${Date.now()}@example.com`, password: 'Sup3r-Secret-pass1', email_confirm: true });
    expect(plain.error).toBeTruthy();
    const staff = await svc.auth.admin.createUser({ email: `staff${Date.now()}@example.com`, password: 'Sup3r-Secret-pass1', email_confirm: true, app_metadata: { staff: true } });
    expect(staff.error).toBeNull();
    await svc.auth.admin.deleteUser(staff.data.user!.id);
  });
  it('has EXECUTE on no public function (including PUBLIC-inherited grants)', async () => {
    for (const fn of ['save_attendance', 'submit_incident', 'create_student', 'transition_incident', 'review_absence_excuse', 'search_students', 'my_roles']) {
      const { error } = await anonClient().rpc(fn as never, {} as never);
      expect(error, fn).toBeTruthy();
      expect(error!.message, fn).not.toMatch(/يجب تسجيل الدخول/); // rejected before the function body runs
    }
  });
  it('cannot call workflow functions', async () => {
    const { error } = await anonClient().rpc('dashboard_overview', { p_from: today, p_to: today });
    expect(error).toBeTruthy();
  });
});

describe('student and class scoping', () => {
  it('managers see all students', async () => {
    const { count } = await affairs.from('students').select('id', { count: 'exact', head: true });
    const { count: actual } = await serviceClient().from('students').select('id', { count: 'exact', head: true });
    expect(count).toBe(actual);
    expect(count).toBeGreaterThanOrEqual(198);
  });
  it('teacher sees only students of assigned classes', async () => {
    const { count } = await t1.from('students').select('id', { count: 'exact', head: true });
    // Expected = distinct students ever enrolled in 10/1, 10/2, 11/2, 11/3 (computed with service role).
    const { data: enr } = await serviceClient().from('enrollments').select('student_id').in('class_id', [CLASS(10, 1), CLASS(10, 2), CLASS(11, 2), CLASS(11, 3)]);
    expect(count).toBe(new Set(enr!.map((e) => e.student_id)).size);
    expect(count).toBeGreaterThanOrEqual(88);
    const { data: classes } = await t1.from('school_classes').select('id');
    expect(classes?.map((c) => c.id).sort()).toEqual([CLASS(10, 1), CLASS(10, 2), CLASS(11, 2), CLASS(11, 3)].sort());
  });
  it('teacher cannot read an unassigned student by UUID', async () => {
    const { data } = await t1.from('students').select('id').eq('id', STUDENT(140)).maybeSingle();
    expect(data).toBeNull();
  });
  it('unassigned teacher sees nothing', async () => {
    const { count } = await t4.from('students').select('id', { count: 'exact', head: true });
    expect(count).toBe(0);
    const { data } = await t4.from('attendance_sessions').select('id').limit(1);
    expect(data).toEqual([]);
  });
  it('teacher cannot create or edit students', async () => {
    const ins = await t1.from('students').insert({ student_number: 'X-999', full_name: 'طالب تجريبي' });
    expect(ins.error).toBeTruthy();
    const upd = await t1.from('students').update({ full_name: 'تغيير' }).eq('id', STUDENT(1)).select();
    expect(upd.error ?? (upd.data?.length === 0 ? 'blocked' : null)).toBeTruthy();
    const rpc = await t1.rpc('create_student', {
      p_student_number: 'X-998', p_full_name: 'طالب تجريبي', p_date_of_birth: null, p_guardian_name: null,
      p_guardian_phone: null, p_notes: null, p_class_id: null,
    });
    expect(rpc.error?.code).toBe('42501');
  });
});

describe('role escalation', () => {
  it('teacher cannot grant themselves a role', async () => {
    const { error } = await t1.from('user_roles').insert({ user_id: ids['teacher1@najat.test'], role: 'admin' });
    expect(error).toBeTruthy();
    const { data } = await t1.rpc('my_roles');
    expect(data).toEqual(['teacher']);
  });
  it('user metadata does not grant roles', async () => {
    await t1.auth.updateUser({ data: { role: 'admin', roles: ['admin'] } });
    const { data } = await t1.rpc('my_roles');
    expect(data).toEqual(['teacher']);
  });
  it('teacher can rename themselves but not reactivate/deactivate', async () => {
    const ok = await t1.from('profiles').update({ full_name: 'أ. حمود الكندري (تجريبي)' }).eq('id', ids['teacher1@najat.test']).select();
    expect(ok.error).toBeNull();
    expect(ok.data).toHaveLength(1);
    const bad = await t1.from('profiles').update({ is_active: false }).eq('id', ids['teacher1@najat.test']);
    expect(bad.error).toBeTruthy();
    const other = await t1.from('profiles').update({ full_name: 'hacked' }).eq('id', ids['admin@najat.test']).select();
    expect(other.data ?? []).toHaveLength(0);
  });
  it('admin cannot remove their own admin role', async () => {
    const { error } = await admin.from('user_roles').delete().eq('user_id', ids['admin@najat.test']).eq('role', 'admin');
    expect(error?.message).toContain('المدير');
  });
  it('student affairs cannot manage roles or settings', async () => {
    const r = await affairs.from('user_roles').insert({ user_id: ids['teacher4@najat.test'], role: 'student_affairs' });
    expect(r.error).toBeTruthy();
    const s = await affairs.from('school_settings').update({ periods_per_day: 9 }).eq('id', 1).select();
    expect(s.data ?? []).toHaveLength(0);
  });
});

describe('attendance', () => {
  it('direct writes to attendance tables are rejected', async () => {
    const { data: session } = await t1.from('attendance_sessions').select('id').eq('class_id', CLASS(10, 1)).limit(1).single();
    const ins = await t1.from('attendance_records').insert({ session_id: session!.id, student_id: STUDENT(1), enrollment_id: STUDENT(1), status: 'present' });
    expect(ins.error).toBeTruthy();
    const upd = await t1.from('attendance_records').update({ status: 'absent' }).eq('session_id', session!.id).select();
    expect(upd.error ?? (upd.data?.length === 0 ? 'blocked' : null)).toBeTruthy();
  });
  it('teacher cannot record attendance for an unassigned class', async () => {
    const { error } = await t1.rpc('save_attendance', {
      p_class_id: CLASS(12, 1), p_date: lastSchoolDay(), p_period: 0,
      p_records: [{ student_id: STUDENT(133), status: 'present' }], p_submit: false,
    });
    expect(error?.code).toBe('42501');
  });
  it('rejects a student who is not enrolled in the class', async () => {
    const { error } = await affairs.rpc('save_attendance', {
      p_class_id: CLASS(10, 1), p_date: lastSchoolDay(), p_period: 0,
      p_records: [{ student_id: STUDENT(140), status: 'present' }], p_submit: false,
    });
    expect(error?.code).toBe('23514');
  });
  it('rejects future dates and period numbers in daily mode', async () => {
    const future = await affairs.rpc('save_attendance', {
      p_class_id: CLASS(10, 1), p_date: '2027-01-05', p_period: 0, p_records: [], p_submit: false,
    });
    expect(future.error).toBeTruthy();
    const period = await affairs.rpc('save_attendance', {
      p_class_id: CLASS(10, 1), p_date: lastSchoolDay(), p_period: 3, p_records: [], p_submit: false,
    });
    expect(period.error?.message).toContain('يومي');
  });
  it('database enforces one record per student per session', async () => {
    const svc = serviceClient();
    const { data: rec } = await svc.from('attendance_records').select('session_id, student_id, enrollment_id').limit(1).single();
    const { error } = await svc.from('attendance_records').insert({ ...rec, status: 'present' });
    expect(error?.code).toBe('23505');
  });
  it('database enforces one session per class/date/period', async () => {
    const svc = serviceClient();
    const { data: s } = await svc.from('attendance_sessions').select('class_id, session_date, period').limit(1).single();
    const { error } = await svc.from('attendance_sessions').insert(s!);
    expect(error?.code).toBe('23505');
  });
  it('submission requires every enrolled student to be marked; unmarked is not absent', async () => {
    const day = lastSchoolDay();
    const cls = CLASS(10, 3);
    const partial = await affairs.rpc('save_attendance', {
      p_class_id: cls, p_date: day, p_period: 0,
      p_records: [{ student_id: STUDENT(45), status: 'present' }], p_submit: true,
    });
    expect(partial.error?.message).toContain('دون رصد');
    // The failed submit rolled back atomically; save a draft instead.
    const draft = await affairs.rpc('save_attendance', {
      p_class_id: cls, p_date: day, p_period: 0,
      p_records: [{ student_id: STUDENT(45), status: 'present' }], p_submit: false,
    });
    expect(draft.error).toBeNull();
    const { data: summary } = await affairs.rpc('attendance_student_summary', { p_from: day, p_to: day, p_class_id: cls });
    expect(summary).toHaveLength(1); // only the marked student appears
    expect(summary![0].absent).toBe(0);
  });
  it('corrections to submitted sessions require a reason and are recorded', async () => {
    const { data: s } = await affairs.from('attendance_sessions').select('id, class_id, session_date')
      .eq('class_id', CLASS(10, 1)).eq('status', 'submitted').order('session_date').limit(1).single();
    const { data: rec } = await affairs.from('attendance_records').select('student_id, status').eq('session_id', s!.id).limit(1).single();
    const next = rec!.status === 'present' ? 'late' : 'present';
    const args = { p_class_id: s!.class_id, p_date: s!.session_date, p_period: 0, p_records: [{ student_id: rec!.student_id, status: next, minutes_late: next === 'late' ? 10 : null }], p_submit: false };
    const noReason = await affairs.rpc('save_attendance', args);
    expect(noReason.error?.message).toContain('سبب');
    const withReason = await affairs.rpc('save_attendance', { ...args, p_reason: 'خطأ في الرصد' });
    expect(withReason.error).toBeNull();
    const { data: corr } = await affairs.from('attendance_corrections').select('old_status, new_status, reason').eq('session_id', s!.id);
    expect(corr).toContainEqual({ old_status: rec!.status, new_status: next, reason: 'خطأ في الرصد' });
    // Teacher (not same day) cannot correct a submitted session.
    const teacher = await t1.rpc('save_attendance', { ...args, p_reason: 'محاولة' });
    expect(teacher.error).toBeTruthy();
  });
  it.skipIf(!isSchoolDay(today))('teacher can record and submit attendance for an assigned class today', async () => {
    const { data: roster } = await t1.rpc('class_roster', { p_class_id: CLASS(10, 2), p_date: today });
    expect(roster!.length).toBeGreaterThan(0);
    const records = roster!.map((r: { student_id: string }, i: number) => ({ student_id: r.student_id, status: i === 0 ? 'absent' : 'present' }));
    // A reason is supplied so re-runs (session already submitted today) are a valid same-day correction.
    const { error } = await t1.rpc('save_attendance', { p_class_id: CLASS(10, 2), p_date: today, p_period: 0, p_records: records, p_submit: true, p_reason: 'اختبار آلي' });
    expect(error).toBeNull();
    const { data: s } = await t1.from('attendance_sessions').select('status').eq('class_id', CLASS(10, 2)).eq('session_date', today).single();
    expect(s!.status).toBe('submitted');
  });
});

describe('behaviour incidents', () => {
  let incidentId: string;
  it('teacher can report on own students only', async () => {
    const bad = await t1.rpc('submit_incident', {
      p_category_id: (await t1.from('behavior_categories').select('id').limit(1).single()).data!.id,
      p_incident_date: today, p_location: null, p_description: 'وصف تجريبي للواقعة لغرض الاختبار', p_severity: 'low',
      p_student_ids: [STUDENT(140)],
    });
    expect(bad.error?.code).toBe('42501');
    const ok = await t1.rpc('submit_incident', {
      p_category_id: (await t1.from('behavior_categories').select('id').limit(1).single()).data!.id,
      p_incident_date: today, p_location: 'الفصل', p_description: 'وصف تجريبي للواقعة لغرض الاختبار', p_severity: 'low',
      p_student_ids: [STUDENT(3)],
    });
    expect(ok.error).toBeNull();
    incidentId = ok.data as string;
  });
  it('teachers only see incidents they reported', async () => {
    const { data } = await t1.from('behavior_incidents').select('reported_by');
    expect(new Set(data!.map((r) => r.reported_by))).toEqual(new Set([ids['teacher1@najat.test']]));
    const { data: t4data } = await t4.from('behavior_incidents').select('id');
    expect(t4data).toEqual([]);
  });
  it('teacher cannot change status directly or via review function', async () => {
    const direct = await t1.from('behavior_incidents').update({ status: 'approved' } as never).eq('id', incidentId);
    expect(direct.error).toBeTruthy();
    const rpc = await t1.rpc('transition_incident', { p_incident_id: incidentId, p_to_status: 'approved', p_note: 'موافقة' });
    expect(rpc.error?.code).toBe('42501');
  });
  it('enforces lifecycle transitions and decision notes', async () => {
    const skip = await affairs.rpc('transition_incident', { p_incident_id: incidentId, p_to_status: 'resolved', p_note: 'إغلاق' });
    expect(skip.error?.message).toContain('غير مسموح');
    const noNote = await affairs.rpc('transition_incident', { p_incident_id: incidentId, p_to_status: 'approved' });
    expect(noNote.error).toBeTruthy();
    expect((await affairs.rpc('transition_incident', { p_incident_id: incidentId, p_to_status: 'under_review' })).error).toBeNull();
    expect((await affairs.rpc('transition_incident', { p_incident_id: incidentId, p_to_status: 'approved', p_note: 'تم التحقق' })).error).toBeNull();
    const { data: actions } = await t1.from('incident_actions').select('action_type, to_status').eq('incident_id', incidentId).order('created_at');
    expect(actions!.map((a) => a.to_status)).toEqual(['submitted', 'under_review', 'approved']);
  });
  it('reviewers cannot review an incident they reported', async () => {
    const { data: cat } = await affairs.from('behavior_categories').select('id').limit(1).single();
    const { data: id } = await affairs.rpc('submit_incident', {
      p_category_id: cat!.id, p_incident_date: today, p_location: null,
      p_description: 'بلاغ من شؤون الطلبة لاختبار منع المراجعة الذاتية', p_severity: 'medium', p_student_ids: [STUDENT(150)],
    });
    const self = await affairs.rpc('transition_incident', { p_incident_id: id, p_to_status: 'approved', p_note: 'ذاتي' });
    expect(self.error?.message).toContain('قمت برفعه');
    const other = await affairs2.rpc('transition_incident', { p_incident_id: id, p_to_status: 'rejected', p_note: 'غير مكتمل' });
    expect(other.error).toBeNull();
  });
});

describe('follow-ups', () => {
  it('assignee can change status but not reassign or retitle', async () => {
    const { data: task } = await t1.from('follow_up_tasks').select('id, status').eq('assigned_to', ids['teacher1@najat.test']).limit(1).single();
    const retitle = await t1.from('follow_up_tasks').update({ title: 'عنوان جديد' }).eq('id', task!.id);
    expect(retitle.error).toBeTruthy();
    const reassign = await t1.from('follow_up_tasks').update({ assigned_to: ids['teacher4@najat.test'] }).eq('id', task!.id);
    expect(reassign.error).toBeTruthy();
    const status = await t1.from('follow_up_tasks').update({ status: 'in_progress', outcome: 'جارٍ التواصل' }).eq('id', task!.id).select('status');
    expect(status.error).toBeNull();
    expect(status.data![0].status).toBe('in_progress');
  });
  it('teachers cannot see tasks of other staff', async () => {
    const { data } = await t4.from('follow_up_tasks').select('assigned_to, created_by');
    for (const row of data!) expect([row.assigned_to, row.created_by]).toContain(ids['teacher4@najat.test']);
  });
  it('teacher cannot create tasks for other staff', async () => {
    const { error } = await t1.from('follow_up_tasks').insert({ title: 'مهمة لغيري', assigned_to: ids['teacher4@najat.test'] });
    expect(error).toBeTruthy();
  });
  it('assignment creates a notification for the assignee only', async () => {
    const { data: task, error } = await affairs.from('follow_up_tasks')
      .insert({ title: 'مهمة اختبار الإشعارات', assigned_to: ids['teacher4@najat.test'], student_id: null }).select('id').single();
    expect(error).toBeNull();
    const { data: mine } = await t4.from('notifications').select('link').eq('type', 'follow_up_assigned');
    expect(mine!.some((n) => n.link === `/follow-ups/${task!.id}`)).toBe(true);
    const { data: others } = await t1.from('notifications').select('recipient_id');
    expect(new Set(others!.map((n) => n.recipient_id))).toEqual(new Set([ids['teacher1@najat.test']]));
  });
});

describe('audit log', () => {
  it('is readable only by admins and is immutable', async () => {
    const { data: teacher } = await t1.from('audit_logs').select('id').limit(1);
    expect(teacher).toEqual([]);
    const { data: sa } = await affairs.from('audit_logs').select('id').limit(1);
    expect(sa).toEqual([]);
    const { data: rows } = await admin.from('audit_logs').select('id').limit(1);
    expect(rows!.length).toBe(1);
    const del = await admin.from('audit_logs').delete().eq('id', rows![0].id);
    expect(del.error).toBeTruthy();
    const svcDel = await serviceClient().from('audit_logs').delete().eq('id', rows![0].id);
    expect(svcDel.error?.message).toContain('غير قابل');
  });
});

describe('reports respect scope', () => {
  it('teacher class summary only includes assigned classes', async () => {
    const { data } = await t1.rpc('class_attendance_summary', { p_from: '2026-09-01', p_to: today });
    const withData = data!.filter((r: { sessions: number }) => r.sessions > 0).map((r: { class_id: string }) => r.class_id);
    for (const id of withData) expect([CLASS(10, 1), CLASS(10, 2), CLASS(11, 2), CLASS(11, 3)]).toContain(id);
  });
  it('student summary for a teacher excludes other classes', async () => {
    const { data } = await t1.rpc('attendance_student_summary', { p_from: '2026-09-01', p_to: today });
    expect(data!.every((r: { class_id: string }) => [CLASS(10, 1), CLASS(10, 2), CLASS(11, 2), CLASS(11, 3)].includes(r.class_id))).toBe(true);
  });
});
