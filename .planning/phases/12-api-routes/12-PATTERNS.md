# Phase 12: API Routes - Pattern Map

**Mapped:** 2026-06-20
**Files analyzed:** 10 (9 new, 1 modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/api/outreach-campaigns/route.ts` | controller | CRUD + cursor-pagination | `src/app/api/job-leads/route.ts` | exact |
| `src/app/api/outreach-campaigns/[id]/route.ts` | controller | CRUD + soft-delete | `src/app/api/contacts/[id]/route.ts` | exact |
| `src/app/api/outreach-campaigns/[id]/emails/route.ts` | controller | CRUD + bulk-dedup-insert | `src/app/api/job-leads/route.ts` (GET) + `src/app/api/contacts/import/route.ts` (POST) | role-match |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts` | controller | CRUD + hard-delete | `src/app/api/contacts/[id]/route.ts` | role-match |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` | controller | state-machine-guarded update | `src/app/api/job-leads/[id]/status/route.ts` | exact |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts` | controller | write-back (request-response) | `src/app/api/job-leads/[id]/status/route.ts` (update+timeline shape) | role-match |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts` | controller | write-back (request-response) | `src/app/api/job-leads/[id]/status/route.ts` (update+timeline shape) | role-match |
| `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` | controller | write-back (request-response) | `src/app/api/job-leads/[id]/status/route.ts` (update+timeline shape) | role-match |
| `src/app/api/outreach-campaigns/[id]/generation-context/route.ts` | controller | aggregated-read (join + parallel) | `src/app/api/job-leads/[id]/recommendations/route.ts` | partial-match |
| `src/app/api/contacts/route.ts` | controller | CRUD + cursor-pagination + filter-accum | self (file being modified) | self |

---

## Pattern Assignments

### `src/app/api/outreach-campaigns/route.ts` (controller, CRUD + cursor-pagination)

**Analog:** `src/app/api/job-leads/route.ts`

**Imports pattern** (job-leads/route.ts lines 1-14):
```typescript
import { db } from '@/lib/db';
import { outreachCampaigns, outreachEmails } from '../../../../drizzle/schema';
import { and, count, desc, isNull, lt, sql, eq } from 'drizzle-orm';
import { created, paginated, success } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { outreachCampaignStatusValues } from '@/lib/domain/types';
```
Note: `count` and `outreachEmails` are needed for CD-01 per-campaign email counts via grouped aggregate (see CD-01 pattern below).

**GET list pattern — conditions[] + sql.join + paginated()** (job-leads/route.ts lines 24-88):
```typescript
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));

    const conditions = [isNull(outreachCampaigns.archivedAt)];

    if (cursor) {
      conditions.push(lt(outreachCampaigns.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
        : conditions[0];

    // CD-01: per-campaign email counts via a single GROUP BY subquery joined in,
    // not N+1 per campaign. Use count() FILTER (WHERE status = ...) or group-by-status.
    const results = await db
      .select({
        id: outreachCampaigns.id,
        name: outreachCampaigns.name,
        goalInstruction: outreachCampaigns.goalInstruction,
        status: outreachCampaigns.status,
        createdAt: outreachCampaigns.createdAt,
        updatedAt: outreachCampaigns.updatedAt,
        archivedAt: outreachCampaigns.archivedAt,
        emailCounts: sql<string>`
          json_build_object(
            'pending',   count(*) FILTER (WHERE ${outreachEmails.status} = 'pending'),
            'generated', count(*) FILTER (WHERE ${outreachEmails.status} = 'generated'),
            'edited',    count(*) FILTER (WHERE ${outreachEmails.status} = 'edited'),
            'approved',  count(*) FILTER (WHERE ${outreachEmails.status} = 'approved'),
            'drafted',   count(*) FILTER (WHERE ${outreachEmails.status} = 'drafted'),
            'failed',    count(*) FILTER (WHERE ${outreachEmails.status} = 'failed')
          )`
      })
      .from(outreachCampaigns)
      .leftJoin(outreachEmails, eq(outreachEmails.campaignId, outreachCampaigns.id))
      .where(where)
      .groupBy(outreachCampaigns.id)
      .orderBy(desc(outreachCampaigns.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor: data.length > 0 ? data[data.length - 1].updatedAt.toISOString() : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}
```

**POST create pattern** (job-leads/route.ts lines 99-242, simplified):
```typescript
const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  goalInstruction: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createCampaignSchema.parse(body);

    const [campaign] = await db
      .insert(outreachCampaigns)
      .values({ name: validated.name, goalInstruction: validated.goalInstruction })
      .returning();

    await logTimeline({
      eventType: 'outreach_campaign_created',
      title: `Campaign created: ${campaign.name}`,
      metadata: { campaignId: campaign.id }
    });

    return created(campaign);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/route.ts` (controller, CRUD + soft-delete)

**Analog:** `src/app/api/contacts/[id]/route.ts`

**Imports pattern** (contacts/[id]/route.ts lines 1-13):
```typescript
import { db } from '@/lib/db';
import { outreachCampaigns, outreachEmails } from '../../../../../drizzle/schema';
import { eq, isNull, count, sql } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { outreachCampaignStatusValues } from '@/lib/domain/types';
```

**GET single pattern** (contacts/[id]/route.ts lines 43-55):
```typescript
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Also include emailCounts (same CD-01 GROUP BY approach as the list route)
    const [campaign] = await db.select().from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id))
      .limit(1);
    if (!campaign) return notFound('Campaign');
    return success(campaign);
  } catch (err) {
    return serverError(err);
  }
}
```

**PATCH update pattern** (contacts/[id]/route.ts lines 57-95):
```typescript
const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  goalInstruction: z.string().min(1).optional(),
  status: z.enum(outreachCampaignStatusValues).optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateCampaignSchema.parse(body);

    const [campaign] = await db
      .update(outreachCampaigns)
      .set({ ...validated, updatedAt: new Date() })   // updatedAt ALWAYS set manually
      .where(eq(outreachCampaigns.id, id))
      .returning();

    if (!campaign) return notFound('Campaign');

    await logTimeline({
      eventType: 'outreach_campaign_updated',
      title: `Campaign updated: ${campaign.name}`,
      metadata: { campaignId: id }
    });

    return success(campaign);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

**DELETE soft pattern** (contacts/[id]/route.ts lines 97-121 — adapt to soft delete, matching campaign schema which has `archivedAt`):
```typescript
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [campaign] = await db
      .update(outreachCampaigns)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(outreachCampaigns.id, id))
      .returning();

    if (!campaign) return notFound('Campaign');

    await logTimeline({
      eventType: 'outreach_campaign_archived',
      title: `Campaign archived: ${campaign.name}`,
      metadata: { campaignId: id }
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/emails/route.ts` (controller, CRUD + bulk-dedup-insert)

**Analog (GET):** `src/app/api/job-leads/route.ts` lines 24-88 (cursor pagination with campaign filter)
**Analog (POST):** `src/app/api/contacts/import/route.ts` lines 160-196 (onConflictDoNothing + inserted/skipped count)

**Imports pattern:**
```typescript
import { db } from '@/lib/db';
import { outreachEmails, outreachCampaigns, contacts } from '../../../../../../drizzle/schema';
import { and, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { created, paginated, success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { outreachEmailStatusValues } from '@/lib/domain/types';
```

**GET list pattern — campaign-scoped pagination with contact join + optional ?status= filter:**
```typescript
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const statuses = parseArrayParam(searchParams.get('status'));

    const conditions = [eq(outreachEmails.campaignId, id)];   // always scope to campaign

    if (statuses) {
      conditions.push(
        inArray(outreachEmails.status, statuses as (typeof outreachEmailStatusValues)[number][])
      );
    }
    if (cursor) {
      conditions.push(lt(outreachEmails.updatedAt, cursor));
    }

    const where = sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`;

    const results = await db
      .select({ email: outreachEmails, contact: contacts })
      .from(outreachEmails)
      .leftJoin(contacts, eq(outreachEmails.contactId, contacts.id))
      .where(where)
      .orderBy(desc(outreachEmails.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor: data.length > 0 ? data[data.length - 1].email.updatedAt.toISOString() : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}
```

**POST bulk-add pattern — onConflictDoNothing + inserted/skipped** (contacts/import/route.ts lines 160-200):
```typescript
const bulkAddEmailsSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(500)
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = bulkAddEmailsSchema.parse(body);

    // Verify campaign exists
    const [campaign] = await db.select().from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id)).limit(1);
    if (!campaign) return notFound('Campaign');

    const rows = validated.contactIds.map((contactId) => ({
      campaignId: id,
      contactId,
      status: 'pending' as const
    }));

    // onConflictDoNothing leverages the UNIQUE (campaign_id, contact_id) constraint (CAMP-07)
    const inserted = await db
      .insert(outreachEmails)
      .values(rows)
      .onConflictDoNothing()
      .returning({ id: outreachEmails.id });

    const insertedCount = inserted.length;
    const skipped = validated.contactIds.length - insertedCount;

    // D-04: bulk-add is ONE timeline event carrying the count — not one per contact
    await logTimeline({
      eventType: 'outreach_emails_added',
      title: `Added ${insertedCount} contacts to ${campaign.name}`,
      metadata: { campaignId: id, inserted: insertedCount, skipped }
    });

    return created({ inserted: insertedCount, skipped });
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/emails/[emailId]/route.ts` (controller, CRUD + hard-delete)

**Analog:** `src/app/api/contacts/[id]/route.ts`

**Imports pattern:**
```typescript
import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
```

**PATCH inline-edit pattern** (contacts/[id]/route.ts lines 57-95, adapted):
```typescript
const inlineEditSchema = z.object({
  editedSubject: z.string().max(500).optional().nullable(),
  editedBody: z.string().optional().nullable(),
  recipientEmail: z.string().email().optional().nullable()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = inlineEditSchema.parse(body);

    // CD-06: verify email belongs to this campaign
    const [existing] = await db.select().from(outreachEmails)
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .limit(1);
    if (!existing) return notFound('Email');

    // CD-02: auto-transition generated → edited when editedSubject/editedBody written
    const isEdit = validated.editedSubject !== undefined || validated.editedBody !== undefined;
    const shouldTransitionToEdited =
      isEdit && (existing.status === 'generated' || existing.status === 'approved');

    const [email] = await db
      .update(outreachEmails)
      .set({
        ...validated,
        ...(shouldTransitionToEdited ? { status: 'edited' } : {}),
        updatedAt: new Date()   // ALWAYS set manually
      })
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    await logTimeline({
      eventType: 'outreach_email_edited',
      title: `Email edited`,
      metadata: { campaignId: id, emailId }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

**DELETE hard pattern** (CD-04 — outreach_emails has NO archivedAt column):
```typescript
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;

    // Hard delete — outreach_emails has no archivedAt (CD-04)
    const [deleted] = await db
      .delete(outreachEmails)
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    if (!deleted) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_deleted',
      title: `Email removed from campaign`,
      metadata: { campaignId: id, emailId }
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/emails/[emailId]/status/route.ts` (controller, state-machine-guarded update)

**Analog:** `src/app/api/job-leads/[id]/status/route.ts` — copy this file's shape verbatim, swapping:
- `canJobLeadTransition` → `canEmailTransition` from `@/features/outreach/lib/email-status`
- `jobLeads` → `outreachEmails`, `jobLeadStatusValues` → `outreachEmailStatusValues`
- `eventTypeFor()` → inline `outreach_email_status_changed` (or per-status mapping per D-04)
- Add D-05 reset logic when `newStatus === 'pending'`

**Imports pattern** (job-leads/[id]/status/route.ts lines 1-9, adapted):
```typescript
import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canEmailTransition } from '@/features/outreach/lib/email-status';
import { outreachEmailStatusValues } from '@/lib/domain/types';
import { z } from 'zod';
```

**Core PATCH pattern** (job-leads/[id]/status/route.ts lines 58-119, adapted with D-05):
```typescript
const statusChangeSchema = z.object({
  status: z.enum(outreachEmailStatusValues),
  lastError: z.string().max(500).nullable().optional()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = statusChangeSchema.parse(body);
    const newStatus = validated.status;

    // CD-06: verify email belongs to campaign
    const [email] = await db.select().from(outreachEmails)
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .limit(1);
    if (!email) return notFound('Email');

    // State machine guard — canEmailTransition from email-status.ts
    if (!canEmailTransition(email.status, newStatus)) {
      return validationError(`Invalid transition: ${email.status} -> ${newStatus}`);
    }

    // CD-03: guard → approved only when content exists
    if (newStatus === 'approved') {
      const subject = email.editedSubject ?? email.generatedSubject;
      const body = email.editedBody ?? email.generatedBody;
      if (!subject || !body) {
        return validationError('Cannot approve: email has no content');
      }
    }

    // Build update — D-05 reset semantics when transitioning → pending
    const update: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date()
    };
    if (newStatus === 'pending') {
      // D-05: clear edited* + error fields; keep generated* (shown greyed-out)
      update.editedSubject = null;
      update.editedBody = null;
      update.lastError = null;
      update.lastErrorAt = null;
      update.generatedAt = null;
      // generatedSubject / generatedBody intentionally NOT cleared
    } else if (newStatus === 'failed') {
      update.lastError = validated.lastError ?? null;
      update.lastErrorAt = new Date();
    } else if (newStatus === 'approved') {
      update.approvedAt = new Date();
    }

    const [updated] = await db
      .update(outreachEmails)
      .set(update)
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    await logTimeline({
      eventType: 'outreach_email_status_changed',
      title: `Email: ${email.status} -> ${newStatus}`,
      metadata: { campaignId: id, emailId, from: email.status, to: newStatus }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/emails/[emailId]/generation/route.ts` (controller, write-back)

**Analog:** `src/app/api/job-leads/[id]/status/route.ts` (update + logTimeline shape, no state-machine check here — generation skill uses `/status` for transitions, this route just writes content)

**Full PATCH pattern:**
```typescript
import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const generationWriteBackSchema = z.object({
  generatedSubject: z.string().min(1).max(500),
  generatedBody: z.string().min(1)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = generationWriteBackSchema.parse(body);

    // CD-06: verify email belongs to campaign
    const [email] = await db
      .update(outreachEmails)
      .set({
        generatedSubject: validated.generatedSubject,
        generatedBody: validated.generatedBody,
        generatedAt: new Date(),
        updatedAt: new Date()   // always manual
      })
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_generated',
      title: `Email content generated`,
      metadata: { campaignId: id, emailId }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/emails/[emailId]/recipient/route.ts` (controller, write-back)

**Analog:** Same write-back shape as `/generation`. Key difference: conditional null on `channel='linkedin_message'` (Phase 11 D-08 discovery model, CD-06).

**Full PATCH pattern:**
```typescript
import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { outreachChannelValues } from '@/lib/domain/types';

const recipientWriteBackSchema = z.object({
  channel: z.enum(outreachChannelValues),
  recipientEmail: z.string().email().optional().nullable()
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = recipientWriteBackSchema.parse(body);

    // CD-06 + Phase 11 D-08: linkedin_message channel forces recipientEmail = null
    const recipientEmail =
      validated.channel === 'linkedin_message' ? null : (validated.recipientEmail ?? null);

    const [email] = await db
      .update(outreachEmails)
      .set({
        channel: validated.channel,
        recipientEmail,
        updatedAt: new Date()
      })
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_recipient_set',
      title: `Email recipient set (channel: ${validated.channel})`,
      metadata: { campaignId: id, emailId, channel: validated.channel }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/emails/[emailId]/draft/route.ts` (controller, write-back)

**Analog:** Same write-back shape. Writes `gmailDraftId`, sets `draftedAt`.

**Full PATCH pattern:**
```typescript
import { db } from '@/lib/db';
import { outreachEmails } from '../../../../../../../../drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const draftWriteBackSchema = z.object({
  gmailDraftId: z.string().min(1)
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  try {
    const { id, emailId } = await params;
    const body = await request.json();
    const validated = draftWriteBackSchema.parse(body);

    const [email] = await db
      .update(outreachEmails)
      .set({
        gmailDraftId: validated.gmailDraftId,
        draftedAt: new Date(),
        updatedAt: new Date()
      })
      .where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.campaignId, id)))
      .returning();

    if (!email) return notFound('Email');

    await logTimeline({
      eventType: 'outreach_email_drafted',
      title: `Gmail draft created`,
      metadata: { campaignId: id, emailId, gmailDraftId: validated.gmailDraftId }
    });

    return success(email);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
```

---

### `src/app/api/outreach-campaigns/[id]/generation-context/route.ts` (controller, aggregated-read)

**Analog:** `src/app/api/job-leads/[id]/recommendations/route.ts` (verify entity exists → joined SELECT → assemble shaped response). No exact match exists — the multi-table join + lowContext flag is novel to this phase.

**Pattern: verify campaign → fetch pending emails with contact join → fetch recent interactions per contact → assemble D-02 payload**

Key patterns borrowed:
- `recommendations/route.ts` lines 13-24: verify parent entity, return `notFound` early
- `recommendations/route.ts` lines 32-40: `db.select({ a: tableA, b: tableB }).from(tableA).innerJoin(tableB, ...)` shaped select
- `contacts/[id]/interactions/route.ts` lines 7-23: interactions fetched by contactId ordered by `occurredAt desc`
- D-02 `lowContext` flag: `interactions.length < 2`

**Imports pattern:**
```typescript
import { db } from '@/lib/db';
import { outreachCampaigns, outreachEmails, contacts, interactions } from '../../../../../../drizzle/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError } from '@/lib/api/errors';
```

**Core GET pattern** (D-01/D-02):
```typescript
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify campaign exists (recommendations/route.ts lines 20-24 pattern)
    const [campaign] = await db.select().from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id)).limit(1);
    if (!campaign) return notFound('Campaign');

    // Fetch all pending emails with contact join (one query — no N+1)
    const emailRows = await db
      .select({ email: outreachEmails, contact: contacts })
      .from(outreachEmails)
      .innerJoin(contacts, eq(outreachEmails.contactId, contacts.id))
      .where(and(eq(outreachEmails.campaignId, id), eq(outreachEmails.status, 'pending')));

    if (emailRows.length === 0) {
      return success({ goalInstruction: campaign.goalInstruction, emails: [] });
    }

    // Fetch recent interactions for all contact IDs — one query, not N+1
    const contactIds = emailRows.map((r) => r.contact.id);
    const allInteractions = await db
      .select()
      .from(interactions)
      .where(inArray(interactions.contactId, contactIds))
      .orderBy(desc(interactions.occurredAt));

    // Group interactions by contactId
    const interactionsByContact = allInteractions.reduce<Record<string, typeof allInteractions>>(
      (acc, i) => {
        if (!acc[i.contactId!]) acc[i.contactId!] = [];
        acc[i.contactId!].push(i);
        return acc;
      },
      {}
    );

    // Assemble D-02 payload per pending email
    const emails = emailRows.map(({ email, contact }) => {
      const recentInteractions = (interactionsByContact[contact.id] ?? []).slice(0, 3);
      return {
        emailId: email.id,
        contactId: contact.id,
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          howMet: contact.howMet,
          companyAtConnection: contact.companyAtConnection,
          roleAtConnection: contact.roleAtConnection,
          currentCompany: contact.currentCompany,
          title: contact.title,
          closeness: contact.closeness,
          recipientEmail: email.recipientEmail
        },
        interactions: recentInteractions.map((i) => ({
          type: i.type,
          summary: i.notes,
          occurredAt: i.occurredAt
        })),
        lowContext: recentInteractions.length < 2   // D-02 anti-hallucination flag
      };
    });

    return success({ goalInstruction: campaign.goalInstruction, emails });
  } catch (err) {
    return serverError(err);
  }
}
```

**Implementation note:** `interactions.notes` is the nearest analog for the "summary" field — confirm the exact column name against `drizzle/schema/interactions.ts` before filing. The `inArray` + `reduce` group approach avoids N+1 while staying in the Drizzle query builder (no raw SQL).

---

### `src/app/api/contacts/route.ts` (MODIFY — add D-07 filter params)

**Analog:** Self — the file being modified. Slot three new filter blocks into the `GET` handler's `conditions[]` accumulation section (contacts/route.ts lines 53-79), after the existing `outreachStatusFilter` block and before the `search` block.

**Addition: new imports** — add `gte`, `lte` to the existing drizzle-orm import line (line 3):
```typescript
import { desc, isNull, inArray, ilike, lt, sql, gte, lte } from 'drizzle-orm';
```

**Addition: new query-param reads** — after line 51 (`const search = searchParams.get('search');`):
```typescript
const howMet = searchParams.get('howMet');
const connectionYearStart = searchParams.get('connectionYearStart');
const connectionYearEnd = searchParams.get('connectionYearEnd');
```

**Addition: three new conditions** — insert after the `outreachStatusFilter` block (after line 65) and before the `search` block:
```typescript
if (howMet) {
  // ilike wraps in % both sides — matches the search pattern used for firstName/lastName
  conditions.push(ilike(contacts.howMet, `%${howMet}%`));
}
if (connectionYearStart) {
  // D-07: gte on Jan 1 of the start year
  conditions.push(gte(contacts.linkedinConnectionDate, new Date(`${connectionYearStart}-01-01`)));
}
if (connectionYearEnd) {
  // D-07: lte on Dec 31 23:59:59 of the end year
  conditions.push(lte(contacts.linkedinConnectionDate, new Date(`${connectionYearEnd}-12-31T23:59:59`)));
}
```

No other changes to the file. The `conditions[]` + `sql.join` assembly (lines 76-79) handles the new predicates automatically.

---

## Shared Patterns

### Envelope helpers
**Source:** `src/lib/api/types.ts` (all 38 lines)
**Apply to:** Every route file in this phase
```typescript
// success(data)       → 200 { success: true, data }
// created(data)       → 201 { success: true, data }
// paginated(data, meta) → 200 { success: true, data, meta: { cursor, hasMore } }
import { created, paginated, success } from '@/lib/api/types';
```

### Error factories
**Source:** `src/lib/api/errors.ts` (all 22 lines)
**Apply to:** Every route file in this phase
```typescript
// notFound(entity)      → 404 { success: false, error: "<entity> not found" }
// validationError(msg)  → 400 { success: false, error: msg }
// serverError(err)      → 500 logs console.error('API Error:', err)
import { notFound, serverError, validationError } from '@/lib/api/errors';
```

### Pagination helpers
**Source:** `src/lib/api/filters.ts` (all 20 lines)
**Apply to:** `outreach-campaigns/route.ts`, `outreach-campaigns/[id]/emails/route.ts`
```typescript
// parseCursor(param) → Date | null
// parseLimit(param, max?)  → number (default 20, cap 100)
// parseArrayParam(param)   → string[] | null (comma-split)
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
```

### Timeline logger
**Source:** `src/lib/db/timeline.ts` (all 23 lines)
**Apply to:** Every route file with a write operation in this phase
```typescript
await logTimeline({
  eventType: 'outreach_campaign_created',    // D-04: distinct string per operation
  title: 'Human-readable description',
  metadata: { campaignId, emailId, ... }     // entityIds + relevant counts
});
import { logTimeline } from '@/lib/db/timeline';
```

### conditions[] + sql.join filter accumulation
**Source:** `src/app/api/contacts/route.ts` lines 53-79; `src/app/api/job-leads/route.ts` lines 31-49
**Apply to:** `outreach-campaigns/route.ts`, `outreach-campaigns/[id]/emails/route.ts`, `contacts/route.ts` (modification)
```typescript
const conditions = [isNull(table.archivedAt)];   // or eq(table.campaignId, id)
// ... push additional predicates ...
if (cursor) { conditions.push(lt(table.updatedAt, cursor)); }

const where =
  conditions.length > 1
    ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
    : conditions[0];
```

### updatedAt manual set on every UPDATE
**Source:** `src/app/api/contacts/[id]/route.ts` line 66; `src/app/api/job-leads/[id]/status/route.ts` line 84
**Apply to:** Every PATCH/update in this phase — Drizzle does NOT auto-update this column
```typescript
.set({ ...validated, updatedAt: new Date() })
```

### Zod error handling
**Source:** `src/app/api/job-leads/[id]/status/route.ts` lines 114-116; `src/app/api/contacts/route.ts` lines 133-136
**Apply to:** All routes with POST/PATCH and a Zod schema
```typescript
} catch (err) {
  if (err instanceof z.ZodError) {
    return validationError(err.issues[0].message);
  }
  return serverError(err);
}
```

### canEmailTransition guard
**Source:** `src/features/outreach/lib/email-status.ts` (all 22 lines)
**Apply to:** `outreach-campaigns/[id]/emails/[emailId]/status/route.ts` only
```typescript
import { canEmailTransition } from '@/features/outreach/lib/email-status';
// ...
if (!canEmailTransition(email.status, newStatus)) {
  return validationError(`Invalid transition: ${email.status} -> ${newStatus}`);
}
```

### Route handler param shape (Next.js App Router)
**Source:** Every existing route file — e.g., `src/app/api/job-leads/[id]/status/route.ts` lines 11-13, 58-62
**Apply to:** All [id]/* routes (params is a Promise in Next.js 16)
```typescript
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; emailId: string }> }
) {
  const { id, emailId } = await params;
```

---

## No Analog Found

All 10 files have usable analogs. The `generation-context` endpoint has no exact match but can be composed cleanly from the recommendations route (join pattern) + interactions route (contact-scoped fetch) + `inArray` grouping.

---

## Metadata

**Analog search scope:** `src/app/api/`, `src/lib/api/`, `src/lib/db/`, `src/features/outreach/lib/`, `drizzle/schema/`
**Files scanned:** 14
**Pattern extraction date:** 2026-06-20
