# Backoffice — Task Checklist

Tracks delivery of the admin backoffice described in the planning session on 2026-07-20. Each item below is a separate, small PR — land them in order, each with `npm run test` passing on its own before merging. This file is the source of truth for "what's done / what's next" if picked up by a different agent or developer mid-sequence.

## Phase 1 (MVP)

- [ ] **1. Foundation** — new `AVAILABLE_FEATURES` entries (`read:user:any`, `update:user:status:any`, `read:studio:any`, `read:store:any`, `read:game:any`, `update:game:status:any`, `read:dashboard:any`, `read:audit_log:any`) + `ADMIN_FEATURES` bundle constant + corresponding `filterOutput` cases in `models/authorization.ts`; `createAdminUser` helper in `tests/orchestrator.js`.
- [ ] **2. Admin bootstrap script** — `scripts/create-admin.js` + `npm run admin:grant -- --email=<email>` (idempotent: find-or-create, activate if needed, grant `ADMIN_FEATURES`). *Depends on 1.*
- [ ] **3. Audit log** — `AdminActionLog` Prisma model/migration (`id, admin_user_id, action, target_type, target_id, reason?, created_at`, no FK) + `models/audit_log.ts` (`record`, `findAllPaginated`).
- [ ] **4. User status field** — migration adding `status` enum (`ACTIVE`/`DISABLED`, default `ACTIVE`) to `User`; `user.setStatus`; `infra/controller.ts` rejects sessions for `DISABLED` users.
- [ ] **5. Games admin backend** — `game.findAllPaginatedAdmin({page, limit, status?, studio_id?, q})`, `game.setStatus(id, status)` (generalizes `makePublic`); `GET /api/v1/backoffice/games`, `PATCH /api/v1/backoffice/games/[slug]/status` (`reason` required for PRIVATE/INACTIVE), optional `PATCH .../bulk-status`; audit log writes; integration tests. *Depends on 1, 3.*
- [ ] **6. Users admin backend** — `user.findAllPaginated({page, limit, q})`; `GET /api/v1/backoffice/users`, `GET .../users/[id]`, `PATCH .../users/[id]/status`; self-protection guard (can't deactivate/de-admin self); audit log writes; tests. *Depends on 1, 3, 4.*
- [ ] **7. Studios + Stores admin backend** — `studio.findAllPaginated` / `store.findAllPaginated`; `GET /api/v1/backoffice/studios`, `GET .../studios/[slug]` (incl. studio's games), `GET /api/v1/backoffice/stores`, `GET .../stores/[slug]`; tests. *Depends on 1.*
- [ ] **8. Dashboard backend** — aggregation function (`models/dashboard.ts` or extend `models/status.ts`): pending-games count + oldest N pending, signups this week vs last week, totals (users/studios/stores/games by status); `GET /api/v1/backoffice/dashboard`; tests. *Depends on 1.*
- [ ] **9. Backoffice UI shell** — `BackofficeLayout`, nav, client-side auth-gate redirect. Tailwind + SWR + `lucide-react`, matching `components/store/UserMenu.tsx` conventions. *Depends on 1.*
- [ ] **10. Games review queue UI** — `pages/backoffice/games/index.tsx`: status filter, search, multi-select approve, reject-with-reason modal. *Depends on 5, 9.*
- [ ] **11. Users UI** — `pages/backoffice/users/index.tsx` + `[id].tsx`: search/list, detail, deactivate/reactivate with confirm dialog. *Depends on 6, 9.*
- [ ] **12. Studios + Stores UI** — `pages/backoffice/studios/index.tsx` + `[slug].tsx`, `pages/backoffice/stores/index.tsx` + `[slug].tsx`: search/list, read-only detail. *Depends on 7, 9.*
- [ ] **13. Dashboard UI** — `pages/backoffice/index.tsx`: pending-approvals and signups at top, then totals. *Depends on 8, 9.*

## Phase 2+ (explicitly deferred — do not build yet)

- Create/edit/delete for Users/Studios/Stores beyond the status toggle.
- Any hard delete (only if a genuinely orphan-free case is identified, gated by a server-side reference check).
- Bulk actions beyond multi-select approve; CSV export.
- Abuse/report inbox (needs a net-new "Report" domain model).
- Studio/user notification emails on rejection/deactivation.
- Session listing/force-revoke.
- Multiple admin permission tiers (ship one flat `ADMIN_FEATURES` bundle for now).
- Audit log viewer UI (log is captured from day one regardless).

## Ground rules for every PR in this sequence

- No hard delete anywhere in Phase 1 — soft-disable (`status` field) only.
- Every admin mutation writes an `AdminActionLog` row.
- Every destructive/mutating UI action has a confirm dialog naming the exact resource.
- Server-side `controller.canRequest("<feature>:any")` enforcement on every backoffice route — never rely on client-side gating alone.
- Self-protection: an admin can never deactivate or de-admin their own account.
- Full plan/context: `docs/backoffice-tasks.md` (this file) is the working checklist; see git history / PR descriptions for the "why" behind each decision (no hard delete, audit log, dashboard ordering, etc.) if more background is needed.
