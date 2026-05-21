'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { closenessColors } from '@/features/contacts/lib/closeness-colors';
import { CLOSENESS_OPTIONS } from '@/features/contacts/components/contact-table/options';
import { cn } from '@/lib/utils';

const shortLabels: Record<string, string> = {
  close_friend: 'Cls Frnd',
  close_colleague: 'Cls Col',
  friend: 'Friend',
  colleague: 'Colleague',
  close_career: 'Cls Career',
  career: 'Career',
  acquaintance: 'Acquaint',
  linkedin_only: 'LinkedIn',
  never_met: 'Never Met'
};

interface ClosenessButtonBarProps {
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export interface ClosenessButtonBarHandle {
  focus: () => void;
}

export const ClosenessButtonBar = forwardRef<ClosenessButtonBarHandle, ClosenessButtonBarProps>(
  function ClosenessButtonBar({ onSelect, disabled }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      focus: () => containerRef.current?.focus()
    }));

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (disabled) return;

        const key = e.key;
        if (key >= '1' && key <= '9') {
          e.preventDefault();
          const option = CLOSENESS_OPTIONS[parseInt(key) - 1];
          if (option) onSelect(option.value);
          return;
        }
        if (key === 'Enter') {
          e.preventDefault();
          onSelect(CLOSENESS_OPTIONS[0].value);
          return;
        }
      },
      [onSelect, disabled]
    );

    return (
      <div className='space-y-1'>
        <label className='text-sm font-medium'>Closeness</label>
        <div
          ref={containerRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className='grid grid-cols-4 gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 p-1 sm:grid-cols-8'
        >
          {CLOSENESS_OPTIONS.map((option, index) => (
            <Button
              key={option.value}
              variant='outline'
              disabled={disabled}
              tabIndex={-1}
              className={cn(
                'h-auto flex-col gap-0.5 px-2 py-2 text-xs',
                closenessColors[option.value]
              )}
              onClick={() => onSelect(option.value)}
            >
              <span className='font-semibold'>
                {index + 1} {shortLabels[option.value]}
              </span>
            </Button>
          ))}
        </div>
      </div>
    );
  }
);
