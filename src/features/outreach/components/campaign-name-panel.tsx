'use client';

import { forwardRef, useImperativeHandle, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface CampaignNamePanelProps {
  name: string;
  onNameChange: (value: string) => void;
  goalInstruction: string;
  onGoalChange: (value: string) => void;
}

export interface CampaignNamePanelHandle {
  focus: () => void;
}

export const CampaignNamePanel = forwardRef<
  CampaignNamePanelHandle,
  CampaignNamePanelProps
>(function CampaignNamePanel(
  { name, onNameChange, goalInstruction, onGoalChange },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus()
  }));

  return (
    <div className='bg-card space-y-4 rounded-lg border p-4'>
      {/* Campaign name (required — D-11/D-14) */}
      <div className='space-y-1.5'>
        <label htmlFor='campaign-name' className='text-sm font-medium'>
          Campaign Name{' '}
          <span className='text-destructive' aria-hidden='true'>
            *
          </span>
        </label>
        <Input
          ref={inputRef}
          id='campaign-name'
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder='e.g. ID.me colleagues 2021–2022'
          maxLength={200}
          required
        />
      </div>

      {/* Goal / instruction (optional — CD-06/D-14, used by Phase 16 AI generation) */}
      <div className='space-y-1.5'>
        <label htmlFor='campaign-goal' className='text-sm font-medium'>
          Goal / Instruction{' '}
          <span className='text-muted-foreground ml-1 text-xs font-normal'>
            (optional — used by AI generation in Phase 16)
          </span>
        </label>
        <Textarea
          id='campaign-goal'
          value={goalInstruction}
          onChange={(e) => onGoalChange(e.target.value)}
          placeholder='e.g. Reconnect and ask for a 20-minute intro call about their hiring plans'
          rows={3}
        />
      </div>
    </div>
  );
});
