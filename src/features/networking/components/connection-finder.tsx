'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Contact } from '@/lib/domain/types';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { closenessColors } from '@/features/contacts/lib/closeness-colors';

const closenessRank: Record<string, number> = {
  friend: 0,
  close_colleague: 1,
  colleague: 2,
  career_contact: 3,
  acquaintance: 4,
  linkedin_only: 5,
  never_met: 6
};

export function ConnectionFinder({ contacts }: { contacts: Contact[] }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query || query.length < 2) return { direct: [], introducers: [] };

    const q = query.toLowerCase();

    // Direct contacts at that company
    const direct = contacts
      .filter((c) => c.currentCompany?.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          (closenessRank[a.closeness ?? 'acquaintance'] ?? 3) -
          (closenessRank[b.closeness ?? 'acquaintance'] ?? 3)
      );

    // Contacts who introduced someone at that company (introducedBy relationships)
    const directIds = new Set(direct.map((c) => c.id));
    const introducers = contacts
      .filter((c) => {
        if (directIds.has(c.id)) return false;
        // Check if this contact introduced anyone at the target company
        return direct.some((d) => d.introducedBy === c.id);
      })
      .sort(
        (a, b) =>
          (closenessRank[a.closeness ?? 'acquaintance'] ?? 3) -
          (closenessRank[b.closeness ?? 'acquaintance'] ?? 3)
      );

    return { direct, introducers };
  }, [contacts, query]);

  const hasResults = results.direct.length > 0 || results.introducers.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find Connections at a Company</CardTitle>
        <Input
          placeholder='Type a company name...'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className='mt-2 w-80'
        />
      </CardHeader>
      <CardContent>
        {query.length >= 2 && !hasResults && (
          <p className='text-muted-foreground py-4 text-center text-sm'>
            No connections found for &ldquo;{query}&rdquo;.
          </p>
        )}

        {results.direct.length > 0 && (
          <div className='mb-6'>
            <h3 className='mb-2 text-sm font-semibold'>Your Contacts There</h3>
            <div className='divide-y'>
              {results.direct.map((c) => (
                <ContactRow key={c.id} contact={c} />
              ))}
            </div>
          </div>
        )}

        {results.introducers.length > 0 && (
          <div>
            <h3 className='mb-2 text-sm font-semibold'>
              People Who Could Introduce You
            </h3>
            <div className='divide-y'>
              {results.introducers.map((c) => (
                <ContactRow key={c.id} contact={c} />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ContactRow({ contact }: { contact: Contact }) {
  return (
    <div className='flex items-center justify-between py-3'>
      <div className='min-w-0 flex-1'>
        <Link
          href={`/dashboard/contacts/${contact.id}`}
          className='font-medium hover:underline'
        >
          {contact.firstName} {contact.lastName}
        </Link>
        <p className='text-muted-foreground text-sm'>
          {contact.title ? `${contact.title} at ` : ''}
          {contact.currentCompany || '-'}
        </p>
      </div>
      <div className='flex items-center gap-2'>
        {contact.closeness && (
          <Badge
            className={closenessColors[contact.closeness] || ''}
            variant='outline'
          >
            {contact.closeness.replace(/_/g, ' ')}
          </Badge>
        )}
        <span className='text-muted-foreground text-xs'>
          {contact.lastContactDate
            ? formatDistanceToNow(new Date(contact.lastContactDate), {
                addSuffix: true
              })
            : 'Never contacted'}
        </span>
        <Button variant='outline' size='sm' asChild>
          <Link href={`/dashboard/contacts/${contact.id}`}>View</Link>
        </Button>
      </div>
    </div>
  );
}
