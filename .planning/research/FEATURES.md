# Feature Research

**Domain:** Personal networking outreach email campaign (single-user, draft-only, 1:1 personalized)
**Researched:** 2026-06-20
**Confidence:** HIGH — domain is well-understood from existing CRM context; Gmail API and Google Contacts API are mature and well-documented.

---

## Framing: What This Is Not

Before listing features, establishing what this tool is NOT eliminates a large category of scope creep. This is not:

- An email marketing platform (Mailchimp, HubSpot, SendGrid) — no bulk blasts, no merge fields, no lists.
- A sales engagement platform (Outreach.io, Apollo, Salesloft) — no sequences, no cadences, no open tracking.
- An automation engine — nothing sends, schedules, or fires without the owner's explicit approval of each email.
- A multi-user tool — one person, one Gmail account, one session.

The correct mental model is: **a drafting assistant that helps the owner write better personal emails faster, batched across a named contact cohort, and pushes the approved drafts to Gmail where the owner decides what to do with them.**

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the milestone to be complete. Missing any of these makes the workflow non-functional.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Named campaign creation (name + goal/instruction) | No way to organize or batch emails without a campaign container | LOW | New `outreach_campaigns` table; campaign goal is the primary prompt signal for AI generation |
| Contact filter UI (howMet, connection date range, closeness tier, outreach status) | Can't build a recipient list without filtering 1500+ contacts | MEDIUM | All filter fields already exist on `contacts`; trickiest part is the date-range picker for `linkedinConnectionDate` / `metDate`; must filter out archived contacts |
| Checkbox multi-select with "select all within filter" | Reviewer must be able to include/exclude individuals before committing to a campaign | LOW | Standard pattern; UI complexity only |
| Save selection as campaign (create `outreach_email` rows) | Persists who is in the campaign before emails are generated; lets the owner exit and return | LOW | One INSERT per selected contact into `outreach_emails` with initial status `pending` |
| Triage connection-date filter | Lets the owner scope triage to a specific company era (e.g. "show me people I connected with in 2021-2022") | LOW | Filter on existing `linkedinConnectionDate` in the triage query — additive to existing triage filters |
| Per-contact AI email generation (subject + body) | The whole point of the milestone; replaces manual drafting | MEDIUM | Calls the AI skill with contact data + campaign goal; stores result in `outreach_emails.generatedSubject` + `generatedBody` |
| Per-email inline editing | Generated text is always a first draft; owner must be able to correct it before approving | LOW | Simple textarea in the review UI; edit saves to `editedSubject` / `editedBody` columns |
| Regenerate single email | Bad generations happen; must be recoverable without touching the rest of the campaign | LOW | Re-runs the generation skill for one contact, overwrites generated columns, resets status to `generated` |
| Approve gate (generated → approved) | Hard requirement from milestone spec; only approved emails get drafted | LOW | Status transition button in UI; API validates transition |
| Campaign-level progress summary | Owner needs to know where they stand (X of N approved, Y drafted) | LOW | Computed from `outreach_emails` status counts; can be a header in the review UI |
| Gmail draft creation for approved emails | The terminal output of the whole workflow | MEDIUM | Claude Code skill; calls Gmail API `drafts.create`; never calls `messages.send` |
| Gmail draft ID stored on `outreach_emails` | Allows the owner to locate the draft in Gmail and track which were created | LOW | `gmailDraftId` column on `outreach_emails` |
| Status `drafted` + timeline event on successful draft creation | Consistent with every other write operation in Heimdall; provides audit trail | LOW | `logTimeline()` call from drafting skill after each successful `drafts.create` |
| "Needs email / LinkedIn message" flag for contacts with no email found | Without this, email-missing contacts silently fall off the workflow | LOW | `noEmailFound` boolean or `channel` enum (`email` / `linkedin_message`) on `outreach_emails` |
| Email status state machine (pending → generated → edited → approved → drafted) | Without explicit status, the review UI has no way to track progress per email | LOW | Enum column on `outreach_emails`; transitions validated at the API boundary (mirrors `canTransition()` pattern) |

### Differentiators (Competitive Advantage)

Features that elevate this above "write 50 emails manually" or a mail-merge template approach. These are why the milestone is worth doing.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Per-contact personalization from CRM data (howMet, company/role, closeness, prior interactions) | Each email reflects what the owner actually knows about the person — not a generic "hope this finds you well" | MEDIUM | The generation prompt assembles a contact brief from `contacts.howMet`, `contacts.companyAtConnection`, `contacts.roleAtConnection`, `contacts.closeness`, and recent `interactions` rows; closeness tier calibrates tone and presumed familiarity |
| Campaign goal/instruction as the generation driver | Owner states what they want (e.g. "reintroduce myself and ask for a 20-min call about VP Data roles") and the AI adapts every email to that goal | LOW | Single free-text field on `outreach_campaigns.goalInstruction`; passed verbatim into each email generation prompt |
| Voice-consistent generation (no LLM tells) | Emails sound like Steve wrote them — casual, story-led, no em dashes, no "it's not X, it's Y" constructions | LOW | Reuse LLM-tell conventions and voice guidance from the `tailor-application-materials` skill's `cover-letter-style.md` reference |
| Email discovery via Google Contacts + Gmail search | Contacts imported from LinkedIn CSV rarely have email addresses; this closes the gap without the owner manually looking up each one | HIGH | Requires Google OAuth2 with `contacts.readonly` + `gmail.readonly` scopes; skill queries Google People API then falls back to Gmail thread search; HIGH complexity because OAuth token management is new to this codebase |
| LinkedIn message fallback channel for no-email contacts | Prevents contacts from being silently dropped; owner gets an actionable list of who to message on LinkedIn instead | LOW | `channel` field on `outreach_emails`; review UI shows a "LinkedIn" badge instead of email preview |
| Prior interactions as personalization signal | If the owner talked to this person 6 months ago, the email should acknowledge it — this is the CRM data advantage over generic tools | MEDIUM | Generation skill queries `interactions` WHERE `contactId = ?` ORDER BY `occurredAt DESC` LIMIT 3; summarizes in the prompt |
| Inline review of all emails in one campaign view | Owner can scan all generated emails in a scrollable list, edit inline, and approve/reject without navigating away | MEDIUM | Single-page review UI; virtual-scroll if campaign has 50+ contacts; shadcn Textarea for inline edits |

### Anti-Features (Commonly Requested, Often Problematic)

Features that are natural to reach for but wrong for this single-user, draft-only, 1:1 personal context.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Bulk "generate all then auto-approve" | Speed; skip the review step | Defeats the approve gate, which is load-bearing — a bad AI generation sent to someone the owner has a real relationship with damages the relationship | Keep the two-step flow (generate → review → approve); the skill can generate all at once in batch but approval remains per-email |
| Email open/click tracking (pixel, link wrapping) | Analytics | 1:1 personal email with tracking pixels looks like surveillance to the recipient; destroys the personal tone; no statistical value at this volume | Owner knows if they got a reply; that's the only metric that matters for exec networking |
| Unsubscribe links and CAN-SPAM compliance blocks | "Best practice" for email marketing | These are markers of bulk email, not personal outreach; including them signals "I mass-emailed you" to VP-level recipients; legally, CAN-SPAM exempts transactional and personal correspondence | Never include; this is personal outreach, not marketing |
| Send from Heimdall (skip Gmail drafts) | One less step | Adds Gmail send scope; introduces risk of accidental sends; removes the Gmail compose moment where the owner can do a final check and choose the right From address | Gmail drafts only; owner sends from Gmail |
| Sequence / follow-up automation | "Remind me if no reply in 7 days" | Follow-up scheduling at this relationship depth should be deliberate, not automated; automated follow-up nudges to VP-level contacts are off-putting | Create a Task in Heimdall when the owner wants to follow up; the existing tasks CRUD handles this |
| Email template library (merge-field approach) | Re-use messaging across campaigns | Templates produce generic output that the owner still has to personalize manually; AI generation from CRM data is strictly better because it uses what the owner already knows | AI generation with campaign goal replaces templates entirely |
| A/B testing subject lines | "Best practice" | No statistical significance at 20-50 recipient cohorts; adds UI complexity with no actionable output | Write one good subject line per contact; the personalization is the A/B test |
| Contact deduplication within a campaign | Prevent sending two emails to the same person | Deduplication belongs at import time (LinkedIn CSV import already handles it); within a campaign, the owner's filter should produce a clean list; adding dedup UI here complicates the flow | Rely on the existing `contacts_linkedin_url_unique_idx`; add a guard at campaign-creation time (API checks for duplicate `contactId` within the campaign) |
| Multi-email-address per contact (primary/secondary) | Some contacts have work + personal email | Adds schema complexity for a rare case; email discovery should return one best address | Discovery returns the single best address found; owner can manually edit the `to` field in Gmail |
| Campaign cloning and re-use | Run the same outreach again later | Campaigns are point-in-time; contact data and relationships change; a "clone" would just produce stale personalization | Create a new campaign; the filter UI makes it fast to rebuild a similar recipient list |
| LinkedIn message composition from Heimdall | Close the loop on the LinkedIn fallback channel | Requires LinkedIn OAuth or browser automation, which is in-scope for the scraping skill but not safe to automate for sending (ToS risk) | Owner sees the "LinkedIn" badge in the review UI and sends manually from LinkedIn; Heimdall can log the interaction afterward |

---

## Feature Dependencies

```
Campaign creation (name + goal)
    └──requires──> Contact filter UI
                       └──requires──> contacts table (CONT-V1) [EXISTING]
                       └──requires──> linkedinConnectionDate (CONT-V2) [EXISTING]

Checkbox multi-select
    └──requires──> Contact filter UI

Save selection as campaign
    └──requires──> Campaign creation
    └──requires──> Checkbox multi-select
    └──requires──> outreach_campaigns table [NEW]
    └──requires──> outreach_emails table [NEW]

AI email generation (skill)
    └──requires──> outreach_emails rows (pending status)
    └──requires──> contacts data: howMet, closeness, companyAtConnection, roleAtConnection [EXISTING]
    └──requires──> interactions history [INTR-V1 EXISTING]
    └──requires──> campaign goalInstruction

Email discovery (skill)
    └──requires──> contacts with no email column set
    └──requires──> Google OAuth2 (contacts.readonly + gmail.readonly scopes) [NEW]

Review & approval UI
    └──requires──> outreach_emails rows (generated status)
    └──requires──> per-email inline edit (updates editedSubject / editedBody)
    └──requires──> approve action (status → approved)

Gmail drafting skill
    └──requires──> outreach_emails rows (approved status + recipient email set)
    └──requires──> Gmail OAuth2 (gmail.compose scope) [NEW]
    └──requires──> logTimeline() [TIME-V1 EXISTING]

Triage connection-date filter
    └──requires──> contacts.linkedinConnectionDate [CONT-V2 EXISTING]
    └──enhances──> Contact filter UI (same filter, different context)

Status state machine
    └──required-by──> Review & approval UI
    └──required-by──> Gmail drafting skill
    └──mirrors──> pipeline canTransition() pattern [EXISTING]
```

### Dependency Notes

- **Campaign creation requires contact filter UI:** The filter defines who is in scope before the owner commits to a campaign. The filter UI and the campaign form are the same page/flow.
- **AI generation requires existing contacts data:** The quality of personalization is directly proportional to how complete the contact's `howMet`, `closeness`, `companyAtConnection`, and `roleAtConnection` fields are. Contacts that haven't gone through triage (Phase 10 enrichment) will produce weaker emails — this is expected and acceptable.
- **Email discovery is independent of generation:** Discovery can run before or after generation. It is a blocker only for the drafting step (no email = no draft). It should run as a pre-flight step when the campaign is ready for approval.
- **Gmail drafting skill requires both Gmail OAuth and approved status:** These are independent blockers — both must be met. The skill should validate both before attempting `drafts.create`.
- **Triage connection-date filter is additive:** It does not replace existing triage filters; it adds a date-range predicate to the existing triage query. It can be built independently of the campaign flow and shipped in the same phase or earlier.

---

## MVP Definition

### Launch With (v1.2)

All of these are required for the milestone to be complete.

- [ ] Campaign creation + contact filter (howMet, date range, closeness, outreach status) with checkbox multi-select
- [ ] Save selection → create `outreach_campaigns` + `outreach_emails` rows
- [ ] Triage connection-date filter (additive to existing triage UI)
- [ ] AI email generation skill (per campaign → per contact → subject + body)
- [ ] Per-email inline editing in review UI
- [ ] Single-email regenerate
- [ ] Approve gate (status transition, validated at API)
- [ ] Email discovery (Google Contacts + Gmail search; flag no-email contacts for LinkedIn)
- [ ] Gmail drafting skill (drafts.create only; store draft ID; log timeline; mark `drafted`)
- [ ] "Needs LinkedIn message" surface in review UI for no-email contacts

### Add After Validation (v1.x)

- [ ] Campaign-level analytics summary (reply rate, meeting-booked rate) — add once a few campaigns have run and the owner wants to see patterns
- [ ] Follow-up task auto-create on draft creation — "create a Task if no interaction logged in 14 days" — add if the owner finds manual follow-up tracking tedious

### Future Consideration (v2+)

- [ ] LinkedIn message composition assistance — requires revisiting LinkedIn ToS and automation risk
- [ ] pgvector semantic search over interactions to find best prior-contact signal (VEC-01/02 backlog)
- [ ] Campaign templates / saved filter presets — only valuable after 5+ campaigns show repeated patterns

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Campaign creation + contact filter UI | HIGH | MEDIUM | P1 |
| Triage connection-date filter | HIGH | LOW | P1 |
| Save selection as campaign (DB rows) | HIGH | LOW | P1 |
| AI email generation skill | HIGH | MEDIUM | P1 |
| Review & approval UI (inline edit + approve) | HIGH | MEDIUM | P1 |
| Gmail drafting skill | HIGH | MEDIUM | P1 |
| Single-email regenerate | MEDIUM | LOW | P1 |
| Status state machine + API validation | MEDIUM | LOW | P1 |
| Email discovery (Google Contacts + Gmail) | MEDIUM | HIGH | P1 (required for Gmail drafts to work for most contacts) |
| "Needs LinkedIn" flag in review UI | MEDIUM | LOW | P1 |
| Campaign progress summary (X of N approved) | MEDIUM | LOW | P2 |
| Follow-up task auto-create | LOW | LOW | P3 |
| Campaign analytics (reply/meeting rate) | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Required for v1.2 milestone to be complete
- P2: Should have, add in the same milestone if low-cost
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

This is not a competitive product. The closest analogues are:

| Feature | Clay / Apollo (sales outreach) | Superhuman / Gmail | Our Approach |
|---------|--------------------------------|---------------------|--------------|
| Contact segmentation | Filter by enriched firmographic data | Manual labels/folders | Filter by CRM fields already in Heimdall (howMet, closeness, date) |
| Email personalization | Merge-field templates + AI "personalization snippets" | Manual writing | Full AI generation from CRM relationship context — no merge fields |
| Approval gate | Typically absent (auto-send sequences) | N/A | Explicit per-email approve required; no draft created without it |
| Email discovery | Data provider enrichment (ZoomInfo, Clearbit) | Manual | Google Contacts + Gmail search (uses existing relationship context, not cold data provider) |
| Send mechanism | ESP or direct send | Gmail compose | Gmail drafts only; owner sends |
| Compliance | CAN-SPAM, unsubscribe, opt-out | N/A | Explicitly omitted; this is personal correspondence, not marketing |
| Relationship data as signal | Firmographic only (company, title) | None | Full CRM depth: howMet, closeness tier, prior interactions, connection date |

---

## Implementation Notes for Requirements Definition

The following are observations from analyzing the existing codebase that bear on feature complexity and build order:

**Existing patterns that apply directly:**
- `canTransition()` pipeline state machine in `src/lib/domain/pipeline.ts` is the exact pattern for the `outreach_emails` status state machine (pending → generated → edited → approved → drafted). Copy the pattern.
- `logTimeline()` in `src/lib/db/timeline.ts` must be called from every API write in the campaign flow — no exceptions (this is enforced by convention throughout the codebase).
- The `scrape-linkedin-connections` skill is the structural model for the Gmail drafting skill: a Claude Code skill reads from the DB (approved `outreach_emails`), calls an external API, writes results back via REST API calls to Heimdall. Same pattern.
- The `tailor-application-materials` skill's LLM-tell conventions and voice guidance (`cover-letter-style.md`) apply directly to email generation. The email generation skill should read those references.

**New complexity introduced:**
- **Google OAuth2 is the only genuinely new external auth pattern in this codebase.** Clerk handles user auth. Gmail + Google Contacts need a separate OAuth2 token flow with scopes `https://www.googleapis.com/auth/contacts.readonly`, `https://www.googleapis.com/auth/gmail.readonly`, and `https://www.googleapis.com/auth/gmail.compose`. Token storage (access + refresh token) needs a `google_oauth_tokens` table or an environment-variable-based approach for single-user use. The single-user nature simplifies this significantly — no per-user token management needed.
- **Gmail API `drafts.create`** takes a MIME-encoded RFC 2822 message. The skill must construct a valid MIME message (To, Subject, From, Content-Type, body). This is straightforward with Node's built-in capabilities but is not already in the codebase.
- **Google People API** (formerly Contacts API) uses `connections.list` to fetch all contacts then filter by name. Gmail search uses the `q` parameter (`from:<name> OR to:<name>`). Neither requires a library beyond `fetch` with a bearer token.
- **Performance:** 1500+ contacts but campaigns are typically 20–100 contacts. No N+1 concerns. A single `SELECT * FROM contacts WHERE id = ANY($1)` with the selected IDs covers the generation prompt assembly.

**Schema additions (minimal):**
- `outreach_campaigns` table: `id`, `name`, `goalInstruction`, `status` enum (`draft | active | completed`), `createdAt`, `updatedAt`
- `outreach_emails` table: `id`, `campaignId`, `contactId`, `channel` enum (`email | linkedin_message`), `recipientEmail`, `generatedSubject`, `generatedBody`, `editedSubject`, `editedBody`, `status` enum (`pending | generated | edited | approved | drafted | failed`), `gmailDraftId`, `noEmailFound` bool, `generatedAt`, `approvedAt`, `draftedAt`, `createdAt`, `updatedAt`

**Conflicts with existing design:**
- None identified. The outreach campaign flow is additive — no existing tables need structural changes. The `contacts.outreachStatus` field (already exists: `not_reached_out | reached_out | meeting_scheduled | meeting_completed | ongoing`) should be updated when an email is drafted (`reached_out`) and when a reply-interaction is logged later. This update should come from the drafting skill or a subsequent interaction log, not automatically.

---

## Sources

- Heimdall `drizzle/schema/` — existing data model (contacts, interactions, enums) — HIGH confidence
- Heimdall `.planning/PROJECT.md` — constraints, architecture, existing features — HIGH confidence
- `.claude/skills/tailor-application-materials/SKILL.md` — voice and LLM-tell conventions reusable for email generation — HIGH confidence
- Gmail API documentation (drafts.create, MIME encoding) — well-documented, stable API — HIGH confidence
- Google People API documentation (contacts.list) — well-documented, stable API — HIGH confidence
- Domain knowledge: personal executive networking email conventions vs bulk marketing — HIGH confidence (single-author CRM context makes this unambiguous)

---

*Feature research for: v1.2 Networking Outreach Campaigns (Heimdall)*
*Researched: 2026-06-20*
