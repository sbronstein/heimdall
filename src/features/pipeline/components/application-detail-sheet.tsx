'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import type { PipelineApplication } from '../utils/store';
import Link from 'next/link';

interface ApplicationDetailSheetProps {
  app: PipelineApplication | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ApplicationDetailSheet({
  app,
  open,
  onOpenChange
}: ApplicationDetailSheetProps) {
  if (!app) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{app.companyName}</SheetTitle>
        </SheetHeader>
        <div className='mt-4 space-y-4'>
          <div>
            <p className='text-muted-foreground text-sm'>Role</p>
            <p className='font-medium'>{app.roleTitle}</p>
          </div>
          <div>
            <p className='text-muted-foreground text-sm'>Status</p>
            <Badge>{app.status.replace(/_/g, ' ')}</Badge>
          </div>
          {app.excitementLevel && (
            <div>
              <p className='text-muted-foreground text-sm'>Excitement</p>
              <Badge variant='outline'>
                {app.excitementLevel.replace(/_/g, ' ')}
              </Badge>
            </div>
          )}
          {app.source && (
            <div>
              <p className='text-muted-foreground text-sm'>Source</p>
              <p>{app.source.replace(/_/g, ' ')}</p>
            </div>
          )}
          {app.referredByName && (
            <div>
              <p className='text-muted-foreground text-sm'>Referred By</p>
              <Link
                href={`/dashboard/contacts/${app.referredById}`}
                className='font-medium text-blue-600 hover:underline'
              >
                {app.referredByName}
              </Link>
            </div>
          )}
          <div className='flex gap-2 pt-4'>
            <Button variant='outline' size='sm' asChild>
              <Link href={`/dashboard/companies/${app.companyId}`}>
                View Company
              </Link>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
