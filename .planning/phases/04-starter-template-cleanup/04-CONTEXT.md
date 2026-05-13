# Phase 4: Starter-Template Cleanup - Context

**Gathered:** 2026-05-13
**Status:** Ready for planning
**Mode:** `--auto` (Claude auto-selected the recommended option for every gray area; log appended at bottom)

<domain>
## Phase Boundary

Delete the Next.js Shadcn dashboard starter-template residue still in the tree so the repo contains only Heimdall code: four unused dashboard routes, the 805-line Infobar component and its dependent machinery, the unused products feature, the kanban starter (decision: remove, not wire), the `__CLEANUP__/` directory, and the unused `computeBridgeScore` import in the job-leads search route.

**In scope (DEBT-A1..A5 verbatim):**
- **DEBT-A1**: Delete `src/features/products/` and `src/app/dashboard/product/` routes.
- **DEBT-A2**: Delete `src/app/dashboard/{exclusive,workspaces,billing}/` routes and the 805-line `src/components/ui/infobar.tsx`.
- **DEBT-A3**: Decide on `/dashboard/kanban` — wire to `/api/tasks` or remove. **Decision: REMOVE** (rationale in D-04 below; record in PROJECT.md per ROADMAP SC #3).
- **DEBT-A4**: Remove the `__CLEANUP__/` directory at the repo root.
- **DEBT-A5**: Drop the unused `computeBridgeScore` import in `src/app/api/job-leads/[id]/search/route.ts:10`.

**In scope by transitive necessity (will break the build if left dangling):**
- **Infobar machinery teardown (consequence of DEBT-A2):** `src/config/infoconfig.ts`, `src/components/layout/info-sidebar.tsx`, `src/components/ui/info-button.tsx`, the `InfobarProvider` + `<InfoSidebar />` wrapper in `src/app/dashboard/layout.tsx`, and the `infoContent` prop on `PageContainer` (`src/components/layout/page-container.tsx`) and `Heading` (`src/components/ui/heading.tsx`) — see PD-02.
- **Products feature dead support (consequence of DEBT-A1):** `src/constants/mock-api.ts` (sole consumer is `src/features/products/`); `Product`, `SaleUser`, `recentSalesData` from `src/constants/data.ts`; the `/dashboard/product` entry in `src/hooks/use-breadcrumbs.tsx`.
- **Live billing href to a deleted route:** the `<a href='/dashboard/billing'>` link inside `src/app/dashboard/exclusive/page.tsx` is removed with its parent file (no other dashboard surface links to `/dashboard/billing`).
- **PROJECT.md update for SC #3:** Append `(Removed in Phase 4)` to the existing "Out of Scope" line about `/dashboard/kanban` so the decision is recorded.

**Out of scope (deferred to other phases, captured in `<deferred>` below):**
- Orphan starter components NOT named in DEBT-A1..A5 and NOT a transitive consequence of their deletion: `src/components/org-switcher.tsx`, `src/components/forms/demo-form.tsx`, `src/features/auth/components/user-auth-form.tsx`, `src/app/dashboard/profile/[[...profile]]/page.tsx`, the `Profile` and `Login` items in `src/config/nav-config.ts`, the `Star on GitHub` link text in auth views (already partly addressed by Phase 3's SEC-A2).
- The remaining auth-page visual chrome that Phase 3 explicitly left alone (Random Dude quote, placeholder `Logo` SVG, `interactive-grid` decoration, `Login` top-right link).
- The `any` typings in `src/components/kbar/index.tsx` and `src/features/metrics/components/weekly-snapshot-form.tsx` from CONCERNS.md — type-debt cleanup, not starter-residue.
- `playwright` package classification (`dependencies` → `devDependencies`) — that's JL2-02, deferred to v2.
- Any architecture-doc rewrites — `.planning/codebase/ARCHITECTURE.md` and similar references will need a sweep after Phase 4 lands, but that's a doc-update task, not part of the deletion phase.

</domain>

<decisions>
## Implementation Decisions

### Critical Pre-Discovery (anchor the whole phase here)

- **PD-01:** Every name in DEBT-A1..A5 still exists in the tree. Verified by `ls`/`grep`: `src/features/products/components/` (4 files), `src/app/dashboard/{product,exclusive,workspaces,billing,kanban}/` (5 starter routes), `src/components/ui/infobar.tsx` (805 lines confirmed), `__CLEANUP__/` (clerk/, kanban/, sentry/, scripts/, cleanup.md), and `computeBridgeScore` imported but unused in `src/app/api/job-leads/[id]/search/route.ts:10`. The phase is genuinely additive cleanup — no requirement is already satisfied.

- **PD-02:** `infobar.tsx` is not isolated — deleting just that file breaks the build. The Infobar machinery is wired into `src/app/dashboard/layout.tsx` via `InfobarProvider` + `<InfoSidebar side='right' />`, and the `InfobarContent` type is referenced by `PageContainer`/`Heading` (via the `infoContent` prop) and by `src/config/infoconfig.ts`. Every Heimdall-feature page that passes `infoContent={...}` to `PageContainer` (`pipeline`, `metrics`, `tasks`, `networking`, `contacts/*`, `notes/*`, `overview/layout`, `job-leads/[id]`, plus the four starter routes being deleted) must be updated — for the Heimdall pages the prop is silently dropped from the JSX; for the starter pages the entire file goes. This is the largest unmarked dependency in the phase and is the most likely source of churn.

- **PD-03:** The `kanban` removal has two surfaces: the `/dashboard/kanban` route (`src/app/dashboard/kanban/page.tsx`) AND the feature folder `src/features/kanban/` (board components, zustand `persist` store from CONCERNS.md anti-pattern, drag-and-drop wiring). Both must go to satisfy "the route is removed" cleanly — leaving `src/features/kanban/` behind would be an orphan feature folder. Also note `__CLEANUP__/kanban/` is a *template* directory the original cleanup script would have used; it's deleted alongside `__CLEANUP__/` itself under DEBT-A4 (not separately).

- **PD-04:** `src/features/products/` has a wider blast radius than DEBT-A1 names: `src/constants/mock-api.ts` is consumed *only* by the products feature, and `Product`/`SaleUser`/`recentSalesData` in `src/constants/data.ts` are consumed only by `src/features/products/components/*`. Once products are gone, these files/exports are dead. Same goes for the `'/dashboard/product'` entry in `src/hooks/use-breadcrumbs.tsx`. Folding these into the products-deletion plan keeps the post-phase tree clean.

- **PD-05:** Verification of SC #1 ("visiting `/dashboard/{product,exclusive,workspaces,billing}` returns 404") does not require an HTTP smoke. In Next.js App Router, deleting a route directory IS the 404 — the dynamic catch-all `not-found.tsx` (or the framework default) takes over. A filesystem-existence assertion in Vitest (assert these directories no longer exist under `src/app/dashboard/`) plus `npm run build` succeeding is a stronger, faster, deterministic check than running a dev server and `curl`-ing four URLs.

### Kanban Decision (DEBT-A3 — recorded for SC #3)

- **D-01:** **Remove `/dashboard/kanban` entirely** rather than wiring it to `/api/tasks`. Rationale:
  1. The kanban store uses `zustand persist` with `localStorage` — explicitly called out as an anti-pattern in `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns → Kanban store uses client-side localStorage persistence". Wiring it to `/api/tasks` would mean rebuilding the whole feature, not a cleanup task.
  2. Heimdall already has two production kanban-like surfaces: `/dashboard/pipeline` (PIPE-V1, the load-bearing system of record per PROJECT.md) and `/dashboard/tasks` (TASK-V1, DB-backed). A third kanban with localStorage state is redundant and confusing.
  3. The phase boundary is *cleanup*, not new feature work. Wiring kanban to the DB would expand scope and miss the cleanup-cycle deadline.
- **D-02:** Decision recording for SC #3 — append `(Removed in Phase 4)` to the existing line in `PROJECT.md` §"Out of Scope": `Database-backed Kanban for the /dashboard/kanban route — Starter-template residue; will be removed under DEBT-A3.` This satisfies SC #3 (`decision recorded in PROJECT.md`) without inventing a new doc.
- **D-03:** Delete *both* the route (`src/app/dashboard/kanban/page.tsx`) AND the feature folder (`src/features/kanban/`). Per PD-03, leaving the feature folder is an orphan and pollutes search/import autocomplete.

### Infobar Teardown (DEBT-A2, transitive)

- **D-04:** **Transitive removal**, not surgical. Delete `src/components/ui/infobar.tsx`, `src/components/ui/info-button.tsx`, `src/components/layout/info-sidebar.tsx`, and `src/config/infoconfig.ts` together. Strip `InfobarProvider` + `<InfoSidebar side='right' />` from `src/app/dashboard/layout.tsx`. Drop the `infoContent?: InfobarContent` prop from `src/components/layout/page-container.tsx` and `src/components/ui/heading.tsx` (and the `<InfoButton ... />` invocation inside `Heading`).
- **D-05:** Sweep every `infoContent={...}` prop usage in dashboard pages. From the scout: `src/app/dashboard/{billing,workspaces,workspaces/team/[[...rest]],product}/page.tsx` (deleted with their parent routes — no work) and the Heimdall feature pages that pass it. Grep `infoContent` after the prop is removed to confirm zero hits before commit.
- **D-06:** No replacement for the removed `<InfoSidebar />` slot in `src/app/dashboard/layout.tsx`. The layout currently has the right-side info panel; after Phase 4 the layout is just `<KBar><SidebarProvider><AppSidebar /><SidebarInset>...</SidebarInset></SidebarProvider><SearchCommand /></KBar>`. No new component, no replacement panel — that would be feature work.

### Products + Dead Support Files (DEBT-A1, transitive)

- **D-07:** Delete `src/features/products/` (entire directory: `components/product-listing.tsx`, `product-form.tsx`, `product-view-page.tsx`, `product-tables/` subtree). Delete `src/app/dashboard/product/` (route directory: `page.tsx`, `[productId]/page.tsx`).
- **D-08:** Delete `src/constants/mock-api.ts` outright — sole consumers are the four `src/features/products/components/*` files. Verified: no other Heimdall code imports from this module.
- **D-09:** Strip `Product`, `SaleUser`, and `recentSalesData` from `src/constants/data.ts`. If the file becomes empty after that, delete it; if any unrelated exports remain, leave the file with only those exports. (Grep before commit; from the scout, those are the only three exports in the file.)
- **D-10:** Remove the `'/dashboard/product': [{ title: 'Dashboard' ... }, { title: 'Product' ... }]` block from `src/hooks/use-breadcrumbs.tsx`. No other entries in that mapping reference deleted routes.

### Starter Dashboard Routes (DEBT-A2)

- **D-11:** Delete `src/app/dashboard/exclusive/page.tsx`, `src/app/dashboard/workspaces/page.tsx`, `src/app/dashboard/workspaces/team/[[...rest]]/page.tsx`, `src/app/dashboard/billing/page.tsx`. The internal `<a href='/dashboard/billing'>` in `exclusive/page.tsx` is removed with the file (no other dashboard surface links to it; org-switcher.tsx's `/dashboard/workspaces` `router.push` is in an orphan component covered under deferred — not Phase 4 scope).
- **D-12:** No nav-config edits are required for DEBT-A2 — `src/config/nav-config.ts` does NOT contain entries for product/exclusive/workspaces/billing/kanban. (Verified via Read: the nav lists Dashboard, Companies, Pipeline, Networking, Job Leads, Contacts, Tasks, Notes, Metrics, Account → Profile/Login. Clean already.)

### `__CLEANUP__/` Removal (DEBT-A4)

- **D-13:** `rm -rf __CLEANUP__/` — entire top-level directory. Contains `clerk/`, `kanban/`, `sentry/`, `scripts/`, and `cleanup.md` — none of which are referenced by any code in `src/` (verified by grep). Per `__CLEANUP__/cleanup.md` line 33, the directory is supposed to be removed once feature-strip decisions are made, which Phase 4 finalizes.
- **D-14:** Sequence: do DEBT-A4 *after* DEBT-A1/A2/A3 land. Reason: `__CLEANUP__/kanban/` and `__CLEANUP__/clerk/` are template directories that mirror real source files; if the order is wrong and someone accidentally invokes `node __CLEANUP__/scripts/cleanup.js kanban` mid-phase, it would silently overwrite real source. Keeping `__CLEANUP__/` until last avoids any accidental script invocation against partially-cleaned state. Planner enforces ordering.

### Unused Import (DEBT-A5)

- **D-15:** One-line edit in `src/app/api/job-leads/[id]/search/route.ts`: remove line 10 (`import { computeBridgeScore } from '@/features/job-leads/lib/prioritization';`). `computeBridgeScore` is genuinely used by `src/app/api/job-leads/[id]/recommendations/route.ts` and `src/features/job-leads/lib/prioritization.ts` — only this one import is dead. No risk to the export.

### Verification Strategy (Phase 4 SC #1–4)

- **D-16:** Verification has two layers, both required to call the phase done:
  1. **Filesystem-existence assertion test** (one file, e.g., `src/__cleanup__.test.ts` colocated with the deletion targets, or under `src/lib/cleanup.test.ts` — planner chooses). Asserts:
     - `fs.existsSync('src/features/products')` is `false`
     - `fs.existsSync('src/app/dashboard/product')` is `false`
     - `fs.existsSync('src/app/dashboard/exclusive')` is `false`
     - `fs.existsSync('src/app/dashboard/workspaces')` is `false`
     - `fs.existsSync('src/app/dashboard/billing')` is `false`
     - `fs.existsSync('src/app/dashboard/kanban')` is `false`
     - `fs.existsSync('src/features/kanban')` is `false`
     - `fs.existsSync('src/components/ui/infobar.tsx')` is `false`
     - `fs.existsSync('__CLEANUP__')` is `false`
     - Source string `computeBridgeScore` is not present in `src/app/api/job-leads/[id]/search/route.ts`
     This is deterministic, fast (<50ms), and runs in the Phase 2 Vitest harness without PGlite (it's filesystem I/O only). Satisfies SC #1 and SC #2 directly; SC #3 is verified by the PROJECT.md edit (D-02) being committed.
  2. **`npm run build` clean exit.** Phase 2's pre-push hook already runs `npm run build` + `npm run test:run`; this phase doesn't add a new gate, it just ensures the build still passes with no warning for the removed `computeBridgeScore` import (SC #4). The planner should run `npm run build` locally before each commit to catch transitive breakage.
- **D-17:** Do NOT add a runtime HTTP test that spins up a dev server and `curl`s `/dashboard/product` for a 404. Filesystem-existence + a clean build is a stronger contract — Next.js's route resolver IS the contract being asserted, and adding HTTP-level checks would mean booting Next in tests for a property the framework guarantees by definition. Per PD-05.

### Plan Grouping (informs the planner, not a hard rule)

- **D-18:** **Recommended plan breakdown — four disjoint plans, executable in two waves.** Mirrors Phase 3's two-disjoint-plans pattern but at the right granularity for five DEBT requirements that don't all touch the same files. The planner has final authority; this is a starting point:

  **Wave 1 (all four parallel — disjoint file sets):**
  - **04-01-PLAN.md (DEBT-A1)** — Products: delete `src/features/products/`, `src/app/dashboard/product/`, `src/constants/mock-api.ts`; strip Product/SaleUser/recentSalesData from `src/constants/data.ts`; strip `/dashboard/product` entry from `src/hooks/use-breadcrumbs.tsx`.
  - **04-02-PLAN.md (DEBT-A2)** — Starter routes + Infobar teardown: delete `src/app/dashboard/{exclusive,workspaces,billing}/`; delete `src/components/ui/infobar.tsx`, `src/components/ui/info-button.tsx`, `src/components/layout/info-sidebar.tsx`, `src/config/infoconfig.ts`; strip `InfobarProvider` + `<InfoSidebar />` from `src/app/dashboard/layout.tsx`; drop the `infoContent` prop from `src/components/layout/page-container.tsx` and `src/components/ui/heading.tsx` and every `infoContent={...}` call site on Heimdall feature pages.
  - **04-03-PLAN.md (DEBT-A3)** — Kanban removal: delete `src/app/dashboard/kanban/`, `src/features/kanban/`; append `(Removed in Phase 4)` to the kanban "Out of Scope" line in `.planning/PROJECT.md`.
  - **04-04-PLAN.md (DEBT-A5)** — One-line import cleanup in `src/app/api/job-leads/[id]/search/route.ts`. Trivial; could be folded into 04-01 if the planner prefers, but it's already a clean atomic commit on its own.

  **Wave 2 (blocked on Wave 1 completion — must be last):**
  - **04-05-PLAN.md (DEBT-A4 + verification)** — `rm -rf __CLEANUP__/`; add the filesystem-existence test file (D-16); confirm `npm run build` clean. Sequenced last so `__CLEANUP__/` scripts can't be accidentally invoked against partially-cleaned state (D-14), and so the verification test runs against the final post-cleanup tree.

  **Why parallel in Wave 1:** the four plans touch disjoint file sets. The only seam is the `infoContent` prop in `PageContainer`/`Heading` — that's owned entirely by 04-02 because all `infoContent` call sites on Heimdall feature pages are within `src/app/dashboard/{pipeline,metrics,tasks,networking,contacts,notes,overview,job-leads}/...` and 04-02 sweeps them. 04-01/04-03/04-04 do not touch those files.

  **Caveat:** If the planner determines that interleaving deletions across Wave 1 plans causes git-merge friction (e.g., two plans both editing `src/app/dashboard/layout.tsx`), the planner is free to serialize. Phase 3's wave-1 worked because the file sets were strictly disjoint; same should hold here once `infoContent` ownership is fixed to 04-02.

- **D-19:** Atomic commits per requirement. Each DEBT-Ax gets its own commit so `git log` reads cleanly (DEBT-A1: delete products; DEBT-A2: delete starter routes + infobar; DEBT-A3: delete kanban + record decision; DEBT-A4: rm __CLEANUP__; DEBT-A5: drop unused import). Phase 3 set this pattern.

### Claude's Discretion

- **CD-01:** Whether to delete `src/constants/data.ts` entirely (if it becomes empty after stripping Product/SaleUser/recentSalesData) or leave it as an empty exports file. Recommended: delete the file if no exports remain — leaving an empty `data.ts` is starter residue too. Planner verifies via `cat src/constants/data.ts` post-edit.
- **CD-02:** Whether to add a `not-found.tsx` under `src/app/` for a Heimdall-branded 404 page on the now-deleted routes, or rely on Next.js's default 404 chrome. Recommended: rely on default — adding a custom 404 is a feature, not cleanup. Defer if desired.
- **CD-03:** Whether to write the filesystem-existence test as one big `describe('Phase 4 cleanup')` with multiple `it()` blocks, or one `it()` with a list of paths checked in a `forEach`. Recommended: `forEach` over a path array — most concise; fewer test names to maintain. Either is fine.
- **CD-04:** Whether to use a single sweep commit for Wave 1 vs four separate commits. Recommended: four separate commits per D-19 — one per DEBT-Ax requirement so `git log` traceability is clean.
- **CD-05:** Whether to scrub the orphan `src/constants/mock-api.ts` import-only types (e.g., the `User`, `Order` types if any exist) vs delete the whole file. Recommended: delete the whole file — the scout confirmed all five exports (`fakeProducts`, mock product helpers) are products-only. If grep finds any non-products import, planner stops and flags.
- **CD-06:** Whether to also fold in the `Star on GitHub` `<Link>` block in auth view components that Phase 3 left behind (CONTEXT.md §"D-12"). Recommended: skip — Phase 3 chose to remove the `stars` *prop* and the `<Link>` block in D-12; if the block was correctly removed in Phase 3, there's nothing left to do here. Planner verifies.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §"Starter-Template Cleanup" — DEBT-A1..A5 verbatim text.
- `.planning/ROADMAP.md` §"Phase 4: Starter-Template Cleanup" — Goal + 4 success criteria. SC #3 explicitly requires the kanban decision to be recorded in PROJECT.md.
- `.planning/PROJECT.md` §"Out of Scope" — Already contains the kanban-removal commitment; this phase finalizes it.

### Codebase Maps (read before planning)
- `.planning/codebase/CONCERNS.md` §"Tech Debt → Entire Starter Template Product Feature Unreferenced by App" — Names `src/features/products/`, `src/app/dashboard/product/`, demo-form.tsx, user-auth-form.tsx (last two are deferred — see below).
- `.planning/codebase/CONCERNS.md` §"Tech Debt → `__CLEANUP__` Directory Not Yet Removed" — Recommends `rm -rf __CLEANUP__` after feature-strip decisions land.
- `.planning/codebase/CONCERNS.md` §"Tech Debt → Starter Template Infobar / Workspaces / Billing / Exclusive Pages" — Names all four routes + `src/config/infoconfig.ts` + `infobar.tsx` (805 lines).
- `.planning/codebase/CONCERNS.md` §"Tech Debt → `computeBridgeScore` Imported But Unused in Search Route" — Names DEBT-A5 target precisely.
- `.planning/codebase/ARCHITECTURE.md` §"Anti-Patterns → Kanban store uses client-side localStorage persistence" — Architectural rationale for the D-01 kanban-removal decision.

### Prior Phase Context (decisions to carry forward)
- `.planning/phases/03-security-hardening/03-CONTEXT.md` §"Verification Strategy", §"Plan Grouping" — Phase 3 established (a) verify via colocated Vitest tests using Phase 2 harness, (b) parallel plans when file sets are disjoint, (c) atomic commits per requirement, (d) prefer `git mv` over `git rm` when preserving blame. Phase 4 inherits patterns (a)–(c); (d) does not apply (Phase 4 is pure deletion, no renames).
- `.planning/phases/02-test-infrastructure/02-CONTEXT.md` — Vitest config + `npm run test:run` pre-push gate. Phase 4 reuses without modification (no PGlite needed; filesystem assertions only).
- `__CLEANUP__/cleanup.md` line 33 — Owner intent: "Once you've finished cleaning up features you don't need, delete the `__CLEANUP__` folder." Phase 4 executes this.

### Source Files (under modification or deletion)

**Delete entirely:**
- `src/features/products/` (whole directory: `components/product-listing.tsx`, `product-form.tsx`, `product-view-page.tsx`, `product-tables/columns.tsx`, `product-tables/cell-action.tsx`)
- `src/app/dashboard/product/page.tsx`, `src/app/dashboard/product/[productId]/page.tsx`
- `src/app/dashboard/exclusive/page.tsx`
- `src/app/dashboard/workspaces/page.tsx`, `src/app/dashboard/workspaces/team/[[...rest]]/page.tsx`
- `src/app/dashboard/billing/page.tsx`
- `src/app/dashboard/kanban/page.tsx`
- `src/features/kanban/` (whole directory: components + zustand store under `utils/store.ts`)
- `src/components/ui/infobar.tsx` (805 lines)
- `src/components/ui/info-button.tsx`
- `src/components/layout/info-sidebar.tsx`
- `src/config/infoconfig.ts`
- `src/constants/mock-api.ts`
- `__CLEANUP__/` (whole directory at repo root)

**Edit (remove specific dependencies, file stays):**
- `src/app/dashboard/layout.tsx` — Remove `import { InfobarProvider }` + `import { InfoSidebar }` + the `<InfobarProvider>...<InfoSidebar />...</InfobarProvider>` wrapper.
- `src/components/layout/page-container.tsx` — Drop the `infoContent?: InfobarContent` prop and the two call sites that pass it to `Heading`.
- `src/components/ui/heading.tsx` — Drop the `infoContent?: InfobarContent` prop and the `{infoContent && <InfoButton content={infoContent} />}` block.
- Every Heimdall feature page that passes `infoContent={...}` (sweep with `grep -rn "infoContent" src/app/dashboard/`). Confirmed live sites from scout: none after the starter routes are deleted (the four starter pages were the only `infoContent` callers; verify by post-deletion grep).
- `src/constants/data.ts` — Strip `Product` type, `SaleUser` interface, `recentSalesData` const. Delete file if it becomes empty (CD-01).
- `src/hooks/use-breadcrumbs.tsx` — Remove the `'/dashboard/product': [...]` entry (lines ~18–20).
- `src/app/api/job-leads/[id]/search/route.ts` — Remove line 10 only.
- `.planning/PROJECT.md` §"Out of Scope" — Append `(Removed in Phase 4)` to the kanban line.

### Tooling / Build / Test
- `vitest.config.ts` — Phase 2 config; no edits expected. The filesystem-existence test runs in the default node environment with no PGlite.
- `package.json` — `test:run`, `build`, and the husky pre-push hook are inherited from Phase 2. No script changes expected.
- `tsconfig.json` — strict; deleted imports will surface as TS errors during `npm run build` if a dependent edit is missed.

### Coding Conventions
- `CLAUDE.md` — TypeScript strict mode, named exports, no server actions, all mutations through `/api/*`. No new code in this phase, but the planner should verify no edit accidentally violates these.
- `.planning/codebase/CONVENTIONS.md` — Naming, kebab-case files. (No new files added, so mostly a sanity reference.)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 2 Vitest harness** (`vitest.config.ts`, `src/test-utils/`) — Reused for the filesystem-existence assertion test (D-16). No new test config or harness work.
- **Phase 3's `git mv` precedent** — Does NOT apply here; Phase 4 is pure `git rm` (no rename pattern). Just noting so the planner doesn't search for analogues.

### Established Patterns
- **Parallel plans on disjoint file sets** — Phase 3 ran two plans in parallel (one for the middleware activation, one for the GitHub button removal). Phase 4 extends this to four parallel plans + one serialized wave-2 plan (D-18).
- **Atomic commits per requirement** — Phase 3 D-12/CD-04 established the pattern: one commit per DEBT-Ax. Phase 4 inherits (D-19).
- **Single-pass `--auto` discussion** — Phase 3 was discussed in auto mode and produced a CONTEXT.md without iteration. Phase 4 does the same; this CONTEXT.md is the single canonical record.

### Integration Points
- **`InfobarProvider` in dashboard layout** — Removing it breaks every dashboard page that calls `useInfobar()` (verified by grep: only `info-sidebar.tsx`, `info-button.tsx`, and the four starter routes via `infoContent` prop — all going away). After Phase 4, `useInfobar` has zero callers and zero declarations.
- **Kanban store anti-pattern** — The `zustand persist` localStorage store in `src/features/kanban/utils/store.ts` is documented in ARCHITECTURE.md as an anti-pattern. Removal eliminates the anti-pattern outright, not just the route.
- **`__CLEANUP__/` script side-effect risk** — The script in `__CLEANUP__/scripts/cleanup.js` can be invoked to overwrite real source files with template versions. D-14 sequences `rm -rf __CLEANUP__/` last in the phase to avoid the risk of an accidental invocation against half-cleaned state.

### What the Planner Does NOT Need to Research
- Whether to wire `/dashboard/kanban` to `/api/tasks` (D-01 locks: remove, do not wire).
- Whether to delete the Infobar machinery transitively or just `infobar.tsx` (D-04 locks: transitive).
- Whether to add an HTTP smoke test for 404s (D-17 locks: no — filesystem assertion + build is the contract).
- Whether the deferred starter components (OrgSwitcher, demo-form, user-auth-form) need to be touched (`<deferred>` says no — they're explicit OOS).
- Whether to add a 404 not-found.tsx page (CD-02 recommends no).

### What the Planner DOES Need to Research / Decide
- Whether `src/constants/data.ts` ends up empty after stripping the three exports (drives CD-01: delete file vs leave empty stub).
- Whether any unexpected Heimdall code imports `Product`, `SaleUser`, `recentSalesData`, or the `mock-api` module — a final `grep -rn "from '@/constants/mock-api'" src/` and `grep -rn "SaleUser\|recentSalesData" src/` before Plan 04-01 ships. Scout returned zero non-products usage but the planner verifies.
- Whether any `infoContent` call site exists outside the four starter dashboard routes — `grep -rn "infoContent" src/app/dashboard/` post-deletion. Scout showed all sites are in `billing`/`workspaces`/`product`/`exclusive`, but the planner should confirm.
- Whether `__CLEANUP__/scripts/cleanup.js` has any deps in `package.json` (`scripts/`, `dependencies`) that should be cleaned out — e.g., a `cleanup` npm script. Quick `cat package.json` check during planning.

</code_context>

<specifics>
## Specific Ideas

- The filesystem-existence test (D-16) should live at `src/__cleanup__.test.ts` next to `src/app/` so it's discoverable as a Phase 4 artifact. Use `node:fs/promises`' `access` + an array of paths in a `forEach`: `for (const p of deletedPaths) { expect(existsSync(p)).toBe(false); }`. Also a single assertion that the source string `computeBridgeScore` is not present in `src/app/api/job-leads/[id]/search/route.ts` (read the file as UTF-8, `expect(content).not.toMatch(/computeBridgeScore/)`).
- For the Wave 1 plans, the planner should commit each `git rm -r <path>` immediately after the deletion (atomic per D-19). This keeps `git log` traceable: a reader can `git log --diff-filter=D --name-only` and see exactly which directories were removed under each DEBT-Ax.
- The `__CLEANUP__/` removal in Wave 2 should also delete any `node_modules` entries that the cleanup script might have pulled in — but the script is pure Node `fs` and config; no extra deps are expected. Sanity check with `git status` after `rm -rf __CLEANUP__/`.
- The PROJECT.md edit (D-02) should be a one-line append to the existing kanban "Out of Scope" line, NOT a new section. The line currently reads: `DB-backed Kanban for the /dashboard/kanban page — Starter-template residue; will be removed under DEBT-A3.` After Phase 4: `DB-backed Kanban for the /dashboard/kanban page — Starter-template residue; removed in Phase 4 (DEBT-A3).` Same line, past tense.
- Order of edits in Plan 04-02 (the largest plan): (1) drop `infoContent` from `PageContainer` and `Heading` first — gets TS errors at every call site. (2) walk the TS errors removing call sites in the starter pages (which are about to be deleted anyway). (3) delete the four starter route directories. (4) delete `info-sidebar.tsx`, `info-button.tsx`, `infoconfig.ts`. (5) strip `InfobarProvider` from `dashboard/layout.tsx`. (6) delete `infobar.tsx`. This order means the build never goes red for more than one commit, and the final `delete infobar.tsx` only happens after every consumer is gone.

</specifics>

<deferred>
## Deferred Ideas

These came up during analysis but are out of phase-4 scope. Captured so future phases / a follow-on cleanup phase don't lose them.

- **`src/components/org-switcher.tsx`** — Imports `useOrganization` from Clerk, calls `router.push('/dashboard/workspaces')`. After Phase 4 deletes the workspaces route, this component is fully orphan (the only caller of itself per scout grep). It is not named in DEBT-A1..A5 and removing it is not a transitive consequence of the named requirements (no other file imports it today). Defer to a follow-on starter-orphan cleanup, or fold into a future "Heimdall vs starter audit" phase.
- **`src/components/forms/demo-form.tsx`** — Starter template demo form. Orphan (no callers in scout). CONCERNS.md mentions it under "Entire Starter Template Product Feature" but it's not named in DEBT-A1..A5. Defer.
- **`src/features/auth/components/user-auth-form.tsx`** — Starter auth form, orphan. Same status as demo-form: mentioned in CONCERNS.md, not in DEBT requirements. Defer.
- **`src/app/dashboard/profile/[[...profile]]/page.tsx` + the `Profile` and `Login` items in `src/config/nav-config.ts`** — The profile route uses `<ProfileViewPage />` from `@/features/profile/`. This is starter chrome (Clerk's profile editor) and the `Login` nav item points at `/` which is the redirect-to-sign-in landing page — possibly intentional, possibly starter residue. Not named in DEBT. Defer for a Heimdall-specific UX decision.
- **Auth-page visual chrome** (Random Dude quote, placeholder `Logo` SVG, `interactive-grid` decoration, `Login` top-right link, `Star on GitHub` link text) — Phase 3 D-13 explicitly deferred these as "starter residue but not security concerns." Phase 4's scope is named DEBT requirements; these are not named. Defer to a future cosmetic-cleanup phase.
- **`any` typings in `src/components/kbar/index.tsx` and `src/features/metrics/components/weekly-snapshot-form.tsx`** — CONCERNS.md "Tech Debt" entries, not in the v1 Active requirements list. Defer to a future type-tightening phase.
- **`playwright` package classification** (CONCERNS.md "Dependencies at Risk") — JL2-02 in REQUIREMENTS.md `v2 (deferred)`. Already deferred.
- **`.planning/codebase/ARCHITECTURE.md` rewrites** — The ARCHITECTURE map currently lists `infobar.tsx` and the Kanban store as components. After Phase 4 lands, the map needs a refresh. Defer to a `/gsd-map-codebase` re-run or a docs-update step after the milestone closes.
- **`scripts/` directory at repo root** (referenced by `__CLEANUP__/scripts/`) — Not touched by Phase 4; only `__CLEANUP__/scripts/` (the cleanup-script implementation) is deleted with the parent directory. The top-level `scripts/` (with `generate-import-data.py`, `parse-paste.py`) is Heimdall tooling and stays.
- **Phase 3 ARCHITECTURE.md correction** (Phase 3 03-CONTEXT.md deferred this) — Still pending, separate doc-update.

### Reviewed Todos (not folded)
None — no project-level todos cross-referenced this phase via `gsd-sdk query todo.match-phase`.

</deferred>

---

## --auto Discussion Log

For each gray area surfaced during analysis, Claude auto-selected the recommended option (no AskUserQuestion calls per `workflows/discuss-phase/modes/auto.md`):

- **[auto] Kanban route fate (DEBT-A3 — recorded for SC #3)** — Q: "Wire `/dashboard/kanban` to `/api/tasks` or remove it?" → Selected: **Remove** (recommended). Reason: localStorage-persisted starter (ARCHITECTURE.md anti-pattern); `/dashboard/pipeline` (PIPE-V1) and `/dashboard/tasks` (TASK-V1) already cover the DB-backed kanban surface; scope is cleanup, not new features. D-01.
- **[auto] Infobar deletion scope** — Q: "Surgical (`infobar.tsx` only) or transitive (`infobar.tsx` + `info-button.tsx` + `info-sidebar.tsx` + `infoconfig.ts` + layout/PageContainer/Heading edits)?" → Selected: **Transitive** (recommended). Reason: surgical breaks the build — 5+ files depend on the `InfobarProvider`/`InfobarContent` symbols. D-04.
- **[auto] Products deletion blast radius** — Q: "Just `src/features/products/` + `src/app/dashboard/product/`, or also `mock-api.ts` + `Product`/`SaleUser`/`recentSalesData` + breadcrumb entry?" → Selected: **Fold in transitive dead code** (recommended). Reason: those files/exports are products-only; leaving them is starter residue too and would force a follow-on cleanup. D-07..D-10.
- **[auto] Plan grouping** — Q: "One bulk plan or disjoint parallel plans?" → Selected: **Four parallel plans (Wave 1) + one verification plan (Wave 2)** (recommended). Reason: file sets are disjoint; mirrors Phase 3's parallel-disjoint pattern; `__CLEANUP__/` deletion must be last (D-14). D-18.
- **[auto] Verification approach** — Q: "Filesystem-existence test + clean `npm run build`, or runtime HTTP 404 smoke?" → Selected: **Filesystem-existence test + clean build** (recommended). Reason: Next.js route resolver IS the 404 contract; HTTP smoke would test the framework. Faster (<50ms), deterministic, runs in Phase 2 harness. D-16, D-17.
- **[auto] Atomic commits granularity** — Q: "One sweep commit or one commit per DEBT-Ax?" → Selected: **One commit per DEBT-Ax** (recommended). Reason: Phase 3 set the pattern; preserves `git log` traceability. D-19.
- **[auto] `__CLEANUP__/` deletion ordering** — Q: "Delete first (clearer diff) or last (avoid accidental script invocation against half-cleaned state)?" → Selected: **Last (Wave 2)** (recommended). Reason: `__CLEANUP__/scripts/cleanup.js` can overwrite real source files; sequencing it last makes accidents structurally impossible. D-14.
- **[auto] Adjacent starter orphans (org-switcher, demo-form, user-auth-form, profile route)** — Q: "Sweep them along with the named DEBT items, or defer?" → Selected: **Defer** (recommended). Reason: not named in DEBT-A1..A5; not a transitive consequence of any named deletion; scope discipline beats opportunistic cleanup. `<deferred>` section.
- **[auto] Decision record location for SC #3** — Q: "New doc, new section in PROJECT.md, or amend the existing kanban out-of-scope line?" → Selected: **Amend existing line** (recommended). Reason: PROJECT.md already has the commitment; appending `(Removed in Phase 4)` is the minimum complete edit. D-02.

---

*Phase: 04-Starter-Template Cleanup*
*Context gathered: 2026-05-13*
