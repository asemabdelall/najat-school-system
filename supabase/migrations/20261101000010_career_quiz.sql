-- =====================================================================
-- Career-interest quiz (اختبار الميول المهنية) integration.
--
-- 1. students.civil_id: the Kuwaiti civil ID (12 digits, check digit
--    validated). Optional, unique, and excluded from the audit log.
-- 2. career_quiz_results: one row per completed quiz attempt.
-- 3. Two narrow SECURITY DEFINER functions are the ONLY thing the public
--    quiz site (anon key) can call: look a student up by civil ID and submit
--    a result. anon still has no table privileges at all.
-- 4. career_quiz_overview(): SECURITY INVOKER report, so RLS scopes it
--    (managers: school; teachers: students in their classes).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Civil ID
-- ---------------------------------------------------------------------
-- Kuwaiti civil ID check digit: weights 2,1,6,3,7,9,10,5,8,4,2 over the
-- first 11 digits; check = 11 - (sum mod 11), must equal the 12th digit.
create or replace function public.is_valid_civil_id(p text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p ~ '^[0-9]{12}$' and (
    11 - (
      substr(p, 1, 1)::int * 2 + substr(p, 2, 1)::int * 1 + substr(p, 3, 1)::int * 6 +
      substr(p, 4, 1)::int * 3 + substr(p, 5, 1)::int * 7 + substr(p, 6, 1)::int * 9 +
      substr(p, 7, 1)::int * 10 + substr(p, 8, 1)::int * 5 + substr(p, 9, 1)::int * 8 +
      substr(p, 10, 1)::int * 4 + substr(p, 11, 1)::int * 2
    ) % 11
  ) = substr(p, 12, 1)::int;
$$;

alter table public.students add column if not exists civil_id text;
alter table public.students add constraint students_civil_id_chk
  check (civil_id is null or public.is_valid_civil_id(civil_id));
create unique index if not exists students_civil_id_uk on public.students (civil_id) where civil_id is not null;

-- Keep the civil ID out of the audit log (like notes).
create or replace trigger audit_students after insert or update on public.students
  for each row execute function public.audit_row_change('notes,civil_id');

-- create_student gains p_civil_id (new 8-argument overload).
create or replace function public.create_student(
  p_student_number text, p_full_name text, p_date_of_birth date, p_guardian_name text,
  p_guardian_phone text, p_notes text, p_class_id uuid, p_civil_id text
)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_staff();
  v_id uuid;
  v_civil text := nullif(btrim(p_civil_id), '');
begin
  if not public.is_manager() then
    raise exception 'لا تملك صلاحية إضافة الطلاب' using errcode = '42501';
  end if;
  if exists (select 1 from public.students where lower(student_number) = lower(btrim(p_student_number))) then
    raise exception 'الرقم الطلابي مستخدم مسبقًا' using errcode = '23505';
  end if;
  if v_civil is not null and not public.is_valid_civil_id(v_civil) then
    raise exception 'الرقم المدني غير صحيح' using errcode = '22023';
  end if;
  if v_civil is not null and exists (select 1 from public.students where civil_id = v_civil) then
    raise exception 'الرقم المدني مسجل لطالب آخر' using errcode = '23505';
  end if;
  insert into public.students (student_number, full_name, date_of_birth, guardian_name, guardian_phone, notes, civil_id)
  values (btrim(p_student_number), btrim(p_full_name), p_date_of_birth, nullif(btrim(p_guardian_name), ''),
          nullif(btrim(p_guardian_phone), ''), nullif(btrim(p_notes), ''), v_civil)
  returning id into v_id;
  if p_class_id is not null then
    perform public.enroll_student(v_id, p_class_id, null);
  end if;
  return v_id;
end;
$$;

-- The original 7-argument signature (CSV import, existing callers) now
-- forwards to the new one without a civil ID, so the rules live in one place.
create or replace function public.create_student(
  p_student_number text, p_full_name text, p_date_of_birth date, p_guardian_name text,
  p_guardian_phone text, p_notes text, p_class_id uuid
)
returns uuid
language sql security definer
set search_path = ''
as $$
  select public.create_student(p_student_number, p_full_name, p_date_of_birth, p_guardian_name,
                               p_guardian_phone, p_notes, p_class_id, null::text);
$$;

revoke execute on function public.create_student(text, text, date, text, text, text, uuid, text) from public, anon;
grant execute on function public.create_student(text, text, date, text, text, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Quiz results
-- ---------------------------------------------------------------------
-- Stable category keys; Arabic labels live in the apps.
create or replace function public.career_categories()
returns text[]
language sql immutable
set search_path = ''
as $$
  select array['outdoor', 'mechanical', 'computational', 'scientific', 'persuasive',
               'artistic', 'literary', 'technology', 'social_service', 'sports'];
$$;

create table if not exists public.career_quiz_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  class_id uuid references public.school_classes (id) on delete restrict,
  -- Average score (1–5) per category.
  scores jsonb not null check (jsonb_typeof(scores) = 'object'),
  top_1 text not null check (top_1 = any (public.career_categories())),
  top_2 text not null check (top_2 = any (public.career_categories())),
  top_3 text not null check (top_3 = any (public.career_categories())),
  submitted_at timestamptz not null default now()
);
create index if not exists career_quiz_results_student_idx on public.career_quiz_results (student_id, submitted_at desc);
create index if not exists career_quiz_results_year_idx on public.career_quiz_results (academic_year_id);
create index if not exists career_quiz_results_class_idx on public.career_quiz_results (class_id);

alter table public.career_quiz_results enable row level security;
create policy career_quiz_results_select on public.career_quiz_results
  for select to authenticated using (public.can_view_student(student_id));
-- No insert/update/delete policies: rows arrive only through quiz_submit_result().
revoke all on public.career_quiz_results from anon, authenticated;
grant select on public.career_quiz_results to authenticated;

-- ---------------------------------------------------------------------
-- Public quiz API (anon). Each returns only what the quiz screen shows.
-- ---------------------------------------------------------------------
create or replace function public.quiz_find_student(p_civil_id text)
returns table (full_name text, grade_level smallint, section text, class_name text)
language sql stable security definer
set search_path = ''
as $$
  select s.full_name, c.grade_level, c.section, c.name
  from public.students s
  join public.enrollments e on e.student_id = s.id and e.status = 'active'
  join public.school_classes c on c.id = e.class_id
  where s.civil_id = btrim(p_civil_id)
    and s.status = 'active'
    and e.academic_year_id = public.current_academic_year_id()
  limit 1;
$$;

create or replace function public.quiz_submit_result(p_civil_id text, p_scores jsonb)
returns table (top_1 text, top_2 text, top_3 text)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_year uuid;
  v_class uuid;
  v_keys text[];
  v_top text[];
begin
  select s.id, e.academic_year_id, e.class_id into v_student, v_year, v_class
  from public.students s
  join public.enrollments e on e.student_id = s.id and e.status = 'active'
  where s.civil_id = btrim(p_civil_id)
    and s.status = 'active'
    and e.academic_year_id = public.current_academic_year_id()
  limit 1;
  if v_student is null then
    raise exception 'الرقم المدني غير مسجل في النظام' using errcode = 'P0002';
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

revoke execute on function public.is_valid_civil_id(text), public.career_categories(),
  public.quiz_find_student(text), public.quiz_submit_result(text, jsonb) from public;
grant execute on function public.is_valid_civil_id(text), public.career_categories() to authenticated;
grant execute on function public.quiz_find_student(text), public.quiz_submit_result(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Report (SECURITY INVOKER → RLS-scoped)
-- Every actively enrolled student of the current year in scope, with
-- their latest result this year (null when they have not taken it yet).
-- ---------------------------------------------------------------------
create or replace function public.career_quiz_overview(p_class_id uuid default null)
returns table (
  student_id uuid, student_number text, full_name text, class_id uuid, class_name text,
  grade_level smallint, section text, top_1 text, top_2 text, top_3 text, scores jsonb,
  submitted_at timestamptz, attempts bigint
)
language sql stable
set search_path = ''
as $$
  with yr as (select public.current_academic_year_id() as id),
  roster as (
    select s.id, s.student_number, s.full_name, c.id as class_id, c.name as class_name, c.grade_level, c.section
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join public.school_classes c on c.id = e.class_id
    cross join yr
    where e.academic_year_id = yr.id and e.status = 'active' and s.status = 'active'
      and (p_class_id is null or c.id = p_class_id)
  ),
  latest as (
    select distinct on (r.student_id) r.student_id, r.top_1, r.top_2, r.top_3, r.scores, r.submitted_at,
           count(*) over (partition by r.student_id) as attempts
    from public.career_quiz_results r cross join yr
    where r.academic_year_id = yr.id
    order by r.student_id, r.submitted_at desc
  )
  select ro.id, ro.student_number, ro.full_name, ro.class_id, ro.class_name, ro.grade_level, ro.section,
         l.top_1, l.top_2, l.top_3, l.scores, l.submitted_at, coalesce(l.attempts, 0)
  from roster ro left join latest l on l.student_id = ro.id
  order by ro.grade_level, ro.section, ro.full_name;
$$;

revoke execute on function public.career_quiz_overview(uuid) from public, anon;
grant execute on function public.career_quiz_overview(uuid) to authenticated;
