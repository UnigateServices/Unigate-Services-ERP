# UI notes

Moved from section 6, "UI/UX and Design System", of `UNIGATE_CURRENT_STATE.md`, the old state snapshot. That file has been removed. Git history keeps it. The code is the final authority.

Removed because it depended on the old mock store and is no longer true:

- "Data loads synchronously, so tables have no skeleton." Server-backed screens load over HTTP. Tables still have no skeleton, and that remaining fact is kept below.

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

- Session gate: a status line “جاري التحقق من الجلسة”. Tables have no skeleton.
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
