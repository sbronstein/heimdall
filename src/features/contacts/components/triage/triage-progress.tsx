'use client';

import { Progress } from '@/components/ui/progress';

interface TriageProgressProps {
  current: number;
  total: number;
}

export function TriageProgress({ current, total }: TriageProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className='space-y-1'>
      <div className='text-muted-foreground flex items-center justify-between text-sm'>
        <span>
          {current} of {total.toLocaleString()}
        </span>
        <span>{pct}%</span>
      </div>
      <Progress value={pct} />
    </div>
  );
}
