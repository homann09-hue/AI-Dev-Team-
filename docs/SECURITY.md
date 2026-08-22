# Security posture and accepted exceptions

## Enforced controls

- Repository code and generated changes are treated as untrusted and tested only in the hardened container boundary.
- Only locally allowlisted repositories can reach provider or Git operations.
- Codex is the sole code-writing model; Claude planning and Grok planning/review are read-only.
- Pull requests, GitHub Actions, exact-revision deployment evidence and a Mac-local HTTP health probe are mandatory completion gates.
- Worker bearer tokens are stored only as hashes in Supabase and can be rotated or revoked. Pairing, rotation, invalid authentication and worker operations are rate-limited and audited.
- Dashboard data and jobs are isolated by authenticated-user RLS.

## Accepted Supabase Auth exception

**Finding:** Supabase reports `auth_leaked_password_protection` because HaveIBeenPwned password screening is disabled.

**Decision:** Accepted while the project remains on the Supabase Free plan and the dashboard remains passwordless. The application exposes only six-digit email OTP login through `signInWithOtp`/`verifyOtp`; it does not expose password registration or password login. Worker authentication uses independent high-entropy local bearer credentials, not user passwords.

**Revisit when:**

- the Supabase organization upgrades to a plan that includes leaked-password protection;
- password login or password registration is introduced; or
- the authentication threat model changes.

At that point, enable `password_hibp_enabled` before accepting password authentication in production.

## Advisor findings that are intentional

- Private credential audit, rate-limit and rotation-code tables have RLS with no policies. This is deliberate deny-all direct access; only narrowly granted functions owned by the database role can reach them.
- Anonymous `SECURITY DEFINER` worker RPCs are intentional custom bearer endpoints. They validate hashed credentials, pin an empty search path, enforce per-worker/global rate limits, restrict payload sizes and scope all reads/writes to the credential owner.
- Newly created indexes may appear as unused until production traffic exercises their associated queue, ownership and audit queries. Do not remove them based only on a short observation window.

## Review cadence

Re-run Supabase security and performance advisors after every database migration and review this exception whenever authentication or subscription level changes.
