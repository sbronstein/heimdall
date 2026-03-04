import { db } from '@/lib/db';
import { companies, timelineEvents } from '../../../../drizzle/schema';
import { desc, isNull, inArray, ilike, lt, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import {
  companyStageValues,
  companySizeValues,
  companyPriorityValues,
  remotePolicyValues
} from '@/lib/domain/types';

const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
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
  status: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const priorities = parseArrayParam(searchParams.get('priority'));
    const stages = parseArrayParam(searchParams.get('stage'));
    const search = searchParams.get('search');

    const conditions = [isNull(companies.archivedAt)];

    if (priorities) {
      conditions.push(inArray(companies.priority, priorities as typeof companyPriorityValues[number][]));
    }
    if (stages) {
      conditions.push(inArray(companies.stage, stages as typeof companyStageValues[number][]));
    }
    if (search) {
      conditions.push(ilike(companies.name, `%${search}%`));
    }
    if (cursor) {
      conditions.push(lt(companies.updatedAt, cursor));
    }

    const where = conditions.length > 1
      ? sql`${sql.join(conditions.map(c => sql`(${c})`), sql` AND `)}`
      : conditions[0];

    const results = await db
      .select()
      .from(companies)
      .where(where)
      .orderBy(desc(companies.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor:
        data.length > 0
          ? data[data.length - 1].updatedAt.toISOString()
          : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createCompanySchema.parse(body);

    const [company] = await db
      .insert(companies)
      .values(validated)
      .returning();

    await logTimeline({
      eventType: 'company_added',
      title: `Added ${validated.name} to tracking`,
      companyId: company.id
    });

    return created(company);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
