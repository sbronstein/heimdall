'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Contact } from '@/lib/domain/types';
import {
  closenessColors,
  warmthColors
} from '@/features/contacts/lib/closeness-colors';
import { CLOSENESS_OPTIONS } from '@/features/contacts/components/contact-table/options';
import {
  IconBrandLinkedin,
  IconArrowUpCircle,
  IconCheck,
  IconArrowBackUp,
  IconConfetti
} from '@tabler/icons-react';

interface CareerReviewDeckProps {
  contacts: Contact[];
}

type Action = { contact: Contact; decision: 'promoted' | 'kept' };

function fmtDate(d: Date | string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric'
  });
}

export function CareerReviewDeck({ contacts }: CareerReviewDeckProps) {
  const [index, setIndex] = useState(0);
  const [history, setHistory] = useState<Action[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);

  const total = contacts.length;
  const current = contacts[index];
  const promotedCount = history.filter((a) => a.decision === 'promoted').length;
  const done = index >= total;

  const setCloseness = useCallback(
    async (id: string, value: 'close_career' | 'career') => {
      const res = await fetch(`/api/contacts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closeness: value })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) {
        throw new Error(json?.error || `Request failed (${res.status})`);
      }
    },
    []
  );

  const promote = useCallback(async () => {
    if (!current || isUpdating) return;
    setIsUpdating(true);
    try {
      await setCloseness(current.id, 'close_career');
      setHistory((h) => [...h, { contact: current, decision: 'promoted' }]);
      setIndex((i) => i + 1);
      toast.success(
        `Promoted ${current.firstName} ${current.lastName} → Close Career`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Could not promote contact'
      );
    } finally {
      setIsUpdating(false);
    }
  }, [current, isUpdating, setCloseness]);

  const keep = useCallback(() => {
    if (!current || isUpdating) return;
    setHistory((h) => [...h, { contact: current, decision: 'kept' }]);
    setIndex((i) => i + 1);
  }, [current, isUpdating]);

  const undo = useCallback(async () => {
    if (isUpdating || history.length === 0) return;
    const last = history[history.length - 1];
    setIsUpdating(true);
    try {
      // Reverting a promotion writes the contact back to the `career` tier.
      if (last.decision === 'promoted') {
        await setCloseness(last.contact.id, 'career');
      }
      setHistory((h) => h.slice(0, -1));
      setIndex((i) => Math.max(0, i - 1));
      toast(`Undid ${last.contact.firstName} ${last.contact.lastName}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not undo');
    } finally {
      setIsUpdating(false);
    }
  }, [history, isUpdating, setCloseness]);

  // Keyboard shortcuts: P = promote, K = keep, U = undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (k === 'p') {
        e.preventDefault();
        promote();
      } else if (k === 'k') {
        e.preventDefault();
        keep();
      } else if (k === 'u') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [promote, keep, undo]);

  if (total === 0) {
    return (
      <Card>
        <CardContent className='flex flex-col items-center gap-2 py-16 text-center'>
          <IconConfetti className='text-muted-foreground h-8 w-8' />
          <p className='text-lg font-medium'>No contacts on the Career tier.</p>
          <p className='text-muted-foreground text-sm'>Nothing to review.</p>
        </CardContent>
      </Card>
    );
  }

  if (done) {
    const promoted = history.filter((a) => a.decision === 'promoted');
    return (
      <Card className='mx-auto max-w-xl'>
        <CardContent className='space-y-4 py-10'>
          <div className='flex flex-col items-center gap-2 text-center'>
            <IconConfetti className='h-8 w-8 text-indigo-500' />
            <p className='text-lg font-medium'>Review complete</p>
            <p className='text-muted-foreground text-sm'>
              Reviewed all {total.toLocaleString()} Career contacts ·{' '}
              {promotedCount} promoted to Close Career.
            </p>
          </div>

          {promoted.length > 0 && (
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs font-medium uppercase'>
                Promoted to Close Career
              </p>
              <div className='flex flex-wrap gap-1.5'>
                {promoted.map((a) => (
                  <Badge
                    key={a.contact.id}
                    variant='outline'
                    className={closenessColors.close_career}
                  >
                    {a.contact.firstName} {a.contact.lastName}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className='flex justify-center gap-2 pt-2'>
            <Link
              href='/dashboard/contacts'
              className={cn(buttonVariants(), 'text-sm')}
            >
              Back to Contacts
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const closenessLabel = current.closeness
    ? CLOSENESS_OPTIONS.find((o) => o.value === current.closeness)?.label
    : null;
  const progressPct = Math.round((index / total) * 100);
  const connected = fmtDate(current.linkedinConnectionDate);
  const showAtConnection =
    (current.companyAtConnection || current.roleAtConnection) &&
    (current.companyAtConnection !== current.currentCompany ||
      current.roleAtConnection !== current.title);

  return (
    <div className='mx-auto w-full max-w-xl space-y-4'>
      {/* Progress */}
      <div className='space-y-1.5'>
        <div className='text-muted-foreground flex items-center justify-between text-xs'>
          <span>
            {index} / {total} reviewed
          </span>
          <span>
            <span className='font-medium text-indigo-500'>{promotedCount}</span>{' '}
            promoted
          </span>
        </div>
        <div className='bg-muted h-1.5 w-full overflow-hidden rounded-full'>
          <div
            className='h-full rounded-full bg-indigo-500 transition-all'
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Card */}
      <Card>
        <CardContent className='space-y-3 pt-6'>
          <div className='flex items-start justify-between gap-2'>
            <div>
              <h2 className='text-2xl font-bold'>
                {current.firstName} {current.lastName}
              </h2>
              {(current.title || current.currentCompany) && (
                <p className='text-muted-foreground text-sm'>
                  {current.title}
                  {current.title && current.currentCompany && ' at '}
                  {current.currentCompany}
                </p>
              )}
            </div>
            {current.linkedinUrl && (
              <a
                href={current.linkedinUrl}
                target='_blank'
                rel='noopener noreferrer'
                tabIndex={-1}
                className='text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors'
              >
                <IconBrandLinkedin className='h-4 w-4' />
                <span>LinkedIn</span>
              </a>
            )}
          </div>

          {showAtConnection && (
            <p className='text-muted-foreground text-xs'>
              At connection: {current.roleAtConnection}
              {current.roleAtConnection &&
                current.companyAtConnection &&
                ' at '}
              {current.companyAtConnection}
            </p>
          )}

          {connected && (
            <p className='text-muted-foreground text-xs'>
              Connected: {connected}
            </p>
          )}

          <div className='flex flex-wrap gap-1.5'>
            {closenessLabel && (
              <Badge
                className={closenessColors[current.closeness!] || ''}
                variant='outline'
              >
                {closenessLabel}
              </Badge>
            )}
            {current.warmth && (
              <Badge
                className={warmthColors[current.warmth] || ''}
                variant='outline'
              >
                {current.warmth}
              </Badge>
            )}
            {current.relationship && current.relationship !== 'other' && (
              <Badge variant='outline'>
                {current.relationship.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>

          {current.tags && current.tags.length > 0 && (
            <div className='flex flex-wrap gap-1'>
              {current.tags.map((tag) => (
                <Badge key={tag} variant='secondary' className='text-xs'>
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {current.notes && (
            <p className='text-muted-foreground line-clamp-3 text-sm'>
              {current.notes}
            </p>
          )}

          {current.howMet && (
            <p className='text-muted-foreground text-xs'>
              Known from: {current.howMet}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className='flex gap-2'>
        <Button
          variant='outline'
          className='flex-1'
          onClick={keep}
          disabled={isUpdating}
        >
          <IconCheck className='mr-2 h-4 w-4' />
          Keep as Career
          <kbd className='text-muted-foreground ml-2 hidden text-[10px] sm:inline'>
            K
          </kbd>
        </Button>
        <Button
          className='flex-1 bg-indigo-600 text-white hover:bg-indigo-700'
          onClick={promote}
          disabled={isUpdating}
        >
          <IconArrowUpCircle className='mr-2 h-4 w-4' />
          Promote → Close Career
          <kbd className='ml-2 hidden text-[10px] opacity-80 sm:inline'>P</kbd>
        </Button>
      </div>

      <div className='flex items-center justify-center'>
        <Button
          variant='ghost'
          size='sm'
          onClick={undo}
          disabled={isUpdating || history.length === 0}
          className='text-muted-foreground text-xs'
        >
          <IconArrowBackUp className='mr-1.5 h-3.5 w-3.5' />
          Undo last
          <kbd className='ml-1.5 text-[10px]'>U</kbd>
        </Button>
      </div>
    </div>
  );
}
