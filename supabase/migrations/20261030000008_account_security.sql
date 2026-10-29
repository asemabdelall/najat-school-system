-- =====================================================================
-- Account security.
-- 1. Staff accounts can only be created by the admin Edge Function (or the
--    service role), never through the public sign-up endpoint — even if
--    "Allow new users to sign up" is left on in the Auth settings.
-- 2. Temporary passwords set by an admin must be changed at first sign-in.
-- =====================================================================

-- 1. Reject auth users that were not created as staff. Only the service
--    role can set app_metadata, so a public sign-up can never carry it.
--    Auth writes app_metadata after the INSERT in the same transaction, so
--    the check is a deferred constraint trigger that reads the row at commit.
create or replace function public.guard_auth_user_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from auth.users u
    where u.id = new.id and coalesce(u.raw_app_meta_data ->> 'staff', '') = 'true'
  ) and exists (select 1 from auth.users u where u.id = new.id) then
    raise exception 'Signups not allowed: staff accounts are created by the school administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create constraint trigger guard_auth_user_insert after insert on auth.users
  deferrable initially deferred
  for each row execute function public.guard_auth_user_insert();

-- 2. Temporary passwords.
alter table public.profiles add column must_change_password boolean not null default false;

-- Users may not clear the flag directly; only password_changed() (below),
-- an admin, or the service role can.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if public.in_trusted_context() or public.is_admin() then
    if new.id = (select auth.uid()) and new.is_active is distinct from old.is_active then
      raise exception 'لا يمكنك تعطيل حسابك بنفسك' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.id <> old.id or new.email is distinct from old.email or new.is_active is distinct from old.is_active
     or new.must_change_password is distinct from old.must_change_password then
    raise exception 'غير مسموح بتعديل هذه الحقول' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Called by the app right after the user sets a new password.
create or replace function public.password_changed()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'يجب تسجيل الدخول' using errcode = '42501';
  end if;
  update public.profiles set must_change_password = false where id = v_uid and must_change_password;
  if found then
    perform public.write_audit('password_changed', 'profiles', v_uid::text, '{}'::jsonb, null);
  end if;
end;
$$;

revoke execute on function public.guard_auth_user_insert() from public, anon, authenticated;
revoke execute on function public.password_changed() from public, anon;
grant execute on function public.password_changed() to authenticated;
