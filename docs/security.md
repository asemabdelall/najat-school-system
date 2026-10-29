# Security model

## Principles

1. **The database is the security boundary.** Hidden menu items and disabled buttons are convenience only. Every read is filtered by Row Level Security, and every consequential write goes through a constrained table policy or a `SECURITY DEFINER` workflow function with its own checks.
2. **Roles come only from `public.user_roles`.** JWT claims and `user_metadata` (which users can edit) are never consulted. A role grant also requires `profiles.is_active = true`.
3. **The browser holds only the public anon/publishable key.** The service-role key exists only in the Edge Function runtime and in the local-only seed script.

## Roles and permission matrix

| Capability | admin | student_affairs | teacher |
|---|:-:|:-:|:-:|
| View dashboard | ✓ (school) | ✓ (school) | ✓ (own classes) |
| View students | all | all | students ever enrolled in assigned classes |
| Create / edit / archive students, enrol / transfer | ✓ | ✓ | — |
| View classes | all | all | assigned only |
| Create / edit / archive classes, assign teachers | ✓ | ✓ | — |
| Manage academic years | ✓ | — | — |
| Take attendance | any class | any class | assigned classes, today − `teacher_backdate_days` |
| Correct submitted attendance (with reason) | ✓ | ✓ | own session, same day only |
| Reopen submitted session | ✓ | ✓ | — |
| File absence excuse | ✓ | ✓ | own students (pending only) |
| Review excuses | ✓ | ✓ | — |
| Report incidents | ✓ | ✓ | own students |
| View incidents | all | all | **only those they reported** |
| Review / approve / reject / resolve incidents | ✓ (not own) | ✓ (not own) | — |
| Follow-ups: view | all | all | assigned to or created by them |
| Follow-ups: create | for anyone active | for anyone active | for themselves only, own students |
| Follow-ups: edit fields / cancel | ✓ | ✓ | creator only |
| Follow-ups: change status / outcome | ✓ | ✓ | assignee |
| Reports and CSV export | school | school | own classes (behaviour tab hidden) |
| Notifications | own | own | own |
| Users and roles (grant / revoke / create / deactivate) | ✓ | — | — |
| School settings, behaviour categories | ✓ | — | — |
| Audit log | read | — | — |

The UI mirror of this matrix is `src/lib/domain/permissions.ts` (unit-tested); the enforcement is in `supabase/migrations/…02_auth_and_rls.sql` and `…04_workflows.sql`.

## RLS summary

RLS is **enabled on all 20 public tables**. `anon` has no table privileges and no function `EXECUTE`. `authenticated` has `SELECT` everywhere (filtered by policies) and write privileges only where a policy allows it, with column-level grants where sensible: e.g. `profiles(full_name, phone, is_active)`, `notifications(is_read)`, and incident content columns.

* **No direct writes** for authenticated users on `attendance_sessions`, `attendance_records`, `attendance_corrections`, `incident_students`, `incident_actions`, `audit_logs`; these go through workflow functions only.
* Helper predicates (`has_role`, `is_manager`, `teaches_class`, `teaches_student`, `can_view_student`) are `SECURITY DEFINER`, `STABLE`, with `search_path = ''`.
* Knowing a UUID grants nothing: every select policy re-checks scope.
* **Guard triggers** block what RLS alone can't express:
  * non-admins changing `email` / `is_active` on profiles;
  * status / review columns on incidents;
  * non-status fields on follow-ups for assignees;
  * anything but `is_read` on notifications;
  * self-removal of the admin role, and removing the last active admin;
  * self-deactivation.
* `audit_logs` is append-only via triggers that raise on `UPDATE`, `DELETE`, and `TRUNCATE`, including for `service_role`.

## Privileged operations

`supabase/functions/admin-users` (Edge Function, no third-party dependencies):

* Verifies the caller's JWT with Auth, then calls `my_roles()` **as the caller** and requires `admin`.
* Actions: `create` (email, name, validated password ≥ 10 characters with letters and digits, roles from a whitelist), `set_active` (profile flag + Auth ban/unban; no self-deactivation; keeps at least one admin), `reset_password`.
* Writes an `audit_logs` row for each action. Uses the service-role key only inside the function.
* Set `ALLOWED_ORIGIN` to your site's origin in production to restrict CORS (default `*`, which is safe here because every call requires an admin bearer token).

Deactivating a user has two effects: their roles stop counting immediately, so existing sessions see no school data, and Auth bans further sign-ins. Both are covered by integration tests.

## Authentication

* Supabase Auth email/password. **Public sign-up is disabled** (`[auth] enable_signup = false`); accounts are created by admins only. Minimum password length is 10, with letters and digits.
* **Sign-up is also blocked in the database**, so a mis-set dashboard toggle cannot open the school to self-registration: the deferred constraint trigger `guard_auth_user_insert` rejects any new `auth.users` row whose `app_metadata.staff` is not `true` at commit. Only the service role can set `app_metadata` (the `admin-users` Edge Function and `scripts/seed-dev.mjs` do). Side effect: users added from the Supabase dashboard's "Add user" form are rejected too; add staff from the app's Users page.
* **Temporary passwords.** Accounts created or reset by an admin get `profiles.must_change_password = true`; after signing in the user sees only the "set your own password" screen until they choose one. The flag cannot be cleared through the API (`guard_profile_update`); `password_changed()` clears it for the caller after the new password is saved. Users can change their own password any time from the account menu (the current password is verified first).
* Sessions persist in `localStorage` under `najat-auth` with auto-refresh. A rejected or expired token signs the user out locally and shows "انتهت الجلسة". After an explicit sign-out the app never redirects the next user to the previous user's page.

## HTTP security headers (vercel.json)

* `Content-Security-Policy`: `default-src 'self'`; scripts from the app origin only (no inline script, no eval; Zod runs `jitless`); `connect-src` limited to the project's Supabase URL (HTTPS + WSS); `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`. Styles allow `'unsafe-inline'` for component style attributes (animation transforms, chart layout). Verified with zero violations across every screen on a production build.
* `Strict-Transport-Security` (2 years, preload), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy: same-origin`, a restrictive `Permissions-Policy`.
* `robots.txt` allows only the public `/welcome` page to be indexed.
* If the Supabase project URL changes, update `connect-src` in `vercel.json`.

## Privacy

* Fields are collected only where the workflows need them: no civil ID, nationality, medical, or address fields.
* **Notifications never contain student names or incident descriptions**, only the event type, a category name, and an internal link the recipient's own RLS protects.
* **The audit log omits sensitive free text** (incident descriptions and decision notes, student notes, excuse details, follow-up descriptions and outcomes).
* User text is rendered as text, never HTML; there is no `dangerouslySetInnerHTML`.
* CSV export neutralises spreadsheet formula injection (`= + - @` prefixes).
* Error messages shown to users are the database's own Arabic messages or generic mappings; internal English DB errors are never displayed (`src/lib/errors.ts`, unit-tested).

## Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | browser build | no |
| `VITE_SUPABASE_ANON_KEY` | browser build | no (public; RLS enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions (injected by Supabase); `scripts/seed-dev.mjs` (local only) | **yes — never `VITE_*`** |
| `SUPABASE_URL` | Edge Functions / seed script | no |
| `ALLOWED_ORIGIN` | Edge Function (optional) | no |
| `DEV_SEED_PASSWORD` | seed script (optional) | dev only |

The production bundle was scanned after `npm run build`: the local service-role key and secret key do not appear in `dist/`.

## Development accounts

`scripts/seed-dev.mjs` creates fictional accounts with a shared development password. It **refuses to run unless the Supabase URL is localhost / 127.0.0.1**. These accounts are never part of the migrations and never exist in production unless someone creates them by hand.

## Verified by tests

`tests/integration/rls.test.ts` and `workflows.test.ts` (45 tests) sign in as each role with the anon key and attempt, among other things:

* anonymous reads and self-sign-up;
* cross-class reads by UUID;
* self-promotion and metadata role injection;
* direct writes to attendance tables;
* out-of-scope attendance, excuses, and incidents;
* status tampering and self-review of incidents;
* invalid lifecycle jumps;
* assignee field tampering on follow-ups;
* reading others' notifications;
* audit-log reads, deletes (including by service_role);
* report scope;
* edge-function access by non-admins;
* deactivation effects.
