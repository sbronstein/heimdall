'use client';

import { Badge } from '@/components/ui/badge';
import { closenessColors } from '@/features/contacts/lib/closeness-colors';
import type { SeniorityLevel } from '@/lib/domain/types';

const seniorityColors: Record<SeniorityLevel, string> = {
  c_suite: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  vp: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  director: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  senior_manager: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  manager: 'bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200',
  senior_ic: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  ic: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  entry_level: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  unknown: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
};

function formatSeniority(level: string): string {
  return level.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

interface RecommendationCardProps {
  contactName: string;
  closeness: string | null;
  lastContactDate: Date | null;
  companyAtConnection?: string | null;
  roleAtConnection?: string | null;
  score: number;
  prospects: Array<{
    name: string;
    title: string | null;
    seniorityLevel: SeniorityLevel;
    bridgeScore: number;
  }>;
  onRequestIntro?: () => void;
}

export function RecommendationCard({
  contactName,
  closeness,
  lastContactDate,
  companyAtConnection,
  roleAtConnection,
  score,
  prospects,
  onRequestIntro
}: RecommendationCardProps) {
  return (
    <div className='border-border rounded-lg border p-4'>
      <div className='flex items-start justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <span className='font-medium'>{contactName}</span>
            {closeness && (
              <Badge
                variant='outline'
                className={closenessColors[closeness] || ''}
              >
                {closeness.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
          {lastContactDate && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              Last contact: {new Date(lastContactDate).toLocaleDateString()}
            </p>
          )}
          {(companyAtConnection || roleAtConnection) && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {[roleAtConnection, companyAtConnection].filter(Boolean).join(' @ ')}
            </p>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <span className='text-muted-foreground text-sm font-medium'>
            Score: {score}
          </span>
          {onRequestIntro && (
            <button
              onClick={onRequestIntro}
              className='text-primary text-sm hover:underline'
            >
              Request Intro
            </button>
          )}
        </div>
      </div>

      <div className='mt-3 space-y-1.5'>
        {prospects.map((p, i) => (
          <div
            key={i}
            className='bg-muted/50 flex items-center justify-between rounded px-3 py-1.5 text-sm'
          >
            <div className='flex items-center gap-2'>
              <span>{p.name}</span>
              {p.title && (
                <span className='text-muted-foreground'>— {p.title}</span>
              )}
            </div>
            <Badge
              variant='outline'
              className={seniorityColors[p.seniorityLevel] || ''}
            >
              {formatSeniority(p.seniorityLevel)}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
