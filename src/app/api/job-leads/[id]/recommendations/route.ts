import { db } from '@/lib/db';
import {
  jobLeads,
  prospects,
  prospectBridges,
  contacts
} from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError } from '@/lib/api/errors';
import {
  buildRecommendations,
  computeBridgeScore
} from '@/features/job-leads/lib/prioritization';

export async function GET(
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

    // Get all prospects with their bridges and contacts
    const rows = await db
      .select({
        prospect: prospects,
        bridge: prospectBridges,
        contact: contacts
      })
      .from(prospectBridges)
      .innerJoin(prospects, eq(prospectBridges.prospectId, prospects.id))
      .innerJoin(contacts, eq(prospectBridges.contactId, contacts.id))
      .where(eq(prospects.jobLeadId, id));

    // Compute and persist scores for any bridges missing them
    for (const row of rows) {
      if (row.bridge.score === null) {
        const score = computeBridgeScore(row.prospect, row.contact);
        await db
          .update(prospectBridges)
          .set({ score })
          .where(eq(prospectBridges.id, row.bridge.id));
        row.bridge.score = score;
      }
    }

    const recommendations = buildRecommendations(rows);

    return success({
      recommendations,
      meta: {
        totalProspects: lead.prospectCount,
        totalBridges: rows.length,
        totalContacts: recommendations.length
      }
    });
  } catch (err) {
    return serverError(err);
  }
}
