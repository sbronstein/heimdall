import { db } from '@/lib/db';
import { contacts } from '../../../../../drizzle/schema';
import { and, isNull, or, ne, asc } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { serverError } from '@/lib/api/errors';
import { parseLimit } from '@/lib/api/filters';

// T-10-06: hard-cap at 50 — never return an unbounded set on 1500+ contacts.
// The skill enforces a lower per-session ceiling; the endpoint enforces the server ceiling.
const QUEUE_MAX = 50;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    // Default 25; hard-capped at 50
    const limit = parseLimit(searchParams.get('limit'), QUEUE_MAX);

    // T-10-05: return only id/url/first/last — no email/phone/notes PII in queue response
    const rows = await db
      .select({
        id: contacts.id,
        linkedinUrl: contacts.linkedinUrl,
        firstName: contacts.firstName,
        lastName: contacts.lastName
      })
      .from(contacts)
      .where(
        and(
          isNull(contacts.archivedAt),
          // Skip contacts already triaged — enrichment exists to inform triage,
          // so there's no value scraping someone whose disposition is set.
          isNull(contacts.triagedAt),
          or(
            isNull(contacts.companyAtConnection),
            isNull(contacts.roleAtConnection)
          ),
          ne(contacts.enrichmentStatus, 'enriched')
        )
      )
      .orderBy(asc(contacts.linkedinConnectionDate))
      .limit(limit);

    return success({ queue: rows, count: rows.length });
  } catch (err) {
    return serverError(err);
  }
}
