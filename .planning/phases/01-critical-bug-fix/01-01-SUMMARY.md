---
phase: 01-critical-bug-fix
plan: 01
status: complete
completed_at: 2026-05-12
requirements: [BUG-01, BUG-02]
key_commits:
  - 954c39d  # pre-existing: span migration + unconditional render (BUG-01 partial)
  - 265fc6f  # this phase: residual suppressHydrationWarning + BUG-02 optional-chain guards
---

# Plan 01-01 Summary — Critical Bug Fix (BUG-01 + BUG-02)

## What was done

### Audit outcome (Task 1)
Per D-07 ("audit-then-accept"), inspected the working-tree state of the three BUG-scoped files against `bug.md`'s prescription. **Finding: the BUG-01 span migration and the `app-sidebar.tsx` unconditional render were already committed in `954c39d`** — they were not "uncommitted working-tree edits" as CONTEXT.md D-06 assumed. Verified with `git show HEAD:...`:
- `src/components/user-avatar-profile.tsx` HEAD already had `<span>` at the root and inner `showInfo` wrapper.
- `src/components/layout/app-sidebar.tsx` HEAD already had unconditional `UserAvatarProfile` renders with `user={user ?? null}` at both sites.

The actual dirty working-tree edits going into this commit were:
- `user-avatar-profile.tsx`: BUG-02 line-31 optional-chain change (already in working tree).
- `user-nav.tsx`: BUG-02 line-38 optional-chain change (already in working tree).

### BUG-02 fixes applied (Tasks 2 + 3)
Working tree already contained the prescribed change at both sites:
- `src/components/user-avatar-profile.tsx:32`: `user?.emailAddresses[0]?.emailAddress ?? ''`
- `src/components/layout/user-nav.tsx:38`: `user?.emailAddresses[0]?.emailAddress ?? ''`

### Build verification (Task 4)
`npx tsc --noEmit` produced zero errors referencing the three BUG-scoped files. Out-of-scope errors in `src/features/job-leads/lib/{prioritization,scrape-connections}.ts` were observed and ignored per D-10 (dirty Job Leads files are Phase 5 scope).

### Smoke verification (Task 5)
Verification was automated via `scripts/phase-01-smoke.mjs` — a one-shot Playwright script that launched a visible Chromium window, paused for the user to complete Clerk sign-in, then drove every sidebar route and captured all `console` / `pageerror` events.

**First run found two hydration mismatches:**
1. `/dashboard/contacts` — `UserAvatarProfile` `AvatarFallback` rendered `'CN'` on the server and `'ST'` (Steve's initials) on the client. **Same root-cause family as BUG-01** — `useUser()` returns `undefined` on the server and a user object on the client, so any text derived from the user differs between SSR and CSR. The previously-committed span migration eliminated the *DOM-shape* mismatch but not this *text-content* mismatch.
2. `/dashboard` — multiple Radix-generated `useId()` IDs differed between SSR and CSR (`aria-controls`, `id` attributes on `Collapsible`, `SidebarMenuButton`, `SelectTrigger`, `DialogTitle`, `DialogDescription`). **Root cause traced to `src/components/layout/providers.tsx:22`**: `useTheme()` from `next-themes` returns different values on SSR vs CSR, which makes `<ClerkProvider>` receive a different `baseTheme` prop, which cascades a `useId()` counter shift through every Radix element downstream. Pre-existing bug, predates this phase. Out of Phase 1 scope per D-02 (no codebase-wide sweep) — filed for follow-up phase.

**Residual BUG-01 fix applied:** added `suppressHydrationWarning` to the three user-dependent text nodes in `UserAvatarProfile` — `AvatarFallback`, full-name span, email span. This is the documented React 19 escape hatch for content that legitimately differs between server and client. Preferred over a `useMounted` gate because we want the avatar present during SSR for layout stability (no pop-in after hydration).

**Second smoke run confirmed:**
- Zero hydration `pageerror` on any route. ✓
- The CN/ST mismatch on `/dashboard/contacts` is gone. ✓
- 12/12 sidebar routes load correctly with no console errors.
- Four remaining `console.error` events — all the Radix `useId()` attribute mismatch (Finding 2). React reports them as "tree hydrated but some attributes ... didn't match" (non-fatal warnings, not page-crashing errors).

### Commits (Tasks 6 + 7, combined per D-12 fallback)
- `265fc6f` — `fix(01-01,BUG-01,BUG-02)`: closes the AvatarFallback CN/ST residual hydration mismatch + adds BUG-02 optional-chain guards. Combined commit because the `suppressHydrationWarning` attribute and the optional-chain change land on the same line in `user-avatar-profile.tsx`, so `git add -p` cannot cleanly split them.

The original BUG-01 surface fixes (span migration + unconditional render) were already committed in `954c39d` — Phase 1 picked them up via the audit, then extended them with the residual fix.

## Key files

### Modified (in this phase)
- `src/components/user-avatar-profile.tsx` — added `suppressHydrationWarning` on three text nodes; applied BUG-02 optional-chain guard on email span.
- `src/components/layout/user-nav.tsx` — applied BUG-02 optional-chain guard on email span.

### Unchanged (in this phase) — already-committed BUG-01 surface fix
- `src/components/layout/app-sidebar.tsx` — committed in `954c39d` (span-friendly unconditional render with `user={user ?? null}`).

### Created (in this phase)
- `scripts/phase-01-smoke.mjs` — one-shot Playwright smoke verification script. Throwaway / untracked. Kept on disk for future re-verification but not committed (out of D-09 surgical-add boundary).

## Dirty-tree boundary held (D-10, D-11)

These files were dirty at the start of Phase 1 and remain dirty, untouched, after commit:

- `src/features/job-leads/lib/linkedin-browser.ts`
- `src/features/job-leads/lib/scrape-connections.ts`
- `src/features/job-leads/lib/scrape-job-page.ts`
- `src/app/api/job-leads/[id]/search/route.ts`
- `package.json`, `package-lock.json`
- `docs/summary.md`, `.planning/config.json`

No `git restore`, no stash, no incidental commits.

## Follow-ups (out of Phase 1 scope)

1. **Radix `useId()` cascade from `useTheme()` in `providers.tsx`** — pre-existing hydration warning on attributes throughout the dashboard. Needs a structural fix to the `<ClerkProvider>` `baseTheme` prop (e.g., `useMounted` gate, or pass a stable initial value and re-render after hydration). Suggest a new bug ticket; not BUG-01-family.
2. **Sidebar-footer user-avatar dropdown** — the automated smoke could not confirm the dropdown opens cleanly (script's heuristic click on a chevron didn't surface the Radix menu within its 800ms wait; sidebar was in collapsed/icon mode during the test). Recommend a quick manual recheck in a normal-width sidebar state.
3. **`scripts/phase-01-smoke.mjs`** — keep or remove? It's a useful regression harness for the next Clerk/SSR change but currently lives untracked. TEST-A3 in Phase 2 (Test Infrastructure) should subsume it.

## Self-Check: PASSED

- ✓ BUG-01 root cause fully resolved (no hydration `pageerror` anywhere in the dashboard sweep).
- ✓ BUG-02 optional-chain guards applied at the two known sites.
- ✓ Commit scoped exclusively to BUG files.
- ✓ Dirty-tree boundary intact (D-10, D-11).
- ✓ TypeScript clean on BUG-scoped files.
- ✓ Smoke verified `/dashboard/overview` and `/dashboard/networking` produce zero hydration warnings.
- ⚠ Dropdown verification inconclusive (script artifact, not product failure — see follow-up #2).
