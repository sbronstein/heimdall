import PageContainer from '@/components/layout/page-container';
import { db } from '@/lib/db';
import { contacts } from '../../../../drizzle/schema';
import { and, eq, isNull, asc } from 'drizzle-orm';
import { CareerReviewDeck } from '@/features/contacts/components/career-review/career-review-deck';

// One-time review tool: after splitting `career_contact` into close_career +
// career, every legacy row landed on the lower `career` tier. This page lets
// the owner walk those contacts and promote the genuinely-close ones to
// `close_career`. Not linked in the sidebar — reach it at /dashboard/career-review.
export const metadata = {
  title: 'Dashboard: Career Review'
};

export default async function CareerReviewPage() {
  const data = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.closeness, 'career'), isNull(contacts.archivedAt)))
    // Oldest connections first — the people you've known longest are the most
    // likely promotion candidates, so they lead the deck.
    .orderBy(asc(contacts.linkedinConnectionDate));

  return (
    <PageContainer
      scrollable
      pageTitle='Career Review'
      pageDescription={`One-time pass — promote the close ones among your ${data.length.toLocaleString()} "Career" contacts to Close Career.`}
    >
      <CareerReviewDeck contacts={data} />
    </PageContainer>
  );
}
