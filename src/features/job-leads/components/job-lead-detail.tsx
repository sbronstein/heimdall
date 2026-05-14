'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  IconCopy,
  IconArrowLeft,
  IconRefresh
} from '@tabler/icons-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { JobLead } from '@/lib/domain/types';
import { ScrapeResults } from './scrape-results';
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

  const handleCopyInvocation = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `claude /scrape-linkedin-connections ${lead.id}`
      );
      toast.success('Skill invocation copied — paste in Claude Code');
    } catch {
      toast.error('Failed to copy to clipboard');
    }
  }, [lead.id]);

  const handleRetry = useCallback(async () => {
    try {
      const res = await fetch(`/api/job-leads/${lead.id}/search`, {
        method: 'POST'
      });
      const json = await res.json();
      if (json.success) {
        setLead((prev) => ({
          ...prev,
          status: 'queued',
          lastError: null,
          lastErrorAt: null
        }));
        toast.success('Re-queued for connection scrape');
      } else {
        toast.error(json.error || 'Retry failed');
      }
    } catch {
      toast.error('Retry failed');
    }
  }, [lead.id]);

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

      {/* Step 1: Scraped — show Copy skill invocation affordance */}
      {lead.status === 'scraped' && (
        <div className='space-y-2'>
          <Button variant='secondary' onClick={handleCopyInvocation}>
            <IconCopy className='mr-1 h-4 w-4' />
            Copy skill invocation to scrape connections
          </Button>
          <p className='text-muted-foreground text-xs'>
            Paste in Claude Code (this directory) to run.
          </p>
        </div>
      )}

      {/* Step 2: Queued — show badge + copy invocation */}
      {lead.status === 'queued' && (
        <div className='space-y-2'>
          <Badge variant='secondary'>queued for connection scrape</Badge>
          <div>
            <Button variant='secondary' onClick={handleCopyInvocation}>
              <IconCopy className='mr-1 h-4 w-4' />
              Copy skill invocation
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>
            Paste in Claude Code (this directory) to run.
          </p>
        </div>
      )}

      {/* Step 3: Searching — passive indicator (no polling, D-17) */}
      {lead.status === 'searching' && (
        <div className='space-y-2'>
          <Badge variant='secondary'>scrape in progress</Badge>
          <p className='text-muted-foreground text-xs'>
            Skill is running. Refresh the page to see the result.
          </p>
        </div>
      )}

      {/* Step 4: Failed — categorized failure banner with retry */}
      {lead.status === 'failed' && (
        <div className='rounded-md border border-destructive/30 bg-destructive/10 p-4'>
          <p className='font-medium'>
            {lead.lastError?.split(':')[0] || 'Scrape failed'}
          </p>
          <p className='text-muted-foreground text-sm'>
            {lead.lastError?.split(':').slice(1).join(':').trim() ||
              'No detail captured'}
          </p>
          <Button
            onClick={handleRetry}
            variant='outline'
            className='mt-2'
          >
            <IconRefresh className='mr-1 h-4 w-4' />
            Retry
          </Button>
        </div>
      )}

      {/* Step 5: Found — show triage trigger */}
      {lead.status === 'found' && (
        <TriageTrigger
          jobLeadId={lead.id}
          untriagedCount={untriagedCount}
          prospectCount={lead.prospectCount}
        />
      )}

      {/* Step 6: Ready or Actioned — show recommendations */}
      {(lead.status === 'ready' || lead.status === 'actioned') && (
        <RecommendationList jobLeadId={lead.id} />
      )}

      {/* Also show recommendations for 'found' if there are no untriaged contacts left */}
      {lead.status === 'found' && untriagedCount === 0 && (
        <RecommendationList jobLeadId={lead.id} />
      )}
    </div>
  );
}
