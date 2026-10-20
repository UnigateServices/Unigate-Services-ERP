# Unigate handoff

Continuation document for a new Agent. It describes the repository after Phase 8 was accepted and merged on 20 October 2026. It does not replace reading the code.

`UNIGATE_CURRENT_STATE.md` was removed (git history keeps it); product requirements are in `docs/FOUNDATION_REQUIREMENTS.md` (initial snapshot); UI notes are in `docs/UI_NOTES.md`; where they differ, this file and the code win.

## Company modules (agreed product rules)
- Keys: finance, exchange, gold, aviation, engineering, hr.
- Toggling `enabled` is a Unigate-only action. Members cannot toggle.
- A disabled module is hidden from the customer, and its direct URL is forbidden.
- An enabled module with no product UI shows a clear "not ready" page, not an error.
- Enabling a module does not make it ready (`ready` lives in MODULE_REGISTRY).
- Turning a module off never deletes data. The UI asks for confirmation first.

---

## 1. Current completed phase and exact status

**Completed and accepted:** product decisions, foundation UI, frontend prototype, Phase 1 database foundation, composite company-integrity foreign keys, Phase 2 authentication, Phase 3 platform company administration, Phase 4 platform support context, Phase 5 branch and location management, Phase 6 role and permission management, Phase 7 users and memberships, and Phase 8 company modules.

**Not started:** Phase 9, the audit list API. Do not start it until the user explicitly says so. Finance, exchange, gold, aviation, engineering, and HR business logic are still not built.

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
| Finance reference files | `acf36ce` — `Reference/tradivia-finance-v2` tracked as normal files |
| Previous handoff | `02e6022` — Phase 2 acceptance notes |

`main` is `640a02e`. A fresh clone includes authentication, platform company routes, server-signed support, PostgreSQL-backed branches, roles, customer users, and company modules. Do not reset or clean the tree.

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
- Prisma schema and three migrations. No Phase 7 or Phase 8 migration.
- Development-only seed: `npm run db:seed:dev` from `uni-gate`. It refuses `NODE_ENV=production`.

**Planned, not implemented**

- Audit-list HTTP API. Entering support writes an `ENTER` row, and module flag changes write `UPDATE` rows, but the audit screen is still mock.
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
- Platform company, branch, role, user, and module screens do not read those records from `ug_mock_db`.
- Server-backed user screens: `/platform/companies/:id/users`, `/platform/companies/:id/users/new`, `/platform/companies/:id/users/:userId`, `/app/users`, `/app/users/new`, and `/app/users/:userId`. Company detail links to Users. The customer dashboard user count, shown only when `canManageUsers` is true, is the `total` from the authorized user list.
- Server-backed module screens: `/platform/companies/:id/modules`, `/app/modules`, and `/app/modules/:key`. Company detail links to Modules and lists enabled modules from the company detail response. The customer navigation and dashboard show only enabled modules. An enabled module opens the not-ready page. A direct URL for a disabled module shows that it is not available. An unknown key shows an unknown section. Turning a module off asks for confirmation and does not delete data.
- The audit screen still uses the mock store. The dashboard's recent-activity table still uses the mock log. Recent activity is text only and does not open a company.
- The directory mock remains for audit. Branch, role, user, and module screens have one source of truth: PostgreSQL.
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
| GET | `/api/users` | Same list contract. A member must currently have `canManageUsers`, or the response is `403` `FORBIDDEN`. `ALL_BRANCHES` sees every customer user in the company. `BRANCH` and `OWN` see only users on their membership location. A platform operator uses `actingCompanyId` and sees every customer user there. No acting company is `409` `CONFLICT`. |
| POST | `/api/users` | Same create rules, scoped to that session company. A branch-scoped manager cannot assign an `ALL_BRANCHES` role or another branch: `403` `FORBIDDEN`. |
| GET | `/api/users/:userId` | Same scope as the list. An out-of-scope id is `404` `NOT_FOUND`. |
| PATCH | `/api/users/:userId` | Same fields as the platform patch. Out of scope is `404` `NOT_FOUND`. |
| POST | `/api/users/:userId/password` | Same reset as the platform route, for an in-scope user. Returns 204. A member manager's reset is not audited. |

A role or location that is not in the session company is `404` `NOT_FOUND`. An `ALL_BRANCHES` role with a location is `400` `VALIDATION_ERROR`. A `BRANCH` or `OWN` role without a location is `400` `LOCATION_REQUIRED`. A new or changed assignment cannot use an `INACTIVE` location. Keeping the same inactive location, with the same role, is allowed. A member cannot deactivate themselves, change their own role, or change their own location, and cannot reset their own password on these routes. Those attempts are `409` `CONFLICT`. Deactivating a user does not change `authVersion`. The next authenticated request is rejected with `401` `UNAUTHORIZED` and the cookie is cleared. A later login returns `INACTIVE`.

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

A member receives `403` `FORBIDDEN` on the platform routes above. A missing cookie receives `401`. `priceUsd` is a decimal string for PostgreSQL `numeric(12,2)`. A past `expiresOn` does not change `ACTIVE` to `SUSPENDED`. Role presets are `tradivia` (four roles) and `simple` (`OWNER` and `STAFF`) in `role-presets.ts`. They are not global authorization. The development seed fills those preset roles for the local sample companies.

`GET /api/health` still returns `{ ok: true }`.

Global prefix is `api`. Validation failures use `VALIDATION_ERROR` and do not echo the submitted value. CORS allows only `WEB_ORIGIN` (local default `http://localhost:3000`) with credentials. Unsafe methods also require `Origin` or `Referer` to match that origin.

The API TypeScript module mode is `commonjs`. TRADIVIA's API uses `nodenext`. That was intentional so Jest could run. Revisit at finance merge, not before.

---

## 5. Current database status

Schema: `uni-gate/packages/database/prisma/schema.prisma`.

Models: `User`, `Company`, `Location`, `Role`, `Membership`, `CompanyModule`, `AuditEntry`.

`User.name` is the display name. It is not a login name. Platform login uses `User.username`. Customer login uses `Membership.username`.

Migrations, in order:

1. `20261004120000_foundation`
2. `20261004180000_membership_company_integrity`
3. `20261005093000_user_display_name`

No finance tables. After the Phase 2 cleanup, local `unigate` held only the development seed: companies `tradivia`, `ofoq`, `expired`, and `lastday`, plus their roles, locations, and users. Re-run `npm run db:seed:dev` on a later calendar day so `lastday` stays that day and `expired` stays the day before.

`authVersion` increments when the user changes their own password or `PasswordService.resetPassword` runs. It does not increment when a role changes. A signed session must carry the current value. Older versions are rejected. Role and permission checks read the current `Role` row.

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

`Reference/tradivia-finance-v2` is a separate NestJS + Prisma + Next app for one client. Its schema uses `Employee` as the login record.

`acf36ce` tracks that folder as normal files. It remains reference only. Finance integration has not started.

Do not start Unigate from that schema. Do not import its auth. Do not merge its tables now. Versions were aligned (Nest 11, Prisma 6.19.3, TypeScript 5.9.3) so a later merge is less painful. Do not upgrade Prisma to 8 for the foundation.

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

## Working method

For every phase: preflight first (`git status`, PostgreSQL on port 5433, existing tests pass), then implement, run all checks, then STOP and report. Never commit or start the next phase before the user manually accepts. Implement on a branch named `phase-N-...`, stage explicit paths only, and merge through a pull request.

## Known follow-ups for Phase 10

1. A branch-scoped manager can edit or reset the password of any user on their branch, including peers with `canManageUsers` (lateral takeover). Policy decision for the user.
2. The same manager can assign roles that carry `canManageUsers` (escalation). Policy decision for the user.
3. Password reset and its audit row are separate statements, not one transaction.
4. `ModulesModule` does not export `ModulesService` or `ModuleAccessGuard`. Add exports when the first real module needs the guard.
5. Two simultaneous PUTs on a company with a missing `CompanyModule` row could return 500 on the unique constraint instead of a clean result.
6. `GET /api/modules/:key` checks enabled twice (guard and service).
7. The API test suite took 354 s on one run and 112 s on a later run; the time varies with machine load. Investigate only if it becomes a problem.
8. The editor reports three TypeScript deprecation diagnostics in `uni-gate/apps/api/tsconfig.json` (`moduleResolution` node10, `rootDir`, `baseUrl`). They come from the editor's newer TypeScript; the project builds under 5.9.x. Do not upgrade TypeScript or add `ignoreDeprecations` during the foundation.

## 12. Exact next action for the next Agent

1. Read this file and `git status`. Do not discard the tree. Do not stage the untracked root `package.json` unless the user asks.
2. Wait until the user explicitly starts **Phase 9, the audit list API**, and names its scope.
3. Do not start finance before that. The user chooses the scope.
4. Keep customer company identity on the server session. Do not trust a company id from the browser.
5. Support context is already `actingCompanyId` in `ug_access`. Do not put it back in `localStorage`.
6. Branch data is already `Location` in PostgreSQL. Do not put branch lists back in `ug_mock_db`. Keep branch-name uniqueness case-sensitive unless the user changes that rule. Do not make an inactive location block login unless the user asks for that rule.
7. Roles are already PostgreSQL-backed. Do not put role lists back in `ug_mock_db`. Do not let members create or edit roles. Do not increment `authVersion` for a role edit. Do not treat approval flags as a finance workflow.
8. Customer users are already PostgreSQL-backed. Do not put them back in `ug_mock_db`. Do not let a member change their own role, branch, or status, or reset their own password, through the user administration routes.
9. Company modules are already PostgreSQL-backed. Do not put module flags back in `ug_mock_db`. Do not let a member toggle `enabled`. Do not store `ready` per company. Do not increment `authVersion` for a module change. A missing row stays disabled until a `PUT` supplies that key.

Local database: PostgreSQL on `localhost:5433`, database `unigate`. Start commands are in section 6. Web: `npm run dev:web`. API: `npm run dev:api`. Both are run from `uni-gate`.

---

## DO NOT DO

- Do not start Phase 9, the audit list, until the user explicitly says so.
- Do not let a member toggle a company module.
- Do not put module flags back in `ug_mock_db`.
- Do not let a member change their own role, branch, or status, or reset their own password, through the user administration routes.
- Do not create a customer user inside company bootstrap unless the user asks for that.
- Do not let a member create or edit a role.
- Do not increment `authVersion` when only role permissions change.
- Do not implement finance approval from `editRequiresApproval` or `deleteRequiresApproval`.
- Do not treat an inactive location as a login block unless the user asks for that rule.
- Do not make branch names case-insensitive unless the user changes that rule.
- Do not treat `ug_support_company` as support authority.
- Do not start Finance integration.
- Do not copy the TRADIVIA Prisma schema or its `Employee` login model.
- Do not trust client-supplied company context.
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
