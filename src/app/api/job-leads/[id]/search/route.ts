import { db } from '@/lib/db';
import { jobLeads } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { canJobLeadTransition } from '@/lib/domain/job-lead-pipeline';

// Thin synchronous status flip: scraped|failed -> queued.
// Real connection scraping is performed out-of-band by the Claude Code skill
// (Plan 06); this route exists so the UI and the skill share one transition
// gate. canJobLeadTransition is the single source of truth — same graph as
// PATCH /status — so there is no possibility of drift between the two routes.

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const [lead] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, id))
      .limit(1);

    if (!lead) return notFound('Job lead');

    if (!canJobLeadTransition(lead.status, 'queued')) {
      return validationError(`Cannot queue lead in status '${lead.status}'`);
    }

    const [updated] = await db
      .update(jobLeads)
      .set({
        status: 'queued',
        lastError: null,
        lastErrorAt: null,
        updatedAt: new Date()
      })
      .where(eq(jobLeads.id, id))
      .returning();

    await logTimeline({
      eventType: 'job_lead_search_queued',
      title: `Queued for connection scrape: ${lead.companyName || 'Unknown'}`,
      companyId: lead.companyId || undefined,
      metadata: { jobLeadId: id, from: lead.status, to: 'queued' }
    });

    return success(updated);
  } catch (err) {
    return serverError(err);
  }
}
