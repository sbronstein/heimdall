# Phase 6: Performance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-14
**Phase:** 6-performance
**Areas discussed:** Restore matchConnections caller (PERF-A2), Bulk update mechanism for PERF-A3, DB-side dedup model for PERF-A5, Phase scope: incidental N+1s + ROADMAP SC refresh

---

## Restore matchConnections caller (PERF-A2)

### Sub-question 1: Where should bridge-building (matchConnections) happen post-Phase-5?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline inside POST /prospects | After bulk prospect insert, call matchConnections() in the same handler. One HTTP call from skill, atomic. PERF-A2 lands inside this newly-active path. | ✓ |
| New endpoint the skill calls after /prospects | POST /api/job-leads/[id]/match. Skill calls /prospects then /match. More skill changes; bridge build can fail independently. | |
| Delete match-connections.ts; drop PERF-A2 | Treat as quietly retired in Phase 5. Recommendations/triage cleaned up. PERF-A2 marked superseded. | |
| Skill computes + sends bridges in the prospects payload | Skill fetches contacts manifest first, computes match, sends prospects + bridgeData in one POST. Heavier skill, lighter server. | |

**User's choice:** Inline inside POST /prospects
**Notes:** Most natural restoration of the caller Phase 5 orphaned. Single HTTP call from skill perspective, atomic operation. PERF-A2 work becomes meaningful inside the now-active path.

### Sub-question 2: Failure mode if matchConnections fails inside POST /prospects?

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic transaction: rollback prospects too | Wrap insert + bridge insert + status flip in db.transaction(). Bridges fail → prospects roll back → status stays 'searching' → skill sees 500 and retries. | ✓ |
| Best-effort bridges: prospects commit, bridges logged-and-skipped | Status flips to 'found' regardless of bridge outcome. User can manually retry matching later. | |
| Sequential, status reflects partial state | Status flips to 'failed' with last_error if bridges fail; prospects already committed. | |

**User's choice:** Atomic transaction: rollback prospects too
**Notes:** No partial state ever observed by UI. Neon HTTP driver supports db.transaction() — statements coalesced into one transactional HTTP request.

---

## Bulk update mechanism for PERF-A3

### Sub-question: How should the bulk categorize update be implemented?

| Option | Description | Selected |
|--------|-------------|----------|
| UPDATE ... FROM unnest($ids, $closenesses) | Single SQL statement via Drizzle's sql template tag. One round-trip, idiomatic Postgres. | ✓ |
| db.transaction([...]) with N db.update calls | Neon HTTP batches the transaction into one request. Stays inside Drizzle query builder. Still N statements server-side. | |
| CASE WHEN single UPDATE via sql template | UPDATE ... SET closeness = CASE WHEN id = X THEN 'a' ... END. One round-trip but unwieldy for 1500 rows. | |

**User's choice:** UPDATE ... FROM unnest($ids, $closenesses)
**Notes:** sql template tag inside db.execute() is the documented escape from CLAUDE.md's "no raw SQL" guard (which targets handwritten string-concatenated SQL). Idiomatic Postgres pattern.

---

## DB-side dedup model for PERF-A5

### Sub-question: How should dedup move to the DB for /api/contacts/import?

| Option | Description | Selected |
|--------|-------------|----------|
| UNIQUE on linkedin_url + narrowed SELECT for name+company | Partial UNIQUE on contacts(linkedin_url) WHERE NOT NULL. Bulk insert with ON CONFLICT DO NOTHING on URL. Name+company dedup stays in-app but uses narrowed SELECT (only CSV tuples), not a full scan. | ✓ |
| UNIQUE on linkedin_url only; drop name+company dedup | Same UNIQUE. Remove the name+company guard entirely. Simpler code; weaker dedup for URL-less rows. | |
| UNIQUE on both: linkedin_url AND (lower(first), lower(last), lower(coalesce(company,''))) | Two UNIQUE constraints. Bulk-insert ON CONFLICT covers both. Risk: legitimately different people sharing name+company over time would collide. | |

**User's choice:** UNIQUE on linkedin_url + narrowed SELECT for name+company
**Notes:** Keeps the slightly-fuzzy name+company guard (catches CSV rows missing a URL) without the schema collision risk. Same narrowing pattern applied to match-connections.ts (narrowed SELECT keyed on mutual-connection name tokens, not full scan).

---

## Phase scope: incidental N+1s and ROADMAP SC refresh

### Sub-question: Which incidentals should Phase 6 include vs defer?

| Option | Description | Selected |
|--------|-------------|----------|
| Refresh ROADMAP SC #1 wording | Update ROADMAP.md SC #1 to point at the actual current prospect-insert path (/api/job-leads/[id]/prospects) and mark that half satisfied. Pure docs hygiene. | ✓ |
| Fold in /api/contacts/import bulk-insert | The ON-CONFLICT change for PERF-A5 only delivers perf if surrounding for-loop becomes a bulk insert. Per-row error reporting drops; aggregate counts replace it. | ✓ |
| Fold in recommendations bridge-score N+1 | Convert recommendations/route.ts:44-52 for-loop to bulk UPDATE via unnest, OR drop persistence and compute on-the-fly. Planner picks. | ✓ |
| Keep phase strictly to PERF-A1..A5 as listed | Don't touch incidentals. ROADMAP wording stays stale; the two N+1s remain open or move to a follow-up phase. | |

**User's choice:** All three folds (Refresh ROADMAP SC #1, Fold contacts/import bulk-insert, Fold recommendations N+1)
**Notes:** All three folds confirmed. ROADMAP SC #1 wording refresh ships in the same commit as the Plan 2a (POST /prospects refactor) since it documents the same change. Contacts/import bulk-insert is required co-fix for PERF-A5. Recommendations N+1 is the same pattern family as the named PERF-A* items.

---

## Claude's Discretion

- Exact parameter-binding shape for the `UPDATE ... FROM unnest()` SQL (Drizzle's `${array}` interpolation vs `ARRAY[...]` literal) — planner picks per Drizzle docs.
- Whether `matchConnections` signature changes to accept a `tx` handle, or remains free-standing inside the outer transaction — both work for atomicity.
- Whether the recommendations N+1 (D-15) persists scores up-front or computes on-the-fly — decided by grep evidence on other consumers of `prospectBridges.score`.
- Index naming convention (`idx_contacts_archived_at` vs `contacts_archived_at_idx`) — match existing Drizzle migration output.

---

## Deferred Ideas

- **`pg_trgm` GIN indexes for `ilike` search** across `/api/search` and list routes (companies, contacts, notes, applications, recruiters) — REQUIREMENTS.md PERF-A4 mentions "investigate"; not locked by ROADMAP SC. v2 work item.
- **Server-side fuzzy matching in `match-connections.ts`** via `pg_trgm similarity()` or FTS — heavier dependency; D-11's narrowed SELECT is sufficient for 1500-contact dataset.
- **Materialized view for `recommendations`** — bulk-insert + bulk-update + indexes deliver the required perf without a new abstraction.
- **Row-granular error reporting on `/api/contacts/import`** — traded for aggregate counts under D-10; revisit if UX requirement emerges.
- **`prospectBridges(prospect_id)` and `(contact_id)` standalone indexes** — recommendations/triage joins; planner research item if joins lag.
- **`prospectBridges.score` column retirement** — if D-15 picks the on-the-fly variant, follow-up cleanup, not Phase 6 scope.
- **`CREATE INDEX CONCURRENTLY`** — overkill for single-user + 1500-row tables; plain CREATE INDEX is fine and Drizzle-migration-compatible.
