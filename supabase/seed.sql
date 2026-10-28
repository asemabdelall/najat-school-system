-- =====================================================================
-- DEVELOPMENT / TEST SEED — ENTIRELY FICTIONAL DATA.
-- Runs automatically on `supabase db reset` (local only). It is NOT part
-- of the migrations and is never applied by `supabase db push`.
-- Staff accounts and user-linked records (attendance, incidents,
-- follow-ups) are created by `npm run seed:dev` (scripts/seed-dev.mjs).
-- =====================================================================

insert into public.academic_years (id, name, starts_on, ends_on, is_current, status) values
  ('a0000000-0000-4000-8000-000000002025', '2025/2026', '2025-09-14', '2026-06-18', false, 'closed'),
  ('a0000000-0000-4000-8000-000000002026', '2026/2027', '2026-09-13', '2027-06-17', true, 'active');

-- Current year: grades 10–12, sections 1–3.
insert into public.school_classes (id, academic_year_id, grade_level, section, name, track, capacity, room)
select ('c0000000-0000-4000-8026-000000000' || g || s)::uuid,
       'a0000000-0000-4000-8000-000000002026', g, s::text, g || '/' || s,
       case when g = 10 then 'general' when s = 3 then 'literary' else 'science' end,
       30, 'قاعة ' || g || s
from generate_series(10, 12) g, generate_series(1, 3) s;

-- Previous year: grades 10–11 (history for current 11th/12th graders).
insert into public.school_classes (id, academic_year_id, grade_level, section, name, track, capacity, is_archived)
select ('c0000000-0000-4000-8025-000000000' || g || s)::uuid,
       'a0000000-0000-4000-8000-000000002025', g, s::text, g || '/' || s,
       case when g = 10 then 'general' when s = 3 then 'literary' else 'science' end, 30, false
from generate_series(10, 11) g, generate_series(1, 3) s;

-- 198 fictional students (22 per current class). Names are combinations
-- of common Arabic given names with invented family names.
with first_names(i, n) as (
  select row_number() over (), n from unnest(array[
    'محمد','أحمد','عبدالله','يوسف','خالد','عمر','فهد','سالم','حمد','علي','إبراهيم','بدر',
    'ناصر','مشاري','عبدالرحمن','سعود','فيصل','حسين','مبارك','طلال','راشد','جاسم']) n
), father_names(i, n) as (
  select row_number() over (), n from unnest(array[
    'عادل','سامي','ماجد','وليد','طارق','هاني','نبيل','باسم','زياد']) n
), families(i, n) as (
  select row_number() over (), n from unnest(array[
    'الوادي','السراج','النخيل','المرجان','الساحل','الضياء','الريان','البيان','الهدى']) n
), roster as (
  select row_number() over (order by g, s, k) as rn, g, s, k
  from generate_series(10, 12) g, generate_series(1, 3) s, generate_series(1, 22) k
)
insert into public.students (id, student_number, full_name, date_of_birth, guardian_name, guardian_phone, status)
select ('5e000000-0000-4000-8000-' || lpad(r.rn::text, 12, '0'))::uuid,
       'NJ-' || (2027 - (r.g - 10)) || '-' || lpad(r.rn::text, 4, '0'),
       f.n || ' ' || fa.n || ' ' || fm.n,
       make_date(2026 - (r.g - 10) - 16, 1 + (r.rn % 12)::int, 1 + (r.rn % 27)::int),
       fa.n || ' ' || fm.n,
       -- 5550 prefix: deliberately fictional, not an allocated Kuwaiti range.
       '+965 5550 ' || lpad(r.rn::text, 4, '0'),
       'active'
from roster r
join first_names f on f.i = 1 + (r.rn * 7) % 22
join father_names fa on fa.i = 1 + (r.rn * 5) % 9
join families fm on fm.i = 1 + (r.rn + r.g + r.s) % 9;

-- Current-year enrollments.
with roster as (
  select row_number() over (order by g, s, k) as rn, g, s
  from generate_series(10, 12) g, generate_series(1, 3) s, generate_series(1, 22) k
)
insert into public.enrollments (student_id, class_id, academic_year_id, status, enrolled_on)
select ('5e000000-0000-4000-8000-' || lpad(rn::text, 12, '0'))::uuid,
       ('c0000000-0000-4000-8026-000000000' || g || s)::uuid,
       'a0000000-0000-4000-8000-000000002026', 'active', '2026-09-13'
from roster;

-- Previous-year (completed) enrollments for current grade 11 and 12.
with roster as (
  select row_number() over (order by g, s, k) as rn, g, s
  from generate_series(10, 12) g, generate_series(1, 3) s, generate_series(1, 22) k
)
insert into public.enrollments (student_id, class_id, academic_year_id, status, enrolled_on, ended_on)
select ('5e000000-0000-4000-8000-' || lpad(rn::text, 12, '0'))::uuid,
       ('c0000000-0000-4000-8025-000000000' || (g - 1) || s)::uuid,
       'a0000000-0000-4000-8000-000000002025', 'completed', '2025-09-14', '2026-06-18'
from roster where g > 10;

-- The previous year is closed; archive its classes now that history exists.
update public.school_classes set is_archived = true
where academic_year_id = 'a0000000-0000-4000-8000-000000002025';

-- One archived student for list filters.
update public.students set status = 'archived' where id = '5e000000-0000-4000-8000-000000000198';
update public.enrollments set status = 'withdrawn', ended_on = '2026-10-01'
where student_id = '5e000000-0000-4000-8000-000000000198' and status = 'active';
