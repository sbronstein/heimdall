import { db } from '@/lib/db';
import {
  searchMetrics,
  applications,
  companies,
  contacts,
  interactions
} from '../../../../drizzle/schema';
import { desc, eq, gte, and, isNull, count } from 'drizzle-orm';
import { success, created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';

const createMetricSchema = z.object({
  weekStarting: z.string().transform((s) => new Date(s)),
  applicationsSubmitted: z.number().int().optional(),
  networkingConversations: z.number().int().optional(),
  interviewsCompleted: z.number().int().optional(),
  followUpsSent: z.number().int().optional(),
  newCompaniesResearched: z.number().int().optional(),
  newContactsAdded: z.number().int().optional(),
  activeApplications: z.number().int().optional(),
  offersReceived: z.number().int().optional(),
  rejections: z.number().int().optional(),
  energyLevel: z.number().int().min(1).max(10).optional(),
  weeklyReflection: z.string().optional(),
  jscNotes: z.string().optional()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'), 52);
    const autoPopulate = searchParams.get('auto_populate') === 'true';

    if (autoPopulate) {
      // Calculate metrics from system data for the current week
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
      weekStart.setHours(0, 0, 0, 0);

      const [
        activeAppsResult,
        newCompaniesResult,
        newContactsResult,
        interviewsResult,
        offersResult,
        rejectionsResult
      ] = await Promise.all([
        db
          .select({ count: count() })
          .from(applications)
          .where(
            and(
              isNull(applications.archivedAt),
              // Active = not in a terminal state
              gte(applications.updatedAt, new Date(0))
            )
          ),
        db
          .select({ count: count() })
          .from(companies)
          .where(gte(companies.createdAt, weekStart)),
        db
          .select({ count: count() })
          .from(contacts)
          .where(gte(contacts.createdAt, weekStart)),
        db
          .select({ count: count() })
          .from(interactions)
          .where(
            and(
              gte(interactions.createdAt, weekStart),
              eq(interactions.type, 'interview')
            )
          ),
        db
          .select({ count: count() })
          .from(applications)
          .where(
            and(eq(applications.status, 'offer'), gte(applications.updatedAt, weekStart))
          ),
        db
          .select({ count: count() })
          .from(applications)
          .where(
            and(
              eq(applications.status, 'rejected'),
              gte(applications.updatedAt, weekStart)
            )
          )
      ]);

      return success({
        weekStarting: weekStart.toISOString(),
        activeApplications: activeAppsResult[0].count,
        newCompaniesResearched: newCompaniesResult[0].count,
        newContactsAdded: newContactsResult[0].count,
        interviewsCompleted: interviewsResult[0].count,
        offersReceived: offersResult[0].count,
        rejections: rejectionsResult[0].count
      });
    }

    const results = await db
      .select()
      .from(searchMetrics)
      .orderBy(desc(searchMetrics.weekStarting))
      .limit(limit);

    return paginated(results, {
      hasMore: results.length === limit
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createMetricSchema.parse(body);

    const [metric] = await db
      .insert(searchMetrics)
      .values(validated)
      .returning();

    await logTimeline({
      eventType: 'metrics_recorded',
      title: `Recorded weekly metrics for ${validated.weekStarting.toLocaleDateString()}`
    });

    return created(metric);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return validationError(err.issues[0].message);
    }
    return serverError(err);
  }
}
