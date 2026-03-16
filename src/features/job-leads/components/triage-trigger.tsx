'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { IconCards, IconUsers } from '@tabler/icons-react';

interface TriageTriggerProps {
  jobLeadId: string;
  untriagedCount: number;
  prospectCount: number;
}

export function TriageTrigger({
  jobLeadId,
  untriagedCount,
  prospectCount
}: TriageTriggerProps) {
  return (
    <Card>
      <CardContent className='flex items-center justify-between p-4'>
        <div>
          <div className='flex items-center gap-2'>
            <IconUsers className='text-muted-foreground h-4 w-4' />
            <span className='font-medium'>
              {prospectCount} prospect{prospectCount !== 1 ? 's' : ''} found
            </span>
          </div>
          {untriagedCount > 0 && (
            <p className='text-muted-foreground mt-1 text-sm'>
              {untriagedCount} mutual connection{untriagedCount !== 1 ? 's' : ''}{' '}
              need triage before recommendations.
            </p>
          )}
        </div>
        {untriagedCount > 0 && (
          <Link href={`/dashboard/job-leads/${jobLeadId}/triage`}>
            <Button>
              <IconCards className='mr-1 h-4 w-4' />
              Triage {untriagedCount}
            </Button>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
