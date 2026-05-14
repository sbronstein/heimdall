import { db } from '@/lib/db';
import { jobLeads, prospects } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { scrapeConnections } from '@/features/job-leads/lib/scrape-connections';
import { matchConnections } from '@/features/job-leads/lib/match-connections';
import { inferSeniority } from '@/features/job-leads/lib/seniority';

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
    if (!lead.companyName) {
      return Response.json(
        { success: false, error: 'Company name not available. Scrape the job page first.' },
        { status: 400 }
      );
    }

    // Set status to searching
    await db
      .update(jobLeads)
      .set({ status: 'searching', updatedAt: new Date() })
      .where(eq(jobLeads.id, id));

    // Fire-and-forget: run the search async
    (async () => {
      try {
        const { prospects: scrapedProspects, context } =
          await scrapeConnections(lead.companyName!, {
            jobUrl: lead.linkedinJobUrl
          });

        // Insert prospects into DB
        for (const sp of scrapedProspects) {
          const { level } = inferSeniority(sp.title || '');
          await db.insert(prospects).values({
            jobLeadId: id,
            name: sp.name,
            title: sp.title,
            seniorityLevel: level,
            linkedinUrl: sp.linkedinUrl,
            profileSnippet: sp.profileSnippet
          });
        }

        // Match mutual connections to contacts
        const matchResult = await matchConnections(id, scrapedProspects);

        // Update lead with results
        const newStatus =
          matchResult.contactIdsNeedingTriage.length > 0 ? 'found' : 'ready';

        await db
          .update(jobLeads)
          .set({
            status: newStatus,
            prospectCount: scrapedProspects.length,
            updatedAt: new Date()
          })
          .where(eq(jobLeads.id, id));

        await logTimeline({
          eventType: 'job_lead_search_complete',
          title: `Found ${scrapedProspects.length} prospects at ${lead.companyName}`,
          companyId: lead.companyId || undefined,
          metadata: {
            jobLeadId: id,
            prospectCount: scrapedProspects.length,
            matched: matchResult.matched,
            unmatched: matchResult.unmatched
          }
        });

        // Leave browser open for now (debug mode)
        // await context.close();
      } catch (err) {
        console.error('Connection search failed:', err);
        await db
          .update(jobLeads)
          .set({ status: 'scraped', updatedAt: new Date() })
          .where(eq(jobLeads.id, id));
      }
    })();

    return success({ status: 'searching', message: 'Search started. Poll /status for progress.' });
  } catch (err) {
    return serverError(err);
  }
}
