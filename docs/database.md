# Database

PostgreSQL (Supabase). All schema lives in versioned migrations under `supabase/migrations/` and is reproducible on a fresh project with `supabase db reset` (local) or `supabase db push` (hosted).

| Migration | Contents |
|---|---|
| `…01_core_schema.sql` | Tables, constraints, indexes, default behaviour categories, settings row |
| `…02_auth_and_rls.sql` | Role helpers, guard triggers, RLS policies, least-privilege grants |
| `…03_audit_and_notifications.sql` | Generic audit trigger, notification fan-out triggers |
| `…04_workflows.sql` | Atomic workflow functions (enrol, attendance save/submit/reopen, excuse review, incident lifecycle, reminders) |
| `…05_reporting.sql` | Dashboard and report aggregations (SECURITY INVOKER) |
| `…06_student_search.sql` | Arabic-normalised, RLS-scoped student search |

`supabase/seed.sql` (fictional reference data) runs **only** on local `db reset`; it is not a migration.

## Design decisions

* **Single school.** School-level configuration is a singleton `school_settings` row (`check (id = 1)`) instead of a `schools` table plus a `school_id` on every row. That avoids multi-tenant complexity that a single school doesn't need, and a school id is never used as proof of authorization. Going multi-tenant later would mean adding `schools` and a `school_id` column with RLS predicates.
* **Statuses are `text` + `CHECK` constraints**, not enums. Adding a status is one `alter table … drop/add constraint` in a migration, with no enum-type locking.
* **UUID primary keys** everywhere except `audit_logs` (an identity `bigint`, append-only, ordered).
* **Calendar dates are `date`**: attendance days, due dates, incident dates, enrollment periods. Moments are `timestamptz`. "Today" is `public.kw_today()` = `(now() at time zone 'Asia/Kuwait')::date`, so a session saved at 00:30 Kuwait time lands on the correct day even though UTC is still on the previous date.
* **History is never deleted.** Students are archived (`status`), enrollments are closed (`status` + `ended_on`), classes are archived (`is_archived`), and behaviour categories are deactivated. Foreign keys to historical data use `on delete restrict`.

## Entities

| Table | Purpose | Key constraints |
|---|---|---|
| `school_settings` | Names, attendance mode (`daily`/`period`), periods per day, teacher back-dating window, due-soon days | singleton; ranges checked |
| `profiles` | One row per staff Auth user (name, email, phone, `is_active`) | FK `auth.users` cascade; phone format check |
| `user_roles` | `(user_id, role)` with role ∈ admin / student_affairs / teacher | PK on both; guard: no self-demotion of admin, at least one active admin |
| `academic_years` | Name, dates, status, `is_current` | `ends_on > starts_on`; **exclusion constraint: no overlapping years**; partial unique index → one current year |
| `school_classes` | Grade 10–12, section, name, track, capacity, room, archived | unique `(year, grade, section)`; `(id, year)` unique for the composite FK |
| `students` | Number, name, DOB, guardian name/phone, status, notes | **unique `lower(student_number)`**; format checks |
| `enrollments` | Student placement in a class for a year, with history | **composite FK `(class_id, academic_year_id)` → classes**, so the year always matches the class; **partial unique: one active enrollment per student per year**; `active ⇔ ended_on is null` |
| `teacher_class_assignments` | Teacher ↔ class (+ subject, homeroom) | unique `(teacher, class, subject)`; partial unique: one homeroom per class; trigger: assignee must hold the teacher role; class not archived |
| `attendance_sessions` | One class / date / period, `draft` or `submitted` | **unique `(class_id, session_date, period)`**; period 0 = daily, 1..N = class period; `submitted ⇔ submitted_at` |
| `attendance_records` | One student's mark in a session | **unique `(session_id, student_id)`**; status ∈ present/absent/late/excused; `minutes_late` only when late; FK to the enrollment that made the student eligible |
| `attendance_corrections` | Old→new status, reason, who/when (manual or excuse approval) | reason 3–500 chars |
| `absence_excuses` | Student, date range, reason type, review outcome | `to_date ≥ from_date`, ≤ 60 days; `pending ⇔ reviewed_at is null` |
| `behavior_categories` | Configurable categories with default severity | unique name; 8 defaults inserted by migration |
| `behavior_incidents` | Category, date, location, description, severity, status, reviewer, decision | status ∈ submitted/under_review/approved/rejected/resolved |
| `incident_students` | Incident ↔ students (many-to-many) | PK both |
| `incident_actions` | Timeline: submitted, edited, status_change, note, action_taken | — |
| `follow_up_tasks` | Title, student, linked incident, category, priority, status, assignee, due date, outcome | `completed ⇔ completed_at`; assignee must be active |
| `follow_up_notes` | Progress notes | — |
| `notifications` | Recipient, type, title, body, internal link, read state | link must be an internal path |
| `audit_logs` | Actor, action, table, record, changed fields, reason | **append-only**: update/delete/truncate raise even for service_role |

## Business rules enforced in the database

**Attendance (`save_attendance`)**, in one transaction:

1. The caller is a manager, or a teacher assigned to the class *and* the date is within `teacher_backdate_days`.
2. No future dates; no Fridays or Saturdays; the date must fall inside the class's academic year.
3. The period must match the configured mode: 0 for daily, 1..`periods_per_day` for period mode.
4. Each student must be eligible: an enrollment in this class active on that date (`class_roster()`). Otherwise the whole batch is rejected, so there are no partial saves.
5. Only students sent are touched. **Unmarked students stay unmarked and are never inferred absent.**
6. **Submit** requires every eligible student to be marked.
7. Editing a **submitted** session is a *correction*: a reason is required; allowed for managers, or for the teacher who took it on the same day. Each status change writes `attendance_corrections`.
8. Every save, submit, or correction writes an `audit_logs` entry with counts and reason.

**Reopen (`reopen_attendance_session`)**: managers only, reason required; it notifies the teacher who took the session.

**Excuse review (`review_absence_excuse`)**: managers only; a pending excuse can be decided only once; rejection needs a reason. Approval converts the student's `absent` records in the range to `excused`, each logged as a correction with `source = excuse_approval`.

**Incident lifecycle (`transition_incident`)**:

```
submitted ──► under_review ──► approved ──► resolved
    │               │
    └──────►────────┴──► rejected
```

Managers only; **a reviewer cannot review an incident they reported**; approve, reject, and resolve need a documented note. Status and review columns are protected by `guard_incident_update`, so they cannot be changed with a direct `UPDATE`. The reporter may edit content only while the incident is `submitted`, and each edit is logged on the timeline.

**Enrollment (`enroll_student`)**: transferring closes the current enrollment as `transferred` and creates a new one. The class must be open, the year not closed, and capacity is enforced.

**Follow-ups (trigger `guard_follow_up_update`)**: an assignee who is not the creator or a manager may change only `status` and `outcome`, and cannot cancel. `completed_at` is maintained automatically.

## Reporting rules

The functions in `…05_reporting.sql` are **SECURITY INVOKER**, so RLS filters their input and a teacher's report only ever covers their own classes. The UI CSV export uses the same function calls and filters as the on-screen table.

* `attendance_rate = (present + late) / (present + late + absent + excused)` over **marked records only** (`public.attendance_rate`; mirrored in `src/lib/domain/attendance.ts`).
* Totals are recomputed from summed counts, never by averaging rates (`totalAttendance`, unit-tested).
* In period mode every period is one record, so rates are per marked period, not per day.

**Known limitations**

* The student report returns all rows for the filter, with no server pagination (fine at one school's scale of a few hundred students).
* Due-soon reminders are generated when the assignee opens the app (`refresh_due_soon_notifications`), not by a background scheduler.

## Account security (migration 008)

* `profiles.must_change_password` (temporary-password gate) and `password_changed()`.
* `guard_auth_user_insert`: deferred constraint trigger on `auth.users` that only admits staff accounts created by the service role.

## Indexes

Indexes cover the common filters: enrollments by class/status and student; sessions by date; records by student/status; incidents by status, date, reporter, category; follow-ups by assignee/status and status/due date; notifications by recipient/read/created; audit logs by created, table/record, actor; student name and number. Migration 009 adds an index for every foreign key the Supabase advisor flagged and splits "for all" policies so each table has one permissive policy per action.

## Regenerating types

```bash
npm run db:types   # supabase gen types typescript --local → src/lib/database.types.ts
```
