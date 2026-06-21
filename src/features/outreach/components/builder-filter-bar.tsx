'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { parseAsString, useQueryStates } from 'nuqs';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { outreachStatusColors } from '@/features/contacts/lib/closeness-colors';
import { outreachStatusValues } from '@/lib/domain/types';
import {
  ConnectionYearFilter,
  type ConnectionYearFilterHandle
} from '@/features/contacts/components/triage/connection-year-filter';
import {
  ClosenessButtonBar,
  type ClosenessButtonBarHandle
} from '@/features/contacts/components/triage/closeness-button-bar';

interface BuilderFilterBarProps {
  /** Distinct connection years for the ConnectionYearFilter — pass deriveConnectionYears() result */
  years: number[];
}

export interface BuilderFilterBarHandle {
  focus: () => void;
}

const outreachStatusLabels: Record<string, string> = {
  not_reached_out: 'Not Contacted',
  reached_out: 'Reached Out',
  meeting_scheduled: 'Mtg Scheduled',
  meeting_completed: 'Mtg Done',
  ongoing: 'Ongoing'
};

export const BuilderFilterBar = forwardRef<
  BuilderFilterBarHandle,
  BuilderFilterBarProps
>(function BuilderFilterBar({ years }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const closenessBarRef = useRef<ClosenessButtonBarHandle>(null);
  const yearFilterRef = useRef<ConnectionYearFilterHandle>(null);

  useImperativeHandle(ref, () => ({
    focus: () => containerRef.current?.focus()
  }));

  // Filter URL state — connectionYearStart/End are owned by ConnectionYearFilter itself
  const [{ closeness, howMet, outreachStatus }, setFilters] = useQueryStates({
    closeness: parseAsString,
    howMet: parseAsString,
    outreachStatus: parseAsString.withDefault('not_reached_out') // D-07
  });

  const handleClosenessSelect = useCallback(
    (value: string) => {
      // Toggle: clicking the same tier again clears it (CAMP-03)
      setFilters({ closeness: closeness === value ? null : value });
    },
    [closeness, setFilters]
  );

  const handleOutreachStatusClick = useCallback(
    (value: string) => {
      // Clicking the already-active status clears back to default (null = "All")
      setFilters({ outreachStatus: outreachStatus === value ? null : value });
    },
    [outreachStatus, setFilters]
  );

  const handleHowMetChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFilters({ howMet: e.target.value || null });
    },
    [setFilters]
  );

  return (
    <div ref={containerRef} className='bg-card space-y-4 rounded-lg border p-4'>
      {/* Row 1: Connection year (reused Phase 13 control — owns its own nuqs year state) */}
      <ConnectionYearFilter ref={yearFilterRef} years={years} />

      {/* Row 2: Closeness (reused Phase 13 control — calls onSelect, does not own URL state) */}
      <div className='space-y-1'>
        <ClosenessButtonBar
          ref={closenessBarRef}
          onSelect={handleClosenessSelect}
        />
        {closeness && (
          <p className='text-muted-foreground text-xs'>
            Filtering by closeness:{' '}
            <span className='font-medium'>{closeness.replace(/_/g, ' ')}</span>{' '}
            —{' '}
            <button
              type='button'
              className='underline hover:no-underline'
              onClick={() => setFilters({ closeness: null })}
            >
              clear
            </button>
          </p>
        )}
      </div>

      {/* Row 3: howMet free-text input (CAMP-01) */}
      <div className='space-y-1'>
        <label className='text-sm font-medium'>Known From</label>
        <Input
          type='text'
          value={howMet ?? ''}
          onChange={handleHowMetChange}
          placeholder='Filter by how you met (e.g. ID.me, Stanford)...'
          className='max-w-sm'
        />
      </div>

      {/* Row 4: Outreach status button bar (CAMP-04, D-07 — defaults to not_reached_out) */}
      <div className='space-y-1'>
        <label className='text-sm font-medium'>Outreach Status</label>
        <div
          tabIndex={0}
          className='focus-visible:ring-ring flex flex-wrap gap-2 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
          onKeyDown={(e) => {
            const buttons = Array.from(
              e.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button[type=button]'
              )
            );
            const idx = buttons.findIndex((b) => b === document.activeElement);
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              buttons[Math.min(idx + 1, buttons.length - 1)]?.focus();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              buttons[Math.max(idx - 1, 0)]?.focus();
            }
          }}
        >
          {/* "All" clear button */}
          <button
            type='button'
            tabIndex={-1}
            onClick={() => setFilters({ outreachStatus: null })}
            className={cn(
              'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              outreachStatus == null
                ? 'border-primary bg-primary text-primary-foreground'
                : 'bg-background hover:bg-accent'
            )}
          >
            All
          </button>
          {outreachStatusValues.map((status) => (
            <button
              key={status}
              type='button'
              tabIndex={-1}
              onClick={() => handleOutreachStatusClick(status)}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                outreachStatus === status
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'bg-background hover:bg-accent',
                // Use status colors as subtle tint when not selected
                outreachStatus !== status && outreachStatusColors[status]
                  ? ''
                  : ''
              )}
            >
              {outreachStatusLabels[status] ?? status.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
