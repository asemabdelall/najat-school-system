-- =====================================================================
-- Discipline (الجزاءات): guardian summons, suspension decisions, pledges.
--
-- One table, three action types, each with its own fields and statuses:
--   guardian_summons  استدعاء ولي أمر   scheduled → attended | no_show | cancelled
--   suspension        قرار فصل مؤقت     issued → cancelled
--   pledge            تعهد              pending_signature → signed | cancelled
--
-- Managers (admin, student affairs) only: these are sensitive decisions.
-- Writes go through RLS + guard triggers: fields that define the decision
-- (type, student, year, issuer) are immutable, status changes follow the
-- allowed transitions, closed years are read-only, and a student cannot
-- have two overlapping suspensions.
-- =====================================================================

create table if not exists public.disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null default public.current_academic_year_id() references public.academic_years (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  incident_id uuid references public.behavior_incidents (id) on delete restrict,
  action_type text not null check (action_type in ('guardian_summons', 'suspension', 'pledge')),
  status text not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 2000),

  -- Guardian summons
  meeting_at timestamptz,
  meeting_with text check (meeting_with is null or char_length(meeting_with) <= 120),
  attendee_name text check (attendee_name is null or char_length(attendee_name) <= 120),

  -- Suspension
  suspension_from date,
  suspension_to date,
  decision_number text check (decision_number is null or char_length(decision_number) <= 40),

  -- Pledge
  pledge_text text check (pledge_text is null or char_length(btrim(pledge_text)) between 10 and 3000),
  signed_on date,

  outcome_notes text check (outcome_notes is null or char_length(outcome_notes) <= 2000),
  cancel_reason text check (cancel_reason is null or char_length(cancel_reason) <= 500),
  issued_by uuid references public.profiles (id) on delete restrict default auth.uid(),
  updated_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint disciplinary_status_chk check (
    (action_type = 'guardian_summons' and status in ('scheduled', 'attended', 'no_show', 'cancelled'))
    or (action_type = 'suspension' and status in ('issued', 'cancelled'))
    or (action_type = 'pledge' and status in ('pending_signature', 'signed', 'cancelled'))
  ),
  constraint disciplinary_summons_chk check (action_type <> 'guardian_summons' or meeting_at is not null),
  constraint disciplinary_suspension_chk check (
    action_type <> 'suspension'
    or (suspension_from is not null and suspension_to is not null and suspension_to >= suspension_from
        and suspension_to - suspension_from <= 30)
  ),
  constraint disciplinary_pledge_chk check (action_type <> 'pledge' or pledge_text is not null),
  constraint disciplinary_signed_chk check ((status = 'signed') = (signed_on is not null) or action_type <> 'pledge'),
  constraint disciplinary_cancel_chk check ((status = 'cancelled') = (cancel_reason is not null))
);

create index if not exists disciplinary_actions_year_idx on public.disciplinary_actions (academic_year_id, action_type, status);
create index if not exists disciplinary_actions_student_idx on public.disciplinary_actions (student_id, created_at desc);
create index if not exists disciplinary_actions_incident_idx on public.disciplinary_actions (incident_id);
create index if not exists disciplinary_actions_issued_by_idx on public.disciplinary_actions (issued_by);
create index if not exists disciplinary_actions_updated_by_idx on public.disciplinary_actions (updated_by);

create or replace trigger disciplinary_actions_updated_at before update on public.disciplinary_actions
  for each row execute function public.set_updated_at();
create or replace trigger disciplinary_actions_open_year before insert or update on public.disciplinary_actions
  for each row execute function public.guard_open_year();
-- Free text (reason, notes, pledge wording) stays out of the audit log.
create or replace trigger audit_disciplinary_actions after insert or update on public.disciplinary_actions
  for each row execute function public.audit_row_change('reason,outcome_notes,pledge_text,cancel_reason');

-- Allowed status changes.
create or replace function public.discipline_transition_allowed(p_type text, p_from text, p_to text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_from = p_to or (p_type, p_from, p_to) in (
    ('guardian_summons', 'scheduled', 'attended'),
    ('guardian_summons', 'scheduled', 'no_show'),
    ('guardian_summons', 'scheduled', 'cancelled'),
    ('guardian_summons', 'no_show', 'scheduled'),   -- rescheduled after a missed meeting
    ('suspension', 'issued', 'cancelled'),
    ('pledge', 'pending_signature', 'signed'),
    ('pledge', 'pending_signature', 'cancelled')
  );
$$;

create or replace function public.guard_disciplinary_action()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.students where id = new.student_id and status = 'active') then
      raise exception 'الطالب غير موجود أو غير نشط' using errcode = '23503';
    end if;
    if new.status not in ('scheduled', 'issued', 'pending_signature', 'signed') then
      raise exception 'حالة البداية غير صالحة' using errcode = '22023';
    end if;
    if not public.in_trusted_context() then
      new.issued_by := (select auth.uid());
    end if;
  else
    if new.action_type is distinct from old.action_type or new.student_id is distinct from old.student_id
       or new.issued_by is distinct from old.issued_by or new.created_at is distinct from old.created_at then
      raise exception 'لا يمكن تغيير نوع الإجراء أو الطالب أو مُصدِر القرار' using errcode = '42501';
    end if;
    if old.status = 'cancelled' then
      raise exception 'الإجراء ملغى ولا يمكن تعديله' using errcode = '23514';
    end if;
    if not public.discipline_transition_allowed(old.action_type, old.status, new.status) then
      raise exception 'لا يمكن تغيير الحالة بهذا الشكل' using errcode = '23514';
    end if;
    -- A signed pledge and an issued suspension keep their wording/dates.
    if old.status = 'signed' and (new.pledge_text is distinct from old.pledge_text or new.signed_on is distinct from old.signed_on) then
      raise exception 'لا يمكن تعديل تعهد موقّع' using errcode = '23514';
    end if;
    if not public.in_trusted_context() then
      new.updated_by := (select auth.uid());
    end if;
  end if;

  -- Clear Arabic messages before the table constraints would reject the row.
  if new.action_type = 'guardian_summons' and new.meeting_at is null then
    raise exception 'حدّد موعد الاستدعاء' using errcode = '23514';
  end if;
  if new.action_type = 'suspension' then
    if new.suspension_from is null or new.suspension_to is null then
      raise exception 'حدّد تاريخ بداية الفصل ونهايته' using errcode = '23514';
    end if;
    if new.suspension_to < new.suspension_from then
      raise exception 'تاريخ نهاية الفصل قبل تاريخ بدايته' using errcode = '23514';
    end if;
    if new.suspension_to - new.suspension_from > 30 then
      raise exception 'مدة الفصل لا يمكن أن تتجاوز ٣٠ يومًا' using errcode = '23514';
    end if;
  end if;
  if new.action_type = 'pledge' and char_length(btrim(coalesce(new.pledge_text, ''))) < 10 then
    raise exception 'نص التعهد مطلوب (١٠ أحرف على الأقل)' using errcode = '23514';
  end if;
  if new.action_type = 'pledge' and new.status = 'signed' and new.signed_on is null then
    raise exception 'حدّد تاريخ توقيع التعهد' using errcode = '23514';
  end if;
  if new.status = 'cancelled' and char_length(btrim(coalesce(new.cancel_reason, ''))) < 3 then
    raise exception 'اذكر سبب الإلغاء' using errcode = '23514';
  end if;

  if new.action_type = 'suspension' and new.status = 'issued' and exists (
    select 1 from public.disciplinary_actions d
    where d.student_id = new.student_id and d.id <> new.id and d.action_type = 'suspension' and d.status = 'issued'
      and daterange(d.suspension_from, d.suspension_to, '[]') && daterange(new.suspension_from, new.suspension_to, '[]')
  ) then
    raise exception 'يوجد قرار فصل آخر للطالب يتداخل مع هذه الفترة' using errcode = '23P01';
  end if;
  return new;
end;
$$;

create or replace trigger disciplinary_actions_guard before insert or update on public.disciplinary_actions
  for each row execute function public.guard_disciplinary_action();

revoke execute on function public.guard_disciplinary_action() from public, anon, authenticated;
revoke execute on function public.discipline_transition_allowed(text, text, text) from public, anon;
grant execute on function public.discipline_transition_allowed(text, text, text) to authenticated;

alter table public.disciplinary_actions enable row level security;
create policy disciplinary_actions_select on public.disciplinary_actions
  for select to authenticated using (public.is_manager());
create policy disciplinary_actions_insert on public.disciplinary_actions
  for insert to authenticated with check (public.is_manager());
create policy disciplinary_actions_update on public.disciplinary_actions
  for update to authenticated using (public.is_manager()) with check (public.is_manager());
-- Decisions are never removed: they are cancelled with a reason.

revoke all on public.disciplinary_actions from anon, authenticated;
grant select, insert on public.disciplinary_actions to authenticated;
grant update (status, meeting_at, meeting_with, attendee_name, suspension_from, suspension_to, decision_number,
              pledge_text, signed_on, outcome_notes, cancel_reason, reason, incident_id)
  on public.disciplinary_actions to authenticated;

-- Counts for the discipline page (current year, RLS-scoped).
create or replace function public.discipline_overview()
returns jsonb
language sql stable
set search_path = ''
as $$
  with d as (select * from public.disciplinary_actions where academic_year_id = public.current_academic_year_id())
  select jsonb_build_object(
    'summons_upcoming', (select count(*) from d where action_type = 'guardian_summons' and status = 'scheduled' and meeting_at >= now()),
    'summons_overdue', (select count(*) from d where action_type = 'guardian_summons' and status = 'scheduled' and meeting_at < now()),
    'summons_total', (select count(*) from d where action_type = 'guardian_summons' and status <> 'cancelled'),
    'suspensions_active', (select count(*) from d where action_type = 'suspension' and status = 'issued'
                           and public.kw_today() between suspension_from and suspension_to),
    'suspensions_total', (select count(*) from d where action_type = 'suspension' and status = 'issued'),
    'pledges_pending', (select count(*) from d where action_type = 'pledge' and status = 'pending_signature'),
    'pledges_signed', (select count(*) from d where action_type = 'pledge' and status = 'signed'),
    'students', (select count(distinct student_id) from d where status <> 'cancelled')
  );
$$;

revoke execute on function public.discipline_overview() from public, anon;
grant execute on function public.discipline_overview() to authenticated;
