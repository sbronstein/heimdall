'use client';

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { parseAsInteger, useQueryStates } from 'nuqs';
import { cn } from '@/lib/utils';

interface ConnectionYearFilterProps {
  years: number[];
}

export interface ConnectionYearFilterHandle {
  focus: () => void;
}

export const ConnectionYearFilter = forwardRef<
  ConnectionYearFilterHandle,
  ConnectionYearFilterProps
>(function ConnectionYearFilter({ years }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);

  const [{ connectionYearStart, connectionYearEnd }, setRange] = useQueryStates(
    {
      connectionYearStart: parseAsInteger,
      connectionYearEnd: parseAsInteger
    }
  );

  useImperativeHandle(ref, () => ({
    focus: () => containerRef.current?.focus()
  }));

  // All options: year buttons + "All years" clear option
  // allOptions length = years.length + 1 (for "All years")
  const allOptions = [...years, null] as (number | null)[];

  const onYearClick = useCallback(
    (year: number) => {
      if (connectionYearStart == null) {
        // (a) no start set → select this year as start
        setRange({ connectionYearStart: year, connectionYearEnd: null });
      } else if (connectionYearEnd == null) {
        // (b) start set, no end
        if (year === connectionYearStart) {
          // deselect: clicking already-selected single year clears both (D-06)
          setRange({ connectionYearStart: null, connectionYearEnd: null });
        } else {
          // set inclusive range
          setRange({
            connectionYearStart: Math.min(connectionYearStart, year),
            connectionYearEnd: Math.max(connectionYearStart, year)
          });
        }
      } else {
        // (c) range already set → begin fresh single selection
        setRange({ connectionYearStart: year, connectionYearEnd: null });
      }
    },
    [connectionYearStart, connectionYearEnd, setRange]
  );

  const isSelected = useCallback(
    (year: number) => {
      if (connectionYearStart == null && connectionYearEnd == null)
        return false;
      const lo = Math.min(
        connectionYearStart ?? connectionYearEnd!,
        connectionYearEnd ?? connectionYearStart!
      );
      const hi = Math.max(
        connectionYearStart ?? connectionYearEnd!,
        connectionYearEnd ?? connectionYearStart!
      );
      return year >= lo && year <= hi;
    },
    [connectionYearStart, connectionYearEnd]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, allOptions.length - 1));
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const focused = allOptions[focusedIndex];
        if (focused === null) {
          setRange({ connectionYearStart: null, connectionYearEnd: null });
        } else {
          onYearClick(focused);
        }
        return;
      }
    },
    [focusedIndex, allOptions, onYearClick, setRange]
  );

  return (
    <div className='space-y-1'>
      <label className='text-sm font-medium'>Connection Year</label>
      <div
        ref={containerRef}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className='focus-visible:ring-ring flex gap-2 rounded-md p-1 outline-none focus-visible:ring-2 focus-visible:ring-offset-2'
      >
        {years.map((year, i) => (
          <button
            key={year}
            type='button'
            tabIndex={-1}
            className={cn(
              'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
              isSelected(year)
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-accent',
              focusedIndex === i &&
                containerRef.current === document.activeElement &&
                'ring-ring ring-2 ring-offset-1'
            )}
            onClick={() => {
              onYearClick(year);
              setFocusedIndex(i);
              containerRef.current?.focus();
            }}
          >
            {year}
          </button>
        ))}
        {/* "All years" clear button — last option */}
        <button
          type='button'
          tabIndex={-1}
          className={cn(
            'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
            connectionYearStart == null && connectionYearEnd == null
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-accent',
            focusedIndex === years.length &&
              containerRef.current === document.activeElement &&
              'ring-ring ring-2 ring-offset-1'
          )}
          onClick={() => {
            setRange({ connectionYearStart: null, connectionYearEnd: null });
            setFocusedIndex(years.length);
            containerRef.current?.focus();
          }}
        >
          All years
        </button>
      </div>
    </div>
  );
});
