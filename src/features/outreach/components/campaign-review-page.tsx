'use client';

import { useCallback, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type {
  Contact,
  OutreachCampaign,
  OutreachEmail
} from '@/lib/domain/types';
import { approvedCount } from '@/features/outreach/lib/review-helpers';
import { EmailReviewCard } from './email-review-card';

interface CampaignReviewPageProps {
  campaign: OutreachCampaign;
  emails: { email: OutreachEmail; contact: Contact | null }[];
}

/**
 * Client review-page container (Phase 15).
 * Holds email rows in local state so per-card edit/approve/regenerate actions
 * update the header progress counts optimistically, without a full page reload.
 */
export function CampaignReviewPage({
  campaign,
  emails: initialEmails
}: CampaignReviewPageProps) {
  // Local email rows — seeded once from props; card actions update via onEmailUpdated
  const [rows, setRows] =
    useState<{ email: OutreachEmail; contact: Contact | null }[]>(
      initialEmails
    );

  // Replace the matching row's email when a card reports an update (keyed on updated.id)
  const onEmailUpdated = useCallback((updated: OutreachEmail) => {
    setRows((prev) =>
      prev.map((row) =>
        row.email.id === updated.id ? { ...row, email: updated } : row
      )
    );
  }, []);

  // Per-status badge summary for at-a-glance status breakdown
  const statusCounts = rows.reduce<Record<string, number>>((acc, { email }) => {
    acc[email.status] = (acc[email.status] ?? 0) + 1;
    return acc;
  }, {});

  const approved = approvedCount(rows.map((r) => r.email));
  const total = rows.length;

  return (
    <div className='mx-auto max-w-3xl space-y-6'>
      {/* Campaign header card */}
      <Card>
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          {campaign.goalInstruction && (
            <p className='text-muted-foreground text-sm'>
              {campaign.goalInstruction}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {/* Progress line (REV-06 / criterion 5) */}
          <p className='mb-3 text-sm font-medium'>
            {approved} / {total} approved
          </p>

          {/* Per-status badge summary */}
          <div className='flex flex-wrap gap-3 text-sm'>
            <span>
              <span className='font-medium'>{total}</span> contact
              {total !== 1 ? 's' : ''} added
            </span>
            {Object.entries(statusCounts).map(([status, count]) => (
              <Badge key={status} variant='outline' className='text-xs'>
                {count} {status.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Email review cards (REV-01): one EmailReviewCard per email row */}
      {rows.map((row) => (
        <EmailReviewCard
          key={row.email.id}
          campaignId={campaign.id}
          email={row.email}
          contact={row.contact}
          onEmailUpdated={onEmailUpdated}
        />
      ))}

      {/* Empty state — preserved when no contacts have been added */}
      {rows.length === 0 && (
        <Card>
          <CardContent className='pt-6 text-center'>
            <p className='text-muted-foreground text-sm'>
              No contacts have been added to this campaign yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
