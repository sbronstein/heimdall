import { db } from '@/lib/db';
import { contacts, companies } from '../../../../../drizzle/schema';
import { isNull, ilike, eq, inArray, sql } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';

const closenessOrder = [
  'close_friend',
  'close_colleague',
  'friend',
  'colleague',
  'career_contact',
  'acquaintance',
  'linkedin_only',
  'never_met'
];

function sortByCloseness<T extends { closeness: string | null }>(items: T[]): T[] {
  return items.sort((a, b) => {
    const aIdx = closenessOrder.indexOf(a.closeness || 'acquaintance');
    const bIdx = closenessOrder.indexOf(b.closeness || 'acquaintance');
    return aIdx - bIdx;
  });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const companyName = searchParams.get('company');
    const companyId = searchParams.get('companyId');

    if (!companyName && !companyId) {
      return validationError('Either company or companyId is required');
    }

    // Find direct contacts at the company
    const conditions = [isNull(contacts.archivedAt)];

    if (companyId) {
      conditions.push(eq(contacts.companyId, companyId));
    }
    if (companyName) {
      conditions.push(ilike(contacts.currentCompany, `%${companyName}%`));
    }

    const where = companyId
      ? sql`${sql.join(
          [isNull(contacts.archivedAt), eq(contacts.companyId, companyId)].map(
            (c) => sql`(${c})`
          ),
          sql` AND `
        )}`
      : sql`${sql.join(
          [
            isNull(contacts.archivedAt),
            sql`(${ilike(contacts.currentCompany, `%${companyName}%`)} OR ${eq(contacts.companyId, companyId || '')})`
          ].map((c) => sql`(${c})`),
          sql` AND `
        )}`;

    // For companyName search, find contacts whose currentCompany matches
    // OR whose companyId matches a company with that name
    let directContacts;
    if (companyName) {
      // Also look up company IDs matching the name
      const matchingCompanies = await db
        .select({ id: companies.id })
        .from(companies)
        .where(ilike(companies.name, `%${companyName}%`));

      const matchingCompanyIds = matchingCompanies.map((c) => c.id);

      const allDirect = await db
        .select()
        .from(contacts)
        .where(isNull(contacts.archivedAt));

      directContacts = allDirect.filter((c) => {
        const nameMatch = c.currentCompany
          ?.toLowerCase()
          .includes(companyName.toLowerCase());
        const idMatch = c.companyId && matchingCompanyIds.includes(c.companyId);
        return nameMatch || idMatch;
      });
    } else {
      directContacts = await db
        .select()
        .from(contacts)
        .where(
          sql`${isNull(contacts.archivedAt)} AND ${eq(contacts.companyId, companyId!)}`
        );
    }

    const directIds = new Set(directContacts.map((c) => c.id));

    // Find potential introducers: contacts who have introducedBy pointing to a direct contact
    // OR direct contacts whose introducedBy points to another contact (reverse lookup)
    const allContacts = await db
      .select()
      .from(contacts)
      .where(isNull(contacts.archivedAt));

    const introducers = allContacts.filter((c) => {
      if (directIds.has(c.id)) return false;
      // This contact introduced someone at the target company
      return directContacts.some((d) => d.introducedBy === c.id);
    });

    return success({
      direct: sortByCloseness(directContacts),
      introducers: sortByCloseness(introducers)
    });
  } catch (err) {
    return serverError(err);
  }
}
