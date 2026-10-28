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
