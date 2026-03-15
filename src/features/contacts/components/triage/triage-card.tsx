'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Contact } from '@/lib/domain/types';
import { closenessColors, warmthColors } from '@/features/contacts/lib/closeness-colors';
import { CLOSENESS_OPTIONS } from '@/features/contacts/components/contact-table/options';
import { IconBrandLinkedin } from '@tabler/icons-react';

interface TriageCardProps {
  contact: Contact;
}

export function TriageCard({ contact }: TriageCardProps) {
  const closenessLabel = contact.closeness
    ? CLOSENESS_OPTIONS.find((o) => o.value === contact.closeness)?.label
    : null;

  return (
    <Card>
      <CardContent className='space-y-3 pt-6'>
        <div className='flex items-start justify-between'>
          <div>
            <h2 className='text-2xl font-bold'>
              {contact.firstName} {contact.lastName}
            </h2>
            {(contact.title || contact.currentCompany) && (
              <p className='text-muted-foreground text-sm'>
                {contact.title}
                {contact.title && contact.currentCompany && ' at '}
                {contact.currentCompany}
              </p>
            )}
          </div>
          {contact.linkedinUrl && (
            <a
              href={contact.linkedinUrl}
              target='_blank'
              rel='noopener noreferrer'
              tabIndex={-1}
              className='text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent'
            >
              <IconBrandLinkedin className='h-4 w-4' />
              <span>LinkedIn</span>
            </a>
          )}
        </div>

        {contact.linkedinConnectionDate && (
          <p className='text-muted-foreground text-xs'>
            Connected:{' '}
            {new Date(contact.linkedinConnectionDate).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric'
            })}
          </p>
        )}

        <div className='flex flex-wrap gap-1.5'>
          {closenessLabel && (
            <Badge
              className={closenessColors[contact.closeness!] || ''}
              variant='outline'
            >
              {closenessLabel}
            </Badge>
          )}
          {contact.warmth && (
            <Badge
              className={warmthColors[contact.warmth] || ''}
              variant='outline'
            >
              {contact.warmth}
            </Badge>
          )}
          {contact.relationship && contact.relationship !== 'other' && (
            <Badge variant='outline'>{contact.relationship.replace(/_/g, ' ')}</Badge>
          )}
        </div>

        {contact.tags && contact.tags.length > 0 && (
          <div className='flex flex-wrap gap-1'>
            {contact.tags.map((tag) => (
              <Badge key={tag} variant='secondary' className='text-xs'>
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {contact.notes && (
          <p className='text-muted-foreground line-clamp-2 text-sm'>
            {contact.notes}
          </p>
        )}

        {contact.howMet && (
          <p className='text-muted-foreground text-xs'>
            Known from: {contact.howMet}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
