# Architecture Research

**Domain:** v1.2 Networking Outreach Campaigns — integration into existing Heimdall CRM
**Researched:** 2026-06-20
**Confidence:** HIGH — all evidence drawn directly from the existing codebase; no external lookups required.

---

## Integration Framing

This is an **additive milestone**. The existing architecture is fixed and well-understood. No tables are structurally modified. No routing patterns change. The new features plug into four existing seams:

1. **Schema layer** — two new tables, three new enums, one optional new index
2. **API layer** — new route tree under `/api/outreach-campaigns/`, additive filter params on the existing `/api/contacts/` route, minor additive change to the triage RSC page
3. **Feature layer** — new `src/features/outreach/` domain; additive filter UI in `src/features/contacts/components/triage/`
4. **Skill layer** — two new skills following the `scrape-linkedin-connections` read-queue → act → write-back-via-REST pattern

---

## New Data Model

### New Enums (add to `drizzle/schema/enums.ts`)

```typescript
export const outreachCampaignStatusEnum = pgEnum('outreach_campaign_status', [
  'draft',      // building the recipient list, not yet generating
  'active',     // generation and/or approval in progress
  'completed'   // all emails drafted or deliberately closed out
]);

export const outreachChannelEnum = pgEnum('outreach_channel', [
  'email',            // will become a Gmail draft
  'linkedin_message'  // no email found; owner sends manually on LinkedIn
]);

export const outreachEmailStatusEnum = pgEnum('outreach_email_status', [
  'pending',    // contact added to campaign; no generation yet
  'generated',  // skill has written back generatedSubject + generatedBody
  'edited',     // owner has modified the generated text
  'approved',   // owner has explicitly approved; eligible for drafting
  'drafted',    // Gmail draft created; gmailDraftId populated
  'failed'      // generation or drafting failed; lastError set
]);
```

### `outreach_campaigns` Table (`drizzle/schema/outreach-campaigns.ts`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | N | `defaultRandom()` |
| `name` | text | N | Display name for the campaign |
| `goalInstruction` | text | N | Free-text prompt passed to generation skill (e.g. "reintroduce myself and ask for a 20-min call about VP Data roles") |
| `status` | `outreachCampaignStatusEnum` | N | Default `'draft'` |
| `createdAt` | timestamp | N | `defaultNow()` |
| `updatedAt` | timestamp | N | `defaultNow()` — set manually on every UPDATE |
| `archivedAt` | timestamp | Y | Soft delete — never hard delete |

No foreign keys. Campaigns are top-level entities; they reference contacts indirectly through `outreach_emails`.

### `outreach_emails` Table (`drizzle/schema/outreach-emails.ts`)

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | uuid PK | N | `defaultRandom()` |
| `campaignId` | uuid FK → `outreach_campaigns.id` | N | Parent campaign |
| `contactId` | uuid FK → `contacts.id` | N | The recipient |
| `channel` | `outreachChannelEnum` | N | Default `'email'`; skill sets to `'linkedin_message'` when no email found |
| `recipientEmail` | text | Y | Null until discovery runs or owner sets manually; must be non-null for drafting |
| `generatedSubject` | text | Y | Written by generation skill |
| `generatedBody` | text | Y | Written by generation skill |
| `editedSubject` | text | Y | Written by owner via review UI; null until owner edits |
| `editedBody` | text | Y | Written by owner via review UI; null until owner edits |
| `status` | `outreachEmailStatusEnum` | N | Default `'pending'` |
| `gmailDraftId` | text | Y | Written by drafting skill after `drafts.create` succeeds |
| `lastError` | text | Y | Set on `'failed'`; categorized error string matching scraping skill convention |
| `generatedAt` | timestamp | Y | Set when status transitions to `'generated'` |
| `approvedAt` | timestamp | Y | Set when status transitions to `'approved'` |
| `draftedAt` | timestamp | Y | Set when status transitions to `'drafted'` |
| `createdAt` | timestamp | N | `defaultNow()` |
| `updatedAt` | timestamp | N | `defaultNow()` — set manually on every UPDATE |

**Unique constraint:** `UNIQUE (campaignId, contactId)` — one email row per contact per campaign. Enforced at schema level with `unique('outreach_email_campaign_contact_unique').on(table.campaignId, table.contactId)`. The API layer checks for duplicate `contactId` at campaign-creation time via `onConflictDoNothing()`.

**Indexes:**
- `outreach_emails_campaign_id_idx` on `campaignId` — every API route filters by campaignId
- `outreach_emails_status_idx` on `status` — skills read the queue with `WHERE status = $1`
- `outreach_emails_contact_id_idx` on `contactId` — join key for contact data

### No Changes to Existing Tables

The `contacts` table gains no new columns. The `timeline_events` table gains no new columns. Campaign and email IDs are stored in the `metadata` JSONB field of timeline events:

```typescript
await logTimeline({
  eventType: 'outreach_email_drafted',
  title: `Drafted email to ${contact.firstName} ${contact.lastName} in campaign "${campaign.name}"`,
  contactId: contact.id,
  metadata: { campaignId: campaign.id, outreachEmailId: email.id, gmailDraftId }
});
```

This avoids a migration just for timeline FK columns, consistent with how optional entity references are handled elsewhere (e.g., enrichment events use `metadata` for context beyond the standard FK set).

---

## Email Status State Machine

Located at `src/features/outreach/lib/email-status.ts`. Mirrors `src/lib/domain/pipeline.ts` exactly — same module shape, same `canEmailTransition()` and `isEmailTerminalState()` exports.

```typescript
const validEmailTransitions: Record<string, string[]> = {
  pending:   ['generated', 'failed'],
  generated: ['edited', 'approved', 'failed'],
  edited:    ['approved', 'generated'],    // 'generated' = regenerate (resets to pending→generated)
  approved:  ['drafted', 'edited'],        // 'edited' = un-approve for re-edit
  failed:    ['pending'],                  // retry
};

const terminalEmailStates = ['drafted'];   // 'failed' is recoverable via retry

export function canEmailTransition(from: string, to: string): boolean {
  if (terminalEmailStates.includes(from)) return false;
  return validEmailTransitions[from]?.includes(to) ?? false;
}

export function isEmailTerminalState(status: string): boolean {
  return terminalEmailStates.includes(status);
}
```

**Transition semantics:**

| Transition | Trigger | Who |
|------------|---------|-----|
| `pending → generated` | Generation skill writes back subject + body | Skill via `PATCH .../generation` |
| `pending → failed` | Generation skill fails | Skill via `PATCH .../status` |
| `generated → edited` | Owner saves any edit to subject or body | UI via `PATCH .../emails/[id]` |
| `generated → approved` | Owner approves without editing | UI via `PATCH .../emails/[id]/status` |
| `generated → failed` | Regeneration attempt fails | Skill via `PATCH .../status` |
| `edited → approved` | Owner approves after editing | UI via `PATCH .../emails/[id]/status` |
| `edited → generated` | Owner requests regeneration — resets generated fields | UI via `PATCH .../emails/[id]/status` then skill picks up |
| `approved → drafted` | Drafting skill creates Gmail draft | Skill via `PATCH .../draft` |
| `approved → edited` | Owner un-approves to re-edit | UI via `PATCH .../emails/[id]/status` |
| `failed → pending` | Owner triggers retry | UI via `PATCH .../emails/[id]/status` |

The `PATCH .../emails/[id]/status` handler validates all status transitions via `canEmailTransition()` before writing, returning `400 validationError('Invalid email status transition: ...')` on rejection — identical to how the pipeline transition endpoint works.

When `edited → generated` (regenerate): the API clears `generatedSubject`, `generatedBody`, `editedSubject`, `editedBody`, sets `status = 'generated'`... actually, no — regenerate should set status back to `'pending'` so the skill picks it up again. The correct transition is `edited → pending` (the skill will then write it to `generated`). Let me reconsider:

The cleaner model: `edited → pending` is the "regenerate" trigger. The generation skill's queue query is `WHERE status = 'pending'`, so it picks up the reset email. Update the state machine accordingly:

```typescript
const validEmailTransitions: Record<string, string[]> = {
  pending:   ['generated', 'failed'],
  generated: ['edited', 'approved', 'failed', 'pending'],  // 'pending' = regenerate
  edited:    ['approved', 'pending'],                       // 'pending' = regenerate
  approved:  ['drafted', 'edited'],
  failed:    ['pending'],
};
```

The "Regenerate" button in the UI sends `PATCH .../status` with `{ status: 'pending' }`, which resets the email to the queue. The generation skill drains the queue next time it runs.

---

## REST API Surface

### New Route Tree: `/api/outreach-campaigns/`

All routes follow the standard Zod validation → Drizzle → `logTimeline()` → response envelope pattern. All are authenticated via Clerk middleware (no changes to `src/proxy.ts` needed).

#### Campaign CRUD

| Method | Route | Purpose | Request Body | Response |
|--------|-------|---------|--------------|----------|
| `GET` | `/api/outreach-campaigns` | List campaigns (cursor paginated) | — | `paginated(campaigns[], meta)` |
| `POST` | `/api/outreach-campaigns` | Create campaign | `{ name, goalInstruction }` | `created(campaign)` |
| `GET` | `/api/outreach-campaigns/[id]` | Get single campaign + email counts by status | — | `success({ campaign, emailCounts })` |
| `PATCH` | `/api/outreach-campaigns/[id]` | Update name, goalInstruction, status | `{ name?, goalInstruction?, status? }` | `success(campaign)` |
| `DELETE` | `/api/outreach-campaigns/[id]` | Soft delete | — | `success({ id })` |

#### Email Management

| Method | Route | Purpose | Request Body | Response |
|--------|-------|---------|--------------|----------|
| `GET` | `/api/outreach-campaigns/[id]/emails` | List emails with contact data joined; supports `?status=` filter | — | `paginated(emails[], meta)` |
| `POST` | `/api/outreach-campaigns/[id]/emails` | Add selected contacts to campaign | `{ contactIds: string[] }` | `created({ inserted: N, rows: [] })` |
| `PATCH` | `/api/outreach-campaigns/[id]/emails/[emailId]` | Save inline edits (subject, body, recipientEmail) | `{ editedSubject?, editedBody?, recipientEmail? }` | `success(email)` — auto-transitions to `'edited'` if was `'generated'` |
| `DELETE` | `/api/outreach-campaigns/[id]/emails/[emailId]` | Remove contact from campaign | — | `success({ id })` |

#### Explicit Status Transitions (validated by `canEmailTransition()`)

| Method | Route | Purpose | Request Body | Response |
|--------|-------|---------|--------------|----------|
| `PATCH` | `/api/outreach-campaigns/[id]/emails/[emailId]/status` | Approve, un-approve, regenerate (→ pending), retry (failed → pending) | `{ status: outreachEmailStatus }` | `success(email)` or `400 validationError` |

#### Skill Write-Back Routes

These are the seams where skills write results back into the app, matching the `scrape-linkedin-connections` precedent exactly.

| Method | Route | Called By | Body | Side Effects |
|--------|-------|-----------|------|--------------|
| `PATCH` | `/api/outreach-campaigns/[id]/emails/[emailId]/generation` | Generation skill | `{ generatedSubject, generatedBody }` | Sets status → `'generated'`, sets `generatedAt`, calls `logTimeline()` |
| `PATCH` | `/api/outreach-campaigns/[id]/emails/[emailId]/recipient` | Discovery skill | `{ recipientEmail?, channel }` | Sets `recipientEmail` and/or `channel`; if `channel = 'linkedin_message'` also sets `recipientEmail = null` |
| `PATCH` | `/api/outreach-campaigns/[id]/emails/[emailId]/draft` | Drafting skill | `{ gmailDraftId }` | Sets status → `'drafted'`, sets `draftedAt`, sets `gmailDraftId`, calls `logTimeline()` |

The generation and draft write-back routes validate that the email exists and belongs to the campaign before writing. The skill authenticates via `Authorization: Bearer $TOKEN` (same `~/.heimdall/api-token` pattern as `scrape-linkedin-connections`).

### Modified Route: `GET /api/contacts`

Two new filter query parameters — additive, no breaking changes:

| Param | Type | Drizzle Predicate |
|-------|------|------------------|
| `howMet` | string | `ilike(contacts.howMet, '%${value}%')` |
| `connectionYearStart` | YYYY string | `gte(contacts.linkedinConnectionDate, new Date('${value}-01-01'))` |
| `connectionYearEnd` | YYYY string | `lte(contacts.linkedinConnectionDate, new Date('${value}-12-31T23:59:59'))` |

Existing filters (`closeness`, `outreachStatus`, `warmth`, `relationship`, `search`) already cover the other campaign-builder filter requirements. The campaign builder calls `GET /api/contacts` with these params to populate the checkbox multi-select.

### Triage Page: No New API Route

The triage page (`src/app/dashboard/contacts/triage/page.tsx`) is an RSC that queries Drizzle directly. The connection-date filter is added as URL `searchParams` read by the page function, which applies `gte`/`lte` predicates on `contacts.linkedinConnectionDate` in the existing query. No new API route is needed; the triage URL becomes `/dashboard/contacts/triage?connectionYearStart=2021&connectionYearEnd=2022`.

---

## New Feature Structure

```
src/features/outreach/
├── components/
│   ├── campaign-list.tsx           # 'use client'; renders campaign table with status badges
│   ├── campaign-builder.tsx        # 'use client'; contact filter UI + checkbox multi-select + campaign name/goal form
│   ├── review-panel.tsx            # 'use client'; scrollable per-email review list with inline edit + approve
│   └── email-card.tsx              # 'use client'; single email card — Textarea for subject/body, approve/reject buttons
└── lib/
    └── email-status.ts             # canEmailTransition(), isEmailTerminalState(), validEmailTransitions

src/app/dashboard/outreach/
├── page.tsx                        # RSC: query outreach_campaigns → <CampaignList />
├── new/
│   └── page.tsx                    # RSC: pass filter context → <CampaignBuilder />
└── [id]/
    └── page.tsx                    # RSC: query campaign + emails with contact JOIN → <ReviewPanel />
```

**Modified files:**

| File | Change |
|------|--------|
| `src/features/contacts/components/triage/triage-workflow.tsx` | Add connection-year filter toggle; reads `connectionYearStart`/`End` from URL params via nuqs; updates URL on selection |
| `src/app/dashboard/contacts/triage/page.tsx` | Accept `searchParams`; add `gte`/`lte` predicates to Drizzle query |
| `src/app/api/contacts/route.ts` | Add `howMet` and `connectionYearStart`/`End` filter params |
| `drizzle/schema/index.ts` | Add barrel exports for `outreachCampaigns`, `outreachEmails` |
| `src/lib/domain/types.ts` | Add inferred types `OutreachCampaign`, `OutreachEmail`, `NewOutreachCampaign`, `NewOutreachEmail`; add enum value arrays `outreachCampaignStatusValues`, `outreachChannelValues`, `outreachEmailStatusValues` |

**New schema files:**

| File | Content |
|------|---------|
| `drizzle/schema/outreach-campaigns.ts` | `outreachCampaigns` pgTable |
| `drizzle/schema/outreach-emails.ts` | `outreachEmails` pgTable |
| `drizzle/schema/enums.ts` | Three new pgEnum additions |

**New migration:** `drizzle/migrations/0011_outreach_campaigns.sql` — all of the above in one migration.

---

## Skill Designs

Both skills follow the `scrape-linkedin-connections` model: read queue via authenticated REST → act (external service call) → write results back via authenticated REST. Skills never touch the DB directly.

### Skill 1: `generate-outreach-emails`

**Location:** `.claude/skills/generate-outreach-emails/`

**Invocation:**
- `generate-outreach-emails <campaign-id>` — batch mode: generates all `status=pending` emails in the campaign
- `generate-outreach-emails <campaign-id> --email <email-id>` — single mode: regenerates one specific email

**Queue read:**
```bash
GET /api/outreach-campaigns/<campaignId>/emails?status=pending
```

**Per-email flow:**
1. `GET /api/contacts/<contactId>` — fetch full contact (howMet, closeness, companyAtConnection, roleAtConnection, currentCompany, title, email)
2. `GET /api/interactions?contactId=<contactId>&limit=3` — recent interaction summaries for personalization
3. Assemble generation prompt: campaign `goalInstruction` + contact brief. Use LLM-tell conventions and voice guidance from `tailor-application-materials` skill references (no em dashes, casual and story-led, no generic openers).
4. Generate subject + body via Claude API (Sonnet-class model).
5. Write back:
   ```bash
   PATCH /api/outreach-campaigns/<campaignId>/emails/<emailId>/generation
   body: { "generatedSubject": "...", "generatedBody": "..." }
   ```
   Confirm `{ success: true }`. API transitions status → `'generated'` and logs timeline event server-side.

**Error handling:** If generation fails, `PATCH .../status` with `{ status: 'failed', lastError: 'Generation failed: <first 200 chars>' }`. Contact stays failed; owner retries via UI.

**References needed in skill:**
- `references/heimdall-api.md` (same pattern as scraping skill)
- `references/voice-guide.md` (reuse or symlink from `tailor-application-materials` skill's `cover-letter-style.md`)

### Skill 2: `draft-outreach-emails`

**Location:** `.claude/skills/draft-outreach-emails/`

**Invocation:**
- `draft-outreach-emails <campaign-id>` — full mode: runs discovery then drafting
- `draft-outreach-emails <campaign-id> --discover-only` — only runs email discovery, no drafts created
- `draft-outreach-emails <campaign-id> --draft-only` — skips discovery, drafts approved emails that already have recipients

**Google OAuth token:** Stored at `~/.heimdall/google-token.json` (`{ accessToken, refreshToken, expiresAt }`). Skill reads, refreshes if expired using the Google OAuth2 token endpoint, writes updated token back. This is the same file-based convention as `~/.heimdall/api-token`. One-time setup: user runs a local OAuth2 authorization flow (described in skill README) to obtain initial tokens with scopes `contacts.readonly`, `gmail.readonly`, `gmail.compose`.

**Discovery sub-flow (for emails with `recipientEmail IS NULL`):**

Queue:
```bash
GET /api/outreach-campaigns/<campaignId>/emails?status=approved
# Filter client-side: emails where recipientEmail IS NULL
```

Per-contact:
1. Query Google People API: `GET https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses` — filter by `displayName` match with `contact.firstName + ' ' + contact.lastName`.
2. If found: use the best email match.
3. If not found: query Gmail: `GET https://gmail.googleapis.com/gmail/v1/users/me/messages?q=from:<firstName>+<lastName>+OR+to:<firstName>+<lastName>&maxResults=5` — extract email addresses from `From`/`To` headers.
4. Write back:
   - Found: `PATCH .../recipient` with `{ recipientEmail: "...", channel: "email" }`
   - Not found: `PATCH .../recipient` with `{ channel: "linkedin_message" }` — sets channel, leaves recipientEmail null; UI shows "LinkedIn" badge

**Drafting sub-flow (for emails with `status = 'approved'` and `channel = 'email'` and `recipientEmail IS NOT NULL`):**

Queue:
```bash
GET /api/outreach-campaigns/<campaignId>/emails?status=approved
# Filter client-side: channel=email AND recipientEmail IS NOT NULL
```

Per-email:
1. Use `editedSubject ?? generatedSubject` and `editedBody ?? generatedBody` as the final content.
2. Construct RFC 2822 MIME message (base64url-encoded): `To`, `Subject`, `From` (owner's email), `Content-Type: text/plain; charset=utf-8`, body.
3. Call Gmail API: `POST https://gmail.googleapis.com/gmail/v1/users/me/drafts` with `{ message: { raw: <base64url> } }`.
4. Write back:
   ```bash
   PATCH /api/outreach-campaigns/<campaignId>/emails/<emailId>/draft
   body: { "gmailDraftId": "r<draft-id>" }
   ```
   API transitions status → `'drafted'`, sets `draftedAt`, logs `outreach_email_drafted` timeline event.

**Error handling:** Per-email failures write `lastError` via `PATCH .../status` with `{ status: 'failed', lastError: '...' }`. Batch continues; summary at end. Terminal pattern identical to `scrape-linkedin-connections`.

---

## Data Flows

### Campaign Creation + Contact Selection

```
User fills campaign form + applies filters
    ↓
GET /api/contacts?closeness=...&howMet=...&connectionYearStart=2021&connectionYearEnd=2022
    ↓ (returns paginated contact list)
User checkbox-selects contacts
    ↓
POST /api/outreach-campaigns → creates outreach_campaigns row
POST /api/outreach-campaigns/[id]/emails → { contactIds: [...] }
    ↓ (bulk INSERT with onConflictDoNothing on unique (campaignId, contactId))
outreach_emails rows created with status = 'pending'
```

### Email Generation (Skill)

```
User runs: generate-outreach-emails <campaign-id>
    ↓
GET /api/outreach-campaigns/[id]/emails?status=pending
    ↓ (for each pending email)
GET /api/contacts/[contactId]
GET /api/interactions?contactId=[contactId]&limit=3
    ↓ (assemble prompt, call Claude API)
PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation
    body: { generatedSubject, generatedBody }
    ↓ (API: set status='generated', generatedAt, logTimeline)
```

### Review, Edit, Approve (UI)

```
User navigates to /dashboard/outreach/[id]
    ↓ (RSC queries campaign + emails JOIN contacts)
<ReviewPanel /> renders all emails as <EmailCard /> components
    ↓
Owner edits subject/body in Textarea
    PATCH /api/outreach-campaigns/[id]/emails/[emailId]
    body: { editedSubject, editedBody }
    → API auto-transitions status: generated → edited
    ↓
Owner clicks "Approve"
    PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status
    body: { status: 'approved' }
    → canEmailTransition('edited', 'approved') validates
    ↓
Owner clicks "Regenerate" on a bad generation
    PATCH /api/outreach-campaigns/[id]/emails/[emailId]/status
    body: { status: 'pending' }
    → resets to queue; owner re-runs generation skill
```

### Gmail Drafting (Skill)

```
User runs: draft-outreach-emails <campaign-id>
    ↓
GET /api/outreach-campaigns/[id]/emails?status=approved
    ↓ (discovery sub-flow for emails with no recipientEmail)
Google People API → Gmail thread search → PATCH .../recipient
    ↓ (drafting sub-flow for approved emails with recipientEmail)
Gmail drafts.create (MIME message) →
    PATCH /api/outreach-campaigns/[id]/emails/[emailId]/draft
    body: { gmailDraftId }
    → API: status='drafted', draftedAt set, logTimeline('outreach_email_drafted')
    ↓
Review UI shows "Drafted" badge; owner opens Gmail to send
```

### Triage Connection-Date Filter (additive to existing flow)

```
User visits /dashboard/contacts/triage?connectionYearStart=2021&connectionYearEnd=2022
    ↓ (RSC reads searchParams)
Drizzle query adds: AND linkedin_connection_date >= '2021-01-01'
                    AND linkedin_connection_date <= '2022-12-31T23:59:59'
    ↓ (passes filtered contact list to TriageWorkflow)
Existing triage keyboard flow unchanged
    ↓
TriageWorkflow renders year-filter toggle buttons (e.g. "2021", "2022", "2023", "All")
→ selecting a year calls router.push with updated searchParams (nuqs pattern)
```

---

## Component Responsibilities

| Component | Responsibility | Pattern |
|-----------|---------------|---------|
| `src/features/outreach/lib/email-status.ts` | `canEmailTransition()` + `isEmailTerminalState()` + transition map | Mirrors `src/lib/domain/pipeline.ts` exactly |
| `src/app/api/outreach-campaigns/route.ts` | Campaign list + create | Standard Zod → Drizzle → logTimeline → envelope |
| `src/app/api/outreach-campaigns/[id]/emails/route.ts` | Email list (with contact JOIN) + bulk add contacts | Bulk INSERT with `onConflictDoNothing()` — mirrors `PATCH /api/contacts/import/categorize` pattern |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` | Status transitions (approve, un-approve, regenerate, retry) | Validates via `canEmailTransition()` — mirrors pipeline status transition route |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts` | Skill write-back: generated subject + body | Mirrors `POST /api/job-leads/[id]/prospects` — sets status, logs timeline, confirms success |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` | Skill write-back: gmailDraftId + drafted status | Same pattern as generation write-back |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts` | Skill write-back: discovered email or linkedin_message flag | Sets recipientEmail and/or channel |
| `src/features/outreach/components/campaign-builder.tsx` | Contact filter + checkbox multi-select + campaign form | `'use client'`; calls GET /api/contacts with filter params; calls POST /api/outreach-campaigns then POST .../emails |
| `src/features/outreach/components/review-panel.tsx` | Per-email inline edit + approve gate + regenerate | `'use client'`; virtual scroll for 50+ emails; calls PATCH on edit/approve/regenerate |
| `.claude/skills/generate-outreach-emails/` | Queue drain: pending → generated (AI-written subject + body) | Read queue via REST → Claude API → write-back via REST |
| `.claude/skills/draft-outreach-emails/` | Discovery (Google People API + Gmail) + Gmail drafts.create | Read queue via REST → Google APIs → write-back via REST |

---

## Dependency-Ordered Build Sequence

### Step 1: Schema + Enums + Migration (no UI dependencies)

- Add three new enums to `drizzle/schema/enums.ts`
- Create `drizzle/schema/outreach-campaigns.ts`
- Create `drizzle/schema/outreach-emails.ts` (with indexes and unique constraint)
- Update `drizzle/schema/index.ts` barrel
- Add inferred types and enum value arrays to `src/lib/domain/types.ts`
- Run `npm run db:generate` → produces `drizzle/migrations/0011_outreach_campaigns.sql`
- Run `npm run db:migrate`

Unblocks: everything else.

### Step 2: Email Status State Machine (depends on Step 1 types)

- Create `src/features/outreach/lib/email-status.ts`
- Write unit tests mirroring `canTransition()` tests in the existing Vitest suite

Unblocks: all API routes that validate status transitions.

### Step 3: API Routes (depends on Steps 1–2)

Build in this sub-order:
1. Campaign CRUD (`/api/outreach-campaigns/` and `[id]/`)
2. Email bulk-add and list (`[id]/emails/`)
3. Email inline edit (`[id]/emails/[emailId]/`)
4. Email status transition (`[id]/emails/[emailId]/status/`) — depends on `canEmailTransition()`
5. Skill write-back routes: `generation`, `recipient`, `draft`

Also: add `howMet` and `connectionYearStart`/`End` filter params to `GET /api/contacts`.

Unblocks: UI (needs campaign and email routes); skills (need generation and draft write-back routes).

### Step 4: Triage Connection-Date Filter (depends on Step 3 contacts filter change; independent of outreach routes)

- Update `src/app/dashboard/contacts/triage/page.tsx` to accept and apply `searchParams`
- Add year-toggle filter controls to `src/features/contacts/components/triage/triage-workflow.tsx` using nuqs

This can be built in parallel with Steps 3–5 once the contacts filter API change is in place (Step 3 last bullet).

### Step 5: Campaign Builder + List UI (depends on Steps 1–3)

- `src/app/dashboard/outreach/page.tsx` (RSC)
- `src/app/dashboard/outreach/new/page.tsx` (RSC)
- `src/features/outreach/components/campaign-list.tsx`
- `src/features/outreach/components/campaign-builder.tsx`
- Add "Outreach" to the dashboard sidebar nav

Unblocks: Review UI (needs campaigns + emails to exist in DB to develop against).

### Step 6: Review & Approval UI (depends on Step 5 — campaigns must be creatable)

- `src/app/dashboard/outreach/[id]/page.tsx` (RSC)
- `src/features/outreach/components/review-panel.tsx`
- `src/features/outreach/components/email-card.tsx`

At this point the full web UI flow is complete (create campaign → select contacts → review emails → approve).

### Step 7: Email Generation Skill (depends on Step 3 write-back routes)

- Create `.claude/skills/generate-outreach-emails/SKILL.md`
- Create `references/heimdall-api.md` (or reuse/symlink from scraping skill)
- Create voice guide reference (symlink or copy from `tailor-application-materials`)
- Test: invoke skill against a real campaign; verify `PATCH .../generation` is called and status transitions to `'generated'` in the UI

### Step 8: Gmail Drafting + Discovery Skill (depends on Steps 3 + 6; also requires Google OAuth setup)

- Document and test one-time Google OAuth2 setup: `~/.heimdall/google-token.json` conventions, scope list, token refresh logic
- Create `.claude/skills/draft-outreach-emails/SKILL.md`
- Test discovery sub-flow against real contacts (no email) → verify `PATCH .../recipient` writes channel correctly
- Test drafting sub-flow → verify `PATCH .../draft` writes `gmailDraftId`; verify draft appears in Gmail Drafts

This is the highest-risk step (new external auth pattern, new MIME construction, Google API rate limits). Building it last means the rest of the system is already validated when the highest-uncertainty piece is introduced.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Google People API (`people.googleapis.com`) | OAuth2 Bearer token; `connections.list` with `personFields=names,emailAddresses` | Single-user token in `~/.heimdall/google-token.json`; refresh on 401 |
| Gmail API — draft creation (`gmail.googleapis.com`) | OAuth2 Bearer token; `POST /gmail/v1/users/me/drafts` with MIME body | `gmail.compose` scope; MIME must be base64url-encoded; `drafts.create` — never `messages.send` |
| Gmail API — thread search | OAuth2 Bearer token; `GET /gmail/v1/users/me/messages?q=...` | `gmail.readonly` scope; used for email discovery only |
| Claude API | Skills call Claude directly (not through Heimdall REST) | Email generation uses Sonnet-class model; prompt assembly includes contact brief + campaign goal + voice guide |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Generation skill → Heimdall | `PATCH /api/outreach-campaigns/[id]/emails/[emailId]/generation` | Auth: `Authorization: Bearer $(cat ~/.heimdall/api-token)` |
| Drafting skill → Heimdall | `PATCH .../recipient` and `PATCH .../draft` | Same auth pattern |
| Review UI → API | Standard `fetch()` from `'use client'` components | No Zustand needed for campaign/email state (no drag-and-drop optimism) |
| Triage filter → URL state | nuqs URL params; RSC reads `searchParams` | Filter is URL-driven, not client store-driven |
| Email status transitions → state machine | `canEmailTransition()` imported from `src/features/outreach/lib/email-status.ts` | Called by the `/status` API route before any write |

---

## Anti-Patterns to Avoid

### Calling Generation Inline from the API Route

**What:** Adding LLM generation directly inside a Next.js API route handler (fire-and-forget async IIFE, similar to the now-removed in-app Playwright scraper).

**Why it's wrong:** Vercel serverless functions have a 10s (Hobby) or 60s (Pro) execution limit. Claude API generation per email takes 5–15s per contact × 50 contacts = cannot complete in a single request. More importantly, the PROJECT.md Key Decisions table shows the in-app fire-and-forget IIFE was called out as a mistake that was fixed in Phase 5 by moving scraping to a skill.

**Do this instead:** The generation skill runs locally (outside the serverless runtime), reads the queue via REST, generates at its own pace, and writes back per-email. The UI polls or refreshes to show progress.

### Storing Google Tokens in Environment Variables

**What:** Putting `GOOGLE_ACCESS_TOKEN` / `GOOGLE_REFRESH_TOKEN` in `.env.local` and reading them from server-side API routes.

**Why it's wrong:** Tokens expire (access tokens in 1 hour). A server-side route cannot refresh the token and persist the new one back to `.env.local`. The token file approach (`~/.heimdall/google-token.json`) allows the skill to read, refresh, and write back atomically without server involvement.

**Do this instead:** Token file convention matching `~/.heimdall/api-token`. Skills handle token refresh inline. If Gmail API integration ever needs a web UI trigger, build a `/api/oauth/google/callback` route that writes to a `google_oauth_tokens` DB table — but that is not needed for v1.2 skill-only interactions.

### N+1 Contact Fetches in Campaign Email List

**What:** Fetching each contact separately in the campaign review page: `emails.forEach(e => fetch(/api/contacts/${e.contactId}))`.

**Why it's wrong:** 50 contacts = 50 round trips. The contacts table already has 1500+ rows and the PROJECT.md flags N+1 patterns as a performance concern.

**Do this instead:** The `GET /api/outreach-campaigns/[id]/emails` route does a single Drizzle JOIN or `inArray` fetch: `db.select().from(outreachEmails).leftJoin(contacts, eq(outreachEmails.contactId, contacts.id)).where(eq(outreachEmails.campaignId, id))`. The RSC page passes the joined data directly to the review component.

### Skipping `logTimeline()` on Skill Write-Backs

**What:** The skill write-back routes (`/generation`, `/draft`, `/recipient`) omit `logTimeline()` because "the skill already knows what happened."

**Why it's wrong:** `logTimeline()` is an unconditional invariant in this codebase — every write operation emits a timeline row. Skipping it breaks the activity feed for the owner and violates the pattern that the test suite (Phase 2) enforces.

**Do this instead:** Every write-back route calls `logTimeline({ eventType: '...', title: '...', contactId, metadata: { campaignId, outreachEmailId } })` before returning the success response.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Table schemas | HIGH | Derived directly from existing schema patterns (`job_leads.ts`, `contacts.ts`, `enums.ts`) |
| State machine | HIGH | Direct copy of `pipeline.ts` pattern with domain-appropriate states |
| REST route structure | HIGH | Follows existing route patterns (Zod → Drizzle → logTimeline → envelope) without ambiguity |
| Skill read/write-back pattern | HIGH | `scrape-linkedin-connections` SKILL.md provides the exact template; no guessing |
| Google OAuth token management | MEDIUM | Single-user file-based approach is straightforward; token refresh logic is standard OAuth2 but not yet in this codebase |
| Gmail MIME construction | MEDIUM | Well-documented API; no library ambiguity; but not yet implemented anywhere in the codebase |
| Google People API discovery quality | MEDIUM | Depends on how many contacts are in the owner's Google Contacts — may find fewer emails than expected |

---

## Sources

- `drizzle/schema/contacts.ts` — existing contact fields available for personalization
- `drizzle/schema/enums.ts` — existing enum patterns; new enums follow the same `pgEnum` shape
- `drizzle/schema/job-leads.ts` — `lastError` + `lastErrorAt` column pattern for skill-driven failure tracking
- `src/lib/domain/pipeline.ts` — `canTransition()` state machine to mirror for email status
- `src/lib/db/timeline.ts` — `logTimeline()` signature; `metadata` field for non-FK entity references
- `src/app/api/contacts/route.ts` — existing filter params (closeness, outreachStatus, warmth, relationship, search already present); missing `howMet` and date-range params
- `src/app/dashboard/contacts/triage/page.tsx` — RSC structure showing how to add `searchParams` predicates to the Drizzle query
- `.claude/skills/scrape-linkedin-connections/SKILL.md` — skill architecture template: queue read → act → write-back via REST, `~/.heimdall/api-token` auth convention, error categories, per-item failure isolation with batch continuation
- `.planning/PROJECT.md` — constraints (no server actions, REST-only mutations, soft deletes, Zod on all routes), Key Decisions table (fire-and-forget IIFE anti-pattern documented)
- `.planning/codebase/ARCHITECTURE.md` — existing component responsibility map and layer descriptions

---

*Architecture research for: v1.2 Networking Outreach Campaigns (Heimdall)*
*Researched: 2026-06-20*
