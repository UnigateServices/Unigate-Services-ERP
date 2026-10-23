# Unigate handoff

Continuation document for a new Agent. It describes the repository after Phases 1 to 10 were accepted and merged (Phase 10 is the foundation hardening from the 21 October 2026 review, see "Foundation hardening" below), and after the finance merge decisions were approved on 22 October 2026. It does not replace reading the code.

`UNIGATE_CURRENT_STATE.md` was removed (git history keeps it); product requirements are in `docs/FOUNDATION_REQUIREMENTS.md` (initial snapshot); UI notes are in `docs/UI_NOTES.md`; the finance merge plan is in `docs/FINANCE_MERGE_PLAN.md` (decisions approved 22 October 2026; section 3 is binding); where they differ, this file and the code win.

## Company modules (agreed product rules)
- Keys: finance, exchange, gold, aviation, engineering, hr.
- Toggling `enabled` is a Unigate-only action. Members cannot toggle.
- A disabled module is hidden from the customer, and its direct URL is forbidden.
- An enabled module with no product UI shows a clear "not ready" page, not an error.
- Enabling a module does not make it ready (`ready` lives in MODULE_REGISTRY).
- Turning a module off never deletes data. The UI asks for confirmation first.

---

## 1. Current completed phase and exact status

**Completed and accepted:** product decisions, foundation UI, frontend prototype, Phase 1 database foundation, composite company-integrity foreign keys, Phase 2 authentication, Phase 3 platform company administration, Phase 4 platform support context, Phase 5 branch and location management, Phase 6 role and permission management, Phase 7 users and memberships, Phase 8 company modules, Phase 9 platform audit list, Phase 10 foundation hardening (pull request #4), and removal of the web mock store (pull request #5).

**Accepted and merged:** phase F1 (role permissions by area), pull request #7. See "Phase F1" below.

**Accepted and merged:** phase 11 (managers manage branches, roles, and permissions), pull request #8. See "Phase 11" below.

**Changed on 23 October 2026:** the finance owner handed over commit `77ce653` and stopped. The user and Claude do the whole merge (F0 to F5). There is no separate preparation in `Reference/erp-finance/`; the conversions happen while moving code in F3 (`docs/FINANCE_MERGE_PLAN.md` section 4).

**Implemented, waiting for acceptance:** phase F0 (finance safety net), on branch `phase-f0-finance-baseline`. `tools/finance-baseline/scenario.mjs` runs a fixed set of finance operations and records every computed number; `tools/finance-baseline/baseline/original.json` holds the original app's numbers. Every F3 batch must reproduce them. Accounting observations for the manager are in `docs/FINANCE_REVIEW_NOTES.md`; do not change finance behavior during the merge.

**Approved, not started:** phases F2 to F5 in `docs/FINANCE_MERGE_PLAN.md` (finance owner). Do not start one until the user explicitly says so.

**Not built:** finance, exchange, gold, aviation, engineering, and HR business logic.

**Git**

| Item | State |
|---|---|
| Branch | `main`, tracking `origin/main` |
| Authentication | `106c03a` — signed cookie authentication |
| Company integrity | `fa53978` — composite foreign keys |
| Phase 1 API and schema | `38ff4aa` |
| Frontend prototype | `3cd02d6` |
| Phase 3 companies | `c92edaa` — platform company administration |
| Phase 4 support | `be9c1d6` — signed support context |
| Phase 5 branches | `ace8c50` — branch and location management |
| Phase 6 roles | `3814e86` — role and permission management |
| Phase 7 users | `5209f39` — customer users and memberships |
| Phase 8 modules | `f147ec1` — company module management and the module access check |
| Phase 8 merge | `640a02e` — pull request #1, `phase-8-modules` into `main` |
| Phase 9 audit | `c58b33a` — platform audit list API and the real support log screen |
| Phase 9 merge | `6dfa643` — pull request #2, `phase-9-audit` into `main` |
| Finance reference files | `acf36ce` — `Reference/tradivia-finance-v2` tracked as normal files. That folder was later renamed to `Reference/erp-finance`. |
| Finance reference update | `751fa61` — replace the copy with finance repository commit `77ce653` (18 October 2026) |
| Finance reference merge | `0671e5d` — pull request #3, `finance-reference-update` into `main` |
| Phase 10 hardening merge | pull request #4, `claude/exciting-pasteur-4q0bzq` into `main` (21 October 2026) |
| Mock store removal | `0374fa7` — pull request #5, `cleanup-mocks` into `main` |
| Finance merge plan draft | `34ffd85` — `docs/FINANCE_MERGE_PLAN.md` |
| Previous handoff | `02e6022` — Phase 2 acceptance notes |

`main` includes everything above (check `git log` for the current head). A fresh clone includes authentication, platform company routes, server-signed support, PostgreSQL-backed branches, roles, customer users, company modules, and the platform audit list. Do not reset or clean the tree.

---

## 2. Implemented in code versus only planned

**In code**

- Frontend foundation under `uni-gate/apps/web`.
- Platform company list, create, detail, edit, suspend, and activate use `uni-gate/apps/web/services/platform-companies.ts`. Dashboard active and suspended counts use the same list contract.
- Login, logout, session gate, `/api/auth/me`, and own password change use the API and the `ug_access` cookie.
- NestJS platform company routes under `uni-gate/apps/api/src/platform/`.
- Platform support context is `actingCompanyId` on the signed `ug_access` cookie. Enter and leave are platform-only. `ug_support_company` is not an authority.
- Branch and location data is server-backed through PostgreSQL for Platform Administration and for customer or support context. The domain model remains `Location`. The UI calls it Branch / فرع.
- Roles and permission metadata are PostgreSQL-backed for Platform Administration and for customer or support context. Role keys are unique per company. Members can read roles only when the current role has `canManageUsers`. Members cannot create or edit roles. Platform operators can.
- Customer users and memberships are PostgreSQL-backed for Platform Administration and for customer or support context. A customer account is one `MEMBER` user plus one membership. Platform operators have no membership and are not in the customer user list.
- Company creation is one transaction: company, first branch named like the company, the selected role preset, six `CompanyModule` rows, and a `CREATE` audit row. It does not create a customer user. A new company has no customer login until its first user is created.
- Company modules are PostgreSQL-backed. `enabled` is the only per-company flag. `ready` stays in `MODULE_REGISTRY` and is `false` for all six keys. Platform operators list and replace flags. Members and a platform operator in support read the session company. `ModuleAccessGuard` with `RequireEnabledModule` is applied only to `GET /api/modules/:key`.
- A missing `CompanyModule` row is disabled. `PUT` creates a row only for a key in the payload. An operator in support is held to the same enabled check as a member. An operator with no support company gets `409` `CONFLICT` before the key is checked, including for an unknown key. After a company is known, an unknown key is `404` `NOT_FOUND` and a disabled or missing module is `403` `FORBIDDEN`. A module change writes an audit `UPDATE` with target type `module` and target id equal to the key only when the enabled flag actually changes. It does not change `authVersion` and it does not delete rows.
- The development seed upserts any missing module key as disabled and does not change an existing `enabled` flag.
- The platform audit list is read-only and PostgreSQL-backed. `GET /api/platform/access-log` uses `AuthGuard` and `PlatformGuard`. Filters are `page`, `pageSize`, and `companyId`. Default page size is 20 and the maximum is 100. Rows are ordered by `createdAt` descending, then `id` descending. Each item selects only the actor name and the company name and code, plus the audit fields. An unknown `companyId` is `404` `NOT_FOUND`. The web client is `uni-gate/apps/web/services/audit.ts`. The support log screen is in `uni-gate/apps/web/components/screens/platform-lists.tsx`. Tests are in `uni-gate/apps/api/src/platform/audit/access-log.spec.ts`.
- Prisma schema and four migrations. No Phase 7, Phase 8, or Phase 9 migration. Phase F1 added the fourth.
- Development-only seed: `npm run db:seed:dev` from `uni-gate`. It refuses `NODE_ENV=production`.

**Planned, not implemented**

- Finance, exchange, gold, aviation, engineering, and HR business logic.
- Production hosting.

---

## 3. Current frontend status

- Next.js App Router, React, TypeScript, plain CSS. No Bootstrap or Tailwind.
- Platform UI under `/platform`. Customer UI under `/app`. Logins at `/login/platform` and `/login`. There is no link between those two doors.
- HTTP client: `uni-gate/apps/web/lib/api.ts`. Cookie requests use `credentials: 'include'`.
- Authentication session is the `ug_access` cookie plus `GET /api/auth/me`. It is not stored in `localStorage`.
- Language and theme preferences remain in `localStorage`.
- Platform support context is the signed `ug_access` cookie. `actingCompanyId` is set by `POST /api/platform/companies/:companyId/enter` and cleared by `POST /api/platform/companies/:companyId/leave`. The browser does not choose the acting company.
- `ug_support_company` is not an authority. `loadSession` deletes any leftover value. It does not decide support context.
- Company detail offers **الدخول إلى الشركة**. That calls enter, then opens `/app`. The support banner reads the company from `/api/auth/me`. Leave returns to `/platform/companies/:companyId` and keeps the operator signed in.
- While support is open, `/platform` stays the platform shell and shows that a support session is open. `/app`, `/app/branches`, `/app/roles`, `/app/users`, `/app/modules`, and `/app/modules/:key` use the acting company. Other `/app` routes for a platform operator still show a pending note.
- A member session still uses `Membership` and does not use `actingCompanyId`. Branch lists come from `GET /api/locations`. Role lists come from `GET /api/roles` and are read-only. User lists come from `GET /api/users`. The seeded TRADIVIA manager is `GENERAL_MANAGER` with `ALL_BRANCHES` and `canManageUsers`, so that account sees every TRADIVIA branch, the role list, and every customer user. It cannot create or edit branches or roles. It can manage other customer users. On its own user record the role, branch, and status controls are disabled, and the password-reset section is hidden.
- The web mock store is gone. Screens do not read or write `ug_mock_db`.
- Server-backed user screens: `/platform/companies/:id/users`, `/platform/companies/:id/users/new`, `/platform/companies/:id/users/:userId`, `/app/users`, `/app/users/new`, and `/app/users/:userId`. Company detail links to Users. The customer dashboard user count, shown only when `canManageUsers` is true, is the `total` from the authorized user list.
- Server-backed module screens: `/platform/companies/:id/modules`, `/app/modules`, and `/app/modules/:key`. Company detail links to Modules and lists enabled modules from the company detail response. The customer navigation and dashboard show only enabled modules. An enabled module opens the not-ready page. A direct URL for a disabled module shows that it is not available. An unknown key shows an unknown section. Turning a module off asks for confirmation and does not delete data.
- The support log at `/platform/audit` and the dashboard recent-activity table read `GET /api/platform/access-log`. Recent activity is text only and does not open a company. A member who opens `/platform/audit` is sent to `/app` by the existing platform session gate.
- Branch, role, user, module, and audit screens have one source of truth: PostgreSQL. `services/directory.ts` keeps only the password, company-code, and role-key checks.
- The customer dashboard branch count comes from the authorized location list. The platform company detail branch and user counts remain the PostgreSQL counts. The branch count includes inactive branches.
- `readUserPassword` is not in the mock directory and is not an API. Own password change stays on `POST /api/auth/password`. An administrator reset uses the user password routes below.

---

## 4. Current backend status

Authentication lives in `uni-gate/apps/api/src/auth/`.

| Method | Path | Behavior |
|---|---|---|
| POST | `/api/auth/platform/login` | Platform username and password. Sets `ug_access`. Returns 200 `{ ok: true }`. |
| POST | `/api/auth/login` | `companyCode`, membership username, and password. Company comes from the code, not from a client company id. |
| POST | `/api/auth/logout` | Clears the cookie. 204. Does not keep a server session list. |
| GET | `/api/auth/me` | Current identity loaded from PostgreSQL. |
| POST | `/api/auth/password` | Verifies the current password, stores a new hash, increments `authVersion`, clears the cookie. 204. |

Platform company routes, all platform-operator only:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/platform/companies` | `{ items, page, pageSize, total }`. Default page size 20, maximum 100. Ordered by name, then id. `q` matches name or code. `status` is `ACTIVE` or `SUSPENDED`. |
| POST | `/api/platform/companies` | Bootstrap transaction. Code is lowercased. Duplicate code, including case-only, is `409` `CODE_TAKEN`. |
| GET | `/api/platform/companies/:companyId` | Platform DTO plus branch count, user count, and six module flags. Unknown id is `404` `NOT_FOUND`. |
| PATCH | `/api/platform/companies/:companyId` | Name, code, `priceUsd`, and `expiresOn` only. Does not change status. |
| POST | `/api/platform/companies/:companyId/suspend` | Sets `SUSPENDED`. Writes audit `UPDATE`. Does not delete rows. |
| POST | `/api/platform/companies/:companyId/activate` | Body `{ expiresOn }`. A date before today in `Asia/Damascus` is `400` `DATE_PAST`. |
| POST | `/api/platform/companies/:companyId/enter` | Platform only. Writes audit `ENTER`. Reissues `ug_access` with `actingCompanyId`. Keeps the current token expiration. Active, suspended, and expired companies are allowed. |
| POST | `/api/platform/companies/:companyId/leave` | Clears `actingCompanyId` and keeps the operator signed in. No new audit action. If that company is not the current support company, `409` `CONFLICT`. |
| GET | `/api/platform/companies/:companyId/locations` | Platform only. `{ items }` of `{ id, name, status, companyId }`, ordered by name, then id. Unknown company is `404` `NOT_FOUND`. |
| POST | `/api/platform/companies/:companyId/locations` | Body `{ name }`. Creates an `ACTIVE` location in that company. Duplicate trimmed name in the same company is `409` `NAME_TAKEN`. Writes audit `CREATE` with target type `location`. |
| PATCH | `/api/platform/companies/:companyId/locations/:locationId` | Body `{ name, status }`. `status` is `ACTIVE` or `INACTIVE`. A location that is not in this company is `404` `NOT_FOUND`. Does not move the branch or delete the row. Writes audit `UPDATE`. |

Customer location route:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/locations` | Company comes from the session. A member uses `Membership`. A platform operator uses `actingCompanyId`. No acting company is `409` `CONFLICT`. The response is `{ items }` of `{ id, name, status }` and does not include company metadata. A client `companyId` does not change scope. |

There is no branch delete route. Deactivation is `INACTIVE`. Inactive locations stay stored and stay visible inside the caller's scope. An inactive location does not block member login. Branch names are unique per company with a case-sensitive comparison, matching the previous screen and `locations_company_id_name_key`. The same name may exist in another company. Visibility is applied before rows leave the server: a platform operator in support and a member with `ALL_BRANCHES` see every branch of that company; `BRANCH` and `OWN` see only the membership location.

Platform role routes, platform-operator only. Writes from `/app` reuse these routes with the company id from the signed session:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/platform/companies/:companyId/roles` | `{ items }` of role fields, ordered by name, then id. Includes `companyId`. Unknown company is `404` `NOT_FOUND`. |
| POST | `/api/platform/companies/:companyId/roles` | Body is `name`, `key`, `canManageUsers`, `visibilityScope`, `editRequiresApproval`, and `deleteRequiresApproval`. Key must match `^[A-Z][A-Z0-9_]{1,40}$`. Duplicate key in the same company is `409` `KEY_TAKEN`. Writes audit `CREATE` with target type `role`. |
| PATCH | `/api/platform/companies/:companyId/roles/:roleId` | Same fields. A role that is not in this company is `404` `NOT_FOUND`. Writes audit `UPDATE`. |

Customer role route:

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/roles` | Company comes from the session. A member uses `Membership` and must currently have `canManageUsers`. Otherwise `403` `FORBIDDEN`. A platform operator uses `actingCompanyId`. No acting company is `409` `CONFLICT`. The response does not include company metadata. A client `companyId` does not change scope. |

There is no role delete route and no separate role-detail route. Role keys are unique per company through `roles_company_id_key_key`. The same key may exist in another company. Keys are not case-folded. A `visibilityScope` change that would make an existing membership invalid is `409` `CONFLICT`, and membership rows are not rewritten. `ALL_BRANCHES` requires `locationId` null. `BRANCH` and `OWN` require a location. `canManageUsers` and `visibilityScope` are read from the current role row on the next request. A role edit does not change `authVersion`. `editRequiresApproval` and `deleteRequiresApproval` are stored and returned. They do not run a finance approval workflow.

Platform user routes, platform-operator only. A member receives `403` `FORBIDDEN`. A missing cookie receives `401` `UNAUTHORIZED`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/platform/companies/:companyId/users` | `{ items, page, pageSize, total }`. Default page size 20, maximum 100. Ordered by display name, then user id. `q` matches display name or customer username. Only `MEMBER` users of that company. Unknown company is `404` `NOT_FOUND`. |
| POST | `/api/platform/companies/:companyId/users` | One transaction: `MEMBER` user plus one membership. `User.username` stays null. The login name is `Membership.username`. Duplicate username in the same company, ignoring case, is `409` `NAME_TAKEN`. Writes audit `CREATE` with target type `user`. |
| GET | `/api/platform/companies/:companyId/users/:userId` | One customer user. A user from another company, or a platform operator, is `404` `NOT_FOUND`. |
| PATCH | `/api/platform/companies/:companyId/users/:userId` | Name, username, email, phone, status, `roleId`, and `locationId`. Password is not changed here. Does not move the user to another company. Writes audit `UPDATE`. |
| POST | `/api/platform/companies/:companyId/users/:userId/password` | Body `{ password }`. Hashes it, increments `authVersion`, clears the lock, returns 204. Writes audit `UPDATE`. |

Customer and support user routes. Company comes only from the session. A client `companyId` does not change scope.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/users` | Same list contract. A member must currently have `canManageUsers`, or the response is `403` `FORBIDDEN`. `ALL_BRANCHES` sees every customer user in the company. `BRANCH` and `OWN` see only users on their membership location whose role has `canManageUsers = false`, plus their own record. A peer manager on the same branch is out of scope. A platform operator uses `actingCompanyId` and sees every customer user there. No acting company is `409` `CONFLICT`. |
| POST | `/api/users` | Same create rules, scoped to that session company. A branch-scoped manager cannot assign an `ALL_BRANCHES` role, a role with `canManageUsers`, or another branch: `403` `FORBIDDEN`. Keeping their own current role on their own record is allowed. |
| GET | `/api/users/:userId` | Same scope as the list. An out-of-scope id is `404` `NOT_FOUND`. |
| PATCH | `/api/users/:userId` | Same fields as the platform patch. Out of scope is `404` `NOT_FOUND`. |
| POST | `/api/users/:userId/password` | Same reset as the platform route, for an in-scope user. Returns 204. The new hash and its audit row are one transaction. |

Member create, edit, and reset write the same `AuditEntry` rows as the platform routes, with the member as actor. They appear in the platform audit list. Members still cannot read that list.

A role or location that is not in the session company is `404` `NOT_FOUND`. An `ALL_BRANCHES` role with a location is `400` `VALIDATION_ERROR`. A `BRANCH` or `OWN` role without a location is `400` `LOCATION_REQUIRED`. A new or changed assignment cannot use an `INACTIVE` location. Keeping the same inactive location, with the same role, is allowed. A member cannot deactivate themselves, change their own role, or change their own location, and cannot reset their own password on these routes. Those attempts are `409` `CONFLICT`. Deactivating a user (ACTIVE to INACTIVE) increments `authVersion`, so every existing session ends for good, including after reactivation. The next authenticated request is rejected with `401` `UNAUTHORIZED` and the cookie is cleared. A later login returns `INACTIVE`. After reactivation the user signs in again. No data is removed.

Session module routes. Company comes only from the signed session. A client `companyId` does not change scope. `ModuleAccessGuard` reads `CompanyModule.enabled` from PostgreSQL on the request. It does not trust the browser or a token claim. A module disabled after the session was issued is refused on the next request. `authVersion` does not change.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/modules` | `{ items }` of `{ key, enabled, ready }` for the six keys, in registry order. A missing row is `enabled: false`. `ready` comes from `MODULE_REGISTRY`. No price, expiry, or company metadata. A member uses `Membership`. A platform operator uses `actingCompanyId`. No acting company is `409` `CONFLICT`. |
| GET | `/api/modules/:key` | `{ key, ready }` when the module is enabled for the session company. The guard and the service both require that. Unknown key, after a company is known, is `404` `NOT_FOUND`. Disabled or missing is `403` `FORBIDDEN`. No acting company is `409` `CONFLICT`, including when the key is unknown. |

Platform module routes, platform-operator only. A member receives `403` `FORBIDDEN`. A missing cookie receives `401` `UNAUTHORIZED`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/platform/companies/:companyId/modules` | `{ items }` of `{ key, enabled, ready, companyId }`. Unknown company is `404` `NOT_FOUND`. A missing row is disabled. |
| PUT | `/api/platform/companies/:companyId/modules` | Body `{ modules: [{ key, enabled }] }`. Unknown company is `404` `NOT_FOUND`. Unknown or duplicate key is `400` `VALIDATION_ERROR`. The payload is one transaction. Keys not supplied stay unchanged. Repeating the same values changes nothing. A missing row for a supplied key is created. An audit `UPDATE` with target type `module` and target id equal to the key is written only when `enabled` actually changes. |

Platform audit list, platform-operator only. Read-only. A member receives `403` `FORBIDDEN`. A missing cookie receives `401` `UNAUTHORIZED`. An operator in support sees the same global list.

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/platform/access-log` | `{ items, page, pageSize, total }`. Default page size 20, maximum 100. Optional `companyId`, `page`, and `pageSize`. Ordered by `createdAt` descending, then `id` descending. Each item is `id`, `createdAt`, `action`, `targetType`, `targetId`, `actorUserId`, `actorName`, `companyId`, `companyName`, and `companyCode`. No other user field is returned. Unknown `companyId` is `404` `NOT_FOUND`. There is no write route. |

A member receives `403` `FORBIDDEN` on the platform routes above. A missing cookie receives `401`. `priceUsd` is a decimal string for PostgreSQL `numeric(12,2)`. A past `expiresOn` does not change `ACTIVE` to `SUSPENDED`. Role presets are `tradivia` (four roles) and `simple` (`OWNER` and `STAFF`) in `role-presets.ts`. They are not global authorization. The development seed fills those preset roles for the local sample companies.

`GET /api/health` still returns `{ ok: true }`.

Global prefix is `api`. Validation failures use `VALIDATION_ERROR` and do not echo the submitted value. CORS allows only `WEB_ORIGIN` (local default `http://localhost:3000`) with credentials. Unsafe methods also require `Origin` or `Referer` to match that origin.

The API TypeScript module mode is `commonjs`. TRADIVIA's API uses `nodenext`. That was intentional so Jest could run. Revisit at finance merge, not before.

---

## 5. Current database status

Schema: `uni-gate/packages/database/prisma/schema.prisma`.

Models: `User`, `Company`, `Location`, `Role`, `RolePermission`, `Membership`, `CompanyModule`, `AuditEntry`.

`User.name` is the display name. It is not a login name. Platform login uses `User.username`. Customer login uses `Membership.username`.

Migrations, in order:

1. `20261004120000_foundation`
2. `20261004180000_membership_company_integrity`
3. `20261005093000_user_display_name`
4. `20261023090000_role_permissions` (phase F1)

No finance tables. After the Phase 2 cleanup, local `unigate` held only the development seed: companies `tradivia`, `ofoq`, `expired`, and `lastday`, plus their roles, locations, and users. Re-run `npm run db:seed:dev` on a later calendar day so `lastday` stays that day and `expired` stays the day before.

`authVersion` increments when the user changes their own password, when an administrator resets it, and when the user is deactivated. It does not increment when a role changes. A signed session must carry the current value. Older versions are rejected. Role and permission checks read the current `Role` row.

---

## 6. PostgreSQL version, database, host, and local setup

| Item | Value |
|---|---|
| Engine | PostgreSQL 16.11, native Windows binaries |
| How it was started | Not Docker. Binaries under the user profile, `pg_ctl`, port 5433. |
| Compose file | `uni-gate/docker-compose.yml` describes `postgres:16-alpine` on host port 5433. It has not been the proven runtime. |
| Host / port | `localhost` / `5433` |
| Database name | `unigate` |
| Connection string | `uni-gate/.env` and `uni-gate/packages/database/.env`, both gitignored. Shape is in `.env.example`. Do not copy secrets into chat or git. |

Do not point Prisma at port 5432. Do not drop or migrate any TRADIVIA database.

If the server is down:

```powershell
& "$env:LOCALAPPDATA\unigate-postgres\pgsql\bin\pg_ctl.exe" -D "$env:LOCALAPPDATA\unigate-postgres\data" -l "$env:LOCALAPPDATA\unigate-postgres\postgres.log" start
```

---

## 7. Authentication decisions that are now in code

- One `User` table. `kind` is `PLATFORM` or `MEMBER`. Platform operators have no membership. Customer users have exactly one.
- Usernames follow the Phase 1 case-insensitive uniqueness rules.
- Password hash is bcrypt at cost 12. Tests may set `BCRYPT_COST=4`. Production rejects a cost below 12. TRADIVIA uses bcrypt cost 10 on `Employee`; Unigate does not reuse that login model or those hashes.
- Password policy: at least 8 characters, one letter, and one number.
- Cookie `ug_access`: HttpOnly, `SameSite=Lax`, `Path=/`, 8 hours, `Secure` only when `NODE_ENV` is `production`.
- Token claims are `userId`, `actor`, `authVersion`, expiration, and optional `actingCompanyId`. They do not include `roleKey`, `visibility`, or `canManageUsers`. Enter and leave reissue the cookie with the same expiration. They do not grant a new 8-hour lifetime.
- Platform `/api/auth/me` returns `actingCompany` as `null` or `{ id, name, code, status }`. It does not include `priceUsd` or `expiresOn`. A missing company row drops the acting company and leaves the operator signed in. Suspending or expiring the customer company does not end the support session. An inactive operator or an `authVersion` mismatch does.
- `AUTH_SECRET` must come from the environment and be at least 32 characters. There is no hardcoded fallback. A missing or short secret stops startup, including in production.
- A member token that names another company is ignored. Customer company identity comes from `Membership`.
- Login codes: `WRONG_CREDENTIALS`, `LOCKED`, `INACTIVE`, `COMPANY_SUSPENDED`, `SUBSCRIPTION_EXPIRED`.
- An already issued session whose user is inactive, whose company is suspended, or whose subscription has expired is rejected on the next authenticated request with `401` and `{ "code": "UNAUTHORIZED", "message": "Authentication is required." }`. The cookie is cleared. The specific login codes are not reused for that later request.
- Five wrong passwords return `WRONG_CREDENTIALS`. The fifth sets `lockedUntil` 15 minutes ahead. The next attempt returns `LOCKED`. A later successful login, including after the lock time has passed, sets `failedLoginCount` back to 0 and clears `lockedUntil`.
- Each attempt is counted in one conditional update before the password is checked, so parallel attempts share the same five-attempt allowance. An attempt over the allowance returns `LOCKED`.
- Logout clears the cookie only. A copied token still works until it expires or `authVersion` changes.
- Customer `/api/auth/me` does not include `priceUsd`, `expiresOn`, or the password hash.
- `expiresOn` is the last valid calendar day in `Asia/Damascus`. The day itself is still valid.

---

## 8. Subscription, modules, and tenancy rules that still apply

`Company.status` `SUSPENDED` means a person suspended the company. It is not set when the date passes.

`SUBSCRIPTION_EXPIRED` is a login error code, not a `CompanyStatus` value. Members cannot sign in when suspended or expired. Platform operators can still administer and enter a suspended or expired company. Reactivation is `POST /api/platform/companies/:companyId/activate` and returns `DATE_PAST` when the new end date is already past. The expiry day itself is still valid.

`CompanyModule.enabled` is the only module flag in the database. `ready` lives in `MODULE_REGISTRY` and is `false` for all six keys. Do not store `ready` per company.

Customer requests must not trust a client-supplied company id. Location lists and user lists filter by the server session before rows leave the API.

Creating and editing branches is a platform route. Members see branches and cannot create them. Creating and editing roles is also a platform route. Members with `canManageUsers` can read roles and cannot create or edit them. Those members can manage customer users inside their visibility scope. A new company still has no customer login until a user is created.

---

## 9. Finance integration boundary

`Reference/erp-finance` is a separate NestJS + Prisma + Next app for one client. Its schema uses `Employee` as the login record. The folder was copied from finance repository commit `77ce653` (18 October 2026) and merged in pull request #3 (`0671e5d`).

`acf36ce` first tracked that folder as normal files under `Reference/tradivia-finance-v2`.

The separate finance repository is frozen since 22 October 2026. `Reference/erp-finance` is now the live finance source until it moves into `uni-gate` in phase F3. Finance preparation (plan section 4) is done there by the finance owner, inside this repository.

Do not start Unigate from that schema. Do not import its auth. Merge finance tables only in phase F2, following the approved plan. Versions were aligned (Nest 11, Prisma 6.19.3, TypeScript 5.9.3) so a later merge is less painful. Do not upgrade Prisma to 8 for the foundation.

---

## 10. Tests and build results from Phase 8 acceptance

Re-run on 20 October 2026 after company modules were merged:

| Command | Result |
|---|---|
| `prisma validate` | Schema valid |
| `prisma migrate status` | 3 migrations, schema up to date. No Phase 8 migration. |
| `tsc --noEmit` for shared, database, API, and web | Exit 0 |
| `npm run test -w @unigate/api` | 11 suites passed, 50 tests passed, 112.413 s |
| `nest build` | Exit 0 |
| `next build` | Exit 0 |

There is no ESLint config and no CI workflow under `uni-gate`. Jest authentication tests use the disposable database `unigate_auth_test` on port 5433. They do not use `unigate`.

---

## 11. Secrets and local files

Git ignores `.env`, `.env.local`, `node_modules/`, `.next/`, `dist/`, and logs.

`uni-gate/.env.example` lists variable names and local development placeholders. It is not a production secret file. The real `AUTH_SECRET` and database password used by this machine stay in the gitignored `.env` files.

Do not commit `.env`, PostgreSQL data directories, `unigate-postgres` logs, or Jest caches.

---

## Foundation hardening (21 October 2026 review)

Independent review and fixes, on branch `claude/exciting-pasteur-4q0bzq`. Product decisions from the user:

- A branch-scoped manager (for example SUPERVISOR) manages only staff on their branch whose role has no `canManageUsers`. They cannot see, edit, reset, or deactivate a peer manager, and cannot grant a role with `canManageUsers`. `ALL_BRANCHES` managers and platform operators keep full reach in their scope.
- Deactivating a user ends every existing session (see section 4).

Fixes:

- Role scope change and user assignment lock the role row (`FOR UPDATE` and `FOR SHARE`), so a race can no longer store an `ALL_BRANCHES` role with a branch.
- Module `PUT` locks the company row (`FOR NO KEY UPDATE`). Simultaneous PUTs no longer return 500 and write one audit row per real change.
- Login lockout is atomic (section 7).
- Member user actions are audited. A password reset and its audit row are one transaction.
- A malformed `ug_access` cookie is `401`, not `500`.
- `page` is capped at 10000 on the company, user, and audit lists. Larger is `400` `VALIDATION_ERROR`.
- A company `PATCH` that changes nothing writes no audit row.
- The customer user form offers a branch manager only the roles they may assign.
- Tests: database creation and migration run once per run in `apps/api/test/jest.global-setup.ts`, through Prisma instead of a Windows `psql.exe` path. ts-jest reads `@unigate/shared` from source, so tests do not need a prior build. They run on Windows, Linux, and macOS.

Results on 21 October 2026 (Linux, PostgreSQL 16 on port 5433): `tsc --noEmit` for API and web exit 0, `nest build` exit 0, `next build` exit 0, `npm run test:api` 12 suites and 58 tests passed in about 16 s (31 s before the setup change).

## Phase F1: role permissions (23 October 2026)

- Table `role_permissions` (`RolePermission`): one level per role and area. Levels are `NONE < READ < WRITE < APPROVE < ADMIN`; each includes the ones before it. A missing row is `NONE`, and `NONE` is never stored (CHECK). Administration areas `users`, `branches`, `roles` accept `READ` or `WRITE` only (CHECK). Module areas are the six module keys. The list lives in `packages/shared/src/permissions.ts` (`PERMISSION_AREAS`), mirrored in `apps/web/lib/permission-areas.ts`.
- `Role.canManageUsers` was removed. Migration `20261023090000_role_permissions` moved it to `users` = `WRITE` (and `roles` = `READ`), and gave every existing role `branches` = `READ`, so nobody lost access. API responses still return `canManageUsers`, derived from `users >= WRITE`.
- Every permission check goes through `apps/api/src/auth/access.ts`: `accessFor(auth, area)` returns the level, scope, location, membership id, and approval flags for the session company; `requireAccess(auth, area, minimum)` refuses with `403 FORBIDDEN`. Do not compare role keys in code.
- Permissions are read from PostgreSQL on every request (with the role), so a change applies on the next request. `authVersion` does not change.
- Platform operator in support: `WRITE` in administration areas, `READ` in every module (`platformSupportPermissions`). Outside support, `/api/auth/me` returns `permissions: null`.
- Routes: `GET /api/users` and `GET /api/users/:id` need `users >= READ`; create, edit, and password reset need `users >= WRITE`. `GET /api/locations` needs `branches >= READ` or `users >= WRITE` (a user manager picks branches in the user form). `GET /api/roles` needs `roles >= READ` or `users >= WRITE`. A branch-scoped manager still cannot reach or assign a role with `users >= WRITE`.
- Decision L is enforced for user assignment: a member cannot create or move a user into a role that is above the member's own level in any area (`403 FORBIDDEN`). Keeping a user's current role is allowed.
- The migration first checks existing memberships against the scope rule and stops, before changing anything, if any row breaks it.
- Role routes (`POST`/`PATCH /api/platform/companies/:companyId/roles`) no longer accept `canManageUsers`. They accept optional `permissions: [{ area, level }]`; supplied areas are replaced, others are kept, `NONE` deletes the row. Each area once, levels allowed per area, otherwise `400 VALIDATION_ERROR`. Responses include the full `permissions` map. Members still cannot edit roles or permissions (phase 11).
- `GET /api/auth/me` returns `permissions` (full map) and, for members, `editRequiresApproval` and `deleteRequiresApproval`.
- `Membership` has a unique `(companyId, id)` for later composite foreign keys (finance actors, decision A).
- Triggers `memberships_scope_check` and `roles_scope_check` refuse (SQLSTATE 23514, message `ROLE_SCOPE_MISMATCH`) an `ALL_BRANCHES` membership with a location, a `BRANCH`/`OWN` membership without one, and a role scope change that would break its members. The services map that error to `409 CONFLICT`. Follow-up 6 is resolved.
- Presets (`role-presets.ts`) carry permissions; company creation and the development seed write them. The seed resets preset roles and their permissions on every run.
- Web: the role screen has a permission matrix (administration and modules). Navigation, the dashboard, the branch list, and the user list follow the levels. A user with `users = READ` sees the list without add or edit.
- `@unigate/shared` and `@unigate/database` are consumed from their built `dist/` (gitignored). `npm run dev:api`, `build:api`, and `db:seed:dev` now run `build:shared` first, so a new export in shared is never missing at start. Before this, a pull that added shared exports failed with `TS2305` until shared was rebuilt by hand.
- `packages/database/prisma/constraint-checks.sql` was brought up to date (it predated `users.name`) and covers the new rules.
- Results (Linux, PostgreSQL 16, port 5433): `prisma validate` OK, `prisma migrate diff` from the migrated database to the schema: no difference, constraint script 24 PASS, `tsc --noEmit` API and web exit 0, `nest build` and `next build` exit 0, `npm run test:api` 13 suites and 69 tests passed.
- An independent review found no cross-company leak and no self-escalation. Its fixes are in: the assignment guard above, the branch list for user managers, a new role starting at `branches = READ` in the web form, and the migration pre-check.

Open follow-ups from the F1 review (for phase 11 or later):

1. `users = READ` can open a user through the API (`GET /api/users/:id`), but the web shows the list only. Add a read-only user view if wanted.
2. User lists treat `OWN` scope like `BRANCH` (pre-existing). A role with `users >= READ` and `OWN` scope sees its branch's staff. Decide whether `OWN` should see only itself.
3. A role created through the API without `permissions` gets no rows (not even `branches = READ`). The web always sends the full matrix.
4. `constraint-checks.sql` is not run by any script. Run it by hand with `psql` after a migration.

## Phase 11: managers manage their company (23 October 2026)

- New session-company routes. The company comes only from the session; a `companyId` in the body is rejected by validation.

| Method | Path | Needs |
|---|---|---|
| POST | `/api/locations` | `branches = WRITE` and `ALL_BRANCHES` scope. Same rules as the platform route (`NAME_TAKEN`, audit `CREATE`). |
| PATCH | `/api/locations/:locationId` | Same. Another company's branch is `404`. |
| POST | `/api/roles` | `roles = WRITE` and `ALL_BRANCHES` scope. Same body as the platform route. |
| PATCH | `/api/roles/:roleId` | Same. Another company's role is `404`. |

- `requireCompanyAdmin(auth, area)` in `auth/access.ts` checks the level and the scope. A platform operator in support passes it and is not limited by the guards below.
- Decision L guards for members, in `roles.service.ts` (`memberGuard`), run inside the transaction after the change and before commit: changing the role you hold is `409 CONFLICT`; touching a role above you in any area, or leaving any area above your own level, is `403 FORBIDDEN`. User assignment has the same ceiling (F1).
- Member writes on users and roles run `auth/member-guard.ts` inside the transaction:
  - `lockCompanyAdmins` locks the company row (`FOR NO KEY UPDATE`) first on every member user edit and role write, so two managers cannot demote each other at the same time.
  - `lockActorCeiling` re-reads the acting member's role and holds it (`FOR SHARE`), so a request that started before a demotion cannot use the old levels.
  - `assertWithin`: nothing a member creates, edits, assigns, resets, or deactivates may be above them. "Above" means a higher level in any area, or fewer approval flags than the member's own role.
  - `assertKeepsRoleEditors`: a member write that would take the company from some active role editors (roles `WRITE`, `ALL_BRANCHES`) to none is `409 LAST_ROLE_EDITOR`. A company that had none is not blocked.
  - Changing the role you hold is `409 OWN_ROLE`.
  - Platform operators are not limited by these guards, so Unigate can always repair a company.
- New error codes: `OWN_ROLE`, `LAST_ROLE_EDITOR`.
- `MemberContext` carries `roleId`, and `/api/auth/me` returns `roleId` for members.
- The independent review found a takeover path (a manager-made users-only role could reset or deactivate the general manager), two lockout paths (including a race), and approval flags not being capped. All four are fixed, with tests, and the reviewer's own probe now gets 403 or 409 in every case.
- Web: `/app/branches` and `/app/roles` create and edit through the new routes. The permission matrix offers a member only the levels they hold. Their own role and roles above them open read-only with a note.
- Tests: `roles/company-admin.spec.ts` (10 tests). `npm run test:api`: 14 suites, 79 tests passed. `tsc --noEmit`, `nest build`, and `next build` pass.

## Working method

From 22 October 2026: Claude plans and writes the phase specification. Claude Code builds it. Cursor is no longer used. A separate Claude Code reviewer, who did not build the phase, reviews the branch. The user tests manually before every merge. For each phase, give the user a plain Arabic explanation of what was done, plus manual test steps with the expected result.

For every phase: preflight first (`git status`, PostgreSQL on port 5433, existing tests pass), then implement, run all checks, then STOP and report. Never merge or start the next phase before the user manually accepts. Implement on a branch named `phase-...` (for example `phase-f1-role-permissions`), stage explicit paths only, and merge through a pull request.

Division of work: the finance owner (the user's colleague) owns finance code. The user and Claude own everything else. Changes where finance meets the foundation are reviewed by both.

## Known follow-ups for Phase 10

Resolved by the foundation hardening: the old items for peer takeover, role escalation, the reset transaction, the module PUT race, test time, the unbounded `page`, and unaudited member actions.

The test time varied (95 s to 354 s) because `jest.setup.ts` was a `setupFiles` entry, which Jest runs once per test file. Each of the 12 suites spawned `psql` and `npx prisma migrate deploy` again, which is slow and uneven on Windows (process start, Defender scans of the Prisma engine, a cold ts-jest cache). That work now runs once in `globalSetup`.

Still open:

1. `ModulesModule` does not export `ModulesService` or `ModuleAccessGuard`. Add exports when the first real module (finance) needs the guard.
2. `GET /api/modules/:key` checks enabled twice (guard and service). Harmless.
3. The editor reports three TypeScript deprecation diagnostics in `uni-gate/apps/api/tsconfig.json` (`moduleResolution` node10, `rootDir`, `baseUrl`). They come from the editor's newer TypeScript; the project builds under 5.9.x. Do not upgrade TypeScript or add `ignoreDeprecations` during the foundation.
4. Audit entries record no old or new values. The actor name is read live from `User.name`, not stored on the audit row.
5. `POST /api/auth/password` does not count wrong current passwords toward the lockout.
6. Resolved in phase F1: role scope and membership location agree through database triggers, in addition to the application locks.
7. An `ALL_BRANCHES` manager can manage another `ALL_BRANCHES` manager. The user confirmed this is wanted (22 October 2026).

## 12. Exact next action for the next Agent

1. Read this file and `git status`. Do not discard the tree.
2. The next work is phase F1 in `docs/FINANCE_MERGE_PLAN.md` section 5, then foundation Phase 11. The decisions in section 3 of that plan are approved and binding.
3. Do not write code for a later phase, a write route to the audit list, or a customer-facing audit before the user asks. The user chooses the scope.
4. Keep customer company identity on the server session. Do not trust a company id from the browser.
5. Support context is already `actingCompanyId` in `ug_access`. Do not put it back in `localStorage`.
6. Branch data is already `Location` in PostgreSQL. Do not put branch lists back in `ug_mock_db`. Keep branch-name uniqueness case-sensitive unless the user changes that rule. Do not make an inactive location block login unless the user asks for that rule.
7. Roles are already PostgreSQL-backed. Do not put role lists back in `ug_mock_db`. Members create and edit roles and branches only from Phase 11, under decision L of the plan. Do not increment `authVersion` for a role edit. Approval flags drive the finance approval workflow only from phase F3, under decision B.
8. Customer users are already PostgreSQL-backed. Do not put them back in `ug_mock_db`. Do not let a member change their own role, branch, or status, or reset their own password, through the user administration routes.
9. Company modules are already PostgreSQL-backed. Do not put module flags back in `ug_mock_db`. Do not let a member toggle `enabled`. Do not store `ready` per company. Do not increment `authVersion` for a module change. A missing row stays disabled until a `PUT` supplies that key.
10. The platform audit list is already PostgreSQL-backed and read-only. Do not put it back in `ug_mock_db`. Do not add a write route. Do not show it to members.

Local database: PostgreSQL on `localhost:5433`, database `unigate`. Start commands are in section 6. From `uni-gate`: `npm run dev:web` and `npm run dev:api`. From the repository root, `package.json` forwards the same work: `npm run dev:web`, `npm run dev:api`, `npm run test:api`, and the matching build, typecheck, and database scripts.

---

## DO NOT DO

- Do not start a phase until the user explicitly says so.
- Do not add a write route to the audit list, and do not show the audit list to members.
- Do not let a member toggle a company module.
- Do not put module flags back in `ug_mock_db`.
- Do not let a member change their own role, branch, or status, or reset their own password, through the user administration routes.
- Do not create a customer user inside company bootstrap unless the user asks for that.
- Do not let a member create or edit a role or a branch before Phase 11.
- Do not increment `authVersion` when only role permissions change.
- Do not implement finance approval from `editRequiresApproval` or `deleteRequiresApproval` before phase F3. Nobody approves their own request.
- Do not treat an inactive location as a login block unless the user asks for that rule.
- Do not make branch names case-insensitive unless the user changes that rule.
- Do not treat `ug_support_company` as support authority.
- Do not write finance merge code outside the approved phases in `docs/FINANCE_MERGE_PLAN.md`.
- Do not give platform operators write access to module business data (finance and later modules). They read only.
- Do not copy the TRADIVIA Prisma schema or its `Employee` login model.
- Do not trust client-supplied company context.
- Do not compare role keys or names in permission checks. Use `accessFor` or `requireAccess` with an area.
- Do not replace approved architecture silently.
- Do not continue to another phase without reporting results first.
- Do not upgrade Prisma to 8.
- Do not store `ready` per company.
- Do not collapse `SUSPENDED` and `SUBSCRIPTION_EXPIRED` into one status.
- Do not return passwords or password hashes.
- Do not keep `readUserPassword` as a real endpoint.
- Do not apply a Prisma `DROP` of `users_username_by_kind_check` or the `lower()` unique indexes.
- Do not drop or migrate any database other than `unigate` and the disposable `unigate_*` databases on port 5433.
- Do not implement exchange, gold, aviation, engineering, or HR behavior.
- Do not introduce Bootstrap, Tailwind, GraphQL, microservices, or another ORM.
