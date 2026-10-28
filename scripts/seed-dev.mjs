#!/usr/bin/env node
// =====================================================================
// DEVELOPMENT-ONLY seeding: creates fictional staff accounts and the
// user-linked demo records (attendance, incidents, follow-ups, excuses).
//
// SAFETY: uses the service-role key, so it refuses to run against any
// Supabase URL that is not on localhost / 127.0.0.1. It must never be
// bundled into the frontend (it lives outside src/ and is not imported).
//
// Usage:  npx supabase db reset && npm run seed:dev
// =====================================================================
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function localStatus() {
  try {
    return JSON.parse(execSync('npx supabase status -o json', { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
  } catch {
    return {};
  }
}

const status = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? {} : localStatus();
const url = process.env.SUPABASE_URL ?? status.API_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? status.SERVICE_ROLE_KEY;
const password = process.env.DEV_SEED_PASSWORD ?? 'Najat-Dev-2026!';

if (!url || !serviceKey) {
  console.error('Could not determine local Supabase URL / service key. Is `npx supabase start` running?');
  process.exit(1);
}
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
  console.error(`Refusing to seed non-local Supabase project (${host}). This script is for local development only.`);
  process.exit(1);
}

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const STAFF = [
  { key: 'admin', email: 'admin@najat.test', name: 'أ. سليمان المطيري (تجريبي)', roles: ['admin'] },
  { key: 'affairs', email: 'affairs@najat.test', name: 'أ. منصور الحربي (تجريبي)', roles: ['student_affairs'] },
  { key: 'affairs2', email: 'affairs2@najat.test', name: 'أ. عيسى الفارس (تجريبي)', roles: ['student_affairs'] },
  { key: 't1', email: 'teacher1@najat.test', name: 'أ. حمود الكندري (تجريبي)', roles: ['teacher'] },
  { key: 't2', email: 'teacher2@najat.test', name: 'أ. يعقوب الشمري (تجريبي)', roles: ['teacher'] },
  { key: 't3', email: 'teacher3@najat.test', name: 'أ. مشعل العنزي (تجريبي)', roles: ['teacher'] },
  { key: 't4', email: 'teacher4@najat.test', name: 'أ. ثامر الرشيدي (تجريبي)', roles: ['teacher'] },
];

const cls = (g, s) => `c0000000-0000-4000-8026-000000000${g}${s}`;
const studentId = (n) => `5e000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Class (g, s) holds students ((g-10)*3 + (s-1))*22 + 1 .. +22
const classStudents = (g, s) => {
  const start = ((g - 10) * 3 + (s - 1)) * 22 + 1;
  return Array.from({ length: 22 }, (_, i) => start + i).filter((n) => n !== 198).map(studentId);
};

// Teacher -> classes. teacher4 has no assignments (authorization tests).
const ASSIGNMENTS = [
  ['t1', cls(10, 1), 'الرياضيات', true], ['t1', cls(10, 2), 'الرياضيات', false],
  ['t2', cls(11, 1), 'اللغة العربية', true], ['t2', cls(11, 2), 'اللغة العربية', false], ['t2', cls(10, 3), 'اللغة العربية', true],
  ['t3', cls(12, 1), 'الفيزياء', true], ['t3', cls(12, 2), 'الفيزياء', true], ['t3', cls(12, 3), 'التربية الإسلامية', true],
  ['t1', cls(11, 3), 'الرياضيات', true], ['t2', cls(10, 2), 'اللغة الإنجليزية', true], ['t1', cls(11, 2), 'الرياضيات', true],
];

function must(res, what) {
  if (res.error) {
    console.error(`✗ ${what}:`, res.error.message);
    process.exit(1);
  }
  return res.data;
}

function kwToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuwait' }).format(new Date());
}
function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const isSchoolDay = (iso) => ![5, 6].includes(new Date(`${iso}T00:00:00Z`).getUTCDay());
// Deterministic pseudo-random in [0,1)
function rand(seed) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10000) / 10000;
}

async function ensureUser(s) {
  const list = must(await db.auth.admin.listUsers({ perPage: 200 }), 'list users');
  let user = list.users.find((u) => u.email === s.email);
  if (!user) {
    user = must(
      await db.auth.admin.createUser({ email: s.email, password, email_confirm: true, user_metadata: { full_name: s.name } }),
      `create ${s.email}`,
    ).user;
  }
  must(await db.from('profiles').upsert({ id: user.id, full_name: s.name, email: s.email, is_active: true }), 'profile');
  for (const role of s.roles) {
    must(await db.from('user_roles').upsert({ user_id: user.id, role }, { onConflict: 'user_id,role', ignoreDuplicates: true }), 'role');
  }
  return user.id;
}

async function main() {
  const ids = {};
  for (const s of STAFF) ids[s.key] = await ensureUser(s);
  console.log('✓ staff accounts');

  const { count } = await db.from('follow_up_tasks').select('id', { count: 'exact', head: true });
  if ((count ?? 0) > 0) {
    console.log('Demo records already present — skipping (run `npx supabase db reset` first for a clean seed).');
    return;
  }

  // Exactly one homeroom (is_homeroom) entry per class in ASSIGNMENTS.
  must(
    await db.from('teacher_class_assignments').upsert(
      ASSIGNMENTS.map(([t, c, subject, homeroom]) => ({ teacher_id: ids[t], class_id: c, subject, is_homeroom: homeroom })),
      { onConflict: 'teacher_id,class_id,subject', ignoreDuplicates: true },
    ),
    'assignments',
  );
  console.log('✓ teacher assignments');

  // Attendance: the last 15 school days (daily mode), excluding today.
  const today = kwToday();
  const days = [];
  for (let d = addDays(today, -1); days.length < 15; d = addDays(d, -1)) if (isSchoolDay(d) && d >= '2026-09-13') days.push(d);
  const takers = { [cls(10, 1)]: 't1', [cls(10, 2)]: 't1', [cls(10, 3)]: 't2', [cls(11, 1)]: 't2', [cls(11, 2)]: 't2', [cls(11, 3)]: 't1', [cls(12, 1)]: 't3', [cls(12, 2)]: 't3', [cls(12, 3)]: 't3' };
  const enrollments = must(await db.from('enrollments').select('id, student_id, class_id').eq('academic_year_id', 'a0000000-0000-4000-8000-000000002026'), 'enrollments');
  const enrollmentOf = new Map(enrollments.map((e) => [`${e.class_id}:${e.student_id}`, e.id]));

  for (const day of days) {
    for (const [classId, taker] of Object.entries(takers)) {
      const draft = day === days[0] && classId === cls(12, 2); // one unfinished session
      const session = must(
        await db.from('attendance_sessions').insert({
          class_id: classId, session_date: day, period: 0, taken_by: ids[taker],
          status: draft ? 'draft' : 'submitted',
          submitted_at: draft ? null : `${day}T05:${String(10 + Math.floor(rand(day + classId) * 40)).padStart(2, '0')}:00Z`,
          submitted_late: false,
        }).select('id').single(),
        'session',
      );
      const studentsOf = enrollments.filter((e) => e.class_id === classId && e.student_id !== studentId(198)).map((e) => e.student_id);
      const rows = studentsOf
        .filter((_, i) => !draft || i < 12)
        .map((sid) => {
          const r = rand(day + sid);
          const status = r < 0.06 ? 'absent' : r < 0.11 ? 'late' : r < 0.13 ? 'excused' : 'present';
          return {
            session_id: session.id, student_id: sid, enrollment_id: enrollmentOf.get(`${classId}:${sid}`),
            status, minutes_late: status === 'late' ? 5 + Math.floor(r * 100) % 20 : null, recorded_by: ids[taker],
          };
        });
      must(await db.from('attendance_records').insert(rows), 'records');
    }
  }
  console.log(`✓ attendance for ${days.length} school days`);

  // Absence excuses
  const s10 = classStudents(10, 1);
  must(await db.from('absence_excuses').insert([
    { student_id: s10[2], from_date: days[3], to_date: days[2], reason_type: 'medical', details: 'تقرير طبي (بيانات تجريبية)', status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null, submitted_by: ids.t1 },
    { student_id: s10[5], from_date: days[1], to_date: days[1], reason_type: 'family', details: 'ظرف عائلي (تجريبي)', status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null, submitted_by: ids.affairs },
    { student_id: s10[7], from_date: days[6], to_date: days[6], reason_type: 'official', status: 'approved', reviewed_by: ids.affairs, reviewed_at: new Date().toISOString(), review_note: 'مستند رسمي', submitted_by: ids.affairs },
  ]), 'excuses');
  console.log('✓ absence excuses');

  // Behaviour incidents in each lifecycle state
  const cats = must(await db.from('behavior_categories').select('id, name, default_severity').order('sort_order'), 'categories');
  const incidentSpecs = [
    { status: 'submitted', cat: 1, by: 't1', students: [s10[0]], date: days[0], desc: 'مقاطعة متكررة لشرح الدرس رغم التنبيه الشفهي أكثر من مرة.' },
    { status: 'submitted', cat: 3, by: 't2', students: [classStudents(11, 1)[3]], date: days[1], desc: 'استخدام الهاتف المحمول أثناء الاختبار القصير دون إذن.' },
    { status: 'under_review', cat: 4, by: 't3', students: [classStudents(12, 1)[4], classStudents(12, 1)[9]], date: days[2], desc: 'مغادرة الحصة السادسة دون إذن والتواجد في الساحة الخارجية.' },
    { status: 'approved', cat: 5, by: 't2', students: [classStudents(11, 2)[1]], date: days[4], desc: 'ألفاظ غير لائقة تجاه زميل خلال الفسحة، وتم التحقق من الشهود.' },
    { status: 'rejected', cat: 2, by: 't1', students: [s10[10]], date: days[5], desc: 'عدم ارتداء الزي المدرسي الكامل في الطابور الصباحي.' },
    { status: 'resolved', cat: 6, by: 't3', students: [classStudents(12, 3)[2]], date: days[8], desc: 'إتلاف مقعد في قاعة 123 أثناء الاستراحة بين الحصص.' },
  ];
  const incidentIds = [];
  for (const spec of incidentSpecs) {
    const reviewed = ['approved', 'rejected', 'resolved'].includes(spec.status);
    const inc = must(await db.from('behavior_incidents').insert({
      category_id: cats[spec.cat].id, incident_date: spec.date, description: spec.desc, severity: cats[spec.cat].default_severity,
      location: 'المبنى الرئيسي', reported_by: ids[spec.by], status: spec.status,
      reviewed_by: spec.status === 'submitted' ? null : ids.affairs,
      reviewed_at: reviewed ? new Date().toISOString() : null,
      decision_note: reviewed ? (spec.status === 'rejected' ? 'لا تنطبق الواقعة على التصنيف المختار.' : 'تم التحقق واستدعاء ولي الأمر.') : null,
      resolved_at: spec.status === 'resolved' ? new Date().toISOString() : null,
    }).select('id').single(), 'incident');
    incidentIds.push(inc.id);
    must(await db.from('incident_students').insert(spec.students.map((sid) => ({ incident_id: inc.id, student_id: sid }))), 'incident students');
    const actions = [{ incident_id: inc.id, action_type: 'submitted', to_status: 'submitted', actor_id: ids[spec.by] }];
    if (spec.status !== 'submitted') actions.push({ incident_id: inc.id, action_type: 'status_change', from_status: 'submitted', to_status: spec.status === 'resolved' ? 'approved' : spec.status, actor_id: ids.affairs, note: reviewed ? 'تمت المراجعة' : null });
    if (spec.status === 'resolved') actions.push({ incident_id: inc.id, action_type: 'status_change', from_status: 'approved', to_status: 'resolved', actor_id: ids.affairs, note: 'تم إصلاح الضرر بالتنسيق مع ولي الأمر.' });
    must(await db.from('incident_actions').insert(actions), 'incident actions');
  }
  console.log('✓ behaviour incidents');

  // Follow-up tasks in varied states
  must(await db.from('follow_up_tasks').insert([
    { title: 'التواصل مع ولي أمر الطالب بشأن تكرار الغياب', category: 'guardian_contact', priority: 'high', status: 'open', assigned_to: ids.affairs, created_by: ids.admin, student_id: s10[2], due_date: addDays(today, 1) },
    { title: 'متابعة مستوى الطالب في الرياضيات', category: 'academic', priority: 'normal', status: 'in_progress', assigned_to: ids.t1, created_by: ids.affairs, student_id: s10[4], due_date: addDays(today, 5), description: 'تراجع ملحوظ في الاختبارات القصيرة.' },
    { title: 'جلسة إرشادية بعد البلاغ السلوكي', category: 'behavior', priority: 'urgent', status: 'open', assigned_to: ids.affairs2, created_by: ids.affairs, student_id: classStudents(11, 2)[1], incident_id: incidentIds[3], due_date: addDays(today, -2) },
    { title: 'التأكد من استلام الكتب الدراسية', category: 'other', priority: 'low', status: 'completed', assigned_to: ids.t2, created_by: ids.affairs, student_id: classStudents(11, 1)[6], due_date: addDays(today, -6), outcome: 'تم الاستلام كاملًا.' },
    { title: 'متابعة التأخر الصباحي المتكرر', category: 'attendance', priority: 'normal', status: 'open', assigned_to: ids.t3, created_by: ids.affairs, student_id: classStudents(12, 1)[4], due_date: addDays(today, -1) },
    { title: 'تحديث بيانات التواصل لولي الأمر', category: 'guardian_contact', priority: 'low', status: 'cancelled', assigned_to: ids.affairs, created_by: ids.admin, student_id: classStudents(10, 3)[3], due_date: addDays(today, 3) },
  ]), 'follow-ups');
  console.log('✓ follow-up tasks');

  must(await db.from('notifications').insert([
    ...[ids.affairs, ids.affairs2, ids.admin].flatMap((r) => [
      { recipient_id: r, type: 'incident_submitted', title: 'بلاغ سلوكي جديد بانتظار المراجعة', body: `التصنيف: ${cats[1].name}`, link: `/behavior/${incidentIds[0]}` },
      { recipient_id: r, type: 'excuse_submitted', title: 'عذر غياب جديد بانتظار المراجعة', link: '/attendance/excuses' },
    ]),
    { recipient_id: ids.t1, type: 'incident_reviewed', title: 'تم رفض البلاغ السلوكي', link: `/behavior/${incidentIds[4]}` },
  ]), 'notifications');
  console.log('✓ notifications');

  console.log(`\nDone. Local test accounts (password: ${process.env.DEV_SEED_PASSWORD ? '$DEV_SEED_PASSWORD' : password}):`);
  for (const s of STAFF) console.log(`  ${s.roles.join(',').padEnd(16)} ${s.email}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
