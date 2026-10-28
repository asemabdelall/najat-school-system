-- =====================================================================
-- Al-Najat Boys Secondary School — core schema
-- Single-school deployment: school-level configuration lives in the
-- singleton `school_settings` row instead of a multi-tenant `schools` table.
-- Status values use CHECK constraints (easy to extend with a migration)
-- rather than Postgres enums.
-- =====================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Kuwait calendar date "today" (Asia/Kuwait, UTC+3, no DST).
create or replace function public.kw_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Kuwait')::date;
$$;

-- ---------------------------------------------------------------------
-- School settings (singleton)
-- ---------------------------------------------------------------------
create table public.school_settings (
  id smallint primary key default 1 check (id = 1),
  school_name_ar text not null default 'ثانوية النجاة بنين – حولي',
  school_name_en text not null default 'Al-Najat Boys Secondary School — Hawally',
  attendance_mode text not null default 'daily' check (attendance_mode in ('daily', 'period')),
  periods_per_day smallint not null default 7 check (periods_per_day between 1 and 10),
  teacher_backdate_days smallint not null default 1 check (teacher_backdate_days between 0 and 14),
  follow_up_due_soon_days smallint not null default 2 check (follow_up_due_soon_days between 1 and 14),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.school_settings (id) values (1);
create trigger school_settings_updated_at before update on public.school_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Staff profiles & roles
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text,
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{7,20}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_full_name_idx on public.profiles (full_name);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'student_affairs', 'teacher')),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

-- ---------------------------------------------------------------------
-- Academic structure
-- ---------------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 4 and 40),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_years_dates_chk check (ends_on > starts_on),
  constraint academic_years_no_overlap exclude using gist (daterange(starts_on, ends_on, '[]') with &&)
);
create unique index academic_years_one_current on public.academic_years (is_current) where is_current;
create trigger academic_years_updated_at before update on public.academic_years
  for each row execute function public.set_updated_at();

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  grade_level smallint not null check (grade_level between 10 and 12),
  section text not null check (char_length(btrim(section)) between 1 and 10),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  track text check (track in ('general', 'science', 'literary')),
  capacity smallint check (capacity is null or capacity between 1 and 60),
  room text,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_classes_unique_section unique (academic_year_id, grade_level, section),
  constraint school_classes_id_year_uk unique (id, academic_year_id)
);
create index school_classes_year_idx on public.school_classes (academic_year_id, grade_level);
create trigger school_classes_updated_at before update on public.school_classes
  for each row execute function public.set_updated_at();

create table public.students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null check (student_number ~ '^[A-Za-z0-9-]{3,20}$'),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  date_of_birth date check (date_of_birth is null or date_of_birth between date '1990-01-01' and date '2020-12-31'),
  guardian_name text check (guardian_name is null or char_length(guardian_name) <= 120),
  guardian_phone text check (guardian_phone is null or guardian_phone ~ '^\+?[0-9 ]{7,20}$'),
  status text not null default 'active' check (status in ('active', 'transferred', 'graduated', 'archived')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index students_number_uk on public.students (lower(student_number));
create index students_status_idx on public.students (status);
create index students_name_idx on public.students (full_name);
create trigger students_updated_at before update on public.students
  for each row execute function public.set_updated_at();

-- Enrollment history: one row per student per class placement. Rows are
-- closed (status/ended_on) rather than deleted, so history is preserved.
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  class_id uuid not null,
  academic_year_id uuid not null,
  status text not null default 'active' check (status in ('active', 'transferred', 'withdrawn', 'completed')),
  enrolled_on date not null default public.kw_today(),
  ended_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Composite FK guarantees the enrollment's year matches the class's year.
  constraint enrollments_class_year_fk foreign key (class_id, academic_year_id)
    references public.school_classes (id, academic_year_id) on delete restrict,
  constraint enrollments_dates_chk check (ended_on is null or ended_on >= enrolled_on),
  constraint enrollments_active_open_chk check ((status = 'active') = (ended_on is null))
);
create unique index enrollments_one_active_per_year
  on public.enrollments (student_id, academic_year_id) where status = 'active';
create index enrollments_class_idx on public.enrollments (class_id, status);
create index enrollments_student_idx on public.enrollments (student_id);
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute function public.set_updated_at();

create table public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  class_id uuid not null references public.school_classes (id) on delete cascade,
  subject text not null default '' check (char_length(subject) <= 60),
  is_homeroom boolean not null default false,
  created_at timestamptz not null default now(),
  constraint tca_unique unique (teacher_id, class_id, subject)
);
create unique index tca_one_homeroom_per_class on public.teacher_class_assignments (class_id) where is_homeroom;
create index tca_teacher_idx on public.teacher_class_assignments (teacher_id);
create index tca_class_idx on public.teacher_class_assignments (class_id);

-- ---------------------------------------------------------------------
-- Attendance
-- period = 0 means a daily session; 1..N is a class period.
-- ---------------------------------------------------------------------
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.school_classes (id) on delete restrict,
  session_date date not null,
  period smallint not null default 0 check (period between 0 and 10),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  taken_by uuid references public.profiles (id) on delete set null,
  submitted_at timestamptz,
  submitted_late boolean not null default false,
  reopened_at timestamptz,
  reopened_by uuid references public.profiles (id) on delete set null,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_sessions_unique unique (class_id, session_date, period),
  constraint attendance_sessions_submitted_chk check ((status = 'submitted') = (submitted_at is not null))
);
create index attendance_sessions_date_idx on public.attendance_sessions (session_date);
create trigger attendance_sessions_updated_at before update on public.attendance_sessions
  for each row execute function public.set_updated_at();

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  enrollment_id uuid not null references public.enrollments (id) on delete restrict,
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  minutes_late smallint check (minutes_late is null or minutes_late between 1 and 300),
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_records_unique unique (session_id, student_id),
  constraint attendance_records_late_chk check (status = 'late' or minutes_late is null)
);
create index attendance_records_student_idx on public.attendance_records (student_id);
create index attendance_records_status_idx on public.attendance_records (status);
create trigger attendance_records_updated_at before update on public.attendance_records
  for each row execute function public.set_updated_at();

create table public.attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references public.attendance_records (id) on delete set null,
  session_id uuid not null references public.attendance_sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  old_status text check (old_status in ('present', 'absent', 'late', 'excused')),
  new_status text not null check (new_status in ('present', 'absent', 'late', 'excused')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  source text not null default 'manual' check (source in ('manual', 'excuse_approval')),
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz not null default now()
);
create index attendance_corrections_session_idx on public.attendance_corrections (session_id);
create index attendance_corrections_student_idx on public.attendance_corrections (student_id);

create table public.absence_excuses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  from_date date not null,
  to_date date not null,
  reason_type text not null check (reason_type in ('medical', 'family', 'official', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint absence_excuses_dates_chk check (to_date >= from_date and to_date - from_date <= 60),
  constraint absence_excuses_review_chk check ((status = 'pending') = (reviewed_at is null))
);
create index absence_excuses_student_idx on public.absence_excuses (student_id, from_date);
create index absence_excuses_status_idx on public.absence_excuses (status);
create trigger absence_excuses_updated_at before update on public.absence_excuses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Behaviour
-- ---------------------------------------------------------------------
create table public.behavior_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  default_severity text not null default 'medium' check (default_severity in ('low', 'medium', 'high')),
  is_active boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger behavior_categories_updated_at before update on public.behavior_categories
  for each row execute function public.set_updated_at();

insert into public.behavior_categories (name, description, default_severity, sort_order) values
  ('التأخر المتكرر عن الحصص', 'تأخر متكرر عن بداية الحصة أو الطابور', 'low', 10),
  ('الإخلال بنظام الفصل', 'سلوك يعيق سير الحصة', 'low', 20),
  ('عدم الالتزام بالزي المدرسي', null, 'low', 30),
  ('استخدام الهاتف دون إذن', null, 'low', 40),
  ('التغيب عن الحصة دون إذن', 'الخروج من الحصة أو عدم حضورها رغم التواجد بالمدرسة', 'medium', 50),
  ('الإساءة اللفظية', null, 'medium', 60),
  ('إتلاف الممتلكات', null, 'high', 70),
  ('الاعتداء الجسدي', null, 'high', 80);

create table public.behavior_incidents (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.behavior_categories (id) on delete restrict,
  incident_date date not null,
  location text check (location is null or char_length(location) <= 120),
  description text not null check (char_length(btrim(description)) between 10 and 3000),
  severity text not null check (severity in ('low', 'medium', 'high')),
  status text not null default 'submitted'
    check (status in ('submitted', 'under_review', 'approved', 'rejected', 'resolved')),
  reported_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index behavior_incidents_status_idx on public.behavior_incidents (status);
create index behavior_incidents_date_idx on public.behavior_incidents (incident_date);
create index behavior_incidents_reporter_idx on public.behavior_incidents (reported_by);
create index behavior_incidents_category_idx on public.behavior_incidents (category_id);
create trigger behavior_incidents_updated_at before update on public.behavior_incidents
  for each row execute function public.set_updated_at();

create table public.incident_students (
  incident_id uuid not null references public.behavior_incidents (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  primary key (incident_id, student_id)
);
create index incident_students_student_idx on public.incident_students (student_id);

create table public.incident_actions (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.behavior_incidents (id) on delete cascade,
  action_type text not null check (action_type in ('submitted', 'edited', 'status_change', 'note', 'action_taken')),
  from_status text,
  to_status text,
  note text check (note is null or char_length(note) <= 2000),
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index incident_actions_incident_idx on public.incident_actions (incident_id, created_at);

-- ---------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------
create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students (id) on delete restrict,
  incident_id uuid references public.behavior_incidents (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 160),
  description text check (description is null or char_length(description) <= 3000),
  category text not null default 'other'
    check (category in ('attendance', 'behavior', 'academic', 'wellbeing', 'guardian_contact', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  assigned_to uuid not null references public.profiles (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete set null,
  due_date date,
  outcome text check (outcome is null or char_length(outcome) <= 3000),
  completed_at timestamptz,
  due_soon_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint follow_up_completed_chk check ((status = 'completed') = (completed_at is not null))
);
create index follow_up_tasks_assignee_idx on public.follow_up_tasks (assigned_to, status);
create index follow_up_tasks_status_due_idx on public.follow_up_tasks (status, due_date);
create index follow_up_tasks_student_idx on public.follow_up_tasks (student_id);
create trigger follow_up_tasks_updated_at before update on public.follow_up_tasks
  for each row execute function public.set_updated_at();

create table public.follow_up_notes (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.follow_up_tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index follow_up_notes_task_idx on public.follow_up_notes (task_id, created_at);

-- ---------------------------------------------------------------------
-- Notifications & audit
-- ---------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'follow_up_assigned', 'follow_up_due_soon', 'incident_submitted', 'incident_reviewed',
    'excuse_submitted', 'excuse_reviewed', 'attendance_reopened', 'role_changed')),
  title text not null,
  body text,
  link text check (link is null or link ~ '^/[A-Za-z0-9/_?=&-]*$'),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, is_read, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  table_name text not null,
  record_id text,
  changes jsonb,
  reason text,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_table_idx on public.audit_logs (table_name, record_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id);
