# Quick Task 260521-bhf: split career closeness into close-career + career - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Task Boundary

Split the single `career_contact` contact-closeness tier into two distinct tiers — `close_career` and `career` — across the Postgres enum, the bridge-score weight table, the triage UI, the contact-table filter options, and the closeness color map. Existing data must be migrated and the old `career_contact` value fully removed.
</domain>

<decisions>
## Implementation Decisions

### Enum naming & labels
- New enum values: `close_career` and `career`.
- Display labels: "Close Career" and "Career".
- Triage short labels: "Cls Career" (or similar) for `close_career`, "Career" for `career`.

### Hierarchy & bridge-score weights
- Insert both new tiers where `career_contact` (weight 45) used to sit — between `colleague` (60) and `acquaintance` (30).
- `closenessWeights`: `close_career: 50`, `career: 40`.
- Resulting order (high→low): close_friend(100), close_colleague(90), friend(75), colleague(60), **close_career(50), career(40)**, acquaintance(30), linkedin_only(15), never_met(5).
- Enum/UI ordering and color-map ordering must follow this same high→low sequence.

### Existing-data migration
- **Replace entirely**: `career_contact` is removed from the `contact_closeness` enum — no legacy value remains.
- Postgres cannot drop an enum value in place. Migration approach: create the new enum with the final value set, `ALTER ... TYPE ... USING` to cast the column, then drop the old enum type. Map the old default and every existing `career_contact` row in the cast.
- **All existing `career_contact` rows map to the lower `career` tier** (Claude's discretion, per follow-up): we cannot distinguish close vs. ordinary career contacts automatically, and the conservative choice is not to overstate closeness. Re-promoting specific people to `close_career` is a deliberate triage action the user takes afterward.
- Column default stays `acquaintance` (unchanged).

### Claude's Discretion
- Exact triage keyboard-shortcut ordering (positional 1–N): the bar grows from 8 to 9 buttons; keep them in the high→low closeness order above.
- Color choices for the two new badges in `closeness-colors.ts` — pick two visually distinct, on-theme colors (the old `career_contact` indigo can be reused for one of them).
- Whether to author the enum-swap migration as raw SQL in a Drizzle migration file vs. `db:generate` output — use whichever produces a correct, reviewable enum value removal (raw SQL is expected here since drizzle-kit does not cleanly remove enum values).
</decisions>

<specifics>
## Specific Ideas

Key files identified during discussion (must all be updated for consistency):

- `drizzle/schema/enums.ts` — `contactClosenessEnum` value list
- `drizzle/schema/contacts.ts:30` — `closeness` column (default `acquaintance` unchanged)
- `src/lib/domain/types.ts` — `contactClosenessValues` array
- `src/features/job-leads/lib/prioritization.ts:4-13` — `closenessWeights` table (replace `career_contact: 45` with `close_career: 50`, `career: 40`)
- `src/features/contacts/lib/closeness-colors.ts` — badge color map
- `src/features/contacts/components/contact-table/options.tsx` — `CLOSENESS_OPTIONS` filter labels
- `src/features/contacts/components/triage/closeness-button-bar.tsx` — `shortLabels` + positional shortcuts
- New Drizzle migration in `drizzle/migrations/` — enum swap + row remap (`career_contact` → `career`)
- Tests referencing `career_contact`: `src/app/api/contacts/import/categorize/route.test.ts`, `src/features/job-leads/lib/prioritization.test.ts` (verify/update)
</specifics>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above. Project conventions in `CLAUDE.md` apply (Drizzle query builder, Zod `z.enum(contactClosenessValues)` auto-derives, soft deletes, no raw SQL except where unavoidable — the enum migration is the sanctioned exception).
</canonical_refs>
