'use client';

import type { OutreachCampaign } from '@/lib/domain/types';

interface CampaignListProps {
  initialCampaigns: (OutreachCampaign & {
    emailCounts: Record<string, number>;
  })[];
}

export function CampaignList({
  initialCampaigns: _initialCampaigns
}: CampaignListProps) {
  return null;
}
