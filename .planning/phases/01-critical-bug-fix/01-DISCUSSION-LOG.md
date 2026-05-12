# Phase 1: Critical Bug Fix - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 1-critical-bug-fix
**Areas discussed:** Sweep scope, Verification approach, Pre-existing edits, Dirty-tree handling

---

## Sweep scope

| Option | Description | Selected |
|--------|-------------|----------|
| Two files only | Fix only user-avatar-profile.tsx:31 and user-nav.tsx:38 — the two unsafe emailAddresses[0] sites grep already found. Smallest surface, matches REQUIREMENTS exactly. | ✓ |
| Email sweep | Also grep for any other unguarded Clerk user.* property chains (firstName, primaryEmailAddress, etc.) and fix any unsafe ones found. | |
| Full hydration audit | Two files + grep for any other useUser()/useAuth() conditional renders that could cause SSR/CSR mismatches anywhere in the sidebar or layout chrome. | |

**User's choice:** Two files only
**Notes:** Phase scope is intentionally narrow. Wider sweeps belong in a different audit phase if needed.

---

## Verification approach

| Option | Description | Selected |
|--------|-------------|----------|
| Smoke + targeted | Start dev server, load /dashboard/overview and /dashboard/networking, confirm no React hydration warnings + sidebar links navigate. Don't need to repro the 1500-import. | ✓ |
| Repro the broken state | Reproduce the original crash by manually invoking a no-email Clerk user state (mock or DevTools override) and confirm UserAvatarProfile renders cleanly. | |
| Trust the fix | Structural fix is mechanical. No browser verification — ship it. Phase 2 will add the regression test anyway. | |

**User's choice:** Smoke + targeted
**Notes:** Regression test (TEST-A3) is owned by Phase 2 — this phase is verified by hand.

---

## Pre-existing edits

| Option | Description | Selected |
|--------|-------------|----------|
| Audit then accept | Read the current state of user-avatar-profile.tsx and app-sidebar.tsx, confirm the <span> migration and guard removal match the fix bug.md prescribed, then keep them. Commit them as part of Phase 1 alongside the BUG-02 guards. | ✓ |
| Revert and redo | Git restore the two files, then re-apply the full fix from scratch in a controlled Phase 1 plan. Cleaner history; throws away working changes. | |
| Trust and complete | Don't re-audit — assume the working-tree edits are correct, just add the BUG-02 guards and commit everything together. | |

**User's choice:** Audit then accept
**Notes:** Cheap insurance — a quick read confirms the existing edits match the bug.md prescription before they ride into a commit.

---

## Dirty-tree handling

| Option | Description | Selected |
|--------|-------------|----------|
| Surgical commits | Phase 1 only stages and commits the BUG-01/BUG-02 files. Leave the others untouched in the working tree for now — they belong to Phase 5 (Job Leads) and other phases. Use targeted `git add <file>` per file. | ✓ |
| Stash unrelated | git stash push the unrelated files before Phase 1 work, do the fix and commit cleanly, then git stash pop after. | |
| Commit unrelated first | Make a separate WIP commit on the dirty Job Leads / package changes first (or stash them), then start Phase 1. | |

**User's choice:** Surgical commits
**Notes:** Phase 5 (Job Leads) owns the scrape-related dirty files; package.json/lock and docs/summary.md are unclear ownership but stay untouched this phase.

---

## Claude's Discretion

- Commit message wording.
- Whether to combine BUG-01 and BUG-02 into one commit or split (recommended: split per requirement for clean revert).
- Order of edits within the patch.

## Deferred Ideas

- Codebase-wide hydration audit of `useUser()` / `useAuth()` conditional renders.
- Codebase-wide unsafe Clerk-property sweep (firstName, primaryEmailAddress, etc.).
- Programmatic no-email user repro harness for Phase 2 testing.
- Hydration regression test (TEST-A3) — owned by Phase 2.
- Unrelated dirty files: Job Leads scrape work (Phase 5), package.json/lock changes (owner TBD), docs/summary.md, .planning/config.json.
