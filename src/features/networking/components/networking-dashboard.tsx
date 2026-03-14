'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Contact } from '@/lib/domain/types';
import { OutreachList } from './outreach-list';
import { ConnectionFinder } from './connection-finder';

const closenessOrder = [
  'friend',
  'close_colleague',
  'colleague',
  'career_contact',
  'acquaintance',
  'linkedin_only',
  'never_met'
] as const;

export function NetworkingDashboard({ contacts }: { contacts: Contact[] }) {
  const totalContacts = contacts.length;
  const outreachCompleted = contacts.filter(
    (c) => c.outreachStatus && c.outreachStatus !== 'not_reached_out'
  ).length;
  const meetingsScheduled = contacts.filter(
    (c) => c.outreachStatus === 'meeting_scheduled'
  ).length;
  const meetingsCompleted = contacts.filter(
    (c) => c.outreachStatus === 'meeting_completed' || c.outreachStatus === 'ongoing'
  ).length;
  const overdueFollowUps = contacts.filter(
    (c) => c.nextFollowUpDate && new Date(c.nextFollowUpDate) < new Date()
  ).length;

  const closenessStats = closenessOrder.map((level) => ({
    level,
    label: level.replace(/_/g, ' '),
    count: contacts.filter((c) => c.closeness === level).length,
    reachedOut: contacts.filter(
      (c) => c.closeness === level && c.outreachStatus !== 'not_reached_out'
    ).length
  }));

  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-2 gap-4 md:grid-cols-5'>
        <KpiCard title='Total Contacts' value={totalContacts} />
        <KpiCard title='Outreach Done' value={outreachCompleted} />
        <KpiCard title='Meetings Scheduled' value={meetingsScheduled} />
        <KpiCard title='Meetings Done' value={meetingsCompleted} />
        <KpiCard
          title='Overdue Follow-ups'
          value={overdueFollowUps}
          alert={overdueFollowUps > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By Closeness Tier</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6'>
            {closenessStats.map((s) => (
              <div key={s.level} className='rounded-lg border p-3 text-center'>
                <p className='text-muted-foreground text-xs capitalize'>{s.label}</p>
                <p className='text-2xl font-bold'>{s.count}</p>
                <p className='text-muted-foreground text-xs'>
                  {s.reachedOut}/{s.count} reached
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue='outreach'>
        <TabsList>
          <TabsTrigger value='outreach'>Outreach List</TabsTrigger>
          <TabsTrigger value='connections'>Connection Finder</TabsTrigger>
        </TabsList>

        <TabsContent value='outreach'>
          <OutreachList contacts={contacts} />
        </TabsContent>

        <TabsContent value='connections'>
          <ConnectionFinder contacts={contacts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  title,
  value,
  alert
}: {
  title: string;
  value: number;
  alert?: boolean;
}) {
  return (
    <Card>
      <CardContent className='py-4 text-center'>
        <p className='text-muted-foreground text-xs'>{title}</p>
        <p className={`text-2xl font-bold ${alert ? 'text-red-600' : ''}`}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
