-- =====================================================================
-- Portal v2: the student page becomes a full portal. portal_my_data()
-- also returns the year's dates, the days attendance was taken (for the
-- calendar), the period count, and the family's own contact details.
-- =====================================================================

create or replace function public.portal_my_data()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_enr record;
  v_year public.academic_years;
  v_result jsonb;
begin
  select s.* into v_student
  from public.student_accounts a join public.students s on s.id = a.student_id
  where a.user_id = (select auth.uid()) and s.status <> 'transferred';
  if not found then
    return null;
  end if;

  select e.academic_year_id, e.status, e.enrolled_on, c.name as class_name, c.grade_level, c.id as class_id
  into v_enr
  from public.enrollments e join public.school_classes c on c.id = e.class_id
  where e.student_id = v_student.id
  order by (e.status = 'active') desc, e.enrolled_on desc
  limit 1;
  select * into v_year from public.academic_years where id = v_enr.academic_year_id;

  with recs as (
    select s.session_date as day, s.period, r.status, r.minutes_late
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    join public.school_classes c on c.id = s.class_id
    where r.student_id = v_student.id and c.academic_year_id = v_year.id
  ),
  counts as (
    select count(*) filter (where status = 'present') as present,
           count(*) filter (where status = 'late') as late,
           count(*) filter (where status = 'absent') as absent,
           count(*) filter (where status = 'excused') as excused,
           count(distinct day) filter (where status = 'absent') as absent_days,
           count(distinct day) as recorded_days
    from recs
  )
  select jsonb_build_object(
    'school', (select school_name_ar from public.school_settings where id = 1),
    'student', jsonb_build_object(
      'full_name', v_student.full_name,
      'student_number', v_student.student_number,
      'civil_id_last4', right(coalesce(v_student.civil_id, ''), 4),
      'status', v_student.status,
      'date_of_birth', v_student.date_of_birth,
      'guardian_name', v_student.guardian_name,
      'guardian_phone', v_student.guardian_phone,
      'enrolled_on', v_enr.enrolled_on,
      'class_name', v_enr.class_name,
      'grade_level', v_enr.grade_level,
      'year_name', v_year.name,
      'year_closed', v_year.status = 'closed',
      'year_starts_on', v_year.starts_on,
      'year_ends_on', v_year.ends_on
    ),
    'settings', (select jsonb_build_object('attendance_mode', st.attendance_mode, 'periods_per_day', st.periods_per_day) from public.school_settings st where st.id = 1),
    -- Every school day on which the student's attendance was taken (for the calendar).
    'recorded_dates', coalesce((select jsonb_agg(distinct day order by day) from recs), '[]'::jsonb),
    'attendance', (
      select jsonb_build_object(
        'present', present, 'late', late, 'absent', absent, 'excused', excused,
        'absent_days', absent_days, 'recorded_days', recorded_days,
        'rate', public.attendance_rate(present, late, absent, excused)
      ) from counts
    ),
    'days', coalesce((
      select jsonb_agg(d order by d->>'day' desc)
      from (
        select jsonb_build_object(
          'day', day,
          'items', jsonb_agg(jsonb_build_object('period', period, 'status', status, 'minutes_late', minutes_late) order by period)
        ) as d
        from recs where status <> 'present'
        group by day
        order by day desc
        limit 120
      ) x
    ), '[]'::jsonb),
    'excuses', coalesce((
      select jsonb_agg(jsonb_build_object('from', x.from_date, 'to', x.to_date, 'reason_type', x.reason_type, 'status', x.status) order by x.from_date desc)
      from public.absence_excuses x
      where x.student_id = v_student.id and x.academic_year_id = v_year.id
    ), '[]'::jsonb),
    'behavior', coalesce((
      select jsonb_agg(jsonb_build_object('date', i.incident_date, 'category', c.name, 'severity', i.severity, 'status', i.status) order by i.incident_date desc)
      from public.incident_students st
      join public.behavior_incidents i on i.id = st.incident_id
      join public.behavior_categories c on c.id = i.category_id
      where st.student_id = v_student.id and i.academic_year_id = v_year.id and i.status in ('approved', 'resolved')
    ), '[]'::jsonb),
    'discipline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', d.action_type, 'status', d.status, 'reason', d.reason, 'date', d.created_at,
        'meeting_at', d.meeting_at, 'meeting_with', d.meeting_with,
        'suspension_from', d.suspension_from, 'suspension_to', d.suspension_to, 'decision_number', d.decision_number,
        'signed_on', d.signed_on) order by d.created_at desc)
      from public.disciplinary_actions d
      where d.student_id = v_student.id and d.academic_year_id = v_year.id and d.status <> 'cancelled'
    ), '[]'::jsonb),
    'career', (
      select jsonb_build_object('top_1', q.top_1, 'top_2', q.top_2, 'top_3', q.top_3, 'submitted_at', q.submitted_at)
      from public.career_quiz_results q
      where q.student_id = v_student.id and q.academic_year_id = v_year.id
      order by q.submitted_at desc limit 1
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.portal_my_data() from public, anon;
grant execute on function public.portal_my_data() to authenticated;
