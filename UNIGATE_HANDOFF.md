# Unigate handoff

Continuation document for a new Agent. It describes the repository as inspected on 4 October 2026. It does not replace reading the code.

Related earlier snapshot: `UNIGATE_CURRENT_STATE.md` (written before the backend foundation existed). Where they differ, trust this file and the current tree.

---

## 1. Current completed phase and exact status

**Completed and approved:** product decisions, UI/UX for the foundation, the frontend prototype, Phase 0 contract, and Phase 1 backend foundation.

**Not started:** Phase 2 authentication. Do not start it until the user explicitly says so. One schema question is still open (section 17).

**Git**

| Item | State |
|---|---|
| Branch | `main`, tracking `origin/main` with no ahead/behind |
| Latest commit | `3cd02d6` — `Complete Unigate ERP foundation frontend prototype` |
| Previous | `e31ebea` platform login; `1c02047` initial repo |
| Working tree | Phase 1 backend is **present and uncommitted** |

`git status --short` at inspection:

- Modified: `uni-gate/.gitignore`, `uni-gate/package.json`, `uni-gate/package-lock.json`
- Untracked: `uni-gate/.env.example`, `uni-gate/docker-compose.yml`, `uni-gate/apps/api/`, `uni-gate/packages/`

A fresh clone of `origin/main` has the frontend only. It does not have the API, Prisma schema, or migration. Do not reset or clean the tree.

---

## 2. Implemented in code versus only planned

**In code**

- Frontend foundation under `uni-gate/apps/web`, still on mock `localStorage` services.
- NestJS app `uni-gate/apps/api` with config validation, global validation pipe, error filter, and `GET /api/health`.
- Prisma schema and one migration under `uni-gate/packages/database`.
- Shared constants and the subscription-day rule under `uni-gate/packages/shared`.
- Local PostgreSQL 16.11 process (not Docker) with the foundation migration applied.

**Planned, not implemented**

- Login, logout, `/auth/me`, cookie `ug_access`, password hashing, lockout endpoints.
- Company, branch, role, user, module, and audit HTTP APIs.
- Replacing frontend mocks with `fetch`.
- Company bootstrap transaction (company + first branch + role preset + modules).
- Composite foreign keys that keep a membership’s role and location inside the same company.
- Finance, exchange, gold, aviation, engineering, and HR business logic.
- Production hosting.

---

## 3. Current frontend status

Committed in `3cd02d6`. Prototype only.

- Next.js App Router, React, TypeScript, plain CSS. No Bootstrap or Tailwind.
- Platform UI under `/platform`. Customer UI under `/app`. Logins at `/login/platform` and `/login`. There is no link between those two doors.
- Data access is synchronous and uses `localStorage` (`uni-gate/apps/web/services/`, `uni-gate/apps/web/mocks/`).
- Session key `ug_session` is not production security. See `uni-gate/apps/web/lib/session.ts`.
- Permission helpers: `uni-gate/apps/web/lib/permissions.ts`. `visibleMemberships` is exported and unused. `UsersScreen` filters after `listUsers`.
- `readUserPassword` in `uni-gate/apps/web/services/directory.ts` must never become an API.

---

## 4. Current backend status

`uni-gate/apps/api` exists only in the working tree.

Implemented:

- `src/main.ts` — global prefix `api`, validation pipe, `AllExceptionsFilter`, CORS for `http://localhost:3000`.
- `src/health/health.controller.ts` — `GET /api/health` returns `{ ok: true }`.
- `src/config/env.ts` — requires `DATABASE_URL` and a positive `API_PORT`.
- `src/prisma/prisma.service.ts` — connects on startup and warns if PostgreSQL is down.
- `src/common/validation.ts` — validation failures use code `VALIDATION_ERROR` and do not echo the submitted value.
- Tests: `src/health/health.controller.spec.ts`, `src/common/validation.spec.ts`, `src/subscription.spec.ts`.

Not implemented: auth controllers, guards, company/user services, bcrypt, JWT, cookies.

The API TypeScript module mode is `commonjs` (`uni-gate/apps/api/tsconfig.json`). TRADIVIA’s API uses `nodenext`. Library majors match; the module mode does not. That was intentional so Jest could run. Revisit at finance merge, not before.

---

## 5. Current database status

Schema: `uni-gate/packages/database/prisma/schema.prisma`.

Models: `User`, `Company`, `Location`, `Role`, `Membership`, `CompanyModule`, `AuditEntry`.

No finance tables. No seed script. The database `unigate` received the foundation migration and then constraint-test rows. Those rows were not cleaned by a later step. **Could not verify in this handoff task that the test rows are still present.** Treat `unigate` as a development database, not an empty one.

`authVersion` is the Prisma field `authVersion`, column `auth_version`, default `1`. A password change or admin reset must increment it later. The signed session must carry that value. Older versions must be rejected. Role and permission checks must still read the current `Role` row and must not be frozen inside `authVersion`. No login code does this yet.

---

## 6. PostgreSQL version, database, host, and local setup

Inspected while writing this file: `localhost:5433` is accepting connections.

| Item | Value |
|---|---|
| Engine actually running | PostgreSQL 16.11, native Windows binaries |
| How it was started | Not Docker. Docker was not installed. Official binaries were unpacked under the user profile and started with `pg_ctl` on port 5433. |
| Compose file | `uni-gate/docker-compose.yml` describes `postgres:16-alpine`, container `unigate-db`, host port **5433**, database name **unigate**. It has not been executed. |
| Host / port | `localhost` / `5433` |
| Database name | `unigate` |
| Connection string | See `uni-gate/.env.example` and `uni-gate/packages/database/.env.example`. Do not copy passwords into chat or production. |
| Time zone observed at `initdb` | `Asia/Damascus` |

Disposable databases `unigate_replay` and `unigate_shadow` were created during validation. **Could not verify whether they still exist.**

---

## 7. Dependency versions

Declared ranges are in `package.json` files. Installed versions below were read from `uni-gate/node_modules/*/package.json` during this inspection.

| Package | Declared | Installed |
|---|---|---|
| Node engines | `>=20` in `uni-gate/package.json` | **Could not verify the running shell’s `node -v` in this task.** An earlier session used Node 24.21.0 from `C:\Program Files\nodejs`. |
| TypeScript | `^5.9.2` | `5.9.3` |
| NestJS `@nestjs/common` | `^11.1.6` | `11.2.7` |
| Prisma and `@prisma/client` | `^6.16.3` | `6.19.3` |
| Next.js | `^15.5.4` | `15.5.27` |
| React / React DOM | `^19.1.1` | `19.3.0` |
| Jest / ts-jest / supertest | `^29.7.0` / `^29.4.5` / `^7.1.4` in `uni-gate/apps/api/package.json` | Not re-read from disk in this task. |

These majors were chosen to match `Reference/tradivia-finance-v2` (Nest 11.2.5, Prisma 6.19.3, TypeScript 5.9.3 in that lockfile), not the newest Prisma 8. Do not upgrade Prisma to 8 for the foundation.

---

## 8. Migrations

Only one:

`uni-gate/packages/database/prisma/migrations/20261004120000_foundation/migration.sql`

Lock file: `uni-gate/packages/database/prisma/migrations/migration_lock.toml` (`provider = "postgresql"`).

It creates enums and tables `users`, `companies`, `locations`, `roles`, `memberships`, `company_modules`, `audit_entries`, Prisma indexes and foreign keys, then the manual constraints in section 9.

Applied to empty `unigate` with `prisma migrate deploy`. Status afterward: database schema up to date. Replayed twice from zero on `unigate_replay` (drop, create, deploy, drop, create, deploy). Both applies succeeded.

---

## 9. Constraints and indexes

From Prisma (also in the migration):

- Primary keys on every model (`cuid()`).
- `users_kind_username_key` on (`kind`, `username`). PostgreSQL allows many `MEMBER` rows with `username` null.
- `companies_code_key`.
- `locations_company_id_name_key`.
- `roles_company_id_key_key`.
- `memberships_user_id_key` (one membership per user).
- `memberships_company_id_username_key`.
- `company_modules_company_id_module_key_key`.
- Foreign keys, all `ON DELETE RESTRICT` except `memberships.location_id` which is `ON DELETE SET NULL`.
- Ordinary indexes listed in the migration around the `CREATE INDEX` statements.

Added only in SQL, after the Prisma-generated statements, in the same migration file:

- `users_username_by_kind_check`: `PLATFORM` must have `username`; `MEMBER` must have `username` null.
- `users_platform_username_lower_key`: unique `lower(username)` where `kind = 'PLATFORM'`.
- `memberships_company_username_lower_key`: unique (`company_id`, `lower(username)`).
- `companies_code_lower_key`: unique `lower(code)`.

These manual objects are not represented as Prisma `@@unique` expressions. See section 10 for drift.

---

## 10. Latest real PostgreSQL test results

Executed in the Phase 1 validation session against PostgreSQL 16.11. Not re-run while writing this handoff. Evidence is that session’s command output, not a CI log.

**Migration:** `prisma migrate deploy` on empty `unigate` succeeded. `prisma migrate status` reported the database up to date. `prisma validate` succeeded. `prisma generate` wrote client 6.19.3.

**Replay:** two successful applies on a database that was dropped and recreated between them.

**Constraint script:** `uni-gate/packages/database/prisma/constraint-checks.sql`. Every labeled check printed `PASS`:

- duplicate company code, including case-only difference (`23505`)
- platform username case-only difference (`23505`)
- customer username case-only difference in one company (`23505`)
- same customer username in a second company (accepted)
- `MEMBER` with `users.username` set (`23514`)
- `PLATFORM` with null username (`23514`)
- second membership for the same `user_id` (`23505`)
- missing role, missing location, missing company on location/role (`23503`)
- `auth_version` default `1`

The six expected unique indexes and `users_username_by_kind_check` were present in `pg_indexes` / `pg_constraint`.

**Cross-company gap (also observed):** a membership in company A could reference a role id from company B, and a location id from company B. Existing foreign keys only prove the row exists.

**Drift:** `prisma migrate diff` from the migrated database to `schema.prisma` printed `-- This is an empty migration.` Prisma 6.19.3 did **not** propose dropping the `lower()` indexes, the partial index, or the CHECK. A temporary ordinary index `users_email_probe_idx` on the disposable database **did** produce `DROP INDEX "users_email_probe_idx";`. That statement was not applied. The probe index was dropped manually. So Prisma will drop ordinary unmanaged indexes, and it did not drop these particular custom objects.

**Company bootstrap transaction:** not implemented. No API or service creates company, branch, roles, and modules in one transaction. Nothing was rolled back because there is no such code.

---

## 11. Approved authentication and session decisions

Not implemented as HTTP yet. Schema columns exist for the future phase.

- One `User` table. `kind` is `PLATFORM` or `MEMBER`. Platform operators have no `Membership`. Customer users have exactly one.
- Platform login name: `User.username`. Customer login name: `Membership.username`. Same customer name may exist in two companies. Database rules are in section 9.
- `authVersion` / `auth_version`: increment on password change or administrator reset. Signed session must include it. Older sessions are rejected.
- Production session: server-signed, `httpOnly` cookie named `ug_access`, 8 hours. Not `localStorage`.
- `GET /api/auth/me` is the frontend source of identity after Phase 2.
- Do not trust `roleKey`, `visibility`, `canManageUsers`, or `companyId` from the browser. Load the member’s role from the database on each request so a role change applies immediately.
- `actingCompanyId` for a platform operator is a server-issued support cursor, set by enter and cleared by leave. It is not a customer role named `PLATFORM`.

Approved route split (not built):

- Platform administration: `/api/platform/companies/:companyId/...` so an operator can manage a company without entering support context.
- Customer application: `/api/locations`, `/api/users`, `/api/roles`, `/api/modules` take the company only from the server session (membership, or `actingCompanyId` after enter).

---

## 12. Multi-company and branch isolation

- Customer requests must not trust a client-supplied company id.
- Branch filtering happens before rows leave the server. Do not return every user and hide some in React.
- Company A must not read, update, or deactivate company B, including by guessed ids.
- A paying company has one subscription shared by its branches. Branches are `Location` rows (`ACTIVE` or `INACTIVE`), not separate subscribers.
- This version deactivates branches and users. It does not hard-delete them.
- Creating and editing branches is a Unigate platform operation.
- Creating and editing roles is a Unigate platform operation. Customer user-managers may read roles.
- A branch-scoped manager manages users of that branch only and cannot assign an `ALL_BRANCHES` role or another branch.

---

## 13. Platform Administration vs Support Context

Approved and not yet implemented on the server.

**Administration** (`/platform/companies/:id/...` in the UI): the operator manages configuration for the company id in the path. No `enter` call is required. Customer users receive 403 on these routes.

**Support entry** (`POST /api/platform/companies/:companyId/enter`): writes audit `ENTER` and sets the server session’s acting company. After that, `/app` data routes use that company. `leave` clears it. Switching companies replaces the cursor. Two companies must never be mixed in one response.

The UI already has both shells (`uni-gate/apps/web/components/shell.tsx`). The banner text is the support context. The platform shell is administration.

---

## 14. Subscription expiration semantics

`Company.status` `SUSPENDED` means a person suspended the company. It is not set when the date passes.

`expiresOn` / `expires_on` is the last valid calendar day in `Asia/Damascus`. `2026-10-04` is valid the whole of that day and expired on `2026-10-05`.

The rule in code: `uni-gate/packages/shared/src/subscription.ts` — `isSubscriptionExpired` is `today > expiresOn`. Tested in `uni-gate/apps/api/src/subscription.spec.ts`.

`SUBSCRIPTION_EXPIRED` is a login error code, not a `CompanyStatus` value. Members cannot sign in when suspended or expired. Platform operators can still administrate the company. Reactivation requires a new end date that is not in the past (`DATE_PAST` if it is).

Customer responses must not include `priceUsd` or the expiry date. Platform DTOs may. Do not serialize the whole company row to every caller.

---

## 15. enabled vs ready

`CompanyModule.enabled` is per company. It is the only module flag in the database.

`ready` means the product code exists. It lives in `MODULE_REGISTRY` in `uni-gate/packages/shared/src/modules.ts`. All six keys are `ready: false`: `finance`, `exchange`, `gold`, `aviation`, `engineering`, `hr`.

Do not store a fake `ready = false` row per company. Turning a module off must not delete future operational data. No module business logic is in this foundation.

---

## 16. Finance integration boundary

`Reference/tradivia-finance-v2` is a separate NestJS + Prisma + Next app for one client. Its schema uses `Employee` as the login record and a fixed company id of `tradivia`.

Do not start Unigate from that schema. Do not import its auth. Do not merge its tables now. Versions were aligned (Nest 11, Prisma 6.19.3, TypeScript 5.9.3) so a later merge is less painful. Integration waits until this foundation’s identity, tenancy, and audit are accepted.

The frontend only reserves module links and `FINANCE_ROLE_KEYS` in `uni-gate/apps/web/types/auth.ts`. Those four names are a TRADIVIA preset, not global authorization.

---

## 17. Known unresolved issue

**Cross-company membership integrity**

Work completed: reproduced on PostgreSQL. A membership in company A can point at a role id from company B and a location id from company B. No schema change has been applied to stop that.

**Proposed fix, not approved and not written:**

Add unique `(id, company_id)` on `roles` and on `locations` (the primary key is already `id`; the extra unique key exists so a composite foreign key can include `company_id`). Then:

- `memberships (company_id, role_id)` references `roles (company_id, id)`
- `memberships (company_id, location_id)` references `locations (company_id, id)` when `location_id` is not null

Application checks are still required, but they must not be the only barrier.

The next Agent must not invent this migration unless the user approves it. The user was asked and has not answered in the repository.

---

## 18. Tests and build results from the latest phase

From the Phase 1 validation session (not re-run for this document):

| Command | Result |
|---|---|
| `prisma validate` | Schema valid |
| `tsc --noEmit` for `@unigate/shared`, `@unigate/database`, `@unigate/api` | Exit 0 |
| `npm run test -w @unigate/api` | 3 suites passed, 3 tests passed |
| `nest build` (`npm run build -w @unigate/api`) | Exit 0 |

There is no ESLint config and no CI workflow under `uni-gate`. The frontend production build was run in the frontend phase, not again after the backend files were added.

Jest does not hit PostgreSQL. The health test overrides `PrismaService`. Database proof is the `psql` session in section 10, not Jest.

---

## 19. Uncommitted and staged files

Nothing is staged. The frontend commit is clean on `origin/main`.

Uncommitted Phase 1 files are the modified root package files and the untracked `apps/api`, `packages`, `docker-compose.yml`, and `.env.example` listed in section 1.

This handoff file is new: `UNIGATE_HANDOFF.md`. It was not part of that backend work.

Do not `git reset`, `git checkout --`, or `git clean` those paths.

---

## 20. Exact next action for the next Agent

1. Read this file and `git status`. Confirm the Phase 1 tree is still present and do not discard it.
2. Ask the user whether to add the composite foreign keys in section 17 before authentication. Do not add them silently.
3. If they say yes, add one new migration only, apply it to the local PostgreSQL 16 database, and prove a cross-company role and location insert now fails. Re-run `prisma migrate diff` and do not apply any `DROP` of the manual username constraints.
4. Only after that answer, start **Phase 2 authentication** and stop when it is done. Do not continue into company CRUD in the same turn.
5. Phase 2 scope is: platform login, customer login, logout, `/auth/me`, `httpOnly` cookie `ug_access`, password hashing, five failures then a 15-minute lock, suspended company, subscription expiry using `isSubscriptionExpired`, own password change and admin reset that increment `authVersion`, and tests. Then replace only the frontend auth/session mock.

Local database for that work: PostgreSQL already listening on `localhost:5433`, database `unigate`. If that process is down, Docker is still not the thing that was proven; the compose file is ready but was never run. Do not point Prisma at TRADIVIA’s port 5432.

---

## DO NOT DO

- Do not start Finance integration.
- Do not copy the TRADIVIA Prisma schema or its `Employee` login model.
- Do not trust client-supplied company context.
- Do not replace approved architecture silently.
- Do not continue to another phase without reporting results first.
- Do not start Phase 2 until the composite-key question in section 17 is answered.
- Do not reset or delete the uncommitted `uni-gate/apps/api` and `uni-gate/packages` work.
- Do not upgrade Prisma to 8.
- Do not store `ready` per company.
- Do not collapse `SUSPENDED` and `SUBSCRIPTION_EXPIRED` into one status.
- Do not return passwords or password hashes.
- Do not keep `readUserPassword` as a real endpoint.
- Do not apply a Prisma `DROP` of `users_username_by_kind_check` or the `lower()` unique indexes.
- Do not implement exchange, gold, aviation, engineering, or HR behavior.
- Do not introduce Bootstrap, Tailwind, GraphQL, microservices, or another ORM.
