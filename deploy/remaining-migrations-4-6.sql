-- Run once in Supabase Dashboard → SQL Editor (project alnajat-school). Migrations 4–6.

-- ===== supabase/migrations/20261027000004_workflows.sql =====
-- =====================================================================
-- Workflow functions. Each one is atomic (single transaction), performs
-- its own authorization checks (SECURITY DEFINER bypasses RLS), validates
-- input at the database boundary and writes an audit entry.
-- Error messages are Arabic and safe to show to end users.
-- =====================================================================

create or replace function public.require_staff()
returns uuid
language plpgsql stable security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null or not public.is_active_staff() then
    raise exception 'يجب تسجيل الدخول بحساب نشط' using errcode = '42501';
  end if;
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------
-- Students & enrollment
-- ---------------------------------------------------------------------
create or replace function public.enroll_student(p_student_id uuid, p_class_id uuid, p_date date default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_date date := coalesce(p_date, public.kw_today());
  v_class public.school_classes;
  v_year public.academic_years;
  v_current public.enrollments;
  v_id uuid;
begin
  if not public.is_manager() then
    raise exception 'لا تملك صلاحية تسجيل الطلاب في الفصول' using errcode = '42501';
  end if;
  select * into v_class from public.school_classes where id = p_class_id;
  if not found or v_class.is_archived then
    raise exception 'الفصل غير موجود أو مؤرشف' using errcode = '23503';
  end if;
  select * into v_year from public.academic_years where id = v_class.academic_year_id;
  if v_year.status = 'closed' then
    raise exception 'العام الدراسي مغلق' using errcode = '23514';
  end if;
  if not exists (select 1 from public.students where id = p_student_id and status = 'active') then
    raise exception 'الطالب غير موجود أو غير نشط' using errcode = '23503';
  end if;
  if v_class.capacity is not null and (
    select count(*) from public.enrollments where class_id = p_class_id and status = 'active') >= v_class.capacity then
    raise exception 'الفصل مكتمل العدد' using errcode = '23514';
  end if;

  select * into v_current from public.enrollments
  where student_id = p_student_id and academic_year_id = v_class.academic_year_id and status = 'active'
  for update;

  if found then
    if v_current.class_id = p_class_id then
      raise exception 'الطالب مسجل بالفعل في هذا الفصل' using errcode = '23505';
    end if;
    if v_current.enrolled_on > v_date then
      raise exception 'تاريخ النقل يسبق تاريخ التسجيل الحالي' using errcode = '23514';
    end if;
    update public.enrollments set status = 'transferred', ended_on = v_date where id = v_current.id;
  end if;

  insert into public.enrollments (student_id, class_id, academic_year_id, enrolled_on)
  values (p_student_id, p_class_id, v_class.academic_year_id, v_date)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_student(
  p_student_number text, p_full_name text, p_date_of_birth date, p_guardian_name text,
  p_guardian_phone text, p_notes text, p_class_id uuid
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_id uuid;
begin
  if not public.is_manager() then
    raise exception 'لا تملك صلاحية إضافة الطلاب' using errcode = '42501';
  end if;
  if exists (select 1 from public.students where lower(student_number) = lower(btrim(p_student_number))) then
    raise exception 'الرقم الطلابي مستخدم مسبقًا' using errcode = '23505';
  end if;
  insert into public.students (student_number, full_name, date_of_birth, guardian_name, guardian_phone, notes)
  values (btrim(p_student_number), btrim(p_full_name), p_date_of_birth, nullif(btrim(p_guardian_name), ''),
          nullif(btrim(p_guardian_phone), ''), nullif(btrim(p_notes), ''))
  returning id into v_id;
  if p_class_id is not null then
    perform public.enroll_student(v_id, p_class_id, null);
  end if;
  return v_id;
end;
$$;

-- Archive / graduate / mark transferred-out. Closes active enrollments so
-- history is preserved and the student leaves attendance lists.
create or replace function public.set_student_status(p_student_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare v_uid uuid := public.require_staff();
begin
  if not public.is_manager() then
    raise exception 'لا تملك صلاحية تعديل حالة الطالب' using errcode = '42501';
  end if;
  if p_status not in ('active', 'transferred', 'graduated', 'archived') then
    raise exception 'حالة غير صالحة' using errcode = '22023';
  end if;
  update public.students set status = p_status where id = p_student_id;
  if not found then raise exception 'الطالب غير موجود' using errcode = '23503'; end if;
  if p_status <> 'active' then
    update public.enrollments
      set status = case when p_status = 'graduated' then 'completed' else 'withdrawn' end,
          ended_on = greatest(enrolled_on, public.kw_today())
    where student_id = p_student_id and status = 'active';
  end if;
  perform public.write_audit('status_change', 'students', p_student_id::text,
    jsonb_build_object('status', p_status), nullif(btrim(p_reason), ''));
end;
$$;

-- ---------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------

-- Students eligible for a class on a given date (enrollment active that day).
create or replace function public.class_roster(p_class_id uuid, p_date date)
returns table (student_id uuid, enrollment_id uuid, student_number text, full_name text)
language sql stable
set search_path = ''
as $$
  select s.id, e.id, s.student_number, s.full_name
  from public.enrollments e
  join public.students s on s.id = e.student_id
  where e.class_id = p_class_id
    and e.enrolled_on <= p_date
    and (e.ended_on is null or p_date < e.ended_on)
    and e.status in ('active', 'transferred', 'withdrawn', 'completed')
  order by s.full_name;
$$;

-- Save (and optionally submit) attendance for one class/date/period.
-- p_records: [{"student_id": uuid, "status": "present|absent|late|excused"|null,
--              "minutes_late": int?, "note": text?}]
-- A null status clears a mark (drafts only). Students not listed are left
-- untouched; unmarked students are never treated as absent.
create or replace function public.save_attendance(
  p_class_id uuid, p_date date, p_period smallint, p_records jsonb,
  p_submit boolean default false, p_reason text default null
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_settings public.school_settings;
  v_class public.school_classes;
  v_year public.academic_years;
  v_session public.attendance_sessions;
  v_is_manager boolean := public.is_manager();
  v_correcting boolean;
  v_item jsonb;
  v_student uuid;
  v_status text;
  v_minutes smallint;
  v_note text;
  v_enrollment uuid;
  v_existing public.attendance_records;
  v_changed int := 0;
  v_corrected int := 0;
  v_unmarked int;
begin
  select * into v_settings from public.school_settings where id = 1;
  select * into v_class from public.school_classes where id = p_class_id;
  if not found then raise exception 'الفصل غير موجود' using errcode = '23503'; end if;
  select * into v_year from public.academic_years where id = v_class.academic_year_id;

  -- Authorization: managers for any class; teachers for assigned classes
  -- within the configured back-dating window.
  if not v_is_manager then
    if not public.teaches_class(p_class_id) then
      raise exception 'لا تملك صلاحية رصد الحضور لهذا الفصل' using errcode = '42501';
    end if;
    if p_date < public.kw_today() - v_settings.teacher_backdate_days then
      raise exception 'انتهت المهلة المسموحة لرصد هذا اليوم، يرجى التواصل مع شؤون الطلبة' using errcode = '42501';
    end if;
  end if;

  if p_date > public.kw_today() then
    raise exception 'لا يمكن رصد الحضور لتاريخ مستقبلي' using errcode = '22023';
  end if;
  if p_date < v_year.starts_on or p_date > v_year.ends_on then
    raise exception 'التاريخ خارج العام الدراسي لهذا الفصل' using errcode = '22023';
  end if;
  if extract(isodow from p_date) in (5, 6) then
    raise exception 'لا يمكن رصد الحضور في يومي الجمعة والسبت' using errcode = '22023';
  end if;
  if v_settings.attendance_mode = 'daily' and p_period <> 0 then
    raise exception 'نظام الحضور الحالي يومي' using errcode = '22023';
  end if;
  if v_settings.attendance_mode = 'period' and (p_period < 1 or p_period > v_settings.periods_per_day) then
    raise exception 'رقم الحصة غير صالح' using errcode = '22023';
  end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 80 then
    raise exception 'بيانات الحضور غير صالحة' using errcode = '22023';
  end if;

  insert into public.attendance_sessions (class_id, session_date, period, taken_by)
  values (p_class_id, p_date, p_period, v_uid)
  on conflict (class_id, session_date, period) do nothing;

  select * into v_session from public.attendance_sessions
  where class_id = p_class_id and session_date = p_date and period = p_period
  for update;

  v_correcting := v_session.status = 'submitted';
  if v_correcting then
    if not v_is_manager and not (v_session.taken_by = v_uid and p_date = public.kw_today()) then
      raise exception 'الجلسة معتمدة؛ التصحيح متاح لشؤون الطلبة أو للمعلم الراصد في اليوم نفسه' using errcode = '42501';
    end if;
    if coalesce(char_length(btrim(p_reason)), 0) < 3 then
      raise exception 'يجب ذكر سبب التصحيح' using errcode = '22023';
    end if;
  end if;

  for v_item in select * from jsonb_array_elements(p_records) loop
    v_student := (v_item ->> 'student_id')::uuid;
    v_status := nullif(v_item ->> 'status', '');
    v_minutes := nullif(v_item ->> 'minutes_late', '')::smallint;
    v_note := nullif(btrim(v_item ->> 'note'), '');

    if v_status is not null and v_status not in ('present', 'absent', 'late', 'excused') then
      raise exception 'حالة حضور غير صالحة' using errcode = '22023';
    end if;
    if v_status is distinct from 'late' then v_minutes := null; end if;

    select r.enrollment_id into v_enrollment from public.class_roster(p_class_id, p_date) r
    where r.student_id = v_student;
    if v_enrollment is null then
      raise exception 'أحد الطلاب غير مسجل في هذا الفصل بتاريخ الجلسة' using errcode = '23514';
    end if;

    select * into v_existing from public.attendance_records
    where session_id = v_session.id and student_id = v_student;

    if v_status is null then
      if v_existing.id is not null then
        if v_correcting then
          raise exception 'لا يمكن إلغاء الرصد في جلسة معتمدة' using errcode = '22023';
        end if;
        delete from public.attendance_records where id = v_existing.id;
        v_changed := v_changed + 1;
      end if;
      continue;
    end if;

    if v_existing.id is null then
      insert into public.attendance_records (session_id, student_id, enrollment_id, status, minutes_late, note, recorded_by)
      values (v_session.id, v_student, v_enrollment, v_status, v_minutes, v_note, v_uid);
      v_changed := v_changed + 1;
      if v_correcting then
        insert into public.attendance_corrections (session_id, student_id, old_status, new_status, reason, corrected_by)
        values (v_session.id, v_student, null, v_status, btrim(p_reason), v_uid);
        v_corrected := v_corrected + 1;
      end if;
    elsif (v_existing.status, v_existing.minutes_late, v_existing.note) is distinct from (v_status, v_minutes, v_note) then
      update public.attendance_records
        set status = v_status, minutes_late = v_minutes, note = v_note, recorded_by = v_uid
      where id = v_existing.id;
      v_changed := v_changed + 1;
      if v_correcting and v_existing.status <> v_status then
        insert into public.attendance_corrections (record_id, session_id, student_id, old_status, new_status, reason, corrected_by)
        values (v_existing.id, v_session.id, v_student, v_existing.status, v_status, btrim(p_reason), v_uid);
        v_corrected := v_corrected + 1;
      end if;
    end if;
  end loop;

  if p_submit and not v_correcting then
    select count(*) into v_unmarked from public.class_roster(p_class_id, p_date) r
    where not exists (select 1 from public.attendance_records a where a.session_id = v_session.id and a.student_id = r.student_id);
    if v_unmarked > 0 then
      raise exception 'لا يمكن اعتماد الجلسة: يوجد % طالب دون رصد', v_unmarked using errcode = '23514';
    end if;
    update public.attendance_sessions
      set status = 'submitted', submitted_at = now(), submitted_late = public.kw_today() > session_date,
          taken_by = coalesce(taken_by, v_uid)
    where id = v_session.id;
  elsif v_session.taken_by is null then
    update public.attendance_sessions set taken_by = v_uid where id = v_session.id;
  end if;

  if v_changed > 0 or p_submit then
    perform public.write_audit(
      case when v_correcting then 'attendance_corrected' when p_submit then 'attendance_submitted' else 'attendance_saved' end,
      'attendance_sessions', v_session.id::text,
      jsonb_build_object('class_id', p_class_id, 'date', p_date, 'period', p_period,
                         'changed', v_changed, 'corrected', v_corrected),
      nullif(btrim(p_reason), ''));
  end if;
  return v_session.id;
end;
$$;

create or replace function public.reopen_attendance_session(p_session_id uuid, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_session public.attendance_sessions;
begin
  if not public.is_manager() then
    raise exception 'إعادة فتح الجلسات متاحة لشؤون الطلبة والإدارة فقط' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'يجب ذكر سبب إعادة الفتح' using errcode = '22023';
  end if;
  select * into v_session from public.attendance_sessions where id = p_session_id for update;
  if not found then raise exception 'الجلسة غير موجودة' using errcode = '23503'; end if;
  if v_session.status <> 'submitted' then
    raise exception 'الجلسة غير معتمدة أصلًا' using errcode = '22023';
  end if;
  update public.attendance_sessions
    set status = 'draft', submitted_at = null, submitted_late = false,
        reopened_at = now(), reopened_by = v_uid, reopen_reason = btrim(p_reason)
  where id = p_session_id;
  perform public.write_audit('attendance_reopened', 'attendance_sessions', p_session_id::text,
    jsonb_build_object('class_id', v_session.class_id, 'date', v_session.session_date, 'period', v_session.period),
    btrim(p_reason));
  perform public.notify(v_session.taken_by, 'attendance_reopened', 'أُعيد فتح جلسة حضور لاستكمالها',
    null, '/attendance/take?class=' || v_session.class_id || '&date=' || v_session.session_date || '&period=' || v_session.period);
end;
$$;

create or replace function public.review_absence_excuse(p_excuse_id uuid, p_decision text, p_note text default null)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_excuse public.absence_excuses;
  v_count int := 0;
begin
  if not public.is_manager() then
    raise exception 'مراجعة الأعذار متاحة لشؤون الطلبة والإدارة فقط' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'قرار غير صالح' using errcode = '22023';
  end if;
  if p_decision = 'rejected' and coalesce(char_length(btrim(p_note)), 0) < 3 then
    raise exception 'يجب ذكر سبب الرفض' using errcode = '22023';
  end if;
  select * into v_excuse from public.absence_excuses where id = p_excuse_id for update;
  if not found then raise exception 'العذر غير موجود' using errcode = '23503'; end if;
  if v_excuse.status <> 'pending' then
    raise exception 'تمت مراجعة هذا العذر مسبقًا' using errcode = '22023';
  end if;

  update public.absence_excuses
    set status = p_decision, reviewed_by = v_uid, reviewed_at = now(), review_note = nullif(btrim(p_note), '')
  where id = p_excuse_id;

  if p_decision = 'approved' then
    -- Convert covered absences to "excused", keeping a correction trail.
    with targets as (
      select r.id, r.session_id, r.student_id
      from public.attendance_records r
      join public.attendance_sessions s on s.id = r.session_id
      where r.student_id = v_excuse.student_id and r.status = 'absent'
        and s.session_date between v_excuse.from_date and v_excuse.to_date
      for update of r
    ), corrections as (
      insert into public.attendance_corrections (record_id, session_id, student_id, old_status, new_status, reason, source, corrected_by)
      select t.id, t.session_id, t.student_id, 'absent', 'excused', 'اعتماد عذر غياب', 'excuse_approval', v_uid from targets t
      returning record_id
    )
    update public.attendance_records r set status = 'excused', recorded_by = v_uid
    from corrections c where r.id = c.record_id;
    get diagnostics v_count = row_count;
  end if;

  perform public.notify(v_excuse.submitted_by, 'excuse_reviewed',
    case when p_decision = 'approved' then 'تم اعتماد عذر الغياب' else 'تم رفض عذر الغياب' end,
    null, '/attendance/excuses');
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Behaviour incidents
-- Status lifecycle:  submitted -> under_review -> approved -> resolved
--                    submitted|under_review -> rejected
-- ---------------------------------------------------------------------
create or replace function public.incident_transition_allowed(p_from text, p_to text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('submitted', 'under_review'), ('submitted', 'approved'), ('submitted', 'rejected'),
    ('under_review', 'approved'), ('under_review', 'rejected'),
    ('approved', 'resolved')
  );
$$;

create or replace function public.submit_incident(
  p_category_id uuid, p_incident_date date, p_location text, p_description text,
  p_severity text, p_student_ids uuid[]
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_id uuid;
  v_student uuid;
  v_category text;
begin
  if not (public.is_manager() or public.has_role('teacher')) then
    raise exception 'لا تملك صلاحية رفع البلاغات' using errcode = '42501';
  end if;
  select name into v_category from public.behavior_categories where id = p_category_id and is_active;
  if v_category is null then raise exception 'تصنيف السلوك غير صالح' using errcode = '23503'; end if;
  if p_severity not in ('low', 'medium', 'high') then raise exception 'درجة الخطورة غير صالحة' using errcode = '22023'; end if;
  if p_incident_date > public.kw_today() or p_incident_date < public.kw_today() - 60 then
    raise exception 'تاريخ الواقعة يجب أن يكون خلال الستين يومًا الماضية' using errcode = '22023';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) not between 1 and 20 then
    raise exception 'يجب اختيار طالب واحد على الأقل (بحد أقصى ٢٠)' using errcode = '22023';
  end if;
  foreach v_student in array p_student_ids loop
    if not public.can_view_student(v_student) then
      raise exception 'لا تملك صلاحية على أحد الطلاب المحددين' using errcode = '42501';
    end if;
  end loop;

  insert into public.behavior_incidents (category_id, incident_date, location, description, severity, reported_by)
  values (p_category_id, p_incident_date, nullif(btrim(p_location), ''), btrim(p_description), p_severity, v_uid)
  returning id into v_id;
  insert into public.incident_students (incident_id, student_id)
  select v_id, s from (select distinct unnest(p_student_ids) s) d;
  insert into public.incident_actions (incident_id, action_type, to_status, actor_id)
  values (v_id, 'submitted', 'submitted', v_uid);

  perform public.notify_managers('incident_submitted', 'بلاغ سلوكي جديد بانتظار المراجعة',
    'التصنيف: ' || v_category, '/behavior/' || v_id);
  return v_id;
end;
$$;

create or replace function public.transition_incident(p_incident_id uuid, p_to_status text, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_incident public.behavior_incidents;
begin
  if not public.is_manager() then
    raise exception 'مراجعة البلاغات متاحة لشؤون الطلبة والإدارة فقط' using errcode = '42501';
  end if;
  select * into v_incident from public.behavior_incidents where id = p_incident_id for update;
  if not found then raise exception 'البلاغ غير موجود' using errcode = '23503'; end if;
  if v_incident.reported_by = v_uid then
    raise exception 'لا يمكنك مراجعة بلاغ قمت برفعه' using errcode = '42501';
  end if;
  if not public.incident_transition_allowed(v_incident.status, p_to_status) then
    raise exception 'انتقال غير مسموح في حالة البلاغ' using errcode = '22023';
  end if;
  if p_to_status in ('approved', 'rejected', 'resolved') and coalesce(char_length(btrim(p_note)), 0) < 3 then
    raise exception 'يجب توثيق القرار أو الإجراء المتخذ' using errcode = '22023';
  end if;

  update public.behavior_incidents set
    status = p_to_status,
    reviewed_by = case when p_to_status in ('under_review', 'approved', 'rejected') then v_uid else reviewed_by end,
    reviewed_at = case when p_to_status in ('approved', 'rejected') then now() else reviewed_at end,
    decision_note = case when p_to_status in ('approved', 'rejected') then btrim(p_note) else decision_note end,
    resolved_at = case when p_to_status = 'resolved' then now() else resolved_at end
  where id = p_incident_id;

  insert into public.incident_actions (incident_id, action_type, from_status, to_status, note, actor_id)
  values (p_incident_id, 'status_change', v_incident.status, p_to_status, nullif(btrim(p_note), ''), v_uid);

  if p_to_status in ('approved', 'rejected', 'resolved') then
    perform public.notify(v_incident.reported_by, 'incident_reviewed',
      case p_to_status when 'approved' then 'تم اعتماد البلاغ السلوكي'
                       when 'rejected' then 'تم رفض البلاغ السلوكي'
                       else 'تم إغلاق البلاغ السلوكي' end,
      null, '/behavior/' || p_incident_id);
  end if;
end;
$$;

create or replace function public.add_incident_action(p_incident_id uuid, p_type text, p_note text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_incident public.behavior_incidents;
begin
  select * into v_incident from public.behavior_incidents where id = p_incident_id;
  if not found then raise exception 'البلاغ غير موجود' using errcode = '23503'; end if;
  if p_type not in ('note', 'action_taken') then raise exception 'نوع غير صالح' using errcode = '22023'; end if;
  if p_type = 'action_taken' and not public.is_manager() then
    raise exception 'تسجيل الإجراءات متاح لشؤون الطلبة والإدارة فقط' using errcode = '42501';
  end if;
  if not (public.is_manager() or v_incident.reported_by = v_uid) then
    raise exception 'لا تملك صلاحية على هذا البلاغ' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_note)), 0) < 2 then
    raise exception 'النص مطلوب' using errcode = '22023';
  end if;
  insert into public.incident_actions (incident_id, action_type, note, actor_id)
  values (p_incident_id, p_type, btrim(p_note), v_uid);
end;
$$;

-- ---------------------------------------------------------------------
-- Follow-up due-soon reminders for the calling user (idempotent).
-- ---------------------------------------------------------------------
create or replace function public.refresh_due_soon_notifications()
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_days int := (select follow_up_due_soon_days from public.school_settings where id = 1);
  v_count int;
begin
  with due as (
    update public.follow_up_tasks t set due_soon_notified_at = now()
    where t.assigned_to = v_uid and t.status in ('open', 'in_progress')
      and t.due_date is not null and t.due_date <= public.kw_today() + v_days
      and t.due_soon_notified_at is null
    returning t.id, t.title, t.due_date
  )
  insert into public.notifications (recipient_id, type, title, body, link)
  select v_uid, 'follow_up_due_soon',
         case when d.due_date < public.kw_today() then 'مهمة متابعة متأخرة' else 'اقترب موعد مهمة متابعة' end,
         left(d.title, 160), '/follow-ups/' || d.id
  from due d;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Lock down helpers that should not be callable directly.
revoke execute on function public.require_staff() from public, anon, authenticated;
revoke execute on all functions in schema public from anon;

-- ===== supabase/migrations/20261027000005_reporting.sql =====
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

-- ===== supabase/migrations/20261027000006_student_search.sql =====
-- Student directory search (SECURITY INVOKER: RLS limits teachers to their
-- own classes). Arabic-aware matching normalises common spelling variants.

create or replace function public.ar_normalize(p text)
returns text
language sql immutable parallel safe
set search_path = ''
as $$
  select lower(translate(regexp_replace(coalesce(p, ''), '[ً-ْـ]', '', 'g'), 'أإآٱةىؤئ', 'اااايهيوي'));
$$;

create or replace function public.search_students(
  p_search text default null,
  p_year_id uuid default null,
  p_class_id uuid default null,
  p_grade smallint default null,
  p_status text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid, student_number text, full_name text, status text, guardian_phone text,
  enrollment_id uuid, enrollment_status text, class_id uuid, class_name text, grade_level smallint,
  academic_year_id uuid, total_count bigint
)
language sql stable
set search_path = ''
as $$
  with yr as (
    select coalesce(p_year_id, public.current_academic_year_id()) as id
  ), enr as (
    select distinct on (e.student_id) e.student_id, e.id, e.status, e.class_id, c.name, c.grade_level, e.academic_year_id
    from public.enrollments e
    join public.school_classes c on c.id = e.class_id
    join yr on yr.id = e.academic_year_id
    order by e.student_id, (e.status = 'active') desc, e.enrolled_on desc
  ), q as (
    select public.ar_normalize(btrim(p_search)) as term
  )
  select s.id, s.student_number, s.full_name, s.status, s.guardian_phone,
         enr.id, enr.status, enr.class_id, enr.name, enr.grade_level, enr.academic_year_id,
         count(*) over ()
  from public.students s
  left join enr on enr.student_id = s.id
  cross join q
  where (q.term = '' or public.ar_normalize(s.full_name) like '%' || replace(replace(q.term, '%', '\%'), '_', '\_') || '%'
         or lower(s.student_number) like '%' || replace(replace(q.term, '%', '\%'), '_', '\_') || '%')
    and (p_status is null or s.status = p_status)
    and (p_class_id is null or enr.class_id = p_class_id)
    and (p_grade is null or enr.grade_level = p_grade)
    and (p_year_id is null or enr.student_id is not null)
  order by s.full_name, s.student_number
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

revoke execute on all functions in schema public from anon;
