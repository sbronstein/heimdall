'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { Contact, OutreachEmail } from '@/lib/domain/types';
import {
  canApproveEmail,
  canRegenerate,
  finalBody,
  finalSubject,
  isArchived,
  needsLinkedinMessage
} from '@/features/outreach/lib/review-helpers';

export interface EmailReviewCardProps {
  campaignId: string;
  email: OutreachEmail;
  contact: Contact | null;
  onEmailUpdated: (updated: OutreachEmail) => void;
}

export function EmailReviewCard({
  campaignId,
  email,
  contact,
  onEmailUpdated
}: EmailReviewCardProps) {
  // Inline edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  // In-flight guard — prevents double-submit across all three actions
  const [isSaving, setIsSaving] = useState(false);

  const subject = finalSubject(email);
  const body = finalBody(email);
  const isPending = email.status === 'pending';
  const hasDisplayContent = subject != null || body != null;

  // Open edit mode seeded with current final content
  const handleEditOpen = useCallback(() => {
    setEditSubject(finalSubject(email) ?? '');
    setEditBody(finalBody(email) ?? '');
    setIsEditing(true);
  }, [email]);

  // Cancel discards edits without saving
  const handleEditCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  // Save the inline edit via PATCH /api/outreach-campaigns/:id/emails/:emailId
  const handleEditSave = useCallback(async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/outreach-campaigns/${campaignId}/emails/${email.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            editedSubject: editSubject,
            editedBody: editBody
          })
        }
      );
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(resBody?.error ?? 'Failed to save — please try again.');
        return;
      }
      onEmailUpdated(resBody.data as OutreachEmail);
      setIsEditing(false);
    } catch (err) {
      console.error('Inline edit save failed:', err);
      toast.error('Failed to save — please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, campaignId, email.id, editSubject, editBody, onEmailUpdated]);

  // Approve via PATCH /api/outreach-campaigns/:id/emails/:emailId/status
  const handleApprove = useCallback(async () => {
    if (isSaving || !canApproveEmail(email, contact)) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/outreach-campaigns/${campaignId}/emails/${email.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'approved' })
        }
      );
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(resBody?.error ?? 'Failed to approve — please try again.');
        return;
      }
      onEmailUpdated(resBody.data as OutreachEmail);
    } catch (err) {
      console.error('Approve failed:', err);
      toast.error('Failed to approve — please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, email, contact, campaignId, onEmailUpdated]);

  // Regenerate via PATCH .../status { status: 'pending' } — clears edits (D-05 reset)
  const handleRegenerate = useCallback(async () => {
    if (isSaving || !canRegenerate(email)) return;
    const confirmed = window.confirm(
      'Regenerate this email? This will clear any edits and reset the email to pending.'
    );
    if (!confirmed) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/outreach-campaigns/${campaignId}/emails/${email.id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending' })
        }
      );
      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          resBody?.error ?? 'Failed to regenerate — please try again.'
        );
        return;
      }
      onEmailUpdated(resBody.data as OutreachEmail);
    } catch (err) {
      console.error('Regenerate failed:', err);
      toast.error('Failed to regenerate — please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, email, campaignId, onEmailUpdated]);

  return (
    <Card>
      <CardHeader>
        {/* Contact identity */}
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            {contact ? (
              <div className='flex flex-wrap items-baseline gap-1'>
                <span className='font-semibold'>
                  {contact.firstName} {contact.lastName}
                </span>
                {contact.currentCompany && (
                  <span className='text-muted-foreground text-sm'>
                    @ {contact.currentCompany}
                  </span>
                )}
              </div>
            ) : (
              <span className='text-muted-foreground italic'>
                Contact removed
              </span>
            )}

            {/* Status + contextual badges */}
            <div className='mt-1 flex flex-wrap gap-1.5'>
              <Badge variant='outline' className='text-xs capitalize'>
                {email.status.replace(/_/g, ' ')}
              </Badge>
              {needsLinkedinMessage(email, contact) && (
                <Badge variant='secondary' className='text-xs'>
                  needs LinkedIn message
                </Badge>
              )}
              {isArchived(contact) && (
                <Badge variant='destructive' className='text-xs'>
                  archived
                </Badge>
              )}
            </div>
          </div>

          {/* Action buttons (hidden in edit mode) */}
          {!isEditing && (
            <div className='flex shrink-0 flex-wrap gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={handleEditOpen}
                disabled={isSaving || isPending}
              >
                Edit
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={handleRegenerate}
                disabled={isSaving || !canRegenerate(email)}
              >
                Regenerate
              </Button>
              <Button
                size='sm'
                onClick={handleApprove}
                disabled={isSaving || !canApproveEmail(email, contact)}
              >
                Approve
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Inline edit form */}
        {isEditing ? (
          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>Subject</label>
              <Input
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder='Email subject'
                maxLength={500}
                disabled={isSaving}
              />
            </div>
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>Body</label>
              <Textarea
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
                placeholder='Email body'
                rows={6}
                disabled={isSaving}
              />
            </div>
            <div className='flex gap-2'>
              <Button size='sm' onClick={handleEditSave} disabled={isSaving}>
                {isSaving ? 'Saving…' : 'Save'}
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={handleEditCancel}
                disabled={isSaving}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          /* Read-only content view */
          <div className='space-y-3'>
            {isPending && !hasDisplayContent ? (
              <p className='text-muted-foreground text-sm italic'>
                Awaiting generation
              </p>
            ) : (
              <>
                {subject && (
                  <div>
                    <p className='text-muted-foreground mb-0.5 text-xs font-medium tracking-wide uppercase'>
                      Subject
                    </p>
                    <p className='text-sm'>{subject}</p>
                  </div>
                )}
                {body && (
                  <div>
                    <p className='text-muted-foreground mb-0.5 text-xs font-medium tracking-wide uppercase'>
                      Body
                    </p>
                    <p className='text-sm whitespace-pre-wrap'>{body}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
