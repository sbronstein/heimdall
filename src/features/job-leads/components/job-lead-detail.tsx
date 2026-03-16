'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconSearch, IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';
import type { JobLead } from '@/lib/domain/types';
import { ScrapeResults } from './scrape-results';
import { SearchProgress } from './search-progress';
import { TriageTrigger } from './triage-trigger';
import { RecommendationList } from './recommendation-list';

interface JobLeadDetailProps {
  lead: JobLead;
  untriagedCount: number;
}

export function JobLeadDetail({
  lead: initialLead,
  untriagedCount: initialUntriagedCount
}: JobLeadDetailProps) {
  const [lead, setLead] = useState(initialLead);
  const [untriagedCount] = useState(initialUntriagedCount);
  const [isSearching, setIsSearching] = useState(lead.status === 'searching');

  const handleFindConnections = useCallback(async () => {
    setIsSearching(true);
    try {
      await fetch(`/api/job-leads/${lead.id}/search`, { method: 'POST' });
      setLead((prev) => ({ ...prev, status: 'searching' }));
    } catch {
      setIsSearching(false);
    }
  }, [lead.id]);

  const handleSearchComplete = useCallback(
    (status: string, prospectCount: number) => {
      setIsSearching(false);
      setLead((prev) => ({
        ...prev,
        status: status as JobLead['status'],
        prospectCount
      }));
    },
    []
  );

  return (
    <div className='space-y-4'>
      <Link
        href='/dashboard/job-leads'
        className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm'
      >
        <IconArrowLeft className='h-4 w-4' />
        Back to Job Leads
      </Link>

      <ScrapeResults lead={lead} />

      {/* Step 1: Scraped — show Find Connections button */}
      {(lead.status === 'scraped' || lead.status === 'pending') &&
        !isSearching && (
          <Button onClick={handleFindConnections} disabled={!lead.companyName}>
            <IconSearch className='mr-1 h-4 w-4' />
            Find Connections
          </Button>
        )}

      {/* Step 2: Searching — show progress */}
      {isSearching && (
        <SearchProgress
          jobLeadId={lead.id}
          onComplete={handleSearchComplete}
        />
      )}

      {/* Step 3: Found — show triage trigger */}
      {lead.status === 'found' && (
        <TriageTrigger
          jobLeadId={lead.id}
          untriagedCount={untriagedCount}
          prospectCount={lead.prospectCount}
        />
      )}

      {/* Step 4: Ready or Actioned — show recommendations */}
      {(lead.status === 'ready' || lead.status === 'actioned') && (
        <RecommendationList jobLeadId={lead.id} />
      )}

      {/* Also show recommendations for 'found' if there are some triaged contacts */}
      {lead.status === 'found' && untriagedCount === 0 && (
        <RecommendationList jobLeadId={lead.id} />
      )}
    </div>
  );
}
