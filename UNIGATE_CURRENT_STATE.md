# Unigate ERP — current state handoff

Read-only snapshot of the git working tree on 4 October 2026. This file describes what is in the repository now. Older design notes are labeled **Planned / not implemented** when they are not in code.

The runnable product lives in `uni-gate/`. A separate reference checkout of the TRADIVIA finance application lives in `Reference/tradivia-finance-v2/`. That reference is not imported by `uni-gate`.

Fixture passwords exist in source. They are omitted from this document. Do not treat them as production credentials.

---

# 1. Current Project Status

## Completed

- Product and architecture decisions for the Unigate foundation (companies, branches, roles, modules, support access). Those decisions are **not** checked in as a spec file. They exist as conversation decisions and are only partly reflected in the frontend.
- Platform operator sign-in screen. That slice is committed: `e31ebea`.
- The rest of the foundation UI (platform admin, customer app, mock directory) is present in the working tree and is **not committed**.

## Phase being entered

Backend implementation of the foundation. It has not started inside `uni-gate`.

## Production code

None. There is no deployed API, no database, and no authentication service. The web app is a local Next.js prototype.

## Prototype / mock code

All of `uni-gate/apps/web`. Screens, session, permissions, and “services” run in the browser against `localStorage`.

## Still only planned

- NestJS API (`@unigate/api`)
- Prisma schema and PostgreSQL (`@unigate/database`)
- Shared package (`packages/shared`)
- HTTP session cookie
- Real authorization on a server
- Finance, exchange, gold, aviation, engineering, and HR behavior
- Offline sync queue
- Hosting on `unigateservices.com`
- Payment collection

## Not implemented

- Any file under `uni-gate/apps/api`
- Any file under `uni-gate/packages`
- Prisma, migrations, Nest modules, tests, ESLint, CI
- A frontend HTTP client

---

# 2. Current Tech Stack

Versions below are from `uni-gate/package.json` (ranges) and `uni-gate/package-lock.json` (installed).

| Item | What the repo says |
|---|---|
| Node.js engines | `uni-gate/package.json` → `"node": ">=20"`. Next’s own engine field in the lockfile is `^18.18.0 \|\| ^19.8.0 \|\| >= 20.0.0`. No `.nvmrc` or `.node-version`. |
| Package manager | npm workspaces. Lockfile `lockfileVersion` is npm’s v3 lock (npm 11 generated it). No pnpm or yarn files. |
| TypeScript | Declared `^5.9.2`. Installed `5.9.3` (`node_modules/typescript` in the lockfile). `strict: true` in `uni-gate/apps/web/tsconfig.json`. Target `ES2017`. |
| Next.js | Declared `^15.5.4`. Installed `15.5.27`. App Router. `reactStrictMode: true` in `uni-gate/apps/web/next.config.ts`. Dev/start port `3000`. |
| React | Declared `^19.1.1` for `react` and `react-dom`. Installed `19.3.0` for both. |
| `@types/node` | Declared `^24.5.2`. Installed `24.19.1`. |
| `@types/react` | Declared `^19.1.13`. Installed `19.3.0`. |
| `@types/react-dom` | Declared `^19.1.9`. Installed `19.3.0`. |
| Frontend libraries | Only `next`, `react`, `react-dom`. No data-fetching library, no component library, no i18n library, no form library, no state library. |
| CSS / UI framework | Plain global CSS. No Bootstrap, Tailwind, CSS Modules, or styled-components in `package.json`. Brand tokens are in `uni-gate/apps/web/app/brand-tokens.css`. Screen CSS is in `uni-gate/apps/web/app/globals.css`. |
| NestJS | **Not present** under `uni-gate`. |
| Prisma | **Not present** under `uni-gate`. A Prisma schema exists only in the reference app: `Reference/tradivia-finance-v2/packages/database/prisma/schema.prisma`. |
| PostgreSQL | **Not present** under `uni-gate`. No `docker-compose.yml` in `uni-gate`. The reference app has its own Compose file. |
| Monorepo | `uni-gate/package.json` workspaces: `"apps/*"`. The only workspace package is `@unigate/web`. |
| Lint | No ESLint config and no lint script. |
| Test | No test script, no `*.test` / `*.spec` files under `uni-gate`. |
| Build | `npm run typecheck -w @unigate/web` → `tsc --noEmit`. `npm run build -w @unigate/web` → `next build`. Root scripts: `dev:web`, `build:web`, `typecheck:web`. |

---

# 3. Current Repository Structure

```text
Unigate Services ERP/                  git root
├── UNIGATE_CURRENT_STATE.md           this handoff
├── Reference/tradivia-finance-v2/     separate TRADIVIA finance app (reference only)
└── uni-gate/                          Unigate foundation prototype
    ├── package.json                   npm workspaces root
    ├── package-lock.json
    ├── .gitignore
    └── apps/web/                      @unigate/web
        ├── package.json
        ├── tsconfig.json
        ├── next.config.ts
        ├── next-env.d.ts
        ├── app/
        │   ├── layout.tsx             html lang/dir, brand CSS, preferences
        │   ├── page.tsx               session router
        │   ├── globals.css
        │   ├── brand-tokens.css
        │   ├── login/                 auth pages
        │   ├── (platform)/platform/   platform URLs under /platform
        │   └── app/                   customer URLs under /app
        ├── components/
        │   ├── auth, form, shell, login forms
        │   └── screens/               page-level screens
        ├── lib/                       session, i18n, permissions, dates, paging
        ├── services/                  mock data access (no HTTP)
        ├── mocks/                     seed + localStorage database
        └── types/auth.ts              domain and session types
```

`app/(platform)` is a route group. It does not appear in the URL. `app/app` is a real segment, so customer URLs start with `/app`.

There is no `uni-gate/apps/api` and no `uni-gate/packages`.

`Reference/tradivia-finance-v2` is a NestJS + Prisma + Next finance system for one client. It is not a dependency of `@unigate/web`.

---

# 4. Approved ERP Architecture

This section mixes the agreed product rules with what the code does. The agreement is **not** stored as a spec in git.

## Unigate Platform context

**Agreed:** operators manage every company: create, suspend, reactivate, subscription fields, modules, branches, users, roles, support entry, and a support audit log. They may view, create, update, and delete customer operational data when finance exists.

**Implemented:** platform screens and mock mutations for companies, branches, users, roles, and modules. There is no customer operational data to edit. Delete-as-audit is typed but never written.

## Customer company context

**Agreed:** a member belongs to one company and sees only that company’s UI.

**Implemented:** member session has one `companyId`. Lists filter by that id in the mock store. There is no server enforcing it.

## Multi-company architecture

**Agreed:** one app, one database, `company_id` on tenant rows. Not a database per customer. Not microservices.

**Implemented:** one browser database. Companies are rows. **Planned / not implemented:** PostgreSQL and `company_id` foreign keys.

## Company isolation

**Agreed:** a customer never sees another customer. Unigate can open any company. Price and subscription end date are visible to Unigate only.

**Implemented:** customer screens do not render `priceUsd` or `expiresOn`. Platform list and detail do. Isolation is only by which id the client code passes.

## Branch / location model

**Agreed:** a branch is its own record under one paying company. The company and the shop are the same subscriber. Extra branches share that subscription. Creating branches is a Unigate action. A branch supervisor manages users of that branch and does not create branches.

**Implemented:** `Location` in `uni-gate/apps/web/types/auth.ts`. `canCreateBranch` is true only for `actor === 'platform'` (`uni-gate/apps/web/lib/permissions.ts`). The UI label is “branch”; the type name is `Location`.

## Users

**Agreed:** a customer login is company code + username + password. A person at two companies would be two users. Platform operators are not company members.

**Implemented:** `DirectoryUser` plus `Membership`. Platform operators are a separate fixture list, not memberships.

## Roles and permissions

**Agreed:** roles are per company. Fields: manage users, visibility `OWN` | `BRANCH` | `ALL_BRANCHES`, and whether that role’s edits/deletes need approval. Creating and editing roles is Unigate-only in this version. TRADIVIA preset has four roles. A simple preset has owner and staff. A role key outside the four finance keys does not open finance screens until the finance module is updated.

**Implemented:** those fields on `Role`. Role forms are editable only when `canEditRoles` (platform). After user save, `financeAccessFor` warns if the role key is not one of `FINANCE_ROLE_KEYS`. Approval flags are stored and shown. They do not gate any foundation action, because there are no financial operations.

## Company modules

**Agreed:** keys `finance`, `exchange`, `gold`, `aviation`, `engineering`, `hr`. Disabled modules are hidden from the customer. Enabled modules with no product UI show a not-ready page. Toggles are Unigate-only. Turning a module off does not delete data.

**Implemented:** checkboxes and a not-ready page. There is no `ready` field. Every enabled module is rendered as not ready. No module has business logic.

## Subscription metadata

**Agreed:** one USD amount stored for information, an end date, status active or suspended. Collection is outside the system. A past end date suspends access for members. Reactivation requires a new end date.

**Implemented:** `priceUsd`, `expiresOn`, `status` on `Company`. Customer login rejects `SUSPENDED` and a past `expiresOn`. Create/update sets `SUSPENDED` when the date is before “today” in `Asia/Damascus`. Activate refuses a past date (`DATE_PAST`).

## Unigate support / customer context

**Agreed:** entering a company is logged. The UI must say, in words, that the operator is inside that customer. The operator can see all branches and can change data without the employee approval queue. Leaving returns to the company record in the platform.

**Implemented:** `enterCompany` writes an `ENTER` audit row, then `writeSupportSession` sets `companyId` and `visibility: 'PLATFORM'`. `AppShell` shows a sticky banner. Leave calls `clearSupportCompany` and routes to `/platform/companies/:id`.

## Audit logging

**Agreed:** log Unigate enter/create/update/delete. Do not log every list read.

**Implemented:** `AuditEntry` rows for platform create/update/enter. `DELETE` is never written. Member changes pass `actor: null`, so they are not logged. Reads are not logged.

## Future finance integration

**Planned / not implemented** inside `uni-gate`.

The reference app at `Reference/tradivia-finance-v2` already has finance, warehouse, invoices, and ledger for one company, with `company_id` defaulting to the string `tradivia`, offices in `locations`, and login on `employees`. The foundation UI uses `DirectoryUser` + `Membership` instead. Merging those models is future work. The UI only reserves module navigation and the four finance role keys.

---

# 5. Frontend Implementation Status

All screens use mock data. None call HTTP. “Complete” means the approved foundation screen exists and can be clicked through. It does not mean production-ready.

Shared pieces: `PlatformShell` or `AppShell`, `PageHeader`, `FormField`, `PasswordField`, `PrimaryButton`, `InlineAlert`, `StatusBadge`, `EmptyState`, `Pagination`, `ConfirmDialog` from `uni-gate/apps/web/components/shell.tsx` and sibling component files.

## Shared / auth

| Route | File | Purpose | Complete | Mock | Permission assumption |
|---|---|---|---|---|---|
| `/` | `uni-gate/apps/web/app/page.tsx` | Sends the browser to login, `/platform`, or `/app` | Yes | Session only | No session → platform login. `companyId` set → `/app`. Platform without company → `/platform`. |
| `/login/platform` | `uni-gate/apps/web/app/login/platform/page.tsx` → `components/platform-login-form.tsx` | Platform sign-in | Yes | `services/platform-auth.ts` | Success only for an active platform fixture. No link to company login. |
| `/login` | `uni-gate/apps/web/app/login/page.tsx` → `components/customer-login-form.tsx` | Company sign-in | Yes | `services/customer-auth.ts` | Company code + username + password. No link to platform login. |

`AuthLayout` wraps both login screens (`components/auth-layout.tsx`).

## Unigate Platform

Gate: `useGate('platform')` in `uni-gate/apps/web/lib/use-gate.ts`. Requires `actor === 'platform'`. A member is sent to `/app`.

| Route | Main component | Purpose | Notes |
|---|---|---|---|
| `/platform` | `PlatformDashboard` in `components/screens/platform-lists.tsx` | Counts and recent audit | Counts come from mock companies. No expiring-soon metric. |
| `/platform/companies` | `CompaniesScreen` | Search, status filter, table | Price and end date visible. |
| `/platform/companies/new` | `CompanyFormScreen` | Create company | Preset, modules, first branch named like the company. |
| `/platform/companies/[id]` | `CompanyDetailsScreen` | Hub | Enter-support dialog, links to branches, users, roles, modules. |
| `/platform/companies/[id]/edit` | `CompanyFormScreen` | Edit subscription | Suspend / reactivate with confirmation. |
| `/platform/companies/[id]/modules` | `CompanyModulesScreen` | Enable modules | Confirm when turning any module off. |
| `/platform/companies/[id]/branches` | `BranchesScreen` `chrome="platform"` | Branch table | Create allowed. |
| `/platform/companies/[id]/branches/new` | `BranchFormScreen` | Create branch | Platform only. |
| `/platform/companies/[id]/branches/[branchId]` | `BranchFormScreen` | Edit branch | Deactivate, no delete. |
| `/platform/companies/[id]/users` | `UsersScreen` | User table | Platform sees all users of that company. |
| `/platform/companies/[id]/users/new` | `UserFormScreen` | Create user | |
| `/platform/companies/[id]/users/[userId]` | `UserFormScreen` | Edit user | Password reset and deactivate. |
| `/platform/companies/[id]/roles` | `RolesScreen` | Role table | New-role button shown. |
| `/platform/companies/[id]/roles/new` | `RoleFormScreen` | Create role | |
| `/platform/companies/[id]/roles/[roleId]` | `RoleFormScreen` | Edit role | |
| `/platform/audit` | `AuditScreen` | Support log | Optional company filter. |
| `/platform/account` | `AccountScreen` | Language, theme, own password | |

## Customer company

Gate: `useGate('app')` requires a session with `companyId`. Platform operators reach these routes after support entry. Members reach them after `/login`.

| Route | Main component | Purpose | Permission assumption |
|---|---|---|---|
| `/app` | `CustomerDashboard` | Company home | Shows role, scope, visible branch count, user count only if `canManageUsers`, enabled modules. No price. |
| `/app/branches` | `BranchesScreen` `chrome="app"` | Branches in scope | No create button for members. |
| `/app/branches/new` | `BranchFormScreen` | Create | Renders forbidden unless platform. |
| `/app/branches/[branchId]` | `BranchFormScreen` | Edit or read-only | Members see read-only. |
| `/app/users` | `UsersScreen` | Users | Hidden from nav unless `canManageUsers`. Direct URL shows forbidden text. Branch scope filters rows. |
| `/app/users/new` | `UserFormScreen` | Create user | Branch-scoped manager cannot assign `ALL_BRANCHES` and cannot pick another branch. |
| `/app/users/[userId]` | `UserFormScreen` | Edit | Role change asks for confirmation. |
| `/app/roles` | `RolesScreen` | List | Visible to user managers. Edit link is view for members. |
| `/app/roles/new` | `RoleFormScreen` | Create | Forbidden for members. |
| `/app/roles/[roleId]` | `RoleFormScreen` | Edit or read-only | Fields disabled for members. Copy says Unigate edits roles. |
| `/app/modules` | `ModulesOverviewScreen` | Enabled modules only | No toggles. |
| `/app/modules/[key]` | `ModulePlaceholderScreen` | Not-ready page | Unknown key: unknown section. Disabled key: forbidden. |
| `/app/account` | `AccountScreen` | Same account UI inside the company shell | |

While `actor === 'platform'` and `companyId` is set, `AppShell` shows the support banner (`components/shell.tsx`). Platform shell pages opened during that session also show a “support session is open” chip.

---

# 6. UI/UX and Design System

Implemented in `brand-tokens.css` and `globals.css`.

## Colors

Identity tokens: forest `#13362F`, sand `#DECFB0`, slate `#7D9BA1`. Light and dark canvases, danger, and warning are in the token file. Default `html` attribute is `data-theme="light"` (`app/layout.tsx`). The token file’s `:root` block is the dark palette; light applies only with `[data-theme="light"]`.

## Typography

`Segoe UI`, `Tahoma`, `Noto Naskh Arabic`, `sans-serif`. No webfont package.

## Layout

Login: centered card, max about 26.25rem, no sidebar. App: fixed sidebar (`--sidebar-width: 240px` from tokens) plus column. Sidebar brand text is “إدارة المنصة” or the company name. Top bar has a text pill (`منصة` or `شركة {name}`), not color alone.

## RTL / LTR

`documentElement.lang` and `.dir` follow `ug_lang`. Arabic → `rtl`, English → `ltr`. CSS uses logical properties (`padding-inline`, `inset-inline-start`) in several places. The mobile sidebar override still uses `translateX` plus a `[dir='rtl']` rule.

## Localization

Hand dictionaries in `uni-gate/apps/web/lib/messages.ts`. Type `Messages` forces Arabic and English to share keys. No i18n library. A third language means another object of that type. Module names go through `moduleLabel`.

## Responsive behavior

Under 800px the sidebar is off-canvas, opened by “القائمة”, closed by a backdrop. Language and theme segments in the top bar are `display: none` at that width. Tables sit in `.table-wrap` with horizontal scroll. They are not turned into cards. Login padding tightens under 640px.

## Tables

Companies, audit, branches, users, roles. Search on companies (name/code), branches (name), users (name). Company status filter. Audit company `<select>`. Page size 20 (`lib/page.ts`). No column-sort controls.

## Forms

`FormField` shows “(مطلوب)” or “(اختياري)”. Errors render under the field. Failed validation does not clear the inputs. Long forms are pages. Confirmations are `ConfirmDialog`.

## Dialogs

`ConfirmDialog` is a `div` with `role="dialog"` and `aria-modal="true"`, not the native `<dialog>` element. Used for enter-company, suspend, activate, disable-modules, deactivate branch, deactivate user, and role change.

## Loading, empty, error, denied

- Session gate: a status line “جاري التحقق من الجلسة”. Data loads synchronously, so tables have no skeleton.
- Empty and no-results use `EmptyState`.
- Several failures set `InlineAlert` or a field error. `messages.retry` exists and is not referenced by a screen.
- Permission failure is a paragraph (`messages.forbidden`), not a dedicated page.
- Status badges include a text label and a dot. Color is not the only signal.

## Deviations from the approved UI/UX

- After the first login commit, `/platform` was a holding page. The working tree replaces that with the real dashboard. `components/platform-session-hold.tsx` is deleted in the working tree.
- No sort control, even for the current page.
- No skeleton loading.
- Dialog is not a focus-trapped native dialog, and Escape is not handled in `ConfirmDialog`.
- Top-bar language/theme controls are hidden on narrow screens. Login pages still show them.
- Default theme is light, while the token file’s unset `:root` is dark.
- Anonymous `/` always offers the platform door, not a choice of doors.
- `DELETE` audit label exists; no screen produces that action.

---

# 7. Frontend Data Models and Types

All of the following are in `uni-gate/apps/web/types/auth.ts` unless noted.

| Type | Fields |
|---|---|
| `Lang` | `'ar' \| 'en'` |
| `Theme` | `'light' \| 'dark'` |
| `Actor` | `'platform' \| 'member'` |
| `VisibilityScope` | `'OWN' \| 'BRANCH' \| 'ALL_BRANCHES'` |
| `SessionVisibility` | scope or `'PLATFORM'` |
| `ModuleKey` | finance, exchange, gold, aviation, engineering, hr. Constant `MODULE_KEYS`. |
| `CompanyStatus` | `'ACTIVE' \| 'SUSPENDED'` |
| `RecordStatus` | `'ACTIVE' \| 'INACTIVE'` (locations and directory users) |
| `AuditAction` | `ENTER`, `CREATE`, `UPDATE`, `DELETE` |
| `RolePreset` | `'tradivia' \| 'simple'` |
| `FINANCE_ROLE_KEYS` | `GENERAL_MANAGER`, `MONITOR`, `SUPERVISOR`, `EMPLOYEE` |
| `AppSession` | `actor`, `userId`, `name`, `companyId`, `roleKey`, `roleName`, `locationId`, `visibility`, `canManageUsers`, `expiresAt` (epoch ms) |
| `PlatformOperatorFixture` | `id`, `name`, `password`, `status` |
| `LoginFailureCode` | `WRONG_CREDENTIALS`, `INACTIVE`, `LOCKED`, `COMPANY_SUSPENDED`, `SUBSCRIPTION_EXPIRED` |
| `Company` | `id`, `name`, `code`, `status`, `priceUsd`, `expiresOn` (`YYYY-MM-DD`) |
| `Location` | `id`, `companyId`, `name`, `status` |
| `Role` | `id`, `companyId`, `key`, `name`, `canManageUsers`, `visibilityScope`, `editRequiresApproval`, `deleteRequiresApproval` |
| `DirectoryUser` | `id`, `name`, `password`, `email`, `phone`, `status` |
| `Membership` | `id`, `userId`, `companyId`, `roleId`, `locationId` (null means all-branch role) |
| `CompanyModule` | `id`, `companyId`, `moduleKey`, `enabled`. No `ready`. |
| `AuditEntry` | `id`, `actorUserId`, `actorName`, `companyId`, `action`, `targetType`, `targetId`, `createdAt` ISO string |
| `MockDatabase` | `version: 1` plus the arrays above |
| `UserRow` | Flattened list row in `uni-gate/apps/web/services/directory.ts`: user, membership, role, and location display fields |
| `ActorRef` | `{ id, name }` in `services/directory.ts` |
| `ServiceFail` | `{ ok: false, code: string }` in `services/directory.ts` |
| `Messages` | UI copy map in `uni-gate/apps/web/lib/messages.ts` |

There is no separate Subscription type. Subscription is fields on `Company`.

---

# 8. Current Mock Data

## Where it lives

- Seed: `uni-gate/apps/web/mocks/seed.ts`
- Browser copy: `localStorage` key `ug_mock_db`, version `1`, via `uni-gate/apps/web/mocks/db.ts`
- Platform operators: `uni-gate/apps/web/mocks/platform-operators.ts` (not inside `ug_mock_db`)
- Password overrides for operators: `localStorage` key `ug_platform_password_overrides` (`services/platform-auth.ts`)
- Lock counters: `ug_platform_login_attempts`, `ug_customer_login_attempts`

If `version !== 1`, `loadDb` replaces storage with a fresh seed.

## Who uses it

Every screen. `services/directory.ts`, `services/customer-auth.ts`, and `services/platform-auth.ts`.

## Entities the UI expects

Companies (ids and codes from seed):

| id | code | status | expiresOn | Enabled modules |
|---|---|---|---|---|
| `co_tradivia` | `tradivia` | ACTIVE | 2027-04-01 | finance |
| `co_noor` | `noor` | ACTIVE | 2027-01-15 | gold |
| `co_ofoq` | `ofoq` | SUSPENDED | 2026-06-01 | none |
| `co_waha` | `waha` | ACTIVE | 2027-08-01 | exchange, hr |

Locations: `loc_t1` المكتب 1, `loc_t2` المكتب 2, `loc_t3` المكتب 3 (`INACTIVE`), plus one active location named like النور, الأفق, and الواحة.

TRADIVIA roles: `GENERAL_MANAGER`, `MONITOR`, `SUPERVISOR` (branch, can manage users), `EMPLOYEE` (`OWN`, approvals on). Other companies use `OWNER` (`ALL_BRANCHES`, can manage users) and, for النور, `STAFF` (`BRANCH`).

Membership location is null for all-branch roles. Supervisor and employee and النور staff point at a location id.

Seed audit has two rows (`ENTER` on TRADIVIA, `UPDATE` on الأفق).

Platform fixtures: an active operator and an inactive operator, plus a username constant `network` that throws to simulate a failed request. Passwords are in those files and are not copied here.

## Behavior the backend must reproduce

- Company code is the public login key, stored lowercase, unique.
- Username is unique per company, not globally. The same name may exist in another company (seed uses `owner` in more than one company).
- One membership per directory user in this UI (`writeMemberSession` is one company).
- Past `expiresOn` blocks member login and marks the company suspended on create/update.
- `SUSPENDED` blocks member login even if Unigate can still open the company.
- Five failed sign-ins lock that username (and, for customers, that company code + username) for 15 minutes.
- Inactive user or inactive platform operator cannot sign in. Wrong password stays a generic error.
- Enabling a module does not make it “ready”.
- Turning a module off keeps other records.
- Branches and users are deactivated, not deleted.
- Role keys compared to the four finance keys only for a warning.
- Support entry is an audit event.
- Platform operators are not rows in the company user table.

---

# 9. Services / Data Access Layer

No function in `uni-gate/apps/web/services` uses `fetch`. “Expected endpoint” is the approved HTTP shape from the architecture discussion. It is **Planned / not implemented**. The code does not contain those paths.

## `uni-gate/apps/web/services/platform-auth.ts`

| Function | Input | Output | Mock | Planned HTTP |
|---|---|---|---|---|
| `loginPlatform` | username, password | `{ ok: true, operator: { id, name } }` or `{ ok: false, code }` | Yes. Throws if the username is the network fixture. | `POST /api/auth/platform/login` |
| `storedPlatformPassword` | operator id + fallback | string | Yes | None. Do not port this. |
| `setPlatformPassword` | operator id, new password | void, writes localStorage | Yes | `POST /api/auth/password` for the signed-in operator |

Lock book is inside this file, not a service export.

## `uni-gate/apps/web/services/customer-auth.ts`

| Function | Input | Output | Mock | Planned HTTP |
|---|---|---|---|---|
| `loginCustomer` | companyCode, username, password | `{ ok: true, session }` or `{ ok: false, code }` | Yes. Writes the member session itself. | `POST /api/auth/login` with `{ companyCode, username, password }` |

## `uni-gate/apps/web/services/directory.ts`

All reads and writes hit `loadDb` / `saveDb`. Actor `null` skips audit.

| Function | Input | Success output | Failure codes seen in code | Planned HTTP |
|---|---|---|---|---|
| `listCompanies` | `{ q?, status? }` | `Company[]` sorted by name | — | `GET /api/companies?page&q&status` |
| `countCompanies` | `ACTIVE` or `SUSPENDED` | number | — | Derive from list `total`, or the same GET |
| `getCompany` | id | `Company` or null | — | `GET /api/companies/:id` |
| `companyCounts` | companyId | `{ branches, users }` | — | Not a separate approved route. Counts were described on the company payload. |
| `createCompany` | name, code, priceUsd, expiresOn, preset, modules; actor | `{ ok: true, company }` | `CODE_TAKEN` | `POST /api/companies` |
| `updateCompany` | id + name, code, priceUsd, expiresOn; actor | `{ ok: true, company }` | `NOT_FOUND`, `CODE_TAKEN` | `PATCH /api/companies/:id` |
| `suspendCompany` | id, actor | `{ ok: true }` | `NOT_FOUND` | `POST /api/companies/:id/suspend` |
| `activateCompany` | id, expiresOn, actor | `{ ok: true }` | `NOT_FOUND`, `DATE_PAST` | `POST /api/companies/:id/activate` body `{ expiresOn }` |
| `listLocations` | companyId | locations sorted by name | — | `GET /api/locations` with company from session, not from the query string |
| `getLocation` | id | location or null | — | Not specified as its own approved route |
| `createLocation` | companyId, name, actor | `{ ok: true, location }` | `NAME_TAKEN` | `POST /api/locations` `{ name }` |
| `updateLocation` | id, `{ name, status }`, actor | `{ ok: true, location }` | `NOT_FOUND`, `NAME_TAKEN` | `PATCH /api/locations/:id` |
| `listRoles` / `getRole` | companyId / id | roles or one role | — | `GET /api/roles` |
| `createRole` / `updateRole` | role fields, actor | `{ ok: true, role }` | `KEY_TAKEN`, `NOT_FOUND` | `POST /api/roles`, `PATCH /api/roles/:id` |
| `listUsers` | companyId | `UserRow[]` | — | `GET /api/users?page&q` |
| `getUserRow` | companyId, userId | row or null | — | Not a separate approved route |
| `financeAccessFor` | role key | boolean | Client rule | Response field `financeAccess` on user create was approved |
| `createUser` | name, password, email, phone, roleId, locationId; actor or null | `{ ok: true, userId, financeAccess }` | `NOT_FOUND`, `NAME_TAKEN`, `LOCATION_REQUIRED` | `POST /api/users` |
| `updateUser` | same without password | `{ ok: true, financeAccess }` | same | `PATCH /api/users/:id` |
| `readUserPassword` | userId | string or null | Yes. Must not exist on a real API. | None |
| `resetUserPassword` | companyId, userId, password, actor | `{ ok: true }` | `NOT_FOUND` | `POST /api/users/:id/password` for an admin reset. Own password was `POST /api/auth/password` with current + new. |
| `listModules` | companyId | six rows, missing keys filled as disabled | — | `GET /api/modules` |
| `setModules` | companyId, enabled keys, actor | `{ ok: true }` | `NOT_FOUND` | `PUT /api/companies/:id/modules` |
| `listAudit` | optional companyId | newest first | — | `GET /api/platform/access-log?companyId&page` |
| `enterCompany` | session, companyId | `{ ok: true }` and an ENTER audit row | `NOT_FOUND` | `POST /api/companies/:id/enter` |
| `passwordIssue` | password | `'short'`, `'weak'`, or null | Rule: length ≥ 8 and a letter and a digit | Server should enforce the same |
| `codeIssue` | code | `'invalid'` or null | `/^[a-z0-9-]{2,32}$/` | Server should enforce the same |
| `roleKeyIssue` | key | `'invalid'` or null | `/^[A-Z][A-Z0-9_]{1,40}$/` | Not in the approved payload as a regex. Frontend-only until the API copies it. |

`leave` is not a directory function. `clearSupportCompany` in `lib/session.ts` only edits the session. **Planned:** `POST /api/companies/:id/leave`.

There is no health client. **Planned:** `GET /api/health`.

---

# 10. Authentication Assumptions

Everything in this section is mocked.

| Topic | What the UI does | Mocked |
|---|---|---|
| Platform login | `/login/platform`. Fields: username, password. No company code. | Yes |
| Customer login | `/login`. Fields: company code, username, password. Code is lowercased in the form. | Yes |
| Session | `localStorage` key `ug_session`. JSON `AppSession`. Lifetime 8 hours via `expiresAt`. | Yes. **Planned:** httpOnly cookie `ug_access`. |
| `/auth/me` | Not called. `readSession` is the substitute. | No endpoint |
| Platform context | `actor: 'platform'`, `companyId: null`, `visibility: 'PLATFORM'`, `canManageUsers: true` | Yes |
| Customer context | `actor: 'member'` plus role key, role name, location, visibility, `canManageUsers` copied from the role at login | Yes. Later role edits do not refresh an already stored session. |
| Enter customer | Dialog, then `enterCompany` + `writeSupportSession`, then `window.location.assign('/app')` | Yes |
| Leave | Banner button. Clears `companyId` and opens `/platform/companies/:id`. | Session only. No server call. |
| Logout | `clearSession()` then platform or customer login based on `actor` | Client only |
| Expired session | `expiresAt <= Date.now()` deletes the key and `readSession` returns null | Client clock |
| Suspended company | Customer login returns `COMPANY_SUSPENDED` | Yes |
| Expired subscription | Customer login returns `SUBSCRIPTION_EXPIRED` when `expiresOn` is before today in `Asia/Damascus` | Yes |
| Locked account | 5 failures, then `LOCKED` for 15 minutes. Platform key is the username. Customer key is `companyCode:username`. | localStorage, not a server |
| Inactive | Correct password and inactive status → `INACTIVE`. Wrong password stays `WRONG_CREDENTIALS`. | Yes |
| Own password | Account form. Members: current password must match `readUserPassword`, then `resetUserPassword`. Platform: current password must match the fixture or override, then `setPlatformPassword`. | Yes |
| Admin reset | User edit screen calls `resetUserPassword` without the user’s old password | Yes |

Platform login does not redirect a member who already has a session. Customer login redirects a member to `/app`. A platform session does not skip `/login`.

---

# 11. Authorization and Permissions

Source: `uni-gate/apps/web/lib/permissions.ts` and the screens. This is UX only. Hiding a link is not security.

| Rule | Code |
|---|---|
| Platform operator | `session.actor === 'platform'` |
| Create/edit branches | `canCreateBranch` → platform only |
| Edit roles | `canEditRoles` → platform only |
| See role list | `canSeeRoles` → platform or `canManageUsers` |
| Manage users | platform or `session.canManageUsers` |
| See all branches | platform, or visibility `ALL_BRANCHES` or `PLATFORM` |
| Other branch visibility | only the location id on the session |
| Assignable roles | platform / all-branch / `PLATFORM` see every role. Others cannot assign `ALL_BRANCHES`. |
| Location field locked | non-platform and visibility `BRANCH` |
| Module nav | customer nav lists only `enabled` modules. Platform module page lists all six. |
| Support | same platform checks. Banner does not add a second permission model. |
| Approval flags | stored and edited. Not enforced on foundation screens. |

`visibleMemberships` is exported and **not used**. `UsersScreen` filters `listUsers` itself. A backend should not assume those two filters stay identical without a test.

Hardcoded names and keys:

- Role presets and Arabic names inside `roleTemplates` in `services/directory.ts`
- `FINANCE_ROLE_KEYS`
- Module keys
- Seed ids and login names in `mocks/seed.ts` and `mocks/platform-operators.ts`
- Visibility strings `OWN`, `BRANCH`, `ALL_BRANCHES`, `PLATFORM`

There is no per-screen permission matrix beyond those booleans.

---

# 12. Routes

Authentication is client-side after hydration.

| URL | Actor | Page file | Requirement |
|---|---|---|---|
| `/` | any | `app/page.tsx` | Public redirect |
| `/login/platform` | public; platform if already signed in | `app/login/platform/page.tsx` | Public |
| `/login` | public; member if already signed in | `app/login/page.tsx` | Public |
| `/platform` | platform | `app/(platform)/platform/page.tsx` | Platform session |
| `/platform/companies` | platform | `.../companies/page.tsx` | Platform. Optional `?status=ACTIVE\|SUSPENDED` |
| `/platform/companies/new` | platform | `.../companies/new/page.tsx` | Platform |
| `/platform/companies/[id]` | platform | `.../[id]/page.tsx` | Platform |
| `/platform/companies/[id]/edit` | platform | `.../edit/page.tsx` | Platform |
| `/platform/companies/[id]/modules` | platform | `.../modules/page.tsx` | Platform |
| `/platform/companies/[id]/branches` | platform | `.../branches/page.tsx` | Platform |
| `/platform/companies/[id]/branches/new` | platform | `.../branches/new/page.tsx` | Platform |
| `/platform/companies/[id]/branches/[branchId]` | platform | `.../branches/[branchId]/page.tsx` | Platform |
| `/platform/companies/[id]/users` | platform | `.../users/page.tsx` | Platform |
| `/platform/companies/[id]/users/new` | platform | `.../users/new/page.tsx` | Platform |
| `/platform/companies/[id]/users/[userId]` | platform | `.../users/[userId]/page.tsx` | Platform |
| `/platform/companies/[id]/roles` | platform | `.../roles/page.tsx` | Platform |
| `/platform/companies/[id]/roles/new` | platform | `.../roles/new/page.tsx` | Platform |
| `/platform/companies/[id]/roles/[roleId]` | platform | `.../roles/[roleId]/page.tsx` | Platform |
| `/platform/audit` | platform | `.../audit/page.tsx` | Platform |
| `/platform/account` | platform (no company in the shell if `companyId` is null; if set, this page still renders `AppShell`) | `.../account/page.tsx` | Any session. Missing session → `/login/platform` |
| `/app` | member or platform-in-company | `app/app/page.tsx` | `companyId` required |
| `/app/branches` | same | `app/app/branches/page.tsx` | Scope filter |
| `/app/branches/new` | same | `.../new/page.tsx` | Create: platform only |
| `/app/branches/[branchId]` | same | `.../[branchId]/page.tsx` | Edit: platform. Others read-only if they can open it. |
| `/app/users` | same | `app/app/users/page.tsx` | `canManageUsers` or platform |
| `/app/users/new` | same | `.../new/page.tsx` | Same |
| `/app/users/[userId]` | same | `.../[userId]/page.tsx` | Same |
| `/app/roles` | same | `app/app/roles/page.tsx` | See roles |
| `/app/roles/new` | same | `.../new/page.tsx` | Platform only |
| `/app/roles/[roleId]` | same | `.../[roleId]/page.tsx` | Write: platform |
| `/app/modules` | same | `app/app/modules/page.tsx` | Any company session |
| `/app/modules/[key]` | same | `app/app/modules/[key]/page.tsx` | Module must be enabled |
| `/app/account` | same | `app/app/account/page.tsx` | Company session uses app shell |

`AccountScreen` picks the shell from `session.companyId`, so `/platform/account` during support still shows the company shell.

---

# 13. Expected Backend API

**Planned / not implemented.** Nothing in `uni-gate` listens on port 3001 or serves `/api`. The shapes below are the contract discussed for this foundation. The frontend does not request them yet. Section 14 lists where the current client differs.

Global prefix **planned:** `/api`.

Error body **planned:** `{ "code": string, "message": string }`.

List body **planned:** `{ items, page, pageSize, total }` with default page size 20 and maximum 100.

Session **planned:** cookie, not the JSON the mock stores. Fields the finance merge expected: `userId`, `companyId`, `role`, `locationId`, plus `actor` so platform users can be refused or allowed on finance routes later.

## Auth

| Method | Path | Body | Success | Errors the UI already branches on |
|---|---|---|---|---|
| POST | `/api/auth/platform/login` | `{ username, password }` | Operator identity, no company | `WRONG_CREDENTIALS`, `INACTIVE`, `LOCKED` |
| POST | `/api/auth/login` | `{ companyCode, username, password }` | Member session | those, plus `COMPANY_SUSPENDED`, `SUBSCRIPTION_EXPIRED` |
| POST | `/api/auth/logout` | empty | 204 | |
| GET | `/api/auth/me` | — | Current session | 401 |
| POST | `/api/auth/password` | `{ currentPassword, newPassword }` | 200 | wrong current password |

## Companies

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/companies` | query `page`, `q`, `status` | Platform only. Include price and `expiresOn`. |
| POST | `/api/companies` | `{ name, code, priceUsd, expiresOn, preset, modules }` | Creates the first branch and preset roles. Past `expiresOn` → suspended. |
| GET | `/api/companies/:id` | — | Include counts and modules if the detail screen should avoid extra calls. **The approved list did not require a separate counts route.** |
| PATCH | `/api/companies/:id` | `{ name, code, priceUsd, expiresOn }` | |
| POST | `/api/companies/:id/suspend` | empty | |
| POST | `/api/companies/:id/activate` | `{ expiresOn }` | |
| POST | `/api/companies/:id/enter` | empty | Audit `ENTER`. Session gains that company. |
| POST | `/api/companies/:id/leave` | empty | Session drops company. |

## Locations / branches

Company id comes from the session on customer routes. Platform hub routes today pass `companyId` in the page URL. The approved API said the server reads company from the session, not from a client-supplied company id.

| Method | Path | Body |
|---|---|---|
| GET | `/api/locations` | — |
| POST | `/api/locations` | `{ name }` |
| PATCH | `/api/locations/:id` | `{ name, status }` |

No delete.

## Roles

| Method | Path | Body |
|---|---|---|
| GET | `/api/roles` | — |
| POST | `/api/roles` | key, name, `canManageUsers`, `visibilityScope`, both approval flags |
| PATCH | `/api/roles/:id` | same |

Write: platform only.

## Users

| Method | Path | Body |
|---|---|---|
| GET | `/api/users` | query `page`, `q`. Scope must be applied on the server. |
| POST | `/api/users` | name, password, email, phone, roleId, locationId |
| PATCH | `/api/users/:id` | name, email, phone, status, roleId, locationId |
| POST | `/api/users/:id/password` | `{ password }` admin reset |

Approved create response may include `financeAccess: false` when the role key is not one of the four finance keys.

## Company modules

| Method | Path | Body |
|---|---|---|
| GET | `/api/modules` | enabled and disabled for the company |
| PUT | `/api/companies/:id/modules` | `{ modules: [{ key, enabled }] }` |
| GET | `/api/modules/:key` | `{ key, ready }` |

`ready` is false for all six until a later phase. Disabled key: 403. Unknown key: 404.

## Platform context

Enter/leave above. Platform list and audit are platform-only.

## Audit / access log

| Method | Path | Body |
|---|---|---|
| GET | `/api/platform/access-log` | query `companyId`, `page` |

Rows: time, actor, company, action, target type, target id. Actions: `ENTER`, `CREATE`, `UPDATE`, `DELETE`. The UI does not emit `DELETE` today.

## Health

| Method | Path |
|---|---|
| GET | `/api/health` |

The web app does not call it.

---

# 14. Differences From the Previously Approved API/Architecture

The approved HTTP API is **not in the repo**. Differences below are between that agreement and the current `uni-gate` code.

1. **No HTTP layer.** Services are synchronous and local. Replacing them later is the integration task. The UI was not written with `fetch`.
2. **Session store.** Approved: httpOnly cookie `ug_access`. Code: `localStorage` key `ug_session` with a richer `AppSession` (`visibility`, `canManageUsers`, `roleName`, `roleKey`, `expiresAt`). Approved merge fields were `userId`, `companyId`, `role`, `locationId`, and `actor`.
3. **No `/auth/me`.** The client trusts its own storage.
4. **Ids.** Approved direction was cuid so a future offline client could mint ids. Code uses `` `${prefix}_${Math.random()...}` `` in `mocks/db.ts`.
5. **`ready` is not data.** Approved `GET /api/modules/:key` returns `ready`. `CompanyModule` has only `enabled`. The placeholder always says not ready.
6. **`companyCounts` and `getLocation` / `getUserRow` / `readUserPassword`.** Extra client helpers. `readUserPassword` must not be copied to an API.
7. **`DATE_PAST`.** Returned by `activateCompany`. It was not in the approved error-code list. The UI maps it to the past-date notice.
8. **Role key regex** is enforced only in the form (`roleKeyIssue`).
9. **Audit `DELETE`** is in the type and the label map, and is never written. Deactivate is an `UPDATE`.
10. **Leave** does not write an audit row.
11. **Member edits are unaudited** because `actorOf` returns null for members. That matches “log Unigate actions”. Password reset of a member by a platform user does pass the platform actor.
12. **Branch create is platform-only.** An earlier draft allowed an all-branch user-manager to create branches. The later decision, and the code, do not.
13. **Login doors are not linked.** No anchor between `/login` and `/login/platform`.
14. **Price and end date** are omitted from customer screens. They are not omitted from the `Company` type, so any future customer payload must strip them.
15. **Pagination max 100** is not implemented. The client always slices 20.
16. **No server sort parameter and no sort UI.**
17. **Workspace is incomplete vs the approved tree.** Missing `apps/api`, `packages/database`, `packages/shared`. Package name `@unigate/web` matches the plan. `@unigate/api` and `@unigate/database` do not exist.
18. **Finance reference is a second application** with its own Prisma schema, `employees` as the login record, and `company_id` default `tradivia`. The foundation prototype does not use that schema.
19. **`visibleMemberships` is unused.** User lists use a separate filter in `UsersScreen`.
20. **Session is not refreshed** when an admin changes that user’s role. The member keeps the old `canManageUsers` and `visibility` until login again.
21. **Support entry uses `window.location.assign`**, not the Next router, so the app fully reloads.
22. **Platform password overrides** live in a second localStorage key. That is a prototype shortcut.
23. **Network failure** on platform login is a special username, not a real transport error. Customer login has a `catch`, but `loginCustomer` does not throw.
24. **Home route** sends strangers to the platform login only.
25. **Dialog and loading** are thinner than the accessibility notes in the UI spec (section 6).

---

# 15. Backend Current State

Inside `uni-gate`: **backend implementation has not started.**

- NestJS is not initialized.
- There is no `apps/api`.
- There are no controllers, guards, DTOs, or validation pipes.
- There is no authentication code on a server.
- There are no backend tests.

`Reference/tradivia-finance-v2/apps/api` is a different NestJS app for TRADIVIA finance. It is not the Unigate API and it is not started as this backend phase.

---

# 16. Database Current State

Inside `uni-gate`: **no database.**

- No Prisma schema.
- No models, enums, or relations.
- No migrations.
- No Docker Compose.
- No `DATABASE_URL` file in `uni-gate`. **Could not verify** a root `.env`; none is required by the web app. Do not add secrets to this document if one exists elsewhere.

What exists instead is the TypeScript `MockDatabase` in `uni-gate/apps/web/types/auth.ts`, persisted in the browser.

The reference Prisma file `Reference/tradivia-finance-v2/packages/database/prisma/schema.prisma` is **not** the Unigate foundation schema. Using it unchanged would collide with `DirectoryUser` versus `Employee` and with single-company assumptions. Treat it as input for a later finance merge, not as the starting migration for this phase.

---

# 17. Tests and Quality Checks

| Check | In the repo now |
|---|---|
| Frontend unit/e2e tests | None |
| Backend tests | None |
| ESLint | Not configured |
| CI | **Could not verify** a workflow under `uni-gate`. None found there. |
| `typecheck` script | Present: `tsc --noEmit` |
| `build` script | Present: `next build` |

During frontend implementation, `tsc --noEmit` and `next build` were run in the agent session and both exited 0. That result is **not** stored in the repository. There is no committed log. Re-run both before relying on them. The production build listed the routes in section 12.

A dev server on port 3000 was used to click platform login, the platform dashboard, TRADIVIA’s detail page, the support dialog, and `/app` with the support banner. That was a manual pass, not an automated test. Customer login, every form, and phone layout were not fully clicked in that pass.

---

# 18. Known Issues, TODOs, Technical Debt and Risks

## Multi-company isolation

The browser holds every company in one `localStorage` blob. Any user of the machine can read it, including other companies and password fields. The server must scope every query by the session company and must not return password hashes or other companies.

## Authorization

All checks are client-side. Direct URLs only hide or show text. `canManageUsers` is copied into the session at login and can go stale.

`visibleMemberships` and `UsersScreen` can drift.

Branch-scoped users are filtered in the component after `listUsers` already returned the whole company. A real API must not return out-of-scope rows.

## Hardcoded mock values

Seed ids, preset role names, finance role keys, the network username, and plaintext passwords in source. The passwords must not ship in a production bundle.

## Frontend/backend contract

Section 14. The highest-risk mismatches for the first API are: session shape, id format, `ready`, company id taken from the URL on platform pages versus from the session, and `readUserPassword`.

## Finance integration

`Reference/tradivia-finance-v2` logs in as `Employee` and uses offices (`locations`) plus a fixed company id. This UI logs in as `DirectoryUser` + `Membership`. Those are not the same tables. Module screens are placeholders only.

## Shortcuts

- `localStorage` session and database
- `window.location.assign` on support entry
- Dialog without a focus trap
- No skeletons, no tests, no lint
- Most of the UI is uncommitted (section 19)
- Anonymous visitors are sent only to the platform door
- Approval flags do nothing yet
- `DELETE` audit is unused
- Top-bar language switch is hidden on small screens

---

# 19. Git / Recent Implementation Summary

Remote branch `main` tracks `origin/main`.

| Commit | Subject | What it contains |
|---|---|---|
| `1c02047` | The begining of ERP | Earlier repository content, including the TRADIVIA reference tree. |
| `e31ebea` | Add the Unigate platform sign-in screen so operators can enter the ERP shell. | Initial `uni-gate` web app and platform login only. |

Working tree after that commit (not committed at the time of this document):

- Modified: platform home page, global CSS, root redirect, form field, alert, platform login form, messages, session, platform auth, `types/auth.ts`
- Deleted: `uni-gate/apps/web/components/platform-session-hold.tsx`
- Untracked: customer app routes, platform companies/audit/account routes, `components/screens/*`, `components/shell.tsx`, `customer-login-form.tsx`, `services/directory.ts`, `services/customer-auth.ts`, `mocks/db.ts`, `mocks/seed.ts`, permissions, dates, paging, `use-gate.ts`

So a clone of `origin/main` has **only the platform login**, not the rest of the screens described here. Review the working tree, or commit it, before handing the branch to the backend engineer.

---

# 20. Recommended Backend Starting Point

Do not start from the TRADIVIA Prisma schema.

Start a new `uni-gate/apps/api` and `uni-gate/packages/database` that match the **frontend types and the service functions in section 9**, with the mismatches in section 14 decided explicitly first (especially session cookie vs `AppSession`, and cuid vs the current id strings).

Implement in this order:

1. **Health, database, and company/user tables** matching `Company`, `Location`, `Role`, `DirectoryUser`, `Membership`, `CompanyModule`, `AuditEntry`. Reason: every screen reads these, and they do not depend on finance.
2. **Platform login, customer login, logout, and `/auth/me`.** Reason: both shells are blocked without a real session, and the mock must stop being the source of truth.
3. **Company CRUD, suspend/activate, modules, enter/leave.** Reason: that is the platform operator’s first path, and enter/leave defines support context.
4. **Locations, roles, users, and the access log, with server-side scope.** Reason: the UI already calls these as functions; the dangerous part is enforcing branch scope and “Unigate-only” writes on the server.
5. **Only then** discuss merging `Reference/tradivia-finance-v2`. The placeholder routes can stay dummy until that merge.

Reason to stop before finance: the current UI has no finance payloads, and the reference schema uses a different login entity.
