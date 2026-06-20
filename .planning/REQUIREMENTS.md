# Requirements: Heimdall — v1.2 Networking Outreach Campaigns

**Defined:** 2026-06-20
**Core Value:** The owner can run their entire executive job search from one place — track companies, log interactions, move applications through pipeline stages, and surface the highest-value introduction paths for any role — without leaving the app.

**Milestone goal:** Run targeted networking-email campaigns end to end from Heimdall — filter and select contacts, let a skill draft personalized emails, review/edit/approve each, then push approved ones to Gmail as drafts. **Nothing ever sends automatically.**

## v1.2 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase (see Traceability).

### Campaigns (CAMP) — selection & persistence

- [ ] **CAMP-01**: User can filter contacts by how they know them (`howMet`) when building a campaign
- [ ] **CAMP-02**: User can filter contacts by connection year / date range (`linkedinConnectionDate`) when building a campaign
- [ ] **CAMP-03**: User can filter contacts by closeness tier when building a campaign
- [ ] **CAMP-04**: User can filter contacts by outreach status when building a campaign
- [ ] **CAMP-05**: User can checkbox-multi-select contacts (including select-all within the current filter) to choose recipients
- [ ] **CAMP-06**: User can create a named campaign with a goal/instruction that drives generation
- [ ] **CAMP-07**: Saving a campaign persists the selected contacts as one `outreach_email` row per contact in a single bulk insert, deduped so a contact can't be added twice
- [ ] **CAMP-08**: User can view a list of campaigns with per-campaign progress (selected / generated / approved / drafted counts)

### Triage (TRGE) — connection-date filter

- [ ] **TRGE-01**: User can filter the existing triage workflow by connection year / date range (e.g. 2021–2022 to surface people met at a given company)

### Generation (GEN) — AI email drafting skill

- [ ] **GEN-01**: User can run a skill that generates a subject line + body for every pending email in a campaign
- [ ] **GEN-02**: Generated emails are personalized from CRM context (`howMet`, company/role, closeness, prior interactions) plus the campaign goal
- [ ] **GEN-03**: Generation calibrates tone to closeness tier and follows the owner's voice conventions, including an LLM-tell scan (reusing `tailor-application-materials` style references)
- [ ] **GEN-04**: Generation references only history present in the provided contact context (no hallucinated shared history); low-context contacts are flagged for extra review
- [ ] **GEN-05**: All generation runs in the skill (never in an API route); the API only enqueues `pending` rows and accepts write-back

### Review & Approval (REV)

- [ ] **REV-01**: User can review each generated email (subject + body) for a campaign in the UI
- [ ] **REV-02**: User can edit a generated email inline (subject and body)
- [ ] **REV-03**: User can regenerate a single email (resets it to `pending` for the skill to redo)
- [ ] **REV-04**: User can approve an email; only approved emails advance to drafting (approve gate)
- [ ] **REV-05**: Email status lifecycle (`pending → generated → edited → approved → drafted`, plus `failed`) is validated at the API boundary via a `canEmailTransition()` state machine
- [ ] **REV-06**: Contacts with no email found show a "needs LinkedIn message" badge; archived contacts show an "archived" badge that blocks approval

### Email Discovery (DISC)

- [ ] **DISC-01**: For approved emails on contacts without a stored address, the drafting skill discovers an email via Gmail thread search (`mcp__gmail__search_threads` / `get_thread`)
- [ ] **DISC-02**: Discovery requires at least two matching signals; ambiguous multi-match candidates surface in the review UI for manual selection; a discovered address is written back to the email row
- [ ] **DISC-03**: When no email is found by any method, the contact is flagged for a LinkedIn message (`channel = linkedin_message`) — never silently dropped

### Gmail Drafting (DRFT)

- [ ] **DRFT-01**: User can run a skill that creates a Gmail draft for each approved email that has a recipient
- [ ] **DRFT-02**: The drafting skill NEVER sends — it only ever calls `create_draft` (hard safety invariant; verified by a code-review/grep checklist before any real run)
- [ ] **DRFT-03**: Drafting is idempotent — re-running does not create duplicate drafts (checks `gmailDraftId`; updates the existing draft in place when re-drafting an edited email)
- [ ] **DRFT-04**: Each created draft stores the Gmail draft id back on the email, marks it `drafted`, and logs a `timeline_events` row
- [ ] **DRFT-05**: Drafting an email updates the contact's `outreachStatus` to `reached_out`

## Future Requirements (v1.x / v2)

Deferred to a future release. Tracked but not in this roadmap.

### Discovery

- **DISC-F1**: Google Contacts / People API lookup as a supplementary discovery source (requires separate People API MCP/OAuth setup) — add only if Gmail-search discovery rate proves insufficient

### Campaigns

- **CAMP-F1**: Campaign analytics — reply rate, meeting-booked rate (useful after several campaigns have run)
- **CAMP-F2**: Auto-create a follow-up task when a draft is created

### Outreach

- **OUT-F1**: LinkedIn message composition assistance for `linkedin_message`-channel contacts (manual LinkedIn message from the review badge is the v1.2 path)
- **VEC-01/02**: pgvector semantic search over notes/interactions/JDs (existing v2 backlog)

## Out of Scope

Explicitly excluded. Anti-features documented to prevent scope creep — several are hard safety boundaries.

| Feature | Reason |
|---------|--------|
| Auto-send / any `messages.send` or `drafts.send` call | **Hard safety invariant** — the system only ever creates drafts; the owner sends manually in Gmail |
| Sending email from within Heimdall | Drafts-only by design (owner's choice); review and send happen in Gmail |
| Email open / click tracking pixels | Destroys the personal tone of VP-level 1:1 outreach |
| CAN-SPAM unsubscribe blocks | This is personal correspondence, not marketing |
| Bulk generate-all then auto-approve | Defeats the approve gate; every email gets human review |
| Email template library with merge fields | AI generation from CRM data is strictly better; the owner explicitly chose campaign-goal + per-contact context |
| Google Contacts / People API discovery in v1.2 | Not connected to the session; needs separate OAuth setup with a 7-day-token gotcha. Gmail-search discovery covers v1.2; People API deferred to DISC-F1 |
| Multi-user / shared campaigns | App is single-user by design (Clerk locks `steve@bronstein.org`) |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CAMP-01..08 | TBD | Pending |
| TRGE-01 | TBD | Pending |
| GEN-01..05 | TBD | Pending |
| REV-01..06 | TBD | Pending |
| DISC-01..03 | TBD | Pending |
| DRFT-01..05 | TBD | Pending |

**Coverage:**
- v1.2 requirements: 28 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 28 ⚠️ (roadmapper will map all)

---
*Requirements defined: 2026-06-20*
*Last updated: 2026-06-20 after initial v1.2 definition*
