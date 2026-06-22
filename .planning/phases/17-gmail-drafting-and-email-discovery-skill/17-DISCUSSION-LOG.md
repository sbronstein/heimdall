# Phase 17: Gmail Drafting and Email Discovery Skill - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-22
**Phase:** 17-Gmail Drafting and Email Discovery Skill
**Areas discussed:** Draft route gap, Idempotent re-draft, Discovery + candidates, Run modes + safety

---

## Draft route gap

| Option | Description | Selected |
|--------|-------------|----------|
| Fix /draft to do all 4 | One PATCH (gmailDraftId) also transitions status→drafted via canEmailTransition + sets contact outreachStatus→reached_out, atomic + one timeline event. Mirrors Phase 16 D-02. | ✓ |
| Skill makes 2 calls | Leave /draft as-is; skill calls /draft then /status{drafted}. No endpoint for contact outreachStatus; 2 timeline events; non-atomic window. | |

**User's choice:** Fix /draft to do all 4
**Notes:** Keeps all DB invariants server-side; matches the established route-gap fix pattern from Phase 16. Becomes the single code change outside `.claude/skills/`. (D-01)

---

## Idempotent re-draft

| Option | Description | Selected |
|--------|-------------|----------|
| Update-or-recreate, research-gated | Researcher confirms whether Gmail MCP has a draft-update tool. Yes → update in place. No → create fresh + repoint gmailDraftId (old draft left harmless). Re-draft signal = status=approved AND gmailDraftId set. | ✓ |
| Defer in-place re-draft | v1.2 only drafts emails with no gmailDraftId; editing-after-draft out of scope. Fails success #4 as written. | |
| Delete + recreate | Always delete old then create new. No delete_draft tool visible in MCP. | |

**User's choice:** Update-or-recreate, research-gated
**Notes:** Satisfies success #4's intent under either MCP capability with zero send risk. (D-02)

---

## Discovery + candidates

### Where ambiguous candidates surface

| Option | Description | Selected |
|--------|-------------|----------|
| Run-summary + LinkedIn fallback | Ambiguous → don't guess; list contact + candidate addresses in end-of-run summary for manual resolution; no new schema/UI. Mirrors Phase 16 D-08. | ✓ |
| Build minimal candidate UI | Add candidates JSONB column + dropdown in email-review-card. Truer to DISC-02 wording but pulls schema + UI work into this phase. | |
| Auto-pick highest confidence | Skill writes top-ranked candidate even when ambiguous. Risks wrong draft recipient. | |

**User's choice:** Run-summary + LinkedIn fallback
**Notes:** Keeps Phase 17 schema-frozen; ambiguous emails left with recipient unset (not forced to linkedin_message since an email likely exists). Durable candidate-picker UI deferred. (D-04)

### Confidence / accept rule

| Option | Description | Selected |
|--------|-------------|----------|
| Roadmap's two pairs | Accept on (name + company domain) OR (confirmed thread participant). | |
| Stricter — require direct thread | Accept only addresses that were a direct to/from participant with Steve; ignore domain-name inference. Fewer false positives. | ✓ |
| Let research propose | Treat 2-signal rule as a starting point; researcher proposes exact scoring after inspecting real MCP output. | |

**User's choice:** Stricter — require direct thread
**Notes:** One clean direct-thread address → accept; multiple → ambiguous (run-summary); none → LinkedIn fallback. Research informs extraction mechanics, not the threshold. (D-03)

---

## Run modes + safety

### Invocation shape

| Option | Description | Selected |
|--------|-------------|----------|
| Single batch, discover-then-draft | `draft-outreach-emails <campaign-id>` runs full flow with one upfront count-confirm gate. Mirrors Phase 16. | ✓ |
| Split modes too | Also support --discover-only / --draft-only. More control, more surface area. | |

**User's choice:** Single batch, discover-then-draft
**Notes:** Consistency with the sibling Phase 16 skill; simpler. (D-05)

### Send-safety enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| Documented allowlist + grep gate | SKILL.md declares a Gmail-tool allowlist + a pre-run "grep for send" checklist. MCP has no send tool (defense-in-depth). | ✓ |
| Add a preview/dry-run gate too | All of the above PLUS a mandatory content-preview step before creating real drafts (like Phase 16's sample gate). | |

**User's choice:** Documented allowlist + grep gate
**Notes:** No content preview gate beyond the upfront count confirm; drafts are reviewable in Gmail and content was already human-approved in Phase 15. (D-06)

---

## Claude's Discretion

- Per-email failure handling (mark-failed-and-continue, consistent with Phase 16 D-12; confirm the `approved → failed` transition legality with the state machine).
- End-of-run summary format/content (counts + ambiguous-candidate list).
- Archived-contact edge case (skip drafting + report, per REV-06 guard).
- Discovery batching/pacing and exact `search_threads` query construction.

## Deferred Ideas

- Durable candidate-picker UI (candidates JSONB column + dropdown) — the literal DISC-02 reading; deferred for v1.2.
- `--discover-only` / `--draft-only` split modes — dropped for batch-only consistency.
- Content preview / sample gate before creating real drafts — dropped; drafts reviewable in Gmail.
