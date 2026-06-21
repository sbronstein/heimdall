import { db } from '@/lib/db';
import {
  outreachCampaigns,
  outreachEmails
} from '../../../../../drizzle/schema';
import { eq, sql } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError, validationError } from '@/lib/api/errors';
import { logTimeline } from '@/lib/db/timeline';
import { z } from 'zod';
import { outreachCampaignStatusValues } from '@/lib/domain/types';

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  goalInstruction: z.string().min(1).optional(),
  status: z.enum(outreachCampaignStatusValues).optional()
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // CD-01: same grouped emailCounts as the list route — one query with leftJoin + groupBy
    const [campaign] = await db
      .select({
        id: outreachCampaigns.id,
        name: outreachCampaigns.name,
        goalInstruction: outreachCampaigns.goalInstruction,
        status: outreachCampaigns.status,
        createdAt: outreachCampaigns.createdAt,
        updatedAt: outreachCampaigns.updatedAt,
        archivedAt: outreachCampaigns.archivedAt,
        emailCounts: sql<string>`
          json_build_object(
            'pending',   count(*) FILTER (WHERE ${outreachEmails.status} = 'pending'),
            'generated', count(*) FILTER (WHERE ${outreachEmails.status} = 'generated'),
            'edited',    count(*) FILTER (WHERE ${outreachEmails.status} = 'edited'),
            'approved',  count(*) FILTER (WHERE ${outreachEmails.status} = 'approved'),
            'drafted',   count(*) FILTER (WHERE ${outreachEmails.status} = 'drafted'),
            'failed',    count(*) FILTER (WHERE ${outreachEmails.status} = 'failed')
          )`
      })
      .from(outreachCampaigns)
      .leftJoin(
        outreachEmails,
        eq(outreachEmails.campaignId, outreachCampaigns.id)
      )
      .where(eq(outreachCampaigns.id, id))
      .groupBy(outreachCampaigns.id)
      .limit(1);

    if (!campaign) return notFound('Campaign');
    return success(campaign);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const validated = updateCampaignSchema.parse(body);

    // No campaign state machine — D-10: status updates are unguarded
    const [campaign] = await db
      .update(outreachCampaigns)
      .set({ ...validated, updatedAt: new Date() })
      .where(eq(outreachCampaigns.id, id))
      .returning();

    if (!campaign) return notFound('Campaign');

    await logTimeline({
      eventType: 'outreach_campaign_updated',
      title: `Campaign updated: ${campaign.name}`,
      metadata: { campaignId: id }
    });

    return success(campaign);
  } catch (err) {
    if (err instanceof z.ZodError)
      return validationError(err.issues[0].message);
    return serverError(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Soft delete — outreach_campaigns has archivedAt; stamp both archivedAt + updatedAt
    const [campaign] = await db
      .update(outreachCampaigns)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(outreachCampaigns.id, id))
      .returning();

    if (!campaign) return notFound('Campaign');

    await logTimeline({
      eventType: 'outreach_campaign_archived',
      title: `Campaign archived: ${campaign.name}`,
      metadata: { campaignId: id }
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    return serverError(err);
  }
}
