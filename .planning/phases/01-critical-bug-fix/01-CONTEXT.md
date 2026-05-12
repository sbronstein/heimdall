# Phase 1: Critical Bug Fix - Context

**Gathered:** 2026-05-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the React hydration crash that breaks sidebar navigation after large LinkedIn imports, and guard the unsafe `emailAddresses[0]` array access that can crash on edge-case Clerk users.

**In scope:**
- BUG-01: Remove the SSR/CSR hydration mismatch in `app-sidebar.tsx` and confirm `UserAvatarProfile` renders valid HTML inside `SidebarMenuButton`.
- BUG-02: Add optional-chain guard on `emailAddresses[0]` access in two known files.

**Out of scope (deferred to other phases):**
- Vitest harness and the BUG-01 regression test (TEST-A3) — Phase 2.
- Any other hydration audits, codebase-wide unsafe-Clerk-pattern sweeps.
- The unrelated dirty files in the working tree (Job Leads scrape work, package.json, etc.) — Phase 5 and others.

</domain>

<decisions>
## Implementation Decisions

### Sweep Scope
- **D-01:** Fix only the two known sites. No codebase-wide sweep this phase.
  - `src/components/user-avatar-profile.tsx:31` — `user?.emailAddresses[0].emailAddress` → `user?.emailAddresses[0]?.emailAddress ?? ''`
  - `src/components/layout/user-nav.tsx:38` — `user.emailAddresses[0].emailAddress` → `user?.emailAddresses[0]?.emailAddress ?? ''`
- **D-02:** Do NOT grep for or fix other unsafe Clerk property chains (firstName, primaryEmailAddress, etc.) — those would be a new audit and belong in a different phase if needed.

### Verification Approach
- **D-03:** Verification is dev-server smoke only, not a full repro of the 1500-contact import.
  - Start `npm run dev`, open `/dashboard/overview` and `/dashboard/networking`.
  - Open browser DevTools console; confirm **no React hydration warnings** appear.
  - Click each sidebar nav link; confirm each routes correctly.
- **D-04:** Do not attempt to synthesize a "no-email Clerk user" state to repro BUG-02 — the optional-chain guard is mechanical and structurally cannot fail at the patched lines.
- **D-05:** No regression test is added in this phase. TEST-A3 (test for the BUG-01 hydration mismatch) is owned by Phase 2 (Test Infrastructure).

### Pre-Existing Edits (working-tree state)
- **D-06:** The working tree already contains partial fixes for BUG-01, uncommitted:
  - `src/components/user-avatar-profile.tsx` — root `<div>` and inner `showInfo` `<div>` already migrated to `<span>`.
  - `src/components/layout/app-sidebar.tsx` — the `{user && <UserAvatarProfile ... />}` guard already removed at lines 148 and 166; now renders `UserAvatarProfile` unconditionally with `user={user ?? null}`.
- **D-07:** Strategy: **audit then accept.** Before locking BUG-01 as done, the planner/executor must:
  1. Read the current `user-avatar-profile.tsx` and `app-sidebar.tsx`.
  2. Confirm the edits match the fix prescribed in `bug.md` (root + inner `<span>`, no `{user && ...}` guard, `user ?? null` passed through).
  3. If they match, include them in the Phase 1 commit. If they diverge, fix the divergence first.
- **D-08:** Do NOT `git restore` or revert the working-tree edits — they are correct, just uncommitted.

### Dirty-Tree Handling
- **D-09:** Phase 1 commits **only** the BUG-01/BUG-02 files. Surgical `git add <file>` per file:
  - `src/components/user-avatar-profile.tsx`
  - `src/components/layout/app-sidebar.tsx`
  - `src/components/layout/user-nav.tsx`
- **D-10:** Leave the following dirty files in the working tree, untouched by Phase 1:
  - `src/features/job-leads/lib/linkedin-browser.ts` — Phase 5 (Job Leads)
  - `src/features/job-leads/lib/scrape-connections.ts` — Phase 5
  - `src/features/job-leads/lib/scrape-job-page.ts` — Phase 5
  - `src/app/api/job-leads/[id]/search/route.ts` — Phase 5
  - `package.json` / `package-lock.json` — unclear ownership; investigate later
  - `docs/summary.md`, `.planning/config.json` — out of scope this phase
- **D-11:** Do not stash or commit the unrelated changes. They stay in place.

### Claude's Discretion
- Commit message wording, ordering of edits within the patch, and whether to commit BUG-01 and BUG-02 as one or two commits — at the executor's discretion. Recommended default: one commit per requirement (one for BUG-01, one for BUG-02) for clean git history and easy revert.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Bug Specification
- `bug.md` — Full symptom, root-cause, fix prescription for BUG-01. Two problems: `{user && ...}` SSR/CSR mismatch + invalid `<div>` inside `<button>` HTML nesting. Lists files to edit.

### Project & Requirements
- `.planning/PROJECT.md` — Project overview, constraints (no server actions, all mutations via REST API, Clerk single-user lock).
- `.planning/REQUIREMENTS.md` — BUG-01 + BUG-02 acceptance criteria.
- `.planning/ROADMAP.md` §"Phase 1: Critical Bug Fix" — Phase 1 success criteria.

### Codebase Maps
- `.planning/codebase/CONCERNS.md` §"Known Bugs" — Current-state description of the hydration crash and the unsafe `emailAddresses[0]` access; confirms that `<span>` migration is partially done.
- `.planning/codebase/STACK.md` — Next.js 16 App Router, Clerk auth library context.
- `.planning/codebase/CONVENTIONS.md` — Code style (single quotes, 2-space indent, named exports, kebab-case files).

### Coding Conventions
- `CLAUDE.md` — Project-level conventions: TypeScript strict mode, named exports, Server Components by default.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/user-avatar-profile.tsx` — already accepts `user: ... | null` and uses optional chaining throughout. The component is robust to a null user; the only failure mode left is the `emailAddresses[0].emailAddress` chain.

### Established Patterns
- **Optional chaining for Clerk user fields:** the rest of `user-avatar-profile.tsx` already uses `user?.imageUrl`, `user?.fullName?.slice(...)`, etc. The fix is to extend this pattern one level deeper into the array index.
- **`'use client'` for components touching Clerk hooks:** both `app-sidebar.tsx` and `user-nav.tsx` are client components — server-only rendering paths cannot be used here.

### Integration Points
- **`AppSidebar` → `UserAvatarProfile`:** `app-sidebar.tsx` renders `UserAvatarProfile` twice — once inside `SidebarMenuButton` (line 148) and once inside the dropdown header (line 164). Both must render valid HTML and survive a null user.
- **`useUser()` hook:** Clerk's `useUser()` returns `undefined` on the server and `{ user, isSignedIn, isLoaded }` on the client. Any conditional render gated on `user` is an SSR/CSR mismatch waiting to happen. The fix relies on `UserAvatarProfile` itself handling `user === null` — it already does.

### What the Planner Does NOT Need to Research
- The fix is mechanical and fully specified in `bug.md` + current code state. No external research is required.

</code_context>

<specifics>
## Specific Ideas

- The fix surface is **three files, ~4 line changes total**. This is a small phase, not a multi-day effort.
- Verification is a 2-minute dev-server smoke check. If the planner is generating a multi-step plan, it should reflect this minimal scope — not invent ceremony.
- The planner should explicitly call out the "audit pre-existing working-tree edits" step (D-07) as a discrete task before committing — otherwise an executor might just stage and commit blindly.

</specifics>

<deferred>
## Deferred Ideas

- **Codebase-wide hydration audit** — sweep for other `useUser()` / `useAuth()` conditional renders that could cause SSR/CSR mismatches. Not done this phase; consider if BUG-01 recurs elsewhere.
- **Codebase-wide unsafe Clerk-property sweep** — grep for unguarded `firstName`, `primaryEmailAddress`, etc. accesses. Not done this phase.
- **No-email user repro harness** — programmatically synthesize a Clerk user with `emailAddresses: []` to repro BUG-02 in a controlled way. Belongs in Phase 2 (Test Infrastructure) as part of TEST-A3 or a related test.
- **Hydration regression test** (TEST-A3) — formally owned by Phase 2.
- **Unrelated dirty files** — Job Leads scrape work, package.json changes, docs/summary.md, .planning/config.json: handled by their owning phases (Phase 5 for Job Leads, etc.).

</deferred>

---

*Phase: 1-Critical Bug Fix*
*Context gathered: 2026-05-12*
