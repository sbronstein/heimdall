'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { IconMapPin, IconExternalLink } from '@tabler/icons-react';
import type { JobLead } from '@/lib/domain/types';

export function ScrapeResults({ lead }: { lead: JobLead }) {
  const scraped = lead.scrapedData as {
    companyName?: string;
    roleTitle?: string;
    location?: string;
    companyLinkedinUrl?: string;
  } | null;

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>
          {lead.roleTitle || 'Unknown Role'}
        </CardTitle>
        <p className='text-muted-foreground text-sm'>
          {lead.companyName || 'Unknown Company'}
        </p>
      </CardHeader>
      <CardContent className='space-y-2'>
        {scraped?.location && (
          <div className='text-muted-foreground flex items-center gap-2 text-sm'>
            <IconMapPin className='h-4 w-4' />
            {scraped.location}
          </div>
        )}
        {lead.linkedinJobUrl && (
          <div className='flex gap-2'>
            <a
              href={lead.linkedinJobUrl}
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary flex items-center gap-1 text-sm hover:underline'
            >
              <IconExternalLink className='h-3.5 w-3.5' />
              View Job Posting
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
