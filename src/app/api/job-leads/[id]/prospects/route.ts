import { db } from '@/lib/db';
import { jobLeads, prospects } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { created } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { inferSeniority } from '@/features/job-leads/lib/seniority';
import { matchConnections } from '@/features/job-leads/lib/match-connections';
import { z } from 'zod';

// 5-field ScrapedProspect shape — must match src/features/job-leads/lib/types.ts
// (name, title, linkedinUrl, profileSnippet, mutualConnectionNames). profileSnippet
// flows through end-to-end from request body to the prospects.profile_snippet column.
const prospectSchema = z.object({
  name: z.string().min(1).max(200),
  title: z.string().max(300).nullable(),
  linkedinUrl: z.string().url().nullable(),
  profileSnippet: z.string().max(500).nullable(),
  mutualConnectionNames: z.array(z.string().max(200)).max(50)
});

const bulkBody = z.object({
  prospects: z.array(prospectSchema).max(200)
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = bulkBody.parse(body);

    // Lead lookup + status check happen BEFORE the transaction (read-only).
    // Status check rejects writes to non-'searching' leads; if it fails, no
    // transaction is opened at all.
    const [lead] = await db
      .select()
      .from(jobLeads)
      .where(eq(jobLeads.id, id))
      .limit(1);

    if (!lead) return notFound('Job lead');

    if (lead.status !== 'searching') {
      return validationError(
        `Cannot write prospects to lead in status '${lead.status}'`
      );
    }

    // Single bulk insert — NOT a per-row loop. profileSnippet wired through
    // from validated input, NOT hardcoded null.
    const rows = validated.prospects.map((p) => ({
      jobLeadId: id,
      name: p.name,
      title: p.title,
      linkedinUrl: p.linkedinUrl,
      profileSnippet: p.profileSnippet,
      seniorityLevel: inferSeniority(p.title ?? '').level
    }));

    // ATOMIC WRITE SET: prospects insert + matchConnections + status flip all
    // commit or roll back together (D-02). logTimeline is OUTSIDE so a rolled-back
    // transaction never emits a timeline event (WARNING 3 fix — post-commit invariant).
    const updated = await db.transaction(async (tx) => {
      if (rows.length > 0) {
        await tx.insert(prospects).values(rows);
      }

      // Inline matchConnections call per D-01. Bridges insert happens inside tx;
      // rollback on failure unwinds prospects and status flip too.
      await matchConnections(tx, id, validated.prospects);

      const [u] = await tx
        .update(jobLeads)
        .set({
          status: 'found',
          prospectCount: rows.length,
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date()
        })
        .where(eq(jobLeads.id, id))
        .returning();
      return u;
    });

    // POST-COMMIT side-effect (WARNING 3 fix — concrete rationale):
    //
    // Drizzle's neon-http db.transaction() returns ONLY after the Neon HTTP
    // endpoint acknowledges COMMIT. Therefore placing logTimeline() after
    // await db.transaction() guarantees the event is emitted only on committed
    // state. If the transaction throws, logTimeline never runs (Test 3 asserts
    // this — zero timeline rows after forced rollback).
    await logTimeline({
      eventType: 'job_lead_search_complete',
      title: `Found ${rows.length} prospects at ${lead.companyName || 'Unknown'}`,
      companyId: lead.companyId || undefined,
      metadata: { jobLeadId: id, prospectCount: rows.length }
    });

    return created({ insertedCount: rows.length, lead: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
