import { db } from '@/lib/db';
import { jobLeads } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canJobLeadTransition } from '@/lib/domain/job-lead-pipeline';
import { jobLeadStatusValues } from '@/lib/domain/types';
import { z } from 'zod';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [lead] = await db
      .select({
        status: jobLeads.status,
        prospectCount: jobLeads.prospectCount,
        updatedAt: jobLeads.updatedAt
      })
      .from(jobLeads)
      .where(eq(jobLeads.id, id))
      .limit(1);

    if (!lead) return notFound('Job lead');

    return success(lead);
  } catch (err) {
    return serverError(err);
  }
}

// D-08 state machine + D-09 lastError surfacing.
// 220 = 200 chars of detail + ~20 chars category prefix budget.
const statusChangeSchema = z.object({
  status: z.enum(jobLeadStatusValues),
  lastError: z.string().max(220).nullable().optional()
});

function eventTypeFor(newStatus: string): string {
  switch (newStatus) {
    case 'queued':
      return 'job_lead_search_queued';
    case 'searching':
      return 'job_lead_search_claimed';
    case 'failed':
      return 'job_lead_search_failed';
    case 'found':
      return 'job_lead_search_complete';
    default:
      return 'job_lead_status_changed';
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = statusChangeSchema.parse(body);
    const newStatus = validated.status;

    const [lead] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, id))
      .limit(1);

    if (!lead) return notFound('Job lead');

    if (!canJobLeadTransition(lead.status, newStatus)) {
      return validationError(`Invalid transition: ${lead.status} -> ${newStatus}`);
    }

    // Build the partial update. Failure path stamps lastError + lastErrorAt;
    // retry/success paths (queued, found) clear them.
    const update: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date()
    };
    if (newStatus === 'failed') {
      update.lastError = validated.lastError ?? null;
      update.lastErrorAt = new Date();
    } else if (newStatus === 'queued' || newStatus === 'found') {
      update.lastError = null;
      update.lastErrorAt = null;
    }

    const [updated] = await db
      .update(jobLeads)
      .set(update)
      .where(eq(jobLeads.id, id))
      .returning();

    await logTimeline({
      eventType: eventTypeFor(newStatus),
      title: `${lead.companyName || 'Job lead'}: ${lead.status} -> ${newStatus}`,
      companyId: lead.companyId || undefined,
      metadata: {
        jobLeadId: id,
        from: lead.status,
        to: newStatus,
        lastError: validated.lastError ?? null
      }
    });

    return success(updated);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
