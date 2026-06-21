// Tests for pure review helpers (REV-01..REV-04, REV-06)
// vitest environment: node (no DOM/React rendering; tests pure functions directly)

import { describe, it, expect } from 'vitest';
import type { OutreachEmail, Contact } from '@/lib/domain/types';

import {
  finalSubject,
  finalBody,
  needsLinkedinMessage,
  canApproveEmail,
  canRegenerate,
  approvedCount
} from './review-helpers';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeEmail(overrides: Partial<OutreachEmail> = {}): OutreachEmail {
  return {
    id: 'email-1',
    campaignId: 'campaign-1',
    contactId: 'contact-1',
    channel: 'email',
    recipientEmail: 'target@example.com',
    generatedSubject: 'Generated Subject',
    generatedBody: 'Generated body text.',
    editedSubject: null,
    editedBody: null,
    status: 'generated',
    gmailDraftId: null,
    lastError: null,
    lastErrorAt: null,
    generatedAt: new Date(),
    approvedAt: null,
    draftedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  } as OutreachEmail;
}

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'contact-1',
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    currentCompany: 'Acme',
    archivedAt: null,
    ...overrides
  } as unknown as Contact;
}

// ---------------------------------------------------------------------------
// finalSubject (REV-01)
// ---------------------------------------------------------------------------

describe('finalSubject', () => {
  it('returns editedSubject when both edited and generated exist', () => {
    const email = makeEmail({
      editedSubject: 'Edited Subject',
      generatedSubject: 'Generated Subject'
    });
    expect(finalSubject(email)).toBe('Edited Subject');
  });

  it('returns generatedSubject when editedSubject is null', () => {
    const email = makeEmail({
      editedSubject: null,
      generatedSubject: 'Generated Subject'
    });
    expect(finalSubject(email)).toBe('Generated Subject');
  });

  it('returns null when both are null', () => {
    const email = makeEmail({ editedSubject: null, generatedSubject: null });
    expect(finalSubject(email)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// finalBody (REV-01)
// ---------------------------------------------------------------------------

describe('finalBody', () => {
  it('returns editedBody when both edited and generated exist', () => {
    const email = makeEmail({
      editedBody: 'Edited body',
      generatedBody: 'Generated body'
    });
    expect(finalBody(email)).toBe('Edited body');
  });

  it('returns generatedBody when editedBody is null', () => {
    const email = makeEmail({
      editedBody: null,
      generatedBody: 'Generated body'
    });
    expect(finalBody(email)).toBe('Generated body');
  });

  it('returns null when both are null', () => {
    const email = makeEmail({ editedBody: null, generatedBody: null });
    expect(finalBody(email)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// needsLinkedinMessage (REV-06)
// ---------------------------------------------------------------------------

describe('needsLinkedinMessage', () => {
  it('returns true when channel is linkedin_message', () => {
    const email = makeEmail({
      channel: 'linkedin_message',
      recipientEmail: null
    });
    const contact = makeContact({ email: null });
    expect(needsLinkedinMessage(email, contact)).toBe(true);
  });

  it('returns true when no recipientEmail AND no contact email', () => {
    const email = makeEmail({ channel: 'email', recipientEmail: null });
    const contact = makeContact({ email: null });
    expect(needsLinkedinMessage(email, contact)).toBe(true);
  });

  it('returns true when no recipientEmail AND contact is null', () => {
    const email = makeEmail({ channel: 'email', recipientEmail: null });
    expect(needsLinkedinMessage(email, null)).toBe(true);
  });

  it('returns false when recipientEmail is present (email channel)', () => {
    const email = makeEmail({
      channel: 'email',
      recipientEmail: 'target@example.com'
    });
    const contact = makeContact({ email: null });
    expect(needsLinkedinMessage(email, contact)).toBe(false);
  });

  it('returns false when contact.email provides a fallback address', () => {
    const email = makeEmail({ channel: 'email', recipientEmail: null });
    const contact = makeContact({ email: 'alice@example.com' });
    expect(needsLinkedinMessage(email, contact)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canApproveEmail (REV-04)
// ---------------------------------------------------------------------------

describe('canApproveEmail', () => {
  it('returns false when contact is archived', () => {
    const email = makeEmail({
      status: 'generated',
      generatedSubject: 'Subject',
      generatedBody: 'Body'
    });
    const contact = makeContact({ archivedAt: new Date() });
    expect(canApproveEmail(email, contact)).toBe(false);
  });

  it('returns false when email has no content (both subject and body null)', () => {
    const email = makeEmail({
      status: 'generated',
      generatedSubject: null,
      generatedBody: null,
      editedSubject: null,
      editedBody: null
    });
    const contact = makeContact();
    expect(canApproveEmail(email, contact)).toBe(false);
  });

  it('returns false when email has subject but no body', () => {
    const email = makeEmail({
      status: 'generated',
      generatedSubject: 'Subject',
      generatedBody: null,
      editedSubject: null,
      editedBody: null
    });
    const contact = makeContact();
    expect(canApproveEmail(email, contact)).toBe(false);
  });

  it('returns false when status is pending (invalid transition)', () => {
    const email = makeEmail({
      status: 'pending',
      generatedSubject: 'Subject',
      generatedBody: 'Body'
    });
    const contact = makeContact();
    expect(canApproveEmail(email, contact)).toBe(false);
  });

  it('returns true when generated with content and non-archived contact', () => {
    const email = makeEmail({
      status: 'generated',
      generatedSubject: 'Subject',
      generatedBody: 'Body'
    });
    const contact = makeContact();
    expect(canApproveEmail(email, contact)).toBe(true);
  });

  it('returns true when edited with content and non-archived contact', () => {
    const email = makeEmail({
      status: 'edited',
      editedSubject: 'Edited Subject',
      editedBody: 'Edited body'
    });
    const contact = makeContact();
    expect(canApproveEmail(email, contact)).toBe(true);
  });

  it('returns false when status is drafted (no transition to approved from drafted)', () => {
    const email = makeEmail({
      status: 'drafted',
      generatedSubject: 'Subject',
      generatedBody: 'Body'
    });
    const contact = makeContact();
    expect(canApproveEmail(email, contact)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// canRegenerate
// ---------------------------------------------------------------------------

describe('canRegenerate', () => {
  it('returns true when status is generated', () => {
    const email = makeEmail({ status: 'generated' });
    expect(canRegenerate(email)).toBe(true);
  });

  it('returns true when status is edited', () => {
    const email = makeEmail({ status: 'edited' });
    expect(canRegenerate(email)).toBe(true);
  });

  it('returns false when status is pending (already at pending)', () => {
    const email = makeEmail({ status: 'pending' });
    expect(canRegenerate(email)).toBe(false);
  });

  it('returns true when status is failed', () => {
    const email = makeEmail({ status: 'failed' });
    expect(canRegenerate(email)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// approvedCount
// ---------------------------------------------------------------------------

describe('approvedCount', () => {
  it('counts emails with status approved', () => {
    const emails = [
      makeEmail({ status: 'approved' }),
      makeEmail({ status: 'generated' }),
      makeEmail({ status: 'pending' })
    ];
    expect(approvedCount(emails)).toBe(1);
  });

  it('counts emails with status drafted (drafted implies previously approved)', () => {
    const emails = [
      makeEmail({ status: 'drafted' }),
      makeEmail({ status: 'generated' })
    ];
    expect(approvedCount(emails)).toBe(1);
  });

  it('counts both approved and drafted together', () => {
    const emails = [
      makeEmail({ status: 'approved' }),
      makeEmail({ status: 'drafted' }),
      makeEmail({ status: 'edited' }),
      makeEmail({ status: 'pending' })
    ];
    expect(approvedCount(emails)).toBe(2);
  });

  it('returns 0 when no emails are approved or drafted', () => {
    const emails = [
      makeEmail({ status: 'pending' }),
      makeEmail({ status: 'generated' }),
      makeEmail({ status: 'failed' })
    ];
    expect(approvedCount(emails)).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(approvedCount([])).toBe(0);
  });
});
