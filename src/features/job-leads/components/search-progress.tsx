'use client';

import { useEffect, useState } from 'react';
import { IconLoader2 } from '@tabler/icons-react';

interface SearchProgressProps {
  jobLeadId: string;
  onComplete: (status: string, prospectCount: number) => void;
}

export function SearchProgress({ jobLeadId, onComplete }: SearchProgressProps) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const dotInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/job-leads/${jobLeadId}/status`);
        if (!res.ok) return;
        const { data } = await res.json();

        if (data.status !== 'searching') {
          onComplete(data.status, data.prospectCount);
        }
      } catch {
        // Retry on next poll
      }
    }, 3000);

    return () => {
      clearInterval(dotInterval);
      clearInterval(pollInterval);
    };
  }, [jobLeadId, onComplete]);

  return (
    <div className='flex flex-col items-center gap-4 py-12'>
      <IconLoader2 className='text-primary h-8 w-8 animate-spin' />
      <p className='text-muted-foreground text-sm'>
        Searching for 2nd-degree connections{dots}
      </p>
      <p className='text-muted-foreground text-xs'>
        This may take a minute. Scanning LinkedIn for people at the company.
      </p>
    </div>
  );
}
