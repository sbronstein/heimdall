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

    // JIT enrichment detection (T-10-07): identify mutual connections still missing
    // at-connection fields and not yet enriched. The WRITE must go through the REST
    // PATCH /api/contacts/[id]/enrichment endpoint (architectural invariant) — this
    // route stays a pure read for the recommendation computation. The PATCH endpoint
    // only accepts company/role values (it stamps 'enriched' immediately); there is no
    // intermediate 'pending' flip available without scraped data. We surface the contact
    // ids in meta so the UI and the scrape skill can consume them for JIT triggering
    // (meta-only fallback per plan task 2 — "document that the UI/skill consumes the ids").
    const pendingEnrichmentContacts = rows
      .map((r) => r.contact)
      // Deduplicate by contact id (a contact may bridge multiple prospects)
      .filter((c, idx, arr) => arr.findIndex((x) => x.id === c.id) === idx)
      .filter(
        (c) =>
          c.companyAtConnection === null &&
          c.roleAtConnection === null &&
          c.enrichmentStatus !== 'enriched'
      );

    const pendingEnrichmentContactIds = pendingEnrichmentContacts.map((c) => c.id);

    const recommendations = buildRecommendations(rows);

    return success({
      recommendations,
      meta: {
        totalProspects: lead.prospectCount,
        totalBridges: rows.length,
        totalContacts: recommendations.length,
        pendingEnrichment: pendingEnrichmentContactIds.length,
        pendingEnrichmentContactIds
      }
    });
  } catch (err) {
    return serverError(err);
  }
}
