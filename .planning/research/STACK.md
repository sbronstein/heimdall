# Stack Research

**Domain:** Networking outreach email campaigns — AI email generation, Gmail drafting, contact email discovery
**Researched:** 2026-06-20
**Confidence:** HIGH for Gmail/People MCP tools (verified from official Google developer docs); MEDIUM for MCP tool naming convention (verified via multiple sources but exact names depend on how `claude mcp add` is invoked)

## Context: Fixed Stack

The core stack is fixed and must not change. This document covers only what is new or different for v1.2.

Fixed and already present: Next.js 16 (App Router, RSC), Neon Postgres, Drizzle ORM v0.45.1, shadcn/ui, Tailwind v4, Clerk, Recharts, Zod v4, react-hook-form v7, zustand v5, vitest.

---

## What is Actually New for v1.2

### New App-Side Requirements (no new npm packages)

The campaign and email tables, API routes, and UI components are all built with existing dependencies. Nothing new is needed server-side.

| Concern | Handled By | Already Present |
|---------|-----------|-----------------|
| New Drizzle schema (`outreach_campaigns`, `outreach_emails`) | `drizzle-orm` v0.45.1 + `drizzle-kit` v0.31.9 | Yes |
| New enum types (`email_status`: generated/edited/approved/drafted) | Drizzle `pgEnum` in `drizzle/schema/enums.ts` | Pattern exists |
| API route validation | `zod` v4 | Yes |
| Campaign creation / contact filter UI | shadcn/ui + react-hook-form v7 | Yes |
| Checkbox multi-select contact table | `@tanstack/react-table` v8 (row selection already in data-table) | Yes |
| Inline email editor (review/approve) | shadcn/ui `Textarea` + react-hook-form | Yes |
| Optimistic status transitions | `zustand` v5 | Yes |
| Timeline logging on every write | `logTimeline()` in `src/lib/db/timeline.ts` | Yes |

**Conclusion: zero new npm packages required for the app layer.**

---

## New: Google Gmail MCP Server

**Purpose:** Create Gmail drafts from approved outreach emails inside a Claude Code skill.

| Property | Value |
|----------|-------|
| Server URL | `https://gmailmcp.googleapis.com/mcp/v1` |
| Type | Official Google remote MCP server (not local/npm) |
| Auth | OAuth 2.0 — configured once via `claude mcp add` |
| Required OAuth scopes | `https://www.googleapis.com/auth/gmail.readonly` + `https://www.googleapis.com/auth/gmail.compose` |

### Gmail MCP Tools Available

| Tool | Purpose | Key Parameters | Returns |
|------|---------|----------------|---------|
| `create_draft` | Create a Gmail draft | `to[]` (required), `subject`, `body`, `htmlBody`, `cc[]`, `bcc[]`, `replyToMessageId` | `{ id, subject, threadId, toRecipients[], date }` — **`id` is the Gmail draft ID to store back in Heimdall** |
| `search_threads` | Search Gmail threads | `query` (Gmail search syntax) | Array of thread summaries with participants |
| `get_thread` | Retrieve full thread | `threadId` | Full thread with all messages and headers |
| `list_drafts` | List existing drafts | — | Draft list |

### create_draft: Critical Details

- `body` accepts a plain text string directly — **no MIME encoding, no base64, no RFC 2822 formatting needed**
- `to[]` is the only required parameter; `subject` and `body` are optional but practically required for usable drafts
- The returned `id` is the Gmail draft resource ID (e.g., `"r1234567890"`), distinct from the message ID — this is what gets stored as `gmailDraftId` on the `outreach_emails` row
- `create_draft` never sends — it only creates a draft in the user's Drafts folder, fulfilling the "never sends" constraint exactly

### MCP Configuration (one-time setup per Google account)

```bash
# Add Gmail MCP server (name "gmail" determines the tool prefix mcp__gmail__*)
claude mcp add --transport http gmail https://gmailmcp.googleapis.com/mcp/v1

# Add People API MCP server (name "people" determines the tool prefix mcp__people__*)
claude mcp add --transport http people https://people.googleapis.com/mcp/v1
```

Each `claude mcp add` triggers an OAuth flow once. Tokens are stored by Claude Code and refreshed automatically.

**Google Cloud Project prerequisites** (one-time):
1. Enable Gmail API + People API in the project
2. Create an OAuth 2.0 client (Web application type)
3. Add redirect URI: `https://claude.ai/api/mcp/auth_callback`
4. Configure OAuth consent screen with the required scopes

---

## New: Google People API MCP Server

**Purpose:** Look up email addresses for contacts not stored in Heimdall's `email` column.

| Property | Value |
|----------|-------|
| Server URL | `https://people.googleapis.com/mcp/v1` |
| Type | Official Google remote MCP server |
| Auth | OAuth 2.0 (same Google Cloud project as Gmail MCP) |
| Required OAuth scopes | `https://www.googleapis.com/auth/contacts.readonly` + `https://www.googleapis.com/auth/directory.readonly` + `https://www.googleapis.com/auth/userinfo.profile` |

### People API MCP Tools Available

| Tool | Purpose | Parameters | Returns |
|------|---------|-----------|---------|
| `search_contacts` | Search the user's Google Contacts by name/email/company | `query` (string), `maxResults` (int, default 10, max 30) | Array of `{ name, email }` |
| `get_user_profile` | Retrieve the authenticated user's own profile | — | Profile info |
| `search_directory_people` | Search Google Workspace directory (org-wide) | `query` | Directory entries |

### search_contacts: Critical Details

- Returns the contact's primary email address in the `email` field — one email per result entry
- If a person has multiple email addresses, only the primary is returned
- `maxResults` caps at 30 — sufficient for name-based disambiguation
- Does NOT search contacts by LinkedIn URL — queries match against name, email, org, and phone

### Email Discovery Logic (in the skill)

For contacts without a stored `email` in Heimdall, the skill executes this lookup chain:

1. **People API first**: `search_contacts` with query `"${firstName} ${lastName}"` → if `results[0].email` matches expected domain/company context, use it
2. **Gmail thread search fallback**: `search_threads` with query `from:"${firstName} ${lastName}" OR to:"${firstName} ${lastName}"` → extract sender/recipient email from thread participants
3. **No email found**: flag the `outreach_emails` row with `status = 'needs_linkedin_message'` so the UI surfaces it distinctly — the contact gets a LinkedIn message instead of a Gmail draft

This chain stays entirely within the skill — no server-side integration with Google APIs, no OAuth tokens in `.env.local`, no googleapis npm package.

---

## New: Two Claude Code Skills

### Skill 1: `generate-outreach-emails`

Reads a campaign from Heimdall, generates one email per contact using Claude's own text generation (following the voice + LLM-tell conventions from `tailor-application-materials`), and writes generated emails back to Heimdall via REST.

```yaml
allowed-tools:
  - Read
  - Bash
```

No MCP tools needed — email generation is Claude reasoning over contact data, not a tool call. Writes back via `curl` to Heimdall REST API.

### Skill 2: `draft-outreach-emails`

Reads approved emails from Heimdall, discovers missing email addresses, creates Gmail drafts, and writes draft IDs + status transitions back.

```yaml
allowed-tools:
  - Read
  - Bash
  - mcp__gmail__create_draft
  - mcp__gmail__search_threads
  - mcp__gmail__get_thread
  - mcp__people__search_contacts
```

**Note on tool names**: The prefix `mcp__gmail__` and `mcp__people__` assumes the MCP servers were added with names `gmail` and `people` respectively (via `claude mcp add --transport http gmail ...` and `claude mcp add --transport http people ...`). If different names are used at setup time, the `allowed-tools` entries must match.

### Skill Pattern: Same as Existing Skills

Both new skills follow the established pattern:
- `~/.heimdall/api-token` for Heimdall REST auth
- `curl` in Bash for all Heimdall reads/writes
- Check prerequisites at start; surface gaps and stop rather than proceeding broken
- Per-contact error isolation — log and continue, never abort the batch
- End with a summary count

---

## Alternatives Considered

| Concern | Recommended | Alternative | Why Not |
|---------|-------------|-------------|---------|
| Gmail draft creation | Google Gmail MCP (`create_draft` tool) | `googleapis` npm package in a server-side route | Adding a Node.js server-side integration introduces OAuth token management in `.env.local`, a new npm dep, and violates the skill pattern — skills already own external integrations |
| Gmail draft creation | Google Gmail MCP | Direct `curl` to Gmail REST API with stored token | Requires maintaining refresh tokens in `~/.heimdall/`, a custom token-refresh script, and base64-encoded MIME bodies — more fragile than the MCP approach |
| Email discovery | People API MCP `search_contacts` → Gmail MCP `search_threads` | Google Contacts CSV export + manual lookup | Not automated; breaks the skill loop |
| Email body composition | Plain text string passed to `create_draft.body` | `mjml` or Handlebars templating | Outreach emails are plain-text conversational emails, not HTML marketing emails; templating is unnecessary complexity |
| Email composition | Plain text | `nodemailer` | `nodemailer` is for sending via SMTP — completely wrong tool for creating drafts via Gmail API |
| MIME encoding | None needed (`create_draft` accepts strings) | `mailcomposer` or hand-crafted base64 RFC 2822 | The Gmail MCP `create_draft` tool handles encoding internally; passing `body` + `to[]` + `subject` is sufficient |

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `googleapis` npm package | Server-side Gmail API integration violates the skill pattern; OAuth token management in `.env.local` is fragile | Gmail MCP `create_draft` tool in the skill |
| `google-auth-library` npm package | Same reason — Google auth belongs at MCP config level, not in the Next.js app | MCP server OAuth flow (one-time setup) |
| `nodemailer` | Built for SMTP sending; irrelevant for Gmail API draft creation | Gmail MCP `create_draft` |
| `mjml` or any HTML email templating library | Networking outreach emails are plain text; HTML email templates are for marketing blasts | Claude generates plain text `body` string |
| Any MIME encoding library (`mailparser`, `mime`, `mailcomposer`) | `create_draft` accepts `body` as a plain string; MIME encoding is handled by Google's API internally | Pass `body` directly |
| `bull` / `bullmq` / any background job queue | Email generation and drafting are synchronous skill runs, not server-initiated async jobs | Skill-driven workflow (user invokes, skill loops per contact) |
| Server-side Google OAuth in `.env.local` | Auth lives at the MCP layer; putting Google credentials in the Next.js app would duplicate auth responsibility | `claude mcp add` OAuth configuration |
| `@sendgrid/mail` or any ESP SDK | This is a personal outreach tool, not a bulk email platform | Gmail MCP |
| Any additional "send" capability beyond draft creation | The requirement is explicit — only create drafts, never send | Keep `create_draft` as the terminal action; user sends manually from Gmail |

---

## MCP Configuration Not Yet Present

Verified: `~/.claude/settings.json` has no `mcpServers` key. Neither Gmail nor People API MCP is currently configured. Both must be added before the `draft-outreach-emails` skill can run.

This is a one-time setup step that lives outside the codebase — it runs against the user's Google account and stores OAuth tokens in Claude Code's credential store. No app code change is needed to support it.

**Required setup (before Phase implementing the drafting skill):**
1. Google Cloud Project: enable Gmail API + People API, create OAuth 2.0 client, add `https://claude.ai/api/mcp/auth_callback` as redirect URI
2. `claude mcp add --transport http gmail https://gmailmcp.googleapis.com/mcp/v1`
3. `claude mcp add --transport http people https://people.googleapis.com/mcp/v1`
4. Complete the OAuth consent flows for each server

---

## No New Environment Variables

The Heimdall `.env.local` does not need any Google credentials. MCP auth is handled entirely at the Claude Code session layer. The new env vars needed by the app for v1.2 are none — all new functionality uses existing `DATABASE_URL`, `CLERK_*`, and the existing `~/.heimdall/api-token` pattern.

---

## Sources

- `https://developers.google.com/workspace/guides/configure-mcp-servers` — confirmed Gmail MCP URL, People API MCP URL, and full tool lists for both servers (HIGH confidence)
- `https://developers.google.com/workspace/gmail/api/reference/mcp/tools_list/create_draft` — exact `create_draft` input schema (`to[]`, `subject`, `body`, `htmlBody`, `replyToMessageId`) and return schema (`id`, `subject`, `threadId`, etc.) (HIGH confidence)
- `https://developers.google.com/people/api/mcp/tools_list/search_contacts` — `search_contacts` parameters (`query`, `maxResults`) and return shape (`{ name, email }`) (HIGH confidence)
- `https://developers.google.com/workspace/gmail/api/guides/configure-mcp-server` — OAuth scopes for Gmail MCP: `gmail.readonly` + `gmail.compose` (HIGH confidence)
- `https://developers.google.com/people/v1/configure-mcp-server` — OAuth scopes for People API MCP: `contacts.readonly`, `directory.readonly`, `userinfo.profile` (HIGH confidence)
- GitHub issue anthropics/claude-code#45775 (`create_draft` missing `threadId` parameter bug) — confirmed `create_draft` is the right tool but has a known regression for reply threading; plain new-draft creation is unaffected (MEDIUM confidence — issue page inaccessible, inferred from search result summaries)
- MCP tool naming convention `mcp__<server-name>__<tool-name>` — verified via multiple Claude Code documentation sources (MEDIUM confidence — exact names depend on the `--name` argument to `claude mcp add`)
- `~/.claude/settings.json` inspection — confirmed no MCP servers currently configured (HIGH confidence — direct file read)

---

*Stack research for: Heimdall v1.2 Networking Outreach Campaigns*
*Researched: 2026-06-20*
