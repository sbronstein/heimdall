import { db } from '@/lib/db';
import { tasks } from '../../../../../drizzle/schema';
import { eq } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { taskStatusValues, taskPriorityValues } from '@/lib/domain/types';

const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(taskStatusValues).optional(),
  priority: z.enum(taskPriorityValues).optional(),
  companyId: z.string().uuid().optional().nullable(),
  contactId: z.string().uuid().optional().nullable(),
  applicationId: z.string().uuid().optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  tags: z.array(z.string()).optional().nullable()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    if (!task) return notFound('Task');
    return success(task);
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
    const validated = updateTaskSchema.parse(body);

    const isCompleting = validated.status === 'done';
    const values: Record<string, unknown> = {
      ...validated,
      updatedAt: new Date()
    };
    if (validated.dueDate) values.dueDate = new Date(validated.dueDate);
    if (isCompleting) values.completedAt = new Date();

    const [task] = await db
      .update(tasks)
      .set(values)
      .where(eq(tasks.id, id))
      .returning();

    if (!task) return notFound('Task');

    if (isCompleting) {
      await logTimeline({
        eventType: 'task_completed',
        title: `Completed: ${task.title}`,
        taskId: task.id,
        companyId: task.companyId || undefined,
        contactId: task.contactId || undefined,
        applicationId: task.applicationId || undefined
      });
    } else {
      await logTimeline({
        eventType: 'task_updated',
        title: `Updated task: ${task.title}`,
        taskId: task.id
      });
    }

    return success(task);
  } catch (err) {
    if (err instanceof z.ZodError) return validationError(err.issues[0].message);
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [task] = await db.delete(tasks).where(eq(tasks.id, id)).returning();
    if (!task) return notFound('Task');
    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
