-- =====================================================================
-- Reporting & dashboard aggregations.
-- All functions are SECURITY INVOKER: Row Level Security filters every
-- row they read, so a teacher only ever aggregates their own classes.
--
-- Calculation rules (mirrored in src/lib/domain/attendance.ts):
--   * Only marked records count. Unmarked students are excluded from both
--     numerator and denominator — they are never treated as absent.
--   * attendance_rate = (present + late) / (present + late + absent + excused)
-- =====================================================================

create or replace function public.attendance_rate(p_present numeric, p_late numeric, p_absent numeric, p_excused numeric)
returns numeric
language sql immutable
set search_path = ''
as $$
  select case when coalesce(p_present + p_late + p_absent + p_excused, 0) = 0 then null
              else round(100.0 * (p_present + p_late) / (p_present + p_late + p_absent + p_excused), 1) end;
$$;

create or replace function public.current_academic_year_id()
returns uuid
language sql stable
set search_path = ''
as $$
  select id from public.academic_years where is_current limit 1;
$$;

create or replace function public.dashboard_overview(p_from date, p_to date)
returns jsonb
language sql stable
set search_path = ''
as $$
  with yr as (select public.current_academic_year_id() as id),
  rec as (
    select r.status, count(*) as n
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    where s.session_date between p_from and p_to
    group by r.status
  ),
  agg as (
    select coalesce(sum(n) filter (where status = 'present'), 0) as present,
           coalesce(sum(n) filter (where status = 'late'), 0) as late,
           coalesce(sum(n) filter (where status = 'absent'), 0) as absent,
           coalesce(sum(n) filter (where status = 'excused'), 0) as excused
    from rec
  )
  select jsonb_build_object(
    'active_students', (select count(*) from public.students where status = 'active'),
    'classes', (select count(*) from public.school_classes c, yr where c.academic_year_id = yr.id and not c.is_archived),
    'active_enrollments', (select count(*) from public.enrollments e, yr where e.academic_year_id = yr.id and e.status = 'active'),
    'present', agg.present, 'late', agg.late, 'absent', agg.absent, 'excused', agg.excused,
    'attendance_rate', public.attendance_rate(agg.present, agg.late, agg.absent, agg.excused),
    'sessions_total', (select count(*) from public.attendance_sessions where session_date between p_from and p_to),
    'sessions_submitted', (select count(*) from public.attendance_sessions where session_date between p_from and p_to and status = 'submitted'),
    'pending_incidents', (select count(*) from public.behavior_incidents where status in ('submitted', 'under_review')),
    'open_follow_ups', (select count(*) from public.follow_up_tasks where status in ('open', 'in_progress')),
    'overdue_follow_ups', (select count(*) from public.follow_up_tasks
                           where status in ('open', 'in_progress') and due_date < public.kw_today()),
    'pending_excuses', (select count(*) from public.absence_excuses where status = 'pending')
  )
  from agg;
$$;

create or replace function public.attendance_trend(p_from date, p_to date, p_class_id uuid default null)
returns table (day date, present bigint, late bigint, absent bigint, excused bigint, rate numeric)
language sql stable
set search_path = ''
as $$
  select s.session_date,
         count(*) filter (where r.status = 'present'),
         count(*) filter (where r.status = 'late'),
         count(*) filter (where r.status = 'absent'),
         count(*) filter (where r.status = 'excused'),
         public.attendance_rate(count(*) filter (where r.status = 'present'), count(*) filter (where r.status = 'late'),
                                count(*) filter (where r.status = 'absent'), count(*) filter (where r.status = 'excused'))
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  where s.session_date between p_from and p_to
    and (p_class_id is null or s.class_id = p_class_id)
  group by s.session_date
  order by s.session_date;
$$;

create or replace function public.attendance_student_summary(
  p_from date, p_to date, p_class_id uuid default null, p_student_id uuid default null
)
returns table (
  student_id uuid, student_number text, full_name text, class_id uuid, class_name text,
  present bigint, late bigint, absent bigint, excused bigint, total_marked bigint, rate numeric
)
language sql stable
set search_path = ''
as $$
  select st.id, st.student_number, st.full_name, c.id, c.name,
         count(*) filter (where r.status = 'present'),
         count(*) filter (where r.status = 'late'),
         count(*) filter (where r.status = 'absent'),
         count(*) filter (where r.status = 'excused'),
         count(*),
         public.attendance_rate(count(*) filter (where r.status = 'present'), count(*) filter (where r.status = 'late'),
                                count(*) filter (where r.status = 'absent'), count(*) filter (where r.status = 'excused'))
  from public.attendance_records r
  join public.attendance_sessions s on s.id = r.session_id
  join public.school_classes c on c.id = s.class_id
  join public.students st on st.id = r.student_id
  where s.session_date between p_from and p_to
    and (p_class_id is null or s.class_id = p_class_id)
    and (p_student_id is null or r.student_id = p_student_id)
  group by st.id, st.student_number, st.full_name, c.id, c.name
  order by c.name, st.full_name;
$$;

create or replace function public.class_attendance_summary(p_from date, p_to date)
returns table (
  class_id uuid, class_name text, grade_level smallint, enrolled bigint, sessions bigint, sessions_submitted bigint,
  present bigint, late bigint, absent bigint, excused bigint, rate numeric
)
language sql stable
set search_path = ''
as $$
  with recs as (
    select s.class_id, r.status
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    where s.session_date between p_from and p_to
  )
  select c.id, c.name, c.grade_level,
         (select count(*) from public.enrollments e where e.class_id = c.id and e.status = 'active'),
         (select count(*) from public.attendance_sessions s where s.class_id = c.id and s.session_date between p_from and p_to),
         (select count(*) from public.attendance_sessions s where s.class_id = c.id and s.session_date between p_from and p_to and s.status = 'submitted'),
         count(*) filter (where recs.status = 'present'),
         count(*) filter (where recs.status = 'late'),
         count(*) filter (where recs.status = 'absent'),
         count(*) filter (where recs.status = 'excused'),
         public.attendance_rate(count(*) filter (where recs.status = 'present'), count(*) filter (where recs.status = 'late'),
                                count(*) filter (where recs.status = 'absent'), count(*) filter (where recs.status = 'excused'))
  from public.school_classes c
  left join recs on recs.class_id = c.id
  where c.academic_year_id = public.current_academic_year_id() and not c.is_archived
  group by c.id, c.name, c.grade_level
  order by c.grade_level, c.name;
$$;

create or replace function public.incident_summary(p_from date, p_to date)
returns table (category_id uuid, category_name text, status text, incidents bigint)
language sql stable
set search_path = ''
as $$
  select c.id, c.name, i.status, count(*)
  from public.behavior_incidents i
  join public.behavior_categories c on c.id = i.category_id
  where i.incident_date between p_from and p_to
  group by c.id, c.name, i.status
  order by c.name, i.status;
$$;

create or replace function public.follow_up_summary()
returns table (assignee_id uuid, assignee_name text, open bigint, in_progress bigint, completed bigint, cancelled bigint, overdue bigint)
language sql stable
set search_path = ''
as $$
  select p.id, p.full_name,
         count(*) filter (where t.status = 'open'),
         count(*) filter (where t.status = 'in_progress'),
         count(*) filter (where t.status = 'completed'),
         count(*) filter (where t.status = 'cancelled'),
         count(*) filter (where t.status in ('open', 'in_progress') and t.due_date < public.kw_today())
  from public.follow_up_tasks t
  join public.profiles p on p.id = t.assigned_to
  group by p.id, p.full_name
  order by p.full_name;
$$;

revoke execute on all functions in schema public from anon;
