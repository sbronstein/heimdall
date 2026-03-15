'use client';

import { Button } from '@/components/ui/button';
import { closenessColors } from '@/features/contacts/lib/closeness-colors';
import { CLOSENESS_OPTIONS } from '@/features/contacts/components/contact-table/options';
import { cn } from '@/lib/utils';

const shortLabels: Record<string, string> = {
  friend: 'Friend',
  close_colleague: 'Close Col',
  colleague: 'Colleague',
  career_contact: 'Career',
  acquaintance: 'Acquaint',
  linkedin_only: 'LinkedIn',
  never_met: 'Never Met'
};

interface ClosenessButtonBarProps {
  onSelect: (value: string) => void;
  disabled?: boolean;
}

export function ClosenessButtonBar({ onSelect, disabled }: ClosenessButtonBarProps) {
  return (
    <div className='grid grid-cols-4 gap-2 sm:grid-cols-7'>
      {CLOSENESS_OPTIONS.map((option, index) => (
        <Button
          key={option.value}
          variant='outline'
          disabled={disabled}
          className={cn(
            'h-auto flex-col gap-0.5 px-2 py-2 text-xs',
            closenessColors[option.value]
          )}
          onClick={() => onSelect(option.value)}
        >
          <span className='font-semibold'>{index + 1} {shortLabels[option.value]}</span>
        </Button>
      ))}
    </div>
  );
}
