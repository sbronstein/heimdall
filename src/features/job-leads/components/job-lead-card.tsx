'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { JobLead } from '@/lib/domain/types';
import { IconBuilding, IconUsers } from '@tabler/icons-react';

const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  scraping: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  scraped: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  searching: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  found: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  ready: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  actioned: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  archived: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200'
};

export function JobLeadCard({ lead }: { lead: JobLead }) {
  return (
    <Link href={`/dashboard/job-leads/${lead.id}`}>
      <Card className='hover:bg-accent/50 transition-colors'>
        <CardContent className='flex items-center justify-between p-4'>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <IconBuilding className='text-muted-foreground h-4 w-4 shrink-0' />
              <span className='truncate font-medium'>
                {lead.companyName || 'Unknown Company'}
              </span>
            </div>
            {lead.roleTitle && (
              <p className='text-muted-foreground mt-1 truncate text-sm'>
                {lead.roleTitle}
              </p>
            )}
          </div>
          <div className='flex items-center gap-3'>
            {lead.prospectCount > 0 && (
              <div className='text-muted-foreground flex items-center gap-1 text-sm'>
                <IconUsers className='h-3.5 w-3.5' />
                {lead.prospectCount}
              </div>
            )}
            <Badge
              variant='outline'
              className={statusColors[lead.status] || ''}
            >
              {lead.status.replace(/_/g, ' ')}
            </Badge>
            <span className='text-muted-foreground text-xs'>
              {new Date(lead.createdAt).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
