import { db } from '@/lib/db';
import { jobLeads } from '../../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError } from '@/lib/api/errors';

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
