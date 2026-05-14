---
phase: 05-job-leads-completion
plan: 02
subsystem: auth
tags: [clerk, middleware, bearer-token, sha256, web-crypto, edge-runtime, tsx, env]

# Dependency graph
requires:
  - phase: 03-api-surface
    provides: src/proxy.ts Clerk middleware + isApiPath branch returning {success,error} envelope
provides:
  - Long-lived bearer-token bypass for /api/* (single-user gated)
  - One-time token generation script writing to ~/.heimdall/api-token
  - env.example.txt placeholders for API_TOKEN_HASH and SINGLE_USER_EMAIL
  - npm run token:generate entry point
affects: [05-job-leads-completion, claude-code-skill, agent-browser]

# Tech tracking
tech-stack:
  added:
    - "crypto.subtle.digest (Web Crypto, Edge-runtime compatible) — for SHA-256 in middleware"
    - "node:crypto randomBytes + createHash — for one-time token generation in the script"
  patterns:
    - "Edge-runtime SHA-256 via Web Crypto (no node:crypto import in middleware)"
    - "Multi-tenant safety gate: bypass refuses unless SINGLE_USER_EMAIL === ALLOWED_EMAIL"
    - "Silent short-circuit on bypass success (no token logging anywhere)"
    - "Per-machine secret pattern: plaintext on disk (chmod 600), hash in env"

key-files:
  created:
    - "scripts/generate-api-token.ts"
    - ".planning/phases/05-job-leads-completion/05-02-SUMMARY.md"
  modified:
    - "src/proxy.ts"
    - "src/proxy.test.ts"
    - "env.example.txt"
    - "package.json"

key-decisions:
  - "Web Crypto (crypto.subtle.digest) used in middleware — Edge-compatible, avoids 'node:crypto' import that fails in Next.js Edge runtime"
  - "Bypass is /api/*-only — Authorization header is IGNORED on /dashboard/* (browser path keeps Clerk redirect UX)"
  - "On invalid token / missing env gate the middleware falls through silently to existing Clerk session check — preserves the same 401 envelope, no new error code"
  - "Token file at ~/.heimdall/api-token (chmod 600); .env.local holds only the SHA-256 hash; plaintext never logged"
  - "package.json script uses bare 'tsx' (not 'npx tsx') — matches the deferred Phase 5 convention; tsx is reachable through node_modules .bin from npm script context (drizzle/seed.ts uses npx tsx as the older pattern)"

patterns-established:
  - "Edge-runtime auth bypass pattern: read request header → hash with Web Crypto → compare to env hash → SINGLE_USER_EMAIL gate → pass-through or fall through silently"
  - "Per-machine local secret pattern: plaintext on disk (~/.heimdall/<name>, chmod 600), SHA-256 hash in .env.local, parent dir chmod 700"

requirements-completed: [JL-B3]

# Metrics
duration: 12min
completed: 2026-05-14
---

# Phase 05 Plan 02: Middleware bearer-token bypass + token-gen script Summary

**Long-lived bearer-token bypass on /api/* using Web Crypto SHA-256, gated by SINGLE_USER_EMAIL, plus a one-time token-generation script writing to ~/.heimdall/api-token (chmod 600).**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-14T07:57Z (worktree branch check + npm install)
- **Completed:** 2026-05-14T08:02Z
- **Tasks:** 2 (one TDD-split into RED + GREEN commits)
- **Files modified:** 4 (1 created, 3 modified) — plus the test file
- **Commits:** 3 atomic task commits (RED test, GREEN impl, script + env + npm)

## Accomplishments

- `src/proxy.ts` now accepts `Authorization: Bearer <token>` as an alternative to Clerk session cookies on `/api/*` paths, validated by SHA-256(token) === `process.env.API_TOKEN_HASH` AND `process.env.SINGLE_USER_EMAIL === 'steve@bronstein.org'`.
- `/dashboard/*` is unchanged — the bearer header is ignored on browser paths, preserving Clerk's redirect UX.
- `scripts/generate-api-token.ts` produces a fresh 32-byte hex token, writes it to `~/.heimdall/api-token` (chmod 600, parent dir chmod 700), and prints the SHA-256 hash + reminder text to stdout — never the plaintext token.
- `env.example.txt` documents `API_TOKEN_HASH=` and `SINGLE_USER_EMAIL=` under a new "Heimdall Service-Token Bypass (Phase 5)" section with usage notes.
- `package.json` adds `"token:generate": "tsx scripts/generate-api-token.ts"`.
- Five new test cases (`describe('proxy (F): bearer-token bypass for /api/* skill traffic')`) verify the four decision paths: valid → pass-through (and Clerk auth NOT invoked); invalid → fall-through 401 envelope; no header → existing Clerk-only behavior preserved; `SINGLE_USER_EMAIL` unset → bypass refused (multi-tenant safety); `/dashboard/*` ignores the bearer header.

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for bearer-token bypass** — `2790534` (test)
2. **Task 1 (GREEN): Middleware bearer-token bypass implementation** — `5584022` (feat)
3. **Task 2: Token generation script + env example + npm script** — `a9b4169` (feat)

_Note: Task 1 was TDD (tdd="true") so it split into two commits — RED (failing test) and GREEN (passing impl). No REFACTOR commit was needed; the `sha256Hex` helper is local, single-purpose, and well-named on first write._

## Files Created/Modified

- **CREATED** `scripts/generate-api-token.ts` — one-time token generator (`randomBytes(32).toString('hex')` → SHA-256 hash → file write to `~/.heimdall/api-token` with mode 0o600 → print hash to stdout, never the plaintext).
- **MODIFIED** `src/proxy.ts` — added Edge-compatible `sha256Hex` helper using `crypto.subtle.digest('SHA-256', ...)`; inserted bypass block inside the `isApiPath` branch BEFORE the existing `await auth()` call.
- **MODIFIED** `src/proxy.test.ts` — wired `authSpy` on the Clerk-mock `auth()` callable; added `describe('proxy (F): bearer-token bypass for /api/* skill traffic')` with 5 `it(...)` cases.
- **MODIFIED** `env.example.txt` — added "Heimdall Service-Token Bypass (Phase 5)" section with `API_TOKEN_HASH=` and `SINGLE_USER_EMAIL=` placeholder lines.
- **MODIFIED** `package.json` — added `"token:generate": "tsx scripts/generate-api-token.ts"` to the scripts block.

## Decisions Made

- **Web Crypto in middleware, node:crypto in script.** `src/proxy.ts` runs in the Next.js Edge runtime where `import { createHash } from 'crypto'` fails. Used `crypto.subtle.digest('SHA-256', ...)` instead (per plan PATTERNS.md guidance). `scripts/generate-api-token.ts` runs in Node and uses `randomBytes` + `createHash` directly.
- **Fall-through, not 401, on invalid token.** When the bearer header is present but the hash doesn't match (or `SINGLE_USER_EMAIL` is unset), the middleware does not return a new 401 — it lets the existing Clerk session check fire. This keeps a single 401 envelope shape across all unauthenticated paths, per CD-02.
- **`authSpy` added to the Clerk mock.** Pre-existing tests only had `protectSpy` on `auth.protect()`. The new pass-through assertion needed to check that the callable `auth()` was NOT invoked (the bypass short-circuits BEFORE Clerk runs). Added a `vi.fn()` `authSpy` recorded inside the mock's `auth = Object.assign(async () => { authSpy(); ... }, ...)`. This is a backward-compatible test-only addition; existing tests still pass.
- **`vi.stubEnv` + `afterEach(vi.unstubAllEnvs)` for hermetic env state.** Vitest 4 standard pattern; avoids mutating `process.env` directly which would leak across tests.

## Deviations from Plan

None — plan executed exactly as written.

The plan was thorough: every artifact, acceptance grep, and threat-model mitigation was directly implementable. Prettier (pre-commit hook) reformatted one multi-line console.log in the script and adjusted some whitespace in the test file — neither affects behavior.

## Issues Encountered

- **Worktree had no `node_modules`.** First action after the branch check was `npm install` (788 packages, 8s, offline cache). Worktrees are created without symlinking node_modules from the main repo; running `npm install` in the worktree is the standard recovery.
- **`process.env.SINGLE_USER_EMAIL=''` semantics.** In one test the gate is "explicitly unset" — `vi.stubEnv('SINGLE_USER_EMAIL', '')` produces an empty string, not `undefined`. The middleware's `singleUser === ALLOWED_EMAIL` comparison still fails because `'' !== 'steve@bronstein.org'`, so the bypass is correctly refused. Equivalent behavior to `undefined` for this gate.

## Verification Confirmation (per plan output spec)

- `npm run test:run -- src/proxy.test.ts` → **passes** (13 tests; was 8 pre-plan, added 5 in suite F).
- `npm run test:run` (full suite) → **passes** (106 tests, 12 files).
- Test count delta: **+5 `it(...)` cases** under the new `describe('proxy (F): ...')` block (5 of 6 describe blocks before; 6 of 6 now).
- Manual `npm run token:generate` smoke ran against `HOME=$(mktemp -d)` — wrote a 64-char hex token to a `chmod 600` file in a `chmod 700` parent dir, printed the SHA-256 hash to stdout. Round-trip (hash from script == `node -e "createHash('sha256').update(<token>).digest('hex')"`) **matches**. No write to the user's real `~/.heimdall/api-token` — the user runs the actual command themselves when they want to issue a new token.

## Threat Model Disposition

Per the plan's `<threat_model>`:

| Threat ID | Disposition | How it was mitigated in this plan |
|-----------|-------------|-----------------------------------|
| T-05-02-01 (spoofing — bypass) | mitigate | SHA-256 hash compared via `crypto.subtle.digest`; plaintext never stored in repo or env |
| T-05-02-02 (multi-tenant misuse) | mitigate | `process.env.SINGLE_USER_EMAIL === ALLOWED_EMAIL` gate verified by test F-4 |
| T-05-02-03 (info disclosure in logs) | mitigate | Middleware short-circuits silently (no `console.*` in proxy.ts); script prints only hash + token path, never plaintext; token file chmod 600 confirmed via smoke test |
| T-05-02-04 (token replay) | accept | Per CONTEXT.md `<deferred>` — long-lived per-machine secret; rotation is manual (regenerate + update env) |
| T-05-02-05 (env.example accidental real-secret commit) | mitigate | `env.example.txt` shows placeholder text only (`API_TOKEN_HASH=` + `# Example:` comment); `.env.local` remains gitignored |

No new threat flags introduced — the bypass surface was already enumerated in the plan's threat model and is fully covered.

## User Setup Required

The user must, on their development machine (once, before invoking the Claude Code skill in Plan 06):

1. Run `npm run token:generate` (from the project root).
2. Copy the printed `API_TOKEN_HASH=<hash>` line into `.env.local`.
3. Confirm `SINGLE_USER_EMAIL=steve@bronstein.org` is set in `.env.local` (the script prints a reminder).
4. Restart the dev server so the new env vars are picked up.

The plaintext token at `~/.heimdall/api-token` will be read by the skill (Plan 06) and sent as the `Authorization: Bearer <contents>` header on REST writes.

## Next Phase Readiness

Plan 05-02 is the auth path that unblocks Plan 05-06 (the Claude Code skill). With this in place:

- Skill can authenticate to `/api/*` via the bearer header without a browser session.
- The middleware's existing email-lock + Clerk redirect path remains the source of truth for browser traffic — no behavioral change for users in the browser.
- No blockers for the remaining Phase 5 plans (`05-03` schema migration, `05-04` API endpoints, `05-05` UI changes, `05-06` skill assets).

## Self-Check: PASSED

- File `src/proxy.ts` exists and contains `sha256Hex` + bearer bypass block — **FOUND**.
- File `src/proxy.test.ts` exists with the new `describe('proxy (F):` block — **FOUND**.
- File `scripts/generate-api-token.ts` exists — **FOUND**.
- File `env.example.txt` contains `API_TOKEN_HASH=` and `SINGLE_USER_EMAIL=` placeholders — **FOUND**.
- File `package.json` contains `"token:generate"` script entry — **FOUND**.
- Commit `2790534` (test RED) — **FOUND** in `git log`.
- Commit `5584022` (feat GREEN proxy.ts) — **FOUND** in `git log`.
- Commit `a9b4169` (feat script + env + npm) — **FOUND** in `git log`.
- Full test suite `npm run test:run` exits 0 with 106/106 tests passing — **CONFIRMED**.

---
*Phase: 05-job-leads-completion*
*Completed: 2026-05-14*
