'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { OutreachCampaign } from '@/lib/domain/types';

// ---------------------------------------------------------------------------
// Exported helpers — tested in campaign-list.test.ts (D-10 + CD-05)
// ---------------------------------------------------------------------------

/**
 * Maps emailCounts record keys to the four D-10 display labels.
 * The DB stores "pending" but the UI labels it "selected" per D-10 wording.
 */
export function displayCountsFromEmailCounts(
  emailCounts: Record<string, number>
): {
  selected: number;
  generated: number;
  approved: number;
  drafted: number;
} {
  return {
    selected: emailCounts['pending'] ?? 0,
    generated: emailCounts['generated'] ?? 0,
    approved: emailCounts['approved'] ?? 0,
    drafted: emailCounts['drafted'] ?? 0
  };
}

/**
 * CD-05: Returns true when the campaign list is empty — triggers empty-state render.
 */
export function hasNoCampaigns(
  campaigns: (OutreachCampaign & { emailCounts: Record<string, number> })[]
): boolean {
  return campaigns.length === 0;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CampaignListProps {
  initialCampaigns: (OutreachCampaign & {
    emailCounts: Record<string, number>;
  })[];
}

export function CampaignList({ initialCampaigns }: CampaignListProps) {
  // CD-05: empty state when no campaigns exist
  if (hasNoCampaigns(initialCampaigns)) {
    return (
      <div className='flex flex-col items-center justify-center py-16 text-center'>
        <p className='text-muted-foreground text-sm'>
          No campaigns yet — create your first from a contact cohort.
        </p>
        <p className='text-muted-foreground mt-1 text-xs'>
          Use the{' '}
          <Link
            href='/dashboard/outreach/new'
            className='text-primary underline underline-offset-2'
          >
            New Campaign
          </Link>{' '}
          button to get started.
        </p>
      </div>
    );
  }

  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
      {initialCampaigns.map((campaign) => {
        const counts = displayCountsFromEmailCounts(campaign.emailCounts);
        return (
          <Link
            key={campaign.id}
            href={`/dashboard/outreach/${campaign.id}`}
            className='block'
          >
            <Card className='hover:border-primary h-full transition-colors'>
              <CardHeader className='pb-2'>
                <div className='flex items-start justify-between gap-2'>
                  <CardTitle className='text-base leading-snug'>
                    {campaign.name}
                  </CardTitle>
                  <Badge variant='outline' className='shrink-0 capitalize'>
                    {campaign.status}
                  </Badge>
                </div>
                {campaign.goalInstruction && (
                  <p className='text-muted-foreground line-clamp-2 text-sm'>
                    {campaign.goalInstruction}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {/* D-10: per-status count badges — selected · generated · approved · drafted */}
                <div className='flex flex-wrap gap-2'>
                  <BadgeCount label='selected' count={counts.selected} />
                  <BadgeCount label='generated' count={counts.generated} />
                  <BadgeCount label='approved' count={counts.approved} />
                  <BadgeCount label='drafted' count={counts.drafted} />
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function BadgeCount({ label, count }: { label: string; count: number }) {
  return (
    <span className='text-muted-foreground flex items-center gap-1 text-xs'>
      <span className='bg-muted rounded px-1.5 py-0.5 font-mono font-medium tabular-nums'>
        {count}
      </span>
      {label}
    </span>
  );
}
