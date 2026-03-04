import { db } from '@/lib/db';
import { tasks } from '../../../../drizzle/schema';
import { desc, inArray, lt, sql, lte, and, isNull } from 'drizzle-orm';
import { created, paginated } from '@/lib/api/types';
import { serverError, validationError } from '@/lib/api/errors';
import { parseArrayParam, parseCursor, parseLimit } from '@/lib/api/filters';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { taskStatusValues, taskPriorityValues } from '@/lib/domain/types';

const createTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional().nullable(),
  status: z.enum(taskStatusValues).optional(),
  priority: z.enum(taskPriorityValues).optional(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseLimit(searchParams.get('limit'));
    const cursor = parseCursor(searchParams.get('cursor'));
    const statuses = parseArrayParam(searchParams.get('status'));
    const priorities = parseArrayParam(searchParams.get('priority'));
    const due = searchParams.get('due');

    const conditions = [];

    if (statuses) {
      conditions.push(inArray(tasks.status, statuses as typeof taskStatusValues[number][]));
    }
    if (priorities) {
      conditions.push(inArray(tasks.priority, priorities as typeof taskPriorityValues[number][]));
    }
    if (due === 'overdue') {
      conditions.push(lte(tasks.dueDate, new Date()));
      conditions.push(inArray(tasks.status, ['todo', 'in_progress']));
    } else if (due === 'today') {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      conditions.push(lte(tasks.dueDate, endOfToday));
      conditions.push(inArray(tasks.status, ['todo', 'in_progress']));
    }
    if (cursor) {
      conditions.push(lt(tasks.updatedAt, cursor));
    }

    const where = conditions.length > 0
      ? sql`${sql.join(conditions.map((c) => sql`(${c})`), sql` AND `)}`
      : undefined;

    const results = await db
      .select()
      .from(tasks)
      .where(where)
      .orderBy(desc(tasks.updatedAt))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const data = hasMore ? results.slice(0, limit) : results;

    return paginated(data, {
      cursor: data.length > 0 ? data[data.length - 1].updatedAt.toISOString() : null,
      hasMore
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createTaskSchema.parse(body);

    const [task] = await db
      .insert(tasks)
      .values({
        ...validated,
        dueDate: validated.dueDate ? new Date(validated.dueDate) : null
      })
      .returning();

    await logTimeline({
      eventType: 'task_created',
      title: `Created task: ${validated.title}`,
      taskId: task.id,
      companyId: validated.companyId || undefined,
      contactId: validated.contactId || undefined,
      applicationId: validated.applicationId || undefined
    });

    return created(task);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}
