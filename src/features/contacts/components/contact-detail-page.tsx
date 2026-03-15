'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Contact, Interaction } from '@/lib/domain/types';
import { IconEdit, IconExternalLink } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { InteractionList } from './interaction-list';
import { InteractionForm } from './interaction-form';
import { closenessColors, warmthColors, outreachStatusColors } from '@/features/contacts/lib/closeness-colors';

export default function ContactDetailPage({
  contact,
  interactions
}: {
  contact: Contact;
  interactions: Interaction[];
}) {
  const router = useRouter();

  const isOverdue =
    contact.nextFollowUpDate && new Date(contact.nextFollowUpDate) < new Date();

  return (
    <div className='space-y-6'>
      <div className='flex items-start justify-between'>
        <div>
          <h1 className='text-3xl font-bold'>
            {contact.firstName} {contact.lastName}
          </h1>
          <div className='mt-2 flex items-center gap-2'>
            {contact.warmth && (
              <Badge className={warmthColors[contact.warmth] || ''}>
                {contact.warmth}
              </Badge>
            )}
            {contact.closeness && (
              <Badge className={closenessColors[contact.closeness] || ''}>
                {contact.closeness.replace(/_/g, ' ')}
              </Badge>
            )}
            {contact.outreachStatus && (
              <Badge className={outreachStatusColors[contact.outreachStatus] || ''} variant='outline'>
                {contact.outreachStatus.replace(/_/g, ' ')}
              </Badge>
            )}
            {contact.relationship && (
              <Badge variant='outline'>
                {contact.relationship.replace(/_/g, ' ')}
              </Badge>
            )}
            {contact.title && (
              <span className='text-muted-foreground text-sm'>
                {contact.title}
              </span>
            )}
          </div>
        </div>
        <div className='flex gap-2'>
          {contact.linkedinUrl && (
            <Button variant='outline' size='sm' asChild>
              <a href={contact.linkedinUrl} target='_blank' rel='noopener'>
                <IconExternalLink className='mr-1 h-4 w-4' /> LinkedIn
              </a>
            </Button>
          )}
          <Button
            variant='outline'
            size='sm'
            onClick={() => router.push(`/dashboard/contacts/${contact.id}?edit=true`)}
          >
            <IconEdit className='mr-1 h-4 w-4' /> Edit
          </Button>
        </div>
      </div>

      {isOverdue && (
        <Card className='border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'>
          <CardContent className='py-3'>
            <p className='text-sm font-medium text-red-600 dark:text-red-400'>
              Follow-up overdue — was due{' '}
              {formatDistanceToNow(new Date(contact.nextFollowUpDate!), { addSuffix: true })}
            </p>
            {contact.followUpNotes && (
              <p className='text-muted-foreground mt-1 text-sm'>{contact.followUpNotes}</p>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue='overview'>
        <TabsList>
          <TabsTrigger value='overview'>Overview</TabsTrigger>
          <TabsTrigger value='interactions'>
            Interactions ({interactions.length})
          </TabsTrigger>
          <TabsTrigger value='log'>Log Interaction</TabsTrigger>
        </TabsList>

        <TabsContent value='overview' className='space-y-4'>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <Card>
              <CardHeader>
                <CardTitle>Contact Info</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2'>
                <DetailRow label='Email' value={contact.email} />
                <DetailRow label='Phone' value={contact.phone} />
                <DetailRow label='Current Company' value={contact.currentCompany} />
                <DetailRow label='How Met' value={contact.howMet} />
                <DetailRow
                  label='Last Contact'
                  value={
                    contact.lastContactDate
                      ? formatDistanceToNow(new Date(contact.lastContactDate), { addSuffix: true })
                      : null
                  }
                />
              </CardContent>
            </Card>
            {contact.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className='text-muted-foreground whitespace-pre-wrap text-sm'>{contact.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value='interactions'>
          <InteractionList interactions={interactions} />
        </TabsContent>

        <TabsContent value='log'>
          <Card>
            <CardHeader>
              <CardTitle>Log New Interaction</CardTitle>
            </CardHeader>
            <CardContent>
              <InteractionForm
                contactId={contact.id}
                companyId={contact.companyId}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className='flex justify-between'>
      <span className='text-muted-foreground text-sm'>{label}</span>
      <span className='text-sm font-medium'>{value || '-'}</span>
    </div>
  );
}
