-- =====================================================================
-- Career quiz: server-side paging and aggregation.
-- The page no longer downloads every student: the list is paged and
-- searched in the database, and the statistics come back as one small
-- JSON document. Both are SECURITY INVOKER (RLS scopes them like
-- career_quiz_overview, which they build on).
-- =====================================================================

-- One page of students with their latest result.
-- p_status: null = everyone, 'tested', 'pending'.
create or replace function public.career_quiz_students(
  p_class_id uuid default null,
  p_status text default null,
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  student_id uuid, student_number text, full_name text, class_id uuid, class_name text,
  top_1 text, top_2 text, top_3 text, submitted_at timestamptz, attempts bigint, total_count bigint
)
language sql stable
set search_path = ''
as $$
  with q as (select public.ar_normalize(btrim(p_search)) as term)
  select o.student_id, o.student_number, o.full_name, o.class_id, o.class_name,
         o.top_1, o.top_2, o.top_3, o.submitted_at, o.attempts, count(*) over ()
  from public.career_quiz_overview(p_class_id) o
  cross join q
  where (q.term = '' or public.ar_normalize(o.full_name) like '%' || replace(replace(q.term, '%', '\%'), '_', '\_') || '%'
         or lower(o.student_number) like '%' || replace(replace(q.term, '%', '\%'), '_', '\_') || '%')
    and (p_status is null
         or (p_status = 'tested' and o.top_1 is not null)
         or (p_status = 'pending' and o.top_1 is null))
  order by o.grade_level, o.section, o.full_name, o.student_id
  limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
$$;

-- Totals, per-category and per-class statistics for the scope.
create or replace function public.career_quiz_stats(p_class_id uuid default null)
returns jsonb
language sql stable
set search_path = ''
as $$
  with o as (select * from public.career_quiz_overview(p_class_id)),
  t as (select * from o where top_1 is not null),
  cats as (
    select k as key,
           array_position(public.career_categories(), k) as ord,
           (select count(*) from t where t.top_1 = k) as first,
           (select count(*) from t where k in (t.top_1, t.top_2, t.top_3)) as in_top3,
           (select round(avg((t.scores ->> k)::numeric), 2) from t where jsonb_typeof(t.scores -> k) = 'number') as average
    from unnest(public.career_categories()) k
  ),
  cls as (
    select o.class_id, o.class_name, o.grade_level, o.section,
           count(*) as total, count(o.top_1) as tested
    from o
    group by o.class_id, o.class_name, o.grade_level, o.section
  ),
  cls_leading as (
    select cls.*, lead.top_1 as leading_key, coalesce(lead.n, 0) as leading_count
    from cls
    left join lateral (
      select t.top_1, count(*) as n
      from t where t.class_id = cls.class_id
      group by t.top_1
      order by count(*) desc, array_position(public.career_categories(), t.top_1)
      limit 1
    ) lead on true
  )
  select jsonb_build_object(
    'total', (select count(*) from o),
    'tested', (select count(*) from t),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('key', key, 'first', first, 'in_top3', in_top3, 'average', average)
                                             order by first desc, in_top3 desc, ord) from cats), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object(
                           'class_id', class_id, 'class_name', class_name, 'total', total, 'tested', tested,
                           'leading', leading_key, 'leading_count', leading_count)
                         order by grade_level, section) from cls_leading), '[]'::jsonb)
  );
$$;

revoke execute on function public.career_quiz_students(uuid, text, text, integer, integer), public.career_quiz_stats(uuid) from public, anon;
grant execute on function public.career_quiz_students(uuid, text, text, integer, integer), public.career_quiz_stats(uuid) to authenticated;
