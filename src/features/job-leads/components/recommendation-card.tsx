'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { closenessColors } from '@/features/contacts/lib/closeness-colors';
import { IconBrandLinkedin } from '@tabler/icons-react';
import Link from 'next/link';
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
  contactId: string;
  contactName: string;
  contactLinkedinUrl?: string | null;
  closeness: string | null;
  lastContactDate: Date | null;
  currentRole?: string | null;
  currentCompany?: string | null;
  companyAtConnection?: string | null;
  roleAtConnection?: string | null;
  score: number;
  prospects: Array<{
    name: string;
    title: string | null;
    seniorityLevel: SeniorityLevel;
    bridgeScore: number;
    linkedinUrl?: string | null;
  }>;
  onRequestIntro?: () => void;
  onOverride?: () => void;
  overriding?: boolean;
}

export function RecommendationCard({
  contactId,
  contactName,
  contactLinkedinUrl,
  closeness,
  lastContactDate,
  currentRole,
  currentCompany,
  companyAtConnection,
  roleAtConnection,
  score,
  prospects,
  onRequestIntro,
  onOverride,
  overriding
}: RecommendationCardProps) {
  return (
    <div className='border-border rounded-lg border p-4'>
      <div className='flex items-start justify-between'>
        <div>
          <div className='flex items-center gap-2'>
            <Link
              href={`/dashboard/contacts/${contactId}`}
              className='font-medium hover:underline'
            >
              {contactName}
            </Link>
            {closeness && (
              <Badge
                variant='outline'
                className={closenessColors[closeness] || ''}
              >
                {closeness.replace(/_/g, ' ')}
              </Badge>
            )}
            {contactLinkedinUrl && (
              <a
                href={contactLinkedinUrl}
                target='_blank'
                rel='noopener noreferrer'
                tabIndex={-1}
                className='inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
              >
                <IconBrandLinkedin className='h-4 w-4' />
                <span>LinkedIn</span>
              </a>
            )}
            {onOverride && (
              <Button
                variant='outline'
                size='sm'
                onClick={onOverride}
                disabled={overriding}
                tabIndex={-1}
              >
                Override
              </Button>
            )}
          </div>
          {lastContactDate && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              Last contact: {new Date(lastContactDate).toLocaleDateString()}
            </p>
          )}
          {(currentRole || currentCompany) && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              Now: {[currentRole, currentCompany].filter(Boolean).join(' @ ')}
            </p>
          )}
          {(companyAtConnection || roleAtConnection) && (
            <p className='text-muted-foreground mt-0.5 text-xs'>
              At connection: {[roleAtConnection, companyAtConnection].filter(Boolean).join(' @ ')}
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
              {p.linkedinUrl && (
                <a
                  href={p.linkedinUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  tabIndex={-1}
                  className='inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                >
                  <IconBrandLinkedin className='h-4 w-4' />
                  <span>LinkedIn</span>
                </a>
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
