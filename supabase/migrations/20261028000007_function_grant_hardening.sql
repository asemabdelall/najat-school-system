-- =====================================================================
-- Function privilege hardening.
-- Postgres grants EXECUTE on new functions to PUBLIC (which anon inherits),
-- so functions created after the initial revoke were callable anonymously.
-- Anonymous visitors get no function access; signed-in users get only the
-- RPCs the app calls plus the helpers RLS policies evaluate.
-- =====================================================================
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Internal-only: called by other SECURITY DEFINER functions or as triggers
-- (trigger firing does not require the caller to hold EXECUTE).
revoke execute on function
  public.require_staff(),
  public.write_audit(text, text, text, jsonb, text),
  public.notify(uuid, text, text, text, text),
  public.notify_managers(text, text, text, text),
  public.set_updated_at(),
  public.handle_new_user(),
  public.audit_row_change(),
  public.audit_logs_immutable(),
  public.academic_year_single_current(),
  public.guard_profile_update(),
  public.guard_user_roles(),
  public.guard_teacher_assignment(),
  public.guard_incident_update(),
  public.guard_follow_up_update(),
  public.guard_follow_up_insert(),
  public.guard_notification_update(),
  public.on_follow_up_assigned(),
  public.on_role_changed(),
  public.on_excuse_submitted(),
  public.on_incident_edited()
from public, anon, authenticated;

-- Future functions start closed to PUBLIC/anon as well.
alter default privileges in schema public revoke execute on functions from public, anon;
