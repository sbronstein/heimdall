import { db } from '@/lib/db';
import { companies } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import {
  companyStageValues,
  companySizeValues,
  companyPriorityValues,
  remotePolicyValues
} from '@/lib/domain/types';

const updateCompanySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  website: z.string().url().optional().nullable(),
  linkedinUrl: z.string().url().optional().nullable(),
  industry: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  stage: z.enum(companyStageValues).optional().nullable(),
  size: z.enum(companySizeValues).optional().nullable(),
  employeeCount: z.number().int().optional().nullable(),
  location: z.string().optional().nullable(),
  remotePolicy: z.enum(remotePolicyValues).optional().nullable(),
  fundingInfo: z.record(z.string(), z.unknown()).optional().nullable(),
  priority: z.enum(companyPriorityValues).optional(),
  tags: z.array(z.string()).optional().nullable(),
  dataMaturity: z.string().optional().nullable(),
  ceoBackground: z.string().optional().nullable(),
  techLeadership: z.record(z.string(), z.unknown()).optional().nullable(),
  researchNotes: z.string().optional().nullable(),
  status: z.string().optional(),
  passedReason: z.string().optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, id));

    if (!company) return notFound('Company');
    return success(company);
  } catch (err) {
    return serverError(err);
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateCompanySchema.parse(body);

    const [company] = await db
      .update(companies)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();

    if (!company) return notFound('Company');

    await logTimeline({
      eventType: 'company_updated',
      title: `Updated ${company.name}`,
      companyId: company.id
    });

    return success(company);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [company] = await db
      .update(companies)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(companies.id, id))
      .returning();

    if (!company) return notFound('Company');

    await logTimeline({
      eventType: 'company_archived',
      title: `Archived ${company.name}`,
      companyId: company.id
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
