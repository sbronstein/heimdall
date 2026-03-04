import { db } from '@/lib/db';
import { applications, companies } from '../../../../drizzle/schema';
import { desc, isNull, inArray, eq, lt, and, sql } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError, notFound } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import {
  applicationStatusValues,
  applicationSourceValues,
  excitementLevelValues
} from '@/lib/domain/types';

const createApplicationSchema = z.object({
  companyId: z.string().uuid(),
  roleTitle: z.string().min(1).max(200),
  roleLevelConfirmed: z.string().optional().nullable(),
  jobPostingUrl: z.string().url().optional().nullable(),
  jobDescription: z.string().optional().nullable(),
  department: z.string().optional().nullable(),
  reportsTo: z.string().optional().nullable(),
  teamSize: z.string().optional().nullable(),
  status: z.enum(applicationStatusValues).optional(),
  source: z.enum(applicationSourceValues).optional().nullable(),
  referredBy: z.string().uuid().optional().nullable(),
  excitementLevel: z.enum(excitementLevelValues).optional().nullable(),
  fitScore: z.number().int().min(1).max(10).optional().nullable(),
  fitNotes: z.string().optional().nullable(),
  compensationNotes: z.string().optional().nullable(),
  resumeVersion: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const statuses = parseArrayParam(searchParams.get('status'));
    const excitement = parseArrayParam(searchParams.get('excitement'));

    const conditions = [isNull(applications.archivedAt)];

    if (statuses) {
      conditions.push(
        inArray(
          applications.status,
          statuses as (typeof applicationStatusValues)[number][]
        )
      );
    }
    if (excitement) {
      conditions.push(
        inArray(
          applications.excitementLevel,
          excitement as (typeof excitementLevelValues)[number][]
        )
      );
    }
    if (cursor) {
      conditions.push(lt(applications.updatedAt, cursor));
    }

    const where =
      conditions.length > 1
        ? sql`${sql.join(
            conditions.map((c) => sql`(${c})`),
            sql` AND `
          )}`
        : conditions[0];

    const results = await db
      .select()
      .from(applications)
      .where(where)
      .orderBy(desc(applications.updatedAt))
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
    const validated = createApplicationSchema.parse(body);

    // Verify company exists
    const [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, validated.companyId));

    if (!company) return notFound('Company');

    const [application] = await db
      .insert(applications)
      .values(validated)
      .returning();

    await logTimeline({
      eventType: 'application_added',
      title: `Added application: ${validated.roleTitle} at ${company.name}`,
      applicationId: application.id,
      companyId: validated.companyId
    });

    return created(application);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
