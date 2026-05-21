'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { Contact } from '@/lib/domain/types';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { closenessColors, outreachStatusColors as outreachColors } from '@/features/contacts/lib/closeness-colors';

const closenessRank: Record<string, number> = {
  close_friend: 0,
  close_colleague: 1,
  friend: 2,
  colleague: 3,
  close_career: 4,
  career: 5,
  acquaintance: 6,
  linkedin_only: 7,
  never_met: 8
};

export function OutreachList({ contacts }: { contacts: Contact[] }) {
  const [search, setSearch] = useState('');
  const [closenessFilter, setClosenessFilter] = useState<string>('all');
  const [outreachFilter, setOutreachFilter] = useState<string>('all');

  const filtered = useMemo(() => {
    let result = contacts;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.firstName.toLowerCase().includes(q) ||
          c.lastName.toLowerCase().includes(q) ||
          c.currentCompany?.toLowerCase().includes(q)
      );
    }
    if (closenessFilter !== 'all') {
      result = result.filter((c) => c.closeness === closenessFilter);
    }
    if (outreachFilter !== 'all') {
      result = result.filter((c) => c.outreachStatus === outreachFilter);
    }

    return result.sort((a, b) => {
      const closenessA = closenessRank[a.closeness ?? 'acquaintance'] ?? 3;
      const closenessB = closenessRank[b.closeness ?? 'acquaintance'] ?? 3;
      if (closenessA !== closenessB) return closenessA - closenessB;
      // Then by stalest first (oldest lastContactDate first)
      const dateA = a.lastContactDate ? new Date(a.lastContactDate).getTime() : 0;
      const dateB = b.lastContactDate ? new Date(b.lastContactDate).getTime() : 0;
      return dateA - dateB;
    });
  }, [contacts, search, closenessFilter, outreachFilter]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outreach Tracker</CardTitle>
        <div className='mt-2 flex flex-wrap gap-2'>
          <Input
            placeholder='Search name or company...'
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className='w-64'
          />
          <Select value={closenessFilter} onValueChange={setClosenessFilter}>
            <SelectTrigger className='w-44'>
              <SelectValue placeholder='Closeness' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Closeness</SelectItem>
              <SelectItem value='close_friend'>Close Friend</SelectItem>
              <SelectItem value='close_colleague'>Close Colleague</SelectItem>
              <SelectItem value='friend'>Friend</SelectItem>
              <SelectItem value='colleague'>Colleague</SelectItem>
              <SelectItem value='close_career'>Close Career</SelectItem>
              <SelectItem value='career'>Career</SelectItem>
              <SelectItem value='acquaintance'>Acquaintance</SelectItem>
              <SelectItem value='linkedin_only'>LinkedIn Only</SelectItem>
              <SelectItem value='never_met'>Never Met</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outreachFilter} onValueChange={setOutreachFilter}>
            <SelectTrigger className='w-44'>
              <SelectValue placeholder='Outreach' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Statuses</SelectItem>
              <SelectItem value='not_reached_out'>Not Reached Out</SelectItem>
              <SelectItem value='reached_out'>Reached Out</SelectItem>
              <SelectItem value='meeting_scheduled'>Meeting Scheduled</SelectItem>
              <SelectItem value='meeting_completed'>Meeting Completed</SelectItem>
              <SelectItem value='ongoing'>Ongoing</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className='divide-y'>
          {filtered.length === 0 ? (
            <p className='text-muted-foreground py-8 text-center text-sm'>
              No contacts match filters.
            </p>
          ) : (
            filtered.map((c) => {
              const isOverdue =
                c.nextFollowUpDate && new Date(c.nextFollowUpDate) < new Date();
              return (
                <div
                  key={c.id}
                  className='flex items-center justify-between py-3'
                >
                  <div className='min-w-0 flex-1'>
                    <Link
                      href={`/dashboard/contacts/${c.id}`}
                      className='font-medium hover:underline'
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                    <p className='text-muted-foreground truncate text-sm'>
                      {c.title ? `${c.title} at ` : ''}
                      {c.currentCompany || '-'}
                    </p>
                  </div>
                  <div className='flex items-center gap-2'>
                    {c.closeness && (
                      <Badge
                        className={closenessColors[c.closeness] || ''}
                        variant='outline'
                      >
                        {c.closeness.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {c.outreachStatus && (
                      <Badge
                        className={outreachColors[c.outreachStatus] || ''}
                        variant='outline'
                      >
                        {c.outreachStatus.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    <span className='text-muted-foreground w-24 text-right text-xs'>
                      {c.lastContactDate
                        ? formatDistanceToNow(new Date(c.lastContactDate), {
                            addSuffix: true
                          })
                        : 'Never'}
                    </span>
                    {isOverdue && (
                      <Badge variant='destructive' className='text-xs'>
                        Overdue
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
