# Phase 2: Test Infrastructure - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-12
**Phase:** 2-Test Infrastructure
**Areas discussed:** DB harness approach, TEST-A3 regression strategy, Test environment split, TEST-A2 coverage scope

---

## DB harness approach

| Option | Description | Selected |
|--------|-------------|----------|
| Mock-only with vi.mock | Stub `@/lib/db` and `@/lib/db/timeline`. Tests assert call shape, not actual SQL. Fastest, simplest, matches TESTING.md's example. Schema drift between Drizzle and real Postgres goes undetected. | |
| PGlite (in-memory Postgres) | Real SQL runs in-process. Catches constraint violations, JSONB issues, pipeline-stage CHECK constraints. Requires running migrations into PGlite before each test file (~1-2s overhead). | ✓ |
| Neon ephemeral branch | Full fidelity, slowest. Overkill for the 5 load-bearing surfaces this phase targets. Better fit if Phase 2.x ever needs pgvector or real index behavior. | |
| Hybrid: mock for pure logic, PGlite for the 1-2 routes worth integration-testing | vi.mock for pure functions. PGlite for the `applications/[id]/status` route since canTransition enforcement at the API layer is the highest-priority untested surface. | |

**User's choice:** PGlite (in-memory Postgres).
**Notes:** Pure-logic tests don't need any DB harness — they get plain inputs and return plain outputs. PGlite is reserved for tests that exercise SQL. PGlite supports JSONB and text arrays natively, which Heimdall uses heavily.

### Follow-up: logTimeline verification with PGlite

| Option | Description | Selected |
|--------|-------------|----------|
| Real row in PGlite's timeline_events | Don't mock logTimeline. After the API route runs, query `timeline_events` from PGlite directly and assert the row exists. Higher fidelity. | ✓ |
| Mock logTimeline and spy on calls | Keep `vi.mock('@/lib/db/timeline')` even with PGlite. Faster, decouples timeline tests from API-route tests. | |
| Both — real row in integration tests, spy in unit tests | Mixes the two patterns explicitly. | |

**User's choice:** Real row in PGlite's timeline_events.
**Notes:** Since the `db` singleton is replaced with the PGlite instance, `logTimeline` writes to PGlite automatically — no separate mock needed.

---

## TEST-A3 regression strategy

| Option | Description | Selected |
|--------|-------------|----------|
| SSR-only structural assertion | Render `<AppSidebar />` with renderToString. Assert no `<div>` inside any `<button>`, and `UserAvatarProfile` markup present. Pure node, no jsdom. Catches both failure modes structurally. | |
| Full hydration mount with console.error spy | `@testing-library/react` + jsdom. SSR-render, then hydrateRoot, then spy on console.error for hydration warnings. Closer to actual browser failure mode but flakier — React's warning text isn't a stable API. | |
| Both: SSR structural test + hydration mount | Structural test in node catches HTML nesting deterministically. Hydration mount in jsdom catches mismatch warnings. Two tests, two environments, full coverage. | ✓ |

**User's choice:** Both — SSR structural test + hydration mount.
**Notes:** Structural test is the deterministic backstop; hydration test catches mismatch warnings. Acceptable that React's warning text could drift; structural fence protects either way.

---

## Test environment split

| Option | Description | Selected |
|--------|-------------|----------|
| Single config, per-file `// @vitest-environment` pragma | One `vitest.config.ts` defaults to `node`. The hydration-mount test gets `// @vitest-environment jsdom`. Single `npm test` command. | ✓ |
| Two configs, projects mode | Use Vitest's `projects` feature: one project for node, one for jsdom. Each has its own setup file. | |
| Single config with `environmentMatchGlobs` | Pattern-match `*.dom.test.ts` → jsdom. `environmentMatchGlobs` was deprecated in Vitest 3 in favor of projects. | |

**User's choice:** Single config + pragma.
**Notes:** One jsdom file currently — projects mode is overkill. Pragma keeps the env switch visible at the top of the one DOM file.

---

## TEST-A2 coverage scope

| Option | Description | Selected |
|--------|-------------|----------|
| Strict: only the 5 roadmap surfaces | Envelope, canTransition, logTimeline, CSV parse, bridge-score. Nothing else. | |
| Roadmap + filters.ts (parseCursor, parseLimit) | Adds ~10 lines of pure-function tests. parseCursor's date parsing is exercised by every paginated API route. | |
| Roadmap + filters.ts + seniority.ts (inferSeniority) | Adds bridge-score's input-side dependency. inferSeniority feeds the bridge score — if it drifts, bridge-score tests can pass while real recommendations rot. | ✓ |
| Roadmap + filters.ts + seniority.ts + match-connections.ts | Largest scope expansion. Phase 5 will touch match-connections; deferring there is cleaner. | |

**User's choice:** Roadmap + filters.ts + seniority.ts.
**Notes:** `match-connections.ts` and scraper modules are deferred to Phase 5 — testing them now would be discarded work.

---

## Claude's Discretion

- Husky pre-push hook integration (whether to add `npm test` alongside `bun run build`).
- Wave ordering inside Phase 2 plan.
- Whether to introduce `tsconfig.test.json`.
- Exact PGlite bootstrap mechanism (migrations vs. push vs. raw SQL).
- Per-file vs. shared PGlite instance.

## Deferred Ideas

- Auth-gate test sweep across `/api/*` routes (Phase 3).
- `match-connections.ts` and Job Leads scraper coverage (Phase 5).
- Playwright E2E test runner.
- Coverage tooling / thresholds.
- GitHub Actions CI test step.
