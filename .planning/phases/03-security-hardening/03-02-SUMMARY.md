---
phase: 03-security-hardening
plan: 02
subsystem: auth
tags: [auth-cleanup, starter-template, security, clerk, ssrf-shape, dead-chrome]

# Dependency graph
requires:
  - phase: 00-bootstrap
    provides: Clerk auth integration with `<SignIn>` / `<SignUp>` forms (the surviving core of the auth pages)
provides:
  - "Sign-in/sign-up pages no longer issue outbound SSR fetch to api.github.com (D-11, T4)"
  - "Sign-in/sign-up pages no longer render a no-op 'Continue with GitHub' button (D-10, T5)"
  - "Sign-in/sign-up view components are stateless (no `stars` prop); page.tsx files are sync RSCs (CD-05, T6)"
affects: [04-design-overhaul, deferred-debt-A-orphan-user-auth-form]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "When a starter-template component is dead (no-op handlers, fake auth controls), prefer outright `git rm` over leaving a stub — keeps the repo small and removes the temptation to wire it up later (CD-04 — confirmed pattern)."
    - "Server Components default to sync — only mark `async` when an awaited call is genuinely needed (CD-05 reaffirmation)."

key-files:
  created: []
  modified:
    - src/features/auth/components/user-auth-form.tsx
    - src/features/auth/components/sign-in-view.tsx
    - src/features/auth/components/sign-up-view.tsx
    - src/app/auth/sign-in/[[...sign-in]]/page.tsx
    - src/app/auth/sign-up/[[...sign-up]]/page.tsx
  deleted:
    - src/features/auth/components/github-auth-button.tsx

key-decisions:
  - "Used `git rm` for github-auth-button.tsx (CD-04 — clean removal, no stub)"
  - "Preserved orphan `UserAuthForm` component body for Phase 4 broader cleanup (D-13 boundary respected); removed only the dead GitHub button + 'Or continue with' divider inside it"
  - "Auth page.tsx files converted from `async function Page()` to sync `function Page()` per CD-05 — no remaining awaited work after the fetch was removed"
  - "Preserved all non-dead auth-page chrome (Random Dude blockquote, Logo SVG, InteractiveGridPattern, Login/Sign Up top-right link, open-source/View on GitHub/Terms/Privacy `<Link>` blocks) per D-13 — Phase 4 owns broader cleanup"

patterns-established:
  - "Threat-register-driven cleanup: each STRIDE row (T4/T5/T6) maps to one or more concrete grep gates that the executor asserts post-edit (e.g., `! grep -rn 'api.github.com' src`)"
  - "Plan-checker discovery promoted to action: planning surfaced that `sign-in-view.tsx`/`sign-up-view.tsx` do NOT render `<GithubSignInButton />` (contrary to CONTEXT.md); the actual rendering site was `user-auth-form.tsx`. Executor confirmed via grep before editing."

requirements-completed: [SEC-A2]

# Metrics
duration: ~5 min
completed: 2026-05-12
---

# Phase 3 Plan 02: Strip GitHub-button + api.github.com leak from auth pages — Summary

**Removed two starter-template residues from the auth flow: a no-op `GithubSignInButton` (UX-level fake auth control) and a server-rendered `await fetch('https://api.github.com/repos/...')` on every sign-in/sign-up page load.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-13T01:04:41Z
- **Completed:** 2026-05-13T01:09:48Z
- **Tasks:** 2 / 2
- **Files modified:** 5 (1 deleted, 4 edited)

## Accomplishments

- Deleted `src/features/auth/components/github-auth-button.tsx` (`git rm`, CD-04). The no-op `onClick={() => console.log('continue with github clicked')}` is gone, and no caller anywhere in `src/` references `GithubSignInButton` (verified via grep).
- Removed the `await fetch('https://api.github.com/repos/kiranism/next-shadcn-dashboard-starter', ...)` block from both `src/app/auth/sign-in/[[...sign-in]]/page.tsx` and `src/app/auth/sign-up/[[...sign-up]]/page.tsx`. Both files are now sync server components (CD-05): `export default function Page() { return <SignInViewPage />; }`.
- Removed the `stars` prop from `SignInViewPage` and `SignUpViewPage`, deleted the `<Link>...Star on GitHub...{stars}</Link>` chrome block, and removed the now-unused `GitHubLogoIcon` / `IconStar` imports from both view components.
- Preserved all in-scope chrome per D-13 (Random Dude blockquote, Logo SVG, InteractiveGridPattern, Login/Sign Up top-right link, the trailing open-source/View on GitHub/Terms/Privacy `<Link>` blocks) — Phase 4 territory.
- Closed STRIDE threats T4 (T-03-04 — Tampering/Information Disclosure SSRF-shape), T5 (T-03-05 — Spoofing UX-level fake auth control), and T6 (T-03-06 — Information Disclosure dead chrome).
- Closed requirement **SEC-A2**.

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete github-auth-button.tsx + remove references from user-auth-form.tsx** — `7290ee3` (feat)
2. **Task 2: Remove stars prop, Star-on-GitHub Link block, and api.github.com fetch from auth views + pages** — `c55bd09` (feat)

## Files Created / Modified / Deleted

- **Deleted:** `src/features/auth/components/github-auth-button.tsx` — no-op GitHub OAuth button, deleted via `git rm` (CD-04).
- **Modified:** `src/features/auth/components/user-auth-form.tsx` — removed `GithubSignInButton` import + render + the dead "Or continue with" divider; preserved the orphan form body for Phase 4 broader cleanup.
- **Modified:** `src/features/auth/components/sign-in-view.tsx` — removed `stars` prop, the `<Link>...Star on GitHub...{stars}</Link>` block, and the now-unused `GitHubLogoIcon` / `IconStar` imports.
- **Modified:** `src/features/auth/components/sign-up-view.tsx` — mirror of the sign-in-view edit (`ClerkSignUpForm` preserved).
- **Modified:** `src/app/auth/sign-in/[[...sign-in]]/page.tsx` — removed `let stars = 3000` + `try { fetch(...) } catch { }` block + `stars={stars}` prop pass + `async` keyword on the default export.
- **Modified:** `src/app/auth/sign-up/[[...sign-up]]/page.tsx` — mirror of the sign-in page.tsx edit.

## Decisions Made

- **CD-04 honored:** Used `git rm` for `github-auth-button.tsx` rather than leaving an empty file.
- **D-13 boundary respected:** The orphan `UserAuthForm` component body itself was preserved — only the dead GitHub button render and the now-incoherent "Or continue with" divider were removed. Phase 4 (`DEBT-A*` starter-template cleanup) owns the broader decision of whether to delete the orphan form entirely.
- **CD-05 honored:** Both auth page.tsx files were converted from `async function Page()` to sync `function Page()` because no awaited work remains after the fetch removal.
- **Auth-page chrome preserved:** Random Dude blockquote, Logo SVG, InteractiveGridPattern, Login/Sign Up top-right link, the trailing open-source / View on GitHub / Terms / Privacy `<Link>` blocks all remain untouched per D-13 — these are stylistic chrome, not network or auth-control surfaces. Phase 4 may scrub them under DEBT-A*.

## Note on CONTEXT.md / Planning Discovery

The phase context document said `sign-in-view.tsx` / `sign-up-view.tsx` rendered `<GithubSignInButton />` "at line ~63". A grep during planning revealed that was slightly imprecise: those two view files actually rendered the `<Link>...Star on GitHub...{stars}</Link>` chrome block at that location (not the button). The only file that actually imported and rendered `GithubSignInButton` was `src/features/auth/components/user-auth-form.tsx`. The plan-checker surfaced this discrepancy and the plan was written to remove the button reference from `user-auth-form.tsx` (Task 1) and the Star-on-GitHub Link block from both view files (Task 2). Both targets are now resolved.

## Deviations from Plan

**None.** Plan executed exactly as written. Two atomic commits, all grep gates pass, no unplanned files touched.

## Deferred Issues

**Pre-existing `npm run build` failure in `src/features/job-leads/lib/prioritization.ts:70`** — `Type 'MapIterator<PrioritizedRecommendation>' can only be iterated through when using the '--downlevelIteration' flag or with a '--target' of 'es2015' or higher.`

This failure exists on the baseline (verified by stashing all 03-02 edits and re-running `npm run build` — the same error reproduces). Root cause: `tsconfig.json` `target: "es5"` without `downlevelIteration`. Out of scope for 03-02. Logged to `.planning/phases/03-security-hardening/deferred-items.md` for Phase 4 cleanup (raise tsconfig target to ES2020 or enable `downlevelIteration`).

`npm run test:run` exits 0 (79 tests pass across 10 test files). The plan's other automated gates (grep assertions, file existence) all pass.

## Threat Register Coverage

Plan-level threat register from PLAN.md `<threat_model>`:

| Threat ID | Disposition | Status after this plan |
|-----------|-------------|------------------------|
| T4 (T-03-04) — SSRF-shape api.github.com fetch | mitigate | **Mitigated.** `grep -rn "api.github.com" src` returns no matches. |
| T5 (T-03-05) — No-op GithubSignInButton fake auth control | mitigate | **Mitigated.** File deleted; `grep -rn "GithubSignInButton" src` returns no matches. |
| T6 (T-03-06) — `<Link>...Star on GitHub...{stars}</Link>` dead chrome | mitigate | **Mitigated.** `grep -rn "Star on GitHub" src/features/auth` returns no matches; `stars` prop removed from both view components. |

**Block-on-high count: 0.** ASVS L1 gate clears.

## Threat Flags

None — the edits in this plan only **remove** surface (a network fetch, a fake auth button, dead chrome). No new endpoints, no new auth paths, no new file access, no schema changes.

## Self-Check

### Files claimed exist / are deleted

- `src/features/auth/components/github-auth-button.tsx` — `test ! -f` PASS (deleted)
- `src/features/auth/components/user-auth-form.tsx` — exists, no `GithubSignInButton` reference (verified via grep)
- `src/features/auth/components/sign-in-view.tsx` — exists, no `stars`/`Star on GitHub`/`api.github.com` (verified via grep)
- `src/features/auth/components/sign-up-view.tsx` — exists, no `stars`/`Star on GitHub`/`api.github.com` (verified via grep)
- `src/app/auth/sign-in/[[...sign-in]]/page.tsx` — exists, no `async function Page`/`api.github.com`/`stars` (verified via grep)
- `src/app/auth/sign-up/[[...sign-up]]/page.tsx` — exists, no `async function Page`/`api.github.com`/`stars` (verified via grep)
- `.planning/phases/03-security-hardening/deferred-items.md` — created (logs pre-existing prioritization.ts build error)

### Commits claimed exist

- `7290ee3` — `feat(03-02): delete github-auth-button and remove its references from user-auth-form` — present on `worktree-agent-a8d3ea82b1d40735a` (verified via `git log --oneline`)
- `c55bd09` — `feat(03-02): remove api.github.com fetch and stars chrome from auth pages` — present on `worktree-agent-a8d3ea82b1d40735a` (verified via `git log --oneline`)

## Self-Check: PASSED

## Notes for Phase 4

- The orphan `UserAuthForm` in `src/features/auth/components/user-auth-form.tsx` is not rendered anywhere in the app today. Phase 4's `DEBT-A*` starter-template cleanup should decide whether to delete it outright or wire it to a real flow.
- Surviving auth-page chrome candidates for Phase 4 scrubbing: Random Dude blockquote, generic Logo SVG, "Login"/"Sign Up" top-right link pointing to non-existent `/examples/authentication`, and the trailing open-source / "View on GitHub" / `/about` / `/terms-of-service` / `/privacy-policy` `<Link>` blocks (these targets do not exist as routes in this fork).
- `tsconfig.json` target should be raised to ES2020 (or `downlevelIteration: true` enabled) to clear the pre-existing prioritization.ts build failure logged in deferred-items.md.
