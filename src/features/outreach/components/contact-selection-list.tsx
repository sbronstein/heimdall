'use client';

import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/lib/domain/types';
import {
  closenessColors,
  outreachStatusColors
} from '@/features/contacts/lib/closeness-colors';
import { format } from 'date-fns';

interface ContactSelectionListProps {
  /** Already-filtered, already-sorted slice from the parent (CampaignBuilder) */
  contacts: Contact[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  /** Select all currently visible contacts (adds to set, does not replace — D-03/D-08) */
  onSelectAll: () => void;
}

function formatConnectionDate(date: Date | null): string {
  if (!date) return '—';
  try {
    return format(new Date(date), 'MMM yyyy');
  } catch {
    return '—';
  }
}

function formatLabel(value: string | null): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ');
}

export function ContactSelectionList({
  contacts,
  selectedIds,
  onToggle,
  onSelectAll
}: ContactSelectionListProps) {
  const allSelected =
    contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id));

  return (
    <div className='rounded-lg border'>
      {/* Select-all header row (D-08/CAMP-05) */}
      <div className='bg-muted/40 flex items-center gap-3 border-b px-4 py-2 text-sm font-medium'>
        <Checkbox
          checked={allSelected}
          onCheckedChange={onSelectAll}
          aria-label='Select all matching contacts'
        />
        <span className='text-muted-foreground'>
          {contacts.length === 0
            ? 'No contacts match'
            : `Select all ${contacts.length} matching`}
        </span>
      </div>

      {/* Contact rows */}
      <ul className='divide-y'>
        {contacts.map((contact) => {
          const isSelected = selectedIds.has(contact.id);

          return (
            <li
              key={contact.id}
              className={`hover:bg-muted/30 flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                isSelected ? 'bg-primary/5' : ''
              }`}
              onClick={() => onToggle(contact.id)}
            >
              {/* Checkbox */}
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggle(contact.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${contact.firstName} ${contact.lastName}`}
                className='mt-0.5 shrink-0'
              />

              {/* Field group layout: 4 D-02 groups */}
              <div className='min-w-0 flex-1'>
                <div className='flex flex-wrap items-center gap-x-3 gap-y-1'>
                  {/* Group 1: Name + howMet + closeness badge */}
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='font-medium'>
                      {contact.firstName} {contact.lastName}
                    </span>
                    {contact.howMet && (
                      <span className='text-muted-foreground text-xs'>
                        via {contact.howMet}
                      </span>
                    )}
                    {contact.closeness && (
                      <Badge
                        className={`text-xs ${closenessColors[contact.closeness] ?? ''}`}
                        variant='outline'
                      >
                        {formatLabel(contact.closeness)}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Group 2: Current company/title + company/role at connection */}
                <div className='mt-1 flex flex-wrap gap-x-3 text-sm'>
                  {(contact.title || contact.currentCompany) && (
                    <span className='text-muted-foreground'>
                      {[contact.title, contact.currentCompany]
                        .filter(Boolean)
                        .join(' @ ')}
                    </span>
                  )}
                  {(contact.roleAtConnection || contact.companyAtConnection) &&
                    (contact.roleAtConnection !== contact.title ||
                      contact.companyAtConnection !==
                        contact.currentCompany) && (
                      <span className='text-muted-foreground text-xs'>
                        (connected as{' '}
                        {[contact.roleAtConnection, contact.companyAtConnection]
                          .filter(Boolean)
                          .join(' @ ')}
                        )
                      </span>
                    )}
                </div>

                {/* Groups 3 + 4: Connection date + outreach status — on one line */}
                <div className='mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
                  {/* Group 3: LinkedIn connection date */}
                  <span className='text-muted-foreground'>
                    Connected:{' '}
                    {formatConnectionDate(contact.linkedinConnectionDate)}
                  </span>

                  {/* Group 4: Outreach status badge */}
                  {contact.outreachStatus && (
                    <Badge
                      className={`text-xs ${outreachStatusColors[contact.outreachStatus] ?? ''}`}
                      variant='outline'
                    >
                      {formatLabel(contact.outreachStatus)}
                    </Badge>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Empty state */}
      {contacts.length === 0 && (
        <div className='py-10 text-center'>
          <p className='text-muted-foreground text-sm'>
            No contacts match the current filters — adjust the filters above to
            see contacts.
          </p>
        </div>
      )}
    </div>
  );
}
