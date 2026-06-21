import { db } from '@/lib/db';
import {
  outreachCampaigns,
  outreachEmails,
  contacts,
  interactions
} from '../../../../../../drizzle/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { success } from '@/lib/api/types';
import { notFound, serverError } from '@/lib/api/errors';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Verify campaign exists
    const [campaign] = await db
      .select()
      .from(outreachCampaigns)
      .where(eq(outreachCampaigns.id, id))
      .limit(1);

    if (!campaign) return notFound('Campaign');

    // Fetch all pending emails with contact join (one query — no N+1, D-01)
    const emailRows = await db
      .select({ email: outreachEmails, contact: contacts })
      .from(outreachEmails)
      .innerJoin(contacts, eq(outreachEmails.contactId, contacts.id))
      .where(
        and(
          eq(outreachEmails.campaignId, id),
          eq(outreachEmails.status, 'pending')
        )
      );

    if (emailRows.length === 0) {
      return success({ goalInstruction: campaign.goalInstruction, emails: [] });
    }

    // Fetch recent interactions for all contact IDs — one batched query, not N+1 (D-01)
    const contactIds = emailRows.map((r) => r.contact.id);
    const allInteractions = await db
      .select()
      .from(interactions)
      .where(inArray(interactions.contactId, contactIds))
      .orderBy(desc(interactions.occurredAt));

    // Group interactions by contactId via reduce
    const interactionsByContact = allInteractions.reduce<
      Record<string, typeof allInteractions>
    >((acc, i) => {
      if (!acc[i.contactId!]) acc[i.contactId!] = [];
      acc[i.contactId!].push(i);
      return acc;
    }, {});

    // Assemble D-02 payload per pending email
    const emails = emailRows.map(({ email, contact }) => {
      const recentInteractions = (
        interactionsByContact[contact.id] ?? []
      ).slice(0, 3);
      return {
        emailId: email.id,
        contactId: contact.id,
        contact: {
          firstName: contact.firstName,
          lastName: contact.lastName,
          howMet: contact.howMet,
          companyAtConnection: contact.companyAtConnection,
          roleAtConnection: contact.roleAtConnection,
          currentCompany: contact.currentCompany,
          title: contact.title,
          closeness: contact.closeness,
          recipientEmail: email.recipientEmail
        },
        interactions: recentInteractions.map((i) => ({
          type: i.type,
          summary: i.content, // i.content — interactions has no notes column
          occurredAt: i.occurredAt
        })),
        lowContext: recentInteractions.length < 2 // D-02 anti-hallucination flag (GEN-02)
      };
    });

    return success({ goalInstruction: campaign.goalInstruction, emails });
  } catch (err) {
    return serverError(err);
  }
}
