import type { OutreachEmail, Contact } from '@/lib/domain/types';
import { canEmailTransition } from '@/features/outreach/lib/email-status';

// ---------------------------------------------------------------------------
// Content helpers (REV-01)
// ---------------------------------------------------------------------------

/** Returns the resolved subject: editedSubject takes precedence over generatedSubject. */
export function finalSubject(email: OutreachEmail): string | null {
  return email.editedSubject ?? email.generatedSubject ?? null;
}

/** Returns the resolved body: editedBody takes precedence over generatedBody. */
export function finalBody(email: OutreachEmail): string | null {
  return email.editedBody ?? email.generatedBody ?? null;
}

/**
 * Returns true only when both finalSubject and finalBody are non-empty strings.
 * Used internally to gate the Approve action.
 */
export function hasContent(email: OutreachEmail): boolean {
  const s = finalSubject(email);
  const b = finalBody(email);
  return (
    typeof s === 'string' &&
    s.length > 0 &&
    typeof b === 'string' &&
    b.length > 0
  );
}

// ---------------------------------------------------------------------------
// Badge helpers (REV-06)
// ---------------------------------------------------------------------------

/**
 * Returns true when the email needs a LinkedIn message instead of a standard email.
 * Triggers for two cases:
 *   1. The channel is explicitly 'linkedin_message'.
 *   2. No recipientEmail is stored AND the contact has no email address
 *      (so there is no valid email address to send to).
 */
export function needsLinkedinMessage(
  email: OutreachEmail,
  contact: Contact | null
): boolean {
  if (email.channel === 'linkedin_message') return true;
  if (!email.recipientEmail && !contact?.email) return true;
  return false;
}

/** Returns true when the contact's archivedAt field is set (soft-deleted contact). */
export function isArchived(contact: Contact | null): boolean {
  return contact?.archivedAt != null;
}

// ---------------------------------------------------------------------------
// Gate helpers (REV-04, REV-03)
// ---------------------------------------------------------------------------

/**
 * Returns true only when ALL of the following hold:
 *   - The contact is NOT archived
 *   - The email has both a finalSubject and finalBody (non-empty)
 *   - The email's current status can legally transition to 'approved' per the state machine
 */
export function canApproveEmail(
  email: OutreachEmail,
  contact: Contact | null
): boolean {
  if (isArchived(contact)) return false;
  if (!hasContent(email)) return false;
  if (!canEmailTransition(email.status, 'approved')) return false;
  return true;
}

/** Returns true when the email's current status can legally transition back to 'pending' (regenerate). */
export function canRegenerate(email: OutreachEmail): boolean {
  return canEmailTransition(email.status, 'pending');
}

// ---------------------------------------------------------------------------
// Progress helper (REV-04)
// ---------------------------------------------------------------------------

/**
 * Counts emails whose status is 'approved' or 'drafted'.
 * 'drafted' means the email was previously approved and a Gmail draft was created —
 * it should still count toward the "approved" progress total.
 */
export function approvedCount(emails: OutreachEmail[]): number {
  return emails.filter((e) => e.status === 'approved' || e.status === 'drafted')
    .length;
}
