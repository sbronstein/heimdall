# Phase 14: Campaign Builder UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-21
**Phase:** 14-campaign-builder-ui
**Areas discussed:** Selection surface, Filter bar + data flow, Select-all at scale, List + save flow

---

## Selection surface

### Surface type

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse data-table + checkbox column | Add selection column to existing contact data-table (@tanstack supports row selection); least new code | |
| Purpose-built selection list | Custom dense list tuned for selection | ✓ |
| Triage-style one-at-a-time | Card-by-card include/skip flow | |

**User's choice:** Purpose-built selection list.

### Row fields

| Option | Description | Selected |
|--------|-------------|----------|
| Name + howMet + closeness | Core identity + relationship signals | ✓ |
| Company / role | Current company + title / at-connection | ✓ |
| Connection date | LinkedIn connection date | ✓ |
| Outreach status + last contact | Already-in-campaign / outreach state + last-contacted | ✓ |

**User's choice:** All four field groups.

### Selection persistence on filter change

| Option | Description | Selected |
|--------|-------------|----------|
| Persist across filter changes | Selections accumulate; running "N selected" tray shows full set | ✓ |
| Reset on filter change | Changing filter clears selection | |
| Persist but only within results | Survive but drop contacts filtered out of view | |

**User's choice:** Persist across filter changes.

### Default ordering

| Option | Description | Selected |
|--------|-------------|----------|
| Connection date (newest first) | Pairs with year filter | |
| Closeness (closest first) | Tier 1–2 at top; prioritizes strongest relationships | ✓ |
| Last contact (most stale first) | Re-engagement framing | |
| Name (A–Z) | Predictable, no prioritization | |

**User's choice:** Closeness (closest first).

---

## Filter bar + data flow

### Data flow

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side refetch via GET /api/contacts | Each filter change refetches; authoritative; matches Phase 13 D-08 | |
| Load-all then filter client-side | Fetch full set once, filter in memory like triage | ✓ |
| Hybrid — server filter, client refine | Server structured filters + client text search | |

**User's choice:** Load-all then filter client-side.
**Notes:** Deliberately overrides the Phase 13 D-08 plan (server-side params). Also makes persist-across-filters and select-all trivial since all matching contacts are in memory.

### Load scope

| Option | Description | Selected |
|--------|-------------|----------|
| All non-archived contacts | Every contact where archived_at is null (~1500) | ✓ |
| Non-archived, excluding triage-pending | Only triaged contacts | |
| Non-archived, paginated lazy-load | Chunked load | |

**User's choice:** All non-archived contacts.

### Filter controls + outreach-status default

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse button-bars; default-hide already-contacted | Reuse ConnectionYearFilter + ClosenessButtonBar + howMet + outreach-status; default to "not yet contacted" | ✓ |
| Reuse button-bars; show all statuses by default | Same controls, no default status filter | |
| Build fresh filter controls | Purpose-built bar, duplicate working controls | |

**User's choice:** Reuse button-bars; default-hide already-contacted.

---

## Select-all at scale

### Select-all semantics

| Option | Description | Selected |
|--------|-------------|----------|
| All rows matching the current filter | Adds every contact in active filtered view to tray, additive | ✓ |
| All loaded contacts (ignore filter) | Selects entire ~1500 set regardless of filter | |
| All matching + a clear-all toggle | Matching current filter, toggles to deselect-all-in-filter | |

**User's choice:** All rows matching the current filter.

### Tray management

| Option | Description | Selected |
|--------|-------------|----------|
| Review list + remove individuals + clear-all | Expand tray, remove people, reset | ✓ |
| Count + clear-all only | Running count + clear-all; re-find to remove one | |
| Count only | Just a live number | |

**User's choice:** Review list + remove individuals + clear-all.

---

## List + save flow

### Campaign list layout

| Option | Description | Selected |
|--------|-------------|----------|
| Cards with progress bar + count badges | Per-campaign card with segmented progress for selected·generated·approved·drafted | ✓ |
| Data-table rows | Reuse data-table, counts as columns | |
| Compact list rows | Stacked rows + inline count chips | |

**User's choice:** Cards with progress bar + count badges.

### Create-form placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inline panel on the builder | Name + goal on the same builder screen; one screen to filter/select/name/save | ✓ |
| Dialog on Save | Modal asks name + goal at save time | |
| Separate first step | Name + goal on a dedicated screen first | |

**User's choice:** Inline panel on the builder.

### Save target (review page is Phase 15)

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal placeholder review page | Thin /dashboard/outreach/[id]: header + pending contacts list | ✓ |
| Navigate back to the campaign list | Return to /dashboard/outreach/ | |
| Toast + stay on builder | Confirm + reset builder | |

**User's choice:** Minimal placeholder review page.

### Save guards

| Option | Description | Selected |
|--------|-------------|----------|
| Require name + at least 1 contact | Disable Save until name + ≥1 contact | ✓ |
| Require goal/instruction too | Also require goal field | |
| Handle partial-failure on bulk-add | Surface error if create succeeds but bulk-add fails | |
| Disable double-submit | Disable Save while POSTs in flight | |

**User's choice:** Require name + at least 1 contact (goal optional).
**Notes:** Partial-failure handling and double-submit disabling were not user-mandated but captured as planner-discretion correctness items (CD-01, CD-02 in CONTEXT.md).

---

## Claude's Discretion

- Disable Save during in-flight POSTs (anti double-submit) — CD-01.
- Partial-failure path when create succeeds but bulk-add fails — CD-02.
- Component file locations under `src/features/outreach/components/` — CD-03.
- Closeness ordering implemented client-side over loaded set — CD-04.
- Empty/loading states (skeleton + empty-match copy) — CD-05.
- Goal/instruction field placeholder/help text — CD-06.

## Deferred Ideas

- Rich review/edit/approve UI — Phase 15.
- Free-text name search within the selection list — not chosen (hybrid option declined).
- Server-side paginated contact loading for the builder — rejected for load-all client-side; revisit if payload grows.
- First-class "re-target already-contacted" mode — default-hidden for now.
