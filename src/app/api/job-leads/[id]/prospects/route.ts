import { db } from '@/lib/db';
import { jobLeads, prospects } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { created } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { inferSeniority } from '@/features/job-leads/lib/seniority';
import {
  matchConnections,
  buildBridgeInsert,
  type ProspectWithId
} from '@/features/job-leads/lib/match-connections';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

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

    // Lead lookup + status check happen BEFORE the atomic write set (read-only).
    // Status check rejects writes to non-'searching' leads; if it fails, no
    // writes are issued.
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

    // Pre-generate prospect UUIDs in app code so we can compute bridge rows
    // (which reference prospect IDs) WITHOUT a post-insert RETURNING round-trip.
    // This is required because the neon-http driver does NOT support
    // interactive transactions (db.transaction() throws) — atomicity must come
    // from a non-interactive db.batch([...]) call where all statements are
    // pre-built. The schema's defaultRandom() on prospects.id is overridden by
    // the explicit id field below; collision risk is negligible (UUIDv4).
    const prospectsWithIds: ProspectWithId[] = validated.prospects.map((p) => ({
      ...p,
      id: randomUUID()
    }));

    const rows = prospectsWithIds.map((p) => ({
      id: p.id,
      jobLeadId: id,
      name: p.name,
      title: p.title,
      linkedinUrl: p.linkedinUrl,
      profileSnippet: p.profileSnippet,
      seniorityLevel: inferSeniority(p.title ?? '').level
    }));

    // Compute bridge rows in app code (read-only DB access for contacts lookup).
    // matchConnections returns the bridge values — it does NOT write — so we
    // can include the bridge insert in the same atomic batch below.
    const matchResult = await matchConnections(prospectsWithIds);
    const bridgeInsert = buildBridgeInsert(matchResult.bridgeValues);

    // ATOMIC WRITE SET (D-02) via db.batch — neon-http executes batched queries
    // as a single non-interactive Postgres transaction over one HTTP request.
    // All statements commit or roll back together. If any statement fails, the
    // whole batch rolls back and the await throws — logTimeline below is
    // skipped (post-commit invariant — WARNING 3 fix preserved).
    const leadUpdate = db
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

    // Build the batch array conditionally — only include the prospects insert
    // and bridge insert if there's anything to write. db.batch requires at
    // least one query; the lead update is always present so the type-level
    // [U, ...U[]] minimum is satisfied.
    let updated;
    if (rows.length === 0) {
      const [result] = await db.batch([leadUpdate]);
      [updated] = result;
    } else if (bridgeInsert === null) {
      const [, leadResult] = await db.batch([
        db.insert(prospects).values(rows),
        leadUpdate
      ]);
      [updated] = leadResult;
    } else {
      const [, , leadResult] = await db.batch([
        db.insert(prospects).values(rows),
        bridgeInsert,
        leadUpdate
      ]);
      [updated] = leadResult;
    }

    // POST-COMMIT side-effect (WARNING 3 fix — concrete rationale):
    //
    // db.batch() resolves only after the Neon HTTP endpoint acknowledges
    // COMMIT for the non-interactive transaction. Therefore placing
    // logTimeline() after await db.batch() guarantees the event is emitted
    // only on committed state. If the batch throws, logTimeline never runs.
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
