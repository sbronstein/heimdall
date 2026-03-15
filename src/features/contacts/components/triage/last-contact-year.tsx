'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface LastContactYearProps {
  value: number;
  onChange: (year: number) => void;
  onEnter?: () => void;
}

export interface LastContactYearHandle {
  focus: () => void;
}

export const LastContactYear = forwardRef<LastContactYearHandle, LastContactYearProps>(
  function LastContactYear({ value, onChange, onEnter }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const years = [2026, 2021, 2018, 2013, 2011];
    const EARLIER_SENTINEL = 0;
    const allOptions = [...years, EARLIER_SENTINEL];

    const [focusedIndex, setFocusedIndex] = useState(0);

    useImperativeHandle(ref, () => ({
      focus: () => {
        containerRef.current?.focus();
        // Snap focusedIndex to current value
        const idx = allOptions.indexOf(value);
        if (idx >= 0) setFocusedIndex(idx);
        else if (value < 2011) setFocusedIndex(5); // Earlier
        else setFocusedIndex(0);
      }
    }));

    const selectOption = useCallback(
      (option: number) => {
        if (option === EARLIER_SENTINEL) {
          onChange(2005);
        } else {
          onChange(option);
        }
      },
      [onChange]
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
          selectOption(allOptions[focusedIndex]);
          onEnter?.();
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          selectOption(allOptions[focusedIndex]);
          onEnter?.();
          return;
        }
      },
      [focusedIndex, allOptions, selectOption, onEnter]
    );

    const isSelected = (option: number) => {
      if (option === EARLIER_SENTINEL) return value < 2011;
      return value === option;
    };

    return (
      <div className='space-y-1'>
        <label className='text-sm font-medium'>Last Contact</label>
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className='flex gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 p-1'
        >
          {allOptions.map((option, i) => {
            const label = option === EARLIER_SENTINEL ? 'Earlier' : String(option);
            return (
              <button
                key={label}
                type='button'
                tabIndex={-1}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  isSelected(option)
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-accent',
                  focusedIndex === i && containerRef.current === document.activeElement &&
                    'ring-2 ring-ring ring-offset-1'
                )}
                onClick={() => {
                  selectOption(option);
                  setFocusedIndex(i);
                  containerRef.current?.focus();
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
);
