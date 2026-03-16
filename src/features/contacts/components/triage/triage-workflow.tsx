'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { Contact } from '@/lib/domain/types';
import { TriageCard } from './triage-card';
import { ClosenessButtonBar, type ClosenessButtonBarHandle } from './closeness-button-bar';
import { HowMetInput, type HowMetInputHandle, type HowMetSuggestion } from './how-met-input';
import { LastContactYear, type LastContactYearHandle } from './last-contact-year';
import { TriageProgress } from './triage-progress';
import { IconArrowRight, IconArrowBackUp, IconX, IconCheck } from '@tabler/icons-react';

interface HistoryEntry {
  contactId: string;
  previousCloseness: string | null;
  previousHowMet: string | null;
  previousTriagedAt: Date | null;
  previousLastContactDate: Date | null;
  index: number;
}

interface TriageWorkflowProps {
  contacts: Contact[];
  howMetSuggestions: HowMetSuggestion[];
  exitUrl?: string;
}

export function TriageWorkflow({ contacts, howMetSuggestions, exitUrl }: TriageWorkflowProps) {
  const router = useRouter();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [howMet, setHowMet] = useState('');
  const [lastContactYear, setLastContactYear] = useState(new Date().getFullYear());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [triaged, setTriaged] = useState(0);
  const [startTime] = useState(Date.now());

  const howMetInputRef = useRef<HowMetInputHandle>(null);
  const yearButtonsRef = useRef<LastContactYearHandle>(null);
  const closenessRef = useRef<ClosenessButtonBarHandle>(null);

  const total = contacts.length;
  const current = contacts[currentIndex] as Contact | undefined;

  // Pre-snap year from existing lastContactDate
  useEffect(() => {
    if (current?.lastContactDate) {
      setLastContactYear(new Date(current.lastContactDate).getFullYear());
    } else {
      setLastContactYear(new Date().getFullYear());
    }
    setHowMet(current?.howMet ?? '');
  }, [currentIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus howMet input on each new contact
  useEffect(() => {
    if (current) {
      // Small delay to ensure DOM is ready
      const t = setTimeout(() => howMetInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [currentIndex, current]);

  const handleHowMetTab = useCallback(() => {
    yearButtonsRef.current?.focus();
  }, []);

  const handleYearEnter = useCallback(() => {
    closenessRef.current?.focus();
  }, []);

  const submitCloseness = useCallback(
    async (closeness: string) => {
      if (!current || isSubmitting) return;

      setIsSubmitting(true);
      try {
        const res = await fetch(`/api/contacts/${current.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            closeness,
            howMet: howMet || current.howMet || undefined,
            lastContactDate: new Date(lastContactYear, 0, 1).toISOString(),
            triagedAt: new Date().toISOString()
          })
        });

        if (!res.ok) throw new Error('Failed to update contact');

        setHistory((prev) => [
          ...prev,
          {
            contactId: current.id,
            previousCloseness: current.closeness,
            previousHowMet: current.howMet,
            previousTriagedAt: current.triagedAt,
            previousLastContactDate: current.lastContactDate
              ? new Date(current.lastContactDate)
              : null,
            index: currentIndex
          }
        ]);
        setTriaged((prev) => prev + 1);
        setCurrentIndex((prev) => prev + 1);
      } catch (err) {
        console.error('Triage update failed:', err);
      } finally {
        setIsSubmitting(false);
      }
    },
    [current, currentIndex, howMet, lastContactYear, isSubmitting]
  );

  const undo = useCallback(async () => {
    const last = history[history.length - 1];
    if (!last || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/contacts/${last.contactId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          closeness: last.previousCloseness,
          howMet: last.previousHowMet,
          lastContactDate: last.previousLastContactDate?.toISOString() ?? null,
          triagedAt: last.previousTriagedAt?.toISOString() ?? null
        })
      });

      if (!res.ok) throw new Error('Failed to undo');

      setHistory((prev) => prev.slice(0, -1));
      setCurrentIndex(last.index);
      setTriaged((prev) => prev - 1);
    } catch (err) {
      console.error('Undo failed:', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [history, isSubmitting]);

  const skip = useCallback(() => {
    if (currentIndex < total - 1) {
      setSkipped((prev) => prev + 1);
      setCurrentIndex((prev) => prev + 1);
    }
  }, [currentIndex, total]);

  const exit = useCallback(() => {
    router.push(exitUrl ?? '/dashboard/contacts');
  }, [router, exitUrl]);

  // Global keyboard shortcuts (only when not in text input)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const active = document.activeElement;
      const isInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement;

      if (isInput) return;

      if (e.key === 'u' || e.key === 'U' || (e.ctrlKey && e.key === 'z')) {
        e.preventDefault();
        undo();
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        skip();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        exit();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, skip, exit]);

  if (currentIndex >= total) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;

    return (
      <div className='mx-auto max-w-lg space-y-6 py-12 text-center'>
        <div className='bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 mx-auto flex h-16 w-16 items-center justify-center rounded-full'>
          <IconCheck className='h-8 w-8' />
        </div>
        <h2 className='text-2xl font-bold'>Triage Complete!</h2>
        <Card>
          <CardContent className='grid grid-cols-3 gap-4 pt-6'>
            <div>
              <p className='text-2xl font-bold'>{triaged}</p>
              <p className='text-muted-foreground text-sm'>Triaged</p>
            </div>
            <div>
              <p className='text-2xl font-bold'>{skipped}</p>
              <p className='text-muted-foreground text-sm'>Skipped</p>
            </div>
            <div>
              <p className='text-2xl font-bold'>
                {minutes}:{seconds.toString().padStart(2, '0')}
              </p>
              <p className='text-muted-foreground text-sm'>Time</p>
            </div>
          </CardContent>
        </Card>
        <Button onClick={exit}>Back to Contacts</Button>
      </div>
    );
  }

  return (
    <div className='mx-auto max-w-xl space-y-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-lg font-semibold'>Contact Triage</h1>
        <Button variant='ghost' size='sm' onClick={exit}>
          <IconX className='mr-1 h-4 w-4' />
          Exit
        </Button>
      </div>

      <TriageProgress current={currentIndex} total={total} />

      <TriageCard contact={current!} />

      <HowMetInput
        ref={howMetInputRef}
        value={howMet}
        onChange={setHowMet}
        suggestions={howMetSuggestions}
        onTab={handleHowMetTab}
      />

      <LastContactYear
        ref={yearButtonsRef}
        value={lastContactYear}
        onChange={setLastContactYear}
        onEnter={handleYearEnter}
      />

      <ClosenessButtonBar
        ref={closenessRef}
        onSelect={submitCloseness}
        disabled={isSubmitting}
      />

      <div className='flex items-center gap-2'>
        <Button
          variant='outline'
          size='sm'
          onClick={undo}
          disabled={history.length === 0 || isSubmitting}
        >
          <IconArrowBackUp className='mr-1 h-4 w-4' />
          U Undo
        </Button>
        <Button
          variant='outline'
          size='sm'
          onClick={skip}
          disabled={isSubmitting}
        >
          S Skip
          <IconArrowRight className='ml-1 h-4 w-4' />
        </Button>
        <div className='text-muted-foreground ml-auto text-xs'>
          Tab&rarr;Year&rarr;Enter&rarr;Closeness
        </div>
      </div>
    </div>
  );
}
