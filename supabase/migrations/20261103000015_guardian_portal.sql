-- =====================================================================
-- Guardian & student portal (بوابة ولي الأمر والطالب).
--
-- Each student gets a sign-in account on the same login page as staff:
--   email    s<civil id>@alnajat.edu.kw
--   password set by the school (portal_set_accounts)
-- The account is marked in app_metadata (portal = 'student'), which only
-- the server can set. It has no profile and no role, so every staff
-- policy and function already refuses it. The only thing it can read is
-- portal_my_data(): its own student's record for the latest year.
-- Incident descriptions (which may name other students), follow-ups,
-- staff notes and unreviewed reports are never returned.
-- =====================================================================

create table if not exists public.student_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  student_id uuid not null unique references public.students (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.student_accounts enable row level security;
revoke all on public.student_accounts from anon, authenticated;

create or replace function public.student_portal_email(p_civil_id text)
returns text language sql immutable set search_path = ''
as $$ select 's' || p_civil_id || '@alnajat.edu.kw'; $$;

-- Student accounts are created only by portal_set_accounts (below), which
-- marks them in app_metadata: accept them alongside staff accounts.
create or replace function public.guard_auth_user_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = new.id
      and (coalesce(u.raw_app_meta_data ->> 'staff', '') = 'true' or coalesce(u.raw_app_meta_data ->> 'portal', '') = 'student')
  ) and exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'Signups not allowed: staff accounts are created by the school administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Student accounts are not staff: no profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if coalesce(new.raw_app_meta_data ->> 'portal', '') = 'student' then
    return new;
  end if;
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Staff (managers): account status per class, and create / reset.
-- ---------------------------------------------------------------------
create or replace function public.portal_accounts(p_class_id uuid)
returns table (student_id uuid, full_name text, student_number text, civil_id text, email text, has_account boolean, last_sign_in_at timestamptz)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  perform public.require_staff();
  if not public.is_manager() then
    raise exception 'حسابات الطلاب متاحة لشؤون الطلبة والإدارة فقط' using errcode = '42501';
  end if;
  return query
  select s.id, s.full_name, s.student_number, s.civil_id,
         coalesce(u.email::text, case when s.civil_id is not null then public.student_portal_email(s.civil_id) end),
         a.user_id is not null, u.last_sign_in_at
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.student_accounts a on a.student_id = s.id
  left join auth.users u on u.id = a.user_id
  where e.class_id = p_class_id and e.status = 'active'
  order by s.full_name;
end;
$$;

-- Creates missing accounts and sets the password of existing ones.
-- Students without a valid civil ID are skipped (no email can be made).
create or replace function public.portal_set_accounts(p_student_ids uuid[], p_password text)
returns table (student_id uuid, email text, created boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_student public.students;
  v_user uuid;
  v_email text;
  v_hash text;
  v_created int := 0;
  v_updated int := 0;
begin
  if not public.is_manager() then
    raise exception 'حسابات الطلاب متاحة لشؤون الطلبة والإدارة فقط' using errcode = '42501';
  end if;
  if p_password is null or char_length(p_password) < 8 then
    raise exception 'كلمة المرور يجب ألا تقل عن ٨ أحرف' using errcode = '22023';
  end if;
  if p_student_ids is null or cardinality(p_student_ids) = 0 then
    return;
  end if;
  if cardinality(p_student_ids) > 2000 then
    raise exception 'عدد كبير جدًا من الطلاب في طلب واحد' using errcode = '22023';
  end if;
  v_hash := extensions.crypt(p_password, extensions.gen_salt('bf'));

  for v_student in
    select s.* from public.students s
    where s.id = any (p_student_ids) and s.civil_id ~ '^[0-9]{12}$'
    order by s.full_name
  loop
    v_email := public.student_portal_email(v_student.civil_id);
    select a.user_id into v_user from public.student_accounts a where a.student_id = v_student.id;
    if found then
      update auth.users
      set encrypted_password = v_hash, email = v_email, updated_at = now()
      where id = v_user;
      update auth.identities
      set identity_data = identity_data || jsonb_build_object('email', v_email), updated_at = now()
      where user_id = v_user and provider = 'email';
      v_updated := v_updated + 1;
      student_id := v_student.id; email := v_email; created := false;
      return next;
    else
      v_user := gen_random_uuid();
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change
      ) values (
        v_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email, v_hash, now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'portal', 'student'),
        jsonb_build_object('full_name', v_student.full_name), now(), now(), '', '', '', ''
      );
      insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_user, v_user::text, 'email',
              jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true), null, now(), now());
      insert into public.student_accounts (user_id, student_id) values (v_user, v_student.id);
      v_created := v_created + 1;
      student_id := v_student.id; email := v_email; created := true;
      return next;
    end if;
  end loop;
  perform public.write_audit('portal_accounts_set', 'student_accounts', null,
    jsonb_build_object('created', v_created, 'password_reset', v_updated));
end;
$$;

-- ---------------------------------------------------------------------
-- The signed-in student's own record, for the latest academic year.
-- ---------------------------------------------------------------------
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

  select e.academic_year_id, e.status, c.name as class_name, c.grade_level, c.id as class_id
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
      'guardian_name', v_student.guardian_name,
      'class_name', v_enr.class_name,
      'grade_level', v_enr.grade_level,
      'year_name', v_year.name,
      'year_closed', v_year.status = 'closed'
    ),
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

revoke execute on function public.student_portal_email(text), public.portal_accounts(uuid), public.portal_set_accounts(uuid[], text), public.portal_my_data() from public, anon;
grant execute on function public.portal_accounts(uuid), public.portal_set_accounts(uuid[], text), public.portal_my_data() to authenticated;
