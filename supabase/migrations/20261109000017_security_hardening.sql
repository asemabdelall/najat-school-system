-- =====================================================================
-- Security hardening (audit 2026-11-09: SEC-01, -02, -03, -05; quiz switch).
--
-- 1. Student portal accounts must set their own password before the
--    portal returns any data (server-enforced, SEC-02).
-- 2. The public career quiz no longer returns full names, is rate limited
--    per client IP, and results can only be submitted with a short-lived,
--    single-use token minted by the lookup (SEC-01, SEC-03).
-- 3. school_settings.quiz_open lets an admin switch the quiz off entirely.
-- 4. Leftovers of an earlier portal design that exist only in production
--    are dropped so production matches the migrations (SEC-05).
-- =====================================================================

-- ---------------------------------------------------------------------
-- SEC-05: drop the undocumented code/token portal leftovers (empty and
-- unreachable in production; never created by these migrations).
-- ---------------------------------------------------------------------
drop function if exists public.portal_issue_codes(uuid[]);
drop function if exists public.portal_login(text, text);
drop function if exists public.portal_logout(text);
drop function if exists public.portal_data(text);
drop table if exists public.portal_sessions;
drop table if exists public.portal_access;

-- ---------------------------------------------------------------------
-- SEC-02: forced first sign-in password change for student accounts.
-- ---------------------------------------------------------------------
-- Every existing account starts out flagged (default fills existing rows).
alter table public.student_accounts add column must_change_password boolean not null default true;

-- The password hash the school last issued. portal_password_changed()
-- only clears the flag once auth.users holds a different hash, so calling
-- it without really changing the shared password does nothing.
alter table public.student_accounts add column issued_password_hash text;
update public.student_accounts a
set issued_password_hash = u.encrypted_password
from auth.users u
where u.id = a.user_id;

-- Creates missing accounts and sets the password of existing ones.
-- Either way the student must choose a new password at the next sign-in.
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
      update public.student_accounts a
      set must_change_password = true, issued_password_hash = v_hash
      where a.user_id = v_user;
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
      insert into public.student_accounts (user_id, student_id, must_change_password, issued_password_hash)
      values (v_user, v_student.id, true, v_hash);
      v_created := v_created + 1;
      student_id := v_student.id; email := v_email; created := true;
      return next;
    end if;
  end loop;
  perform public.write_audit('portal_accounts_set', 'student_accounts', null,
    jsonb_build_object('created', v_created, 'password_reset', v_updated));
end;
$$;

-- Account status per class now includes whether the student has replaced
-- the school-issued password (null when there is no account yet).
drop function if exists public.portal_accounts(uuid);
create function public.portal_accounts(p_class_id uuid)
returns table (
  student_id uuid, full_name text, student_number text, civil_id text, email text,
  has_account boolean, last_sign_in_at timestamptz, must_change_password boolean
)
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
         a.user_id is not null, u.last_sign_in_at, a.must_change_password
  from public.enrollments e
  join public.students s on s.id = e.student_id
  left join public.student_accounts a on a.student_id = s.id
  left join auth.users u on u.id = a.user_id
  where e.class_id = p_class_id and e.status = 'active'
  order by s.full_name;
end;
$$;

-- Called by the portal right after supabase.auth.updateUser({ password }).
-- Students have no staff profile, so audit_logs.actor_id (a profiles FK)
-- stays null; the account is named in record_id/changes instead.
create or replace function public.portal_password_changed()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_acc public.student_accounts;
  v_current text;
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول' using errcode = '42501';
  end if;
  select a.* into v_acc from public.student_accounts a where a.user_id = v_uid for update;
  if not found then
    raise exception 'هذا الإجراء متاح لحسابات الطلاب فقط' using errcode = '42501';
  end if;
  if not v_acc.must_change_password then
    return;
  end if;
  select u.encrypted_password into v_current from auth.users u where u.id = v_uid;
  if v_acc.issued_password_hash is not null and v_current is not distinct from v_acc.issued_password_hash then
    raise exception 'لم تتغير كلمة المرور بعد، اختر كلمة مرور جديدة أولًا' using errcode = '42501';
  end if;
  update public.student_accounts a set must_change_password = false where a.user_id = v_uid;
  insert into public.audit_logs (actor_id, action, table_name, record_id, changes)
  values (null, 'portal_password_changed', 'student_accounts', v_acc.student_id::text,
          jsonb_build_object('user_id', v_uid));
end;
$$;

-- portal_my_data(): unchanged from portal v2 except the gate — while the
-- school-issued password is still in use it returns only
-- {"must_change_password": true} and no student data.
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

  -- The school-issued password is still in use: nothing but the flag.
  if exists (
    select 1 from public.student_accounts a
    where a.user_id = (select auth.uid()) and a.must_change_password
  ) then
    return jsonb_build_object('must_change_password', true);
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

revoke execute on function public.portal_set_accounts(uuid[], text), public.portal_accounts(uuid),
  public.portal_password_changed(), public.portal_my_data() from public, anon;
grant execute on function public.portal_set_accounts(uuid[], text), public.portal_accounts(uuid),
  public.portal_password_changed(), public.portal_my_data() to authenticated;

-- ---------------------------------------------------------------------
-- Quiz open/closed switch (admins, via the settings page).
-- ---------------------------------------------------------------------
alter table public.school_settings add column quiz_open boolean not null default true;

-- ---------------------------------------------------------------------
-- SEC-01 / SEC-03: quiz lookup throttling and submit tokens.
-- Both tables are written only by the SECURITY DEFINER quiz functions.
-- ---------------------------------------------------------------------
create table public.quiz_lookup_log (
  id bigserial primary key,
  ip text,
  civil_prefix text,          -- first three digits only, never the civil ID
  found boolean,
  created_at timestamptz default now()
);
create index quiz_lookup_log_ip_created_idx on public.quiz_lookup_log (ip, created_at);
alter table public.quiz_lookup_log enable row level security;
revoke all on public.quiz_lookup_log from public, anon, authenticated;
revoke all on sequence public.quiz_lookup_log_id_seq from public, anon, authenticated;

create table public.quiz_tokens (
  token_hash text primary key,  -- sha256 hex of the token; the token itself is never stored
  student_id uuid references public.students (id) on delete cascade,
  expires_at timestamptz,
  used_at timestamptz
);
create index quiz_tokens_student_idx on public.quiz_tokens (student_id);
alter table public.quiz_tokens enable row level security;
revoke all on public.quiz_tokens from public, anon, authenticated;

-- The calling client's IP as seen by the API gateway. x-forwarded-for may
-- hold a chain ("client, proxy, ..."); the first entry is the client.
create or replace function public.quiz_client_ip()
returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  return coalesce(nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''), 'unknown');
end;
$$;

-- Old shape returned the full name, grade and section to anyone.
drop function if exists public.quiz_find_student(text);
create function public.quiz_find_student(p_civil_id text)
returns table (first_name text, class_name text, token text)
language plpgsql volatile security definer
set search_path = ''
as $$
declare
  v_ip text := public.quiz_client_ip();
  v_civil text := regexp_replace(coalesce(p_civil_id, ''), '\s', '', 'g');
  v_student uuid;
  v_full text;
  v_class text;
  v_first text;
  v_token text;
begin
  if not coalesce((select st.quiz_open from public.school_settings st where st.id = 1), false) then
    raise exception 'اختبار الميول المهنية مغلق حاليًا. راجع المرشد الطلابي.' using errcode = 'QZ423';
  end if;

  -- One lookup at a time per client, so parallel requests cannot slip
  -- past the counters below.
  perform pg_advisory_xact_lock(hashtext('quiz_find_student:' || v_ip));

  -- Opportunistic clean-up keeps both tables small.
  delete from public.quiz_lookup_log l where l.created_at < now() - interval '1 day';
  delete from public.quiz_tokens t where t.expires_at < now() - interval '1 day';

  -- Per client: at most 10 lookups per 10 minutes and 5 misses per hour.
  -- Across all clients: at most 30 misses per 10 minutes, in case the
  -- forwarded IP can be varied by the caller (enumeration ceiling).
  if (select count(*) from public.quiz_lookup_log l
      where l.ip = v_ip and l.created_at > now() - interval '10 minutes') >= 10
     or (select count(*) from public.quiz_lookup_log l
         where l.ip = v_ip and not l.found and l.created_at > now() - interval '1 hour') >= 5
     or (select count(*) from public.quiz_lookup_log l
         where not l.found and l.created_at > now() - interval '10 minutes') >= 30
  then
    raise exception 'محاولات كثيرة، يرجى المحاولة لاحقًا' using errcode = 'QZ429';
  end if;

  if v_civil ~ '^[0-9]{12}$' then
    select s.id, s.full_name, c.name into v_student, v_full, v_class
    from public.students s
    join public.enrollments e on e.student_id = s.id and e.status = 'active'
    join public.school_classes c on c.id = e.class_id
    where s.civil_id = v_civil
      and s.status = 'active'
      and e.academic_year_id = public.current_academic_year_id()
    limit 1;
  end if;

  insert into public.quiz_lookup_log (ip, civil_prefix, found)
  values (v_ip, left(regexp_replace(v_civil, '\D', '', 'g'), 3), v_student is not null);

  if v_student is null then
    return;
  end if;

  -- First name only; compound names keep their prefix (عبد الله, أبو بكر).
  v_first := split_part(btrim(v_full), ' ', 1);
  if v_first in ('عبد', 'ابو', 'أبو') and split_part(btrim(v_full), ' ', 2) <> '' then
    v_first := v_first || ' ' || split_part(btrim(v_full), ' ', 2);
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.quiz_tokens (token_hash, student_id, expires_at)
  values (encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_student, now() + interval '2 hours');

  first_name := v_first;
  class_name := v_class;
  token := v_token;
  return next;
end;
$$;

-- Old signature took the civil ID: anyone could submit for any student.
drop function if exists public.quiz_submit_result(text, jsonb);
create function public.quiz_submit_result(p_token text, p_scores jsonb)
returns table (top_1 text, top_2 text, top_3 text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_token_student uuid;
  v_student uuid;
  v_year uuid;
  v_class uuid;
  v_keys text[];
  v_top text[];
begin
  if not coalesce((select st.quiz_open from public.school_settings st where st.id = 1), false) then
    raise exception 'اختبار الميول المهنية مغلق حاليًا. راجع المرشد الطلابي.' using errcode = 'QZ423';
  end if;

  -- A valid, unexpired, unused token from quiz_find_student.
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'انتهت جلسة الاختبار، أدخل الرقم المدني من جديد' using errcode = 'QZ401';
  end if;
  v_hash := encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  select t.student_id into v_token_student
  from public.quiz_tokens t
  where t.token_hash = v_hash and t.used_at is null and t.expires_at > now()
  for update;
  if v_token_student is null then
    raise exception 'انتهت جلسة الاختبار، أدخل الرقم المدني من جديد' using errcode = 'QZ401';
  end if;

  select s.id, e.academic_year_id, e.class_id into v_student, v_year, v_class
  from public.students s
  join public.enrollments e on e.student_id = s.id and e.status = 'active'
  where s.id = v_token_student
    and s.status = 'active'
    and e.academic_year_id = public.current_academic_year_id()
  limit 1;
  if v_student is null then
    raise exception 'الطالب غير مسجل في العام الدراسي الحالي' using errcode = 'P0002';
  end if;

  -- Exactly the known categories, each an average between 1 and 5.
  if p_scores is null or jsonb_typeof(p_scores) <> 'object' then
    raise exception 'نتيجة غير صالحة' using errcode = '22023';
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_scores) k;
  if v_keys is distinct from (select array_agg(c order by c) from unnest(public.career_categories()) c) then
    raise exception 'نتيجة غير صالحة' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_each(p_scores) j
    where jsonb_typeof(j.value) <> 'number' or (j.value)::numeric < 1 or (j.value)::numeric > 5
  ) then
    raise exception 'نتيجة غير صالحة' using errcode = '22023';
  end if;

  -- Light abuse guard: one submission per student per two minutes.
  if exists (
    select 1 from public.career_quiz_results r
    where r.student_id = v_student and r.submitted_at > now() - interval '2 minutes'
  ) then
    raise exception 'تم استلام نتيجتك قبل قليل' using errcode = 'P0001';
  end if;

  -- The token is spent only when the result is stored (any error above
  -- rolls this back, so the student can retry with the same token).
  update public.quiz_tokens t set used_at = now() where t.token_hash = v_hash;

  -- The top three are computed here, never trusted from the client.
  -- Ties keep the fixed category order.
  select array_agg(k order by (p_scores ->> k)::numeric desc, array_position(public.career_categories(), k))
  into v_top
  from unnest(public.career_categories()) k;

  insert into public.career_quiz_results (student_id, academic_year_id, class_id, scores, top_1, top_2, top_3)
  values (v_student, v_year, v_class, p_scores, v_top[1], v_top[2], v_top[3]);

  return query select v_top[1], v_top[2], v_top[3];
end;
$$;

-- The quiz site is anonymous: only anon may call the two quiz functions.
revoke execute on function public.quiz_client_ip() from public, anon, authenticated;
revoke execute on function public.quiz_find_student(text), public.quiz_submit_result(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.quiz_find_student(text), public.quiz_submit_result(text, jsonb) to anon;
