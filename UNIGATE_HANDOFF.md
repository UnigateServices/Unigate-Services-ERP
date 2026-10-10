# Unigate handoff

Continuation document for a new Agent. It describes the repository after Phase 3 manual acceptance on 10 October 2026. It does not replace reading the code.

Related earlier snapshot: `UNIGATE_CURRENT_STATE.md` (written before the backend foundation existed). Where they differ, trust this file and the current tree.

---

## 1. Current completed phase and exact status

**Completed and accepted:** product decisions, foundation UI, frontend prototype, Phase 1 database foundation, composite company-integrity foreign keys, Phase 2 authentication, and Phase 3 platform company administration.

**Not started:** Phase 4. Do not start it until the user explicitly says so. Support enter/leave, standalone branch, user, role, module, and audit APIs, and finance are still not built.

**Git**

| Item | State |
|---|---|
| Branch | `main`, tracking `origin/main` |
| Authentication | `106c03a` — signed cookie authentication |
| Company integrity | `fa53978` — composite foreign keys |
| Phase 1 API and schema | `38ff4aa` |
| Frontend prototype | `3cd02d6` |
| Previous handoff | `02e6022` — Phase 2 acceptance notes |

Phase 3 company administration is committed with this handoff update. A fresh clone includes the API, three migrations, authentication, and the platform company routes. Do not reset or clean the tree.

---

## 2. Implemented in code versus only planned

**In code**

- Frontend foundation under `uni-gate/apps/web`.
- Platform company list, create, detail, edit, suspend, and activate use `uni-gate/apps/web/services/platform-companies.ts`. Dashboard active and suspended counts use the same list contract.
- Login, logout, session gate, `/api/auth/me`, and own password change use the API and the `ug_access` cookie.
- NestJS platform company routes under `uni-gate/apps/api/src/platform/`.
- Company creation is one transaction: company, first branch named like the company, the selected role preset, six `CompanyModule` rows, and a `CREATE` audit row.
- Prisma schema and three migrations. No Phase 3 migration.
- Development-only seed: `npm run db:seed:dev` from `uni-gate`. It refuses `NODE_ENV=production`.

**Planned, not implemented**

- Standalone branch, role, user, module-edit, and audit HTTP APIs.
- HTTP route for an administrator password reset. `PasswordService.resetPassword` exists and is tested. `POST /api/users/:id/password` is still 404.
- Server enter/leave for platform support context. The company detail page no longer offers that action. `ug_support_company` remains a client-only key and the API does not trust it.
- Finance, exchange, gold, aviation, engineering, and HR business logic.
- Production hosting.

---

## 3. Current frontend status

- Next.js App Router, React, TypeScript, plain CSS. No Bootstrap or Tailwind.
- Platform UI under `/platform`. Customer UI under `/app`. Logins at `/login/platform` and `/login`. There is no link between those two doors.
- HTTP client: `uni-gate/apps/web/lib/api.ts`. Cookie requests use `credentials: 'include'`.
- Authentication session is the `ug_access` cookie plus `GET /api/auth/me`. It is not stored in `localStorage`.
- Language and theme preferences remain in `localStorage`.
- Platform support navigation still writes `ug_support_company` in `localStorage` so the mock screens can open a company. That key is not a credential.
- Platform company screens do not read companies from `ug_mock_db`.
- The company detail page does not link to branches, users, roles, modules, or support entry. It says those areas connect later. Direct URLs for those screens still use the mock store and will not find a real company id.
- The audit screen and the dashboard's recent-activity table still use the mock log. Recent activity is text only and does not open a company.
- Directory mocks remain for branches, users, roles, module editing, and audit.
- `readUserPassword` remains in the mock directory and must never become an API. The account screen no longer uses it.
- An administrator resetting another user's password in the user form still writes the mock database.

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

A member receives `403` `FORBIDDEN` on these routes. A missing cookie receives `401`. `priceUsd` is a decimal string for PostgreSQL `numeric(12,2)`. A past `expiresOn` does not change `ACTIVE` to `SUSPENDED`. Role presets are `tradivia` (four roles) and `simple` (`OWNER` and `STAFF`) in `role-presets.ts`. They are not global authorization.

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
- Token claims are `userId`, `actor`, `authVersion`, expiration, and optional `actingCompanyId`. They do not include `roleKey`, `visibility`, or `canManageUsers`.
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

`SUBSCRIPTION_EXPIRED` is a login error code, not a `CompanyStatus` value. Members cannot sign in when suspended or expired. Platform operators can still administer a suspended company. Reactivation is `POST /api/platform/companies/:companyId/activate` and returns `DATE_PAST` when the new end date is already past. The expiry day itself is still valid.

`CompanyModule.enabled` is the only module flag in the database. `ready` lives in `MODULE_REGISTRY` and is `false` for all six keys. Do not store `ready` per company.

Customer requests must not trust a client-supplied company id. Branch filtering must happen before rows leave the server. That enforcement is still ahead, in the company and user APIs.

Creating and editing branches and roles remains a Unigate platform operation in the product rules. The server routes for those actions are not built.

---

## 9. Finance integration boundary

`Reference/tradivia-finance-v2` is a separate NestJS + Prisma + Next app for one client. Its schema uses `Employee` as the login record.

Do not start Unigate from that schema. Do not import its auth. Do not merge its tables now. Versions were aligned (Nest 11, Prisma 6.19.3, TypeScript 5.9.3) so a later merge is less painful. Do not upgrade Prisma to 8 for the foundation.

---

## 10. Tests and build results from Phase 3 acceptance

Re-run on 10 October 2026 after the company API and platform screens:

| Command | Result |
|---|---|
| `prisma validate` | Schema valid |
| `prisma migrate status` | 3 migrations, schema up to date |
| `tsc --noEmit` for shared, database, API, and web | Exit 0 |
| `npm run test -w @unigate/api` | 6 suites passed, 24 tests passed |
| `nest build` | Exit 0 |
| `next build` | Exit 0 |

There is no ESLint config and no CI workflow under `uni-gate`. Jest authentication tests use the disposable database `unigate_auth_test` on port 5433. They do not use `unigate`.

---

## 11. Secrets and local files

Git ignores `.env`, `.env.local`, `node_modules/`, `.next/`, `dist/`, and logs.

`uni-gate/.env.example` lists variable names and local development placeholders. It is not a production secret file. The real `AUTH_SECRET` and database password used by this machine stay in the gitignored `.env` files.

Do not commit `.env`, PostgreSQL data directories, `unigate-postgres` logs, or Jest caches.

---

## 12. Exact next action for the next Agent

1. Read this file and `git status`. Do not discard the tree.
2. Wait until the user explicitly starts **Phase 4** and names its scope.
3. Do not assume Phase 4 is support enter/leave, branches, users, roles, modules, or audit. Those are unbuilt, but the user chooses the next phase.
4. Keep customer company identity on the server session. Do not trust a company id from the browser.
5. When support enter is built, set `actingCompanyId` in the signed session and stop using `ug_support_company` as the source of truth.

Local database: PostgreSQL on `localhost:5433`, database `unigate`. Start commands are in section 6. Web: `npm run dev:web`. API: `npm run dev:api`. Both are run from `uni-gate`.

---

## DO NOT DO

- Do not start Phase 4 until the user explicitly says so.
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
