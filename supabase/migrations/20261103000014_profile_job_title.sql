-- =====================================================================
-- Staff job title (المسمى الوظيفي), e.g. «أخصائي اجتماعي».
-- Descriptive only: permissions still come from user_roles. Only an
-- admin may set or change it (a user cannot retitle themselves).
-- =====================================================================
alter table public.profiles add column if not exists job_title text
  check (job_title is null or char_length(btrim(job_title)) between 2 and 60);

grant update (job_title) on public.profiles to authenticated;

create or replace function public.guard_profile_job_title()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.job_title is distinct from old.job_title and not public.is_admin() and not public.in_trusted_context() then
    raise exception 'تعديل المسمى الوظيفي متاح لمدير النظام فقط' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace trigger profiles_job_title_guard before update of job_title on public.profiles
  for each row execute function public.guard_profile_job_title();

revoke execute on function public.guard_profile_job_title() from public, anon, authenticated;
