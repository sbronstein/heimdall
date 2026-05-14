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
import { buildRecommendations } from '@/features/job-leads/lib/prioritization';

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

    // Variant B per Phase 6 D-15: bridge scores are computed on-the-fly inside
    // buildRecommendations (which falls back to computeBridgeScore when bridge.score
    // is null). No persistence step — recommendations is a pure read.
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
