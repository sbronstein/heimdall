'use client';

import { FormInput } from '@/components/forms/form-input';
import { FormSelect } from '@/components/forms/form-select';
import { FormTextarea } from '@/components/forms/form-textarea';
import { FormDatePicker } from '@/components/forms/form-date-picker';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import type { Contact, Company } from '@/lib/domain/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import * as z from 'zod';
import {
  RELATIONSHIP_OPTIONS,
  WARMTH_OPTIONS,
  CLOSENESS_OPTIONS,
  OUTREACH_STATUS_OPTIONS
} from './contact-table/options';

const formSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  linkedinUrl: z.string().url().optional().or(z.literal('')),
  title: z.string().optional().or(z.literal('')),
  currentCompany: z.string().optional().or(z.literal('')),
  companyId: z.string().optional(),
  relationship: z.string().optional(),
  warmth: z.string().optional(),
  closeness: z.string().optional(),
  outreachStatus: z.string().optional(),
  howMet: z.string().optional().or(z.literal('')),
  metDate: z.date().optional().nullable(),
  linkedinConnectionDate: z.date().optional().nullable(),
  notes: z.string().optional().or(z.literal('')),
  tags: z.string().optional().or(z.literal('')),
  followUpNotes: z.string().optional().or(z.literal('')),
  nextFollowUpDate: z.date().optional().nullable()
});

type FormValues = z.infer<typeof formSchema>;

export default function ContactForm({
  initialData,
  companies,
  pageTitle
}: {
  initialData: Contact | null;
  companies: Company[];
  pageTitle: string;
}) {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      firstName: initialData?.firstName || '',
      lastName: initialData?.lastName || '',
      email: initialData?.email || '',
      phone: initialData?.phone || '',
      linkedinUrl: initialData?.linkedinUrl || '',
      title: initialData?.title || '',
      currentCompany: initialData?.currentCompany || '',
      companyId: initialData?.companyId || undefined,
      relationship: initialData?.relationship || undefined,
      warmth: initialData?.warmth || undefined,
      closeness: initialData?.closeness || undefined,
      outreachStatus: initialData?.outreachStatus || undefined,
      howMet: initialData?.howMet || '',
      metDate: initialData?.metDate ? new Date(initialData.metDate) : undefined,
      linkedinConnectionDate: initialData?.linkedinConnectionDate ? new Date(initialData.linkedinConnectionDate) : undefined,
      notes: initialData?.notes || '',
      tags: initialData?.tags?.join(', ') || '',
      followUpNotes: initialData?.followUpNotes || '',
      nextFollowUpDate: initialData?.nextFollowUpDate ? new Date(initialData.nextFollowUpDate) : undefined
    }
  });

  async function onSubmit(values: FormValues) {
    const payload = {
      ...values,
      email: values.email || null,
      phone: values.phone || null,
      linkedinUrl: values.linkedinUrl || null,
      companyId: values.companyId || null,
      tags: values.tags
        ? values.tags.split(',').map((t) => t.trim()).filter(Boolean)
        : null,
      nextFollowUpDate: values.nextFollowUpDate
        ? values.nextFollowUpDate.toISOString()
        : null,
      metDate: values.metDate
        ? values.metDate.toISOString()
        : null,
      linkedinConnectionDate: values.linkedinConnectionDate
        ? values.linkedinConnectionDate.toISOString()
        : null
    };

    const url = initialData ? `/api/contacts/${initialData.id}` : '/api/contacts';
    const method = initialData ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (json.success) {
      toast.success(initialData ? 'Contact updated' : 'Contact created');
      router.push('/dashboard/contacts');
      router.refresh();
    } else {
      toast.error(json.error || 'Something went wrong');
    }
  }

  return (
    <Card className='mx-auto w-full'>
      <CardHeader>
        <CardTitle className='text-left text-2xl font-bold'>{pageTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form form={form} onSubmit={form.handleSubmit(onSubmit)} className='space-y-6'>
          <div className='grid grid-cols-1 gap-6 md:grid-cols-2'>
            <FormInput control={form.control} name='firstName' label='First Name' placeholder='John' required />
            <FormInput control={form.control} name='lastName' label='Last Name' placeholder='Smith' required />
            <FormInput control={form.control} name='email' label='Email' placeholder='john@example.com' />
            <FormInput control={form.control} name='phone' label='Phone' placeholder='+1 555-0123' />
            <FormInput control={form.control} name='title' label='Title' placeholder='VP Engineering' />
            <FormInput control={form.control} name='linkedinUrl' label='LinkedIn' placeholder='https://linkedin.com/in/...' />
            <FormSelect
              control={form.control}
              name='companyId'
              label='Linked Company'
              placeholder='Select company'
              options={companies.map((c) => ({ label: c.name, value: c.id }))}
            />
            <FormSelect
              control={form.control}
              name='relationship'
              label='Relationship'
              placeholder='Select relationship'
              options={RELATIONSHIP_OPTIONS}
            />
            <FormSelect
              control={form.control}
              name='warmth'
              label='Warmth'
              placeholder='Select warmth'
              options={WARMTH_OPTIONS}
            />
            <FormSelect
              control={form.control}
              name='closeness'
              label='Closeness'
              placeholder='Select closeness'
              options={CLOSENESS_OPTIONS}
            />
            <FormSelect
              control={form.control}
              name='outreachStatus'
              label='Outreach Status'
              placeholder='Select status'
              options={OUTREACH_STATUS_OPTIONS}
            />
            <FormInput control={form.control} name='howMet' label='Known From' placeholder='Andover, Penn, WebYes...' />
            <FormDatePicker control={form.control} name='metDate' label='Met Date' />
            <FormDatePicker control={form.control} name='linkedinConnectionDate' label='LinkedIn Connected On' />
            <FormInput control={form.control} name='tags' label='Tags' placeholder='Comma-separated' />
            <FormDatePicker control={form.control} name='nextFollowUpDate' label='Next Follow-up Date' />
          </div>
          <FormTextarea control={form.control} name='notes' label='Notes' placeholder='Notes about this contact...' config={{ rows: 4 }} />
          <FormTextarea control={form.control} name='followUpNotes' label='Follow-up Notes' placeholder='What to follow up on...' config={{ rows: 2 }} />
          <Button type='submit'>{initialData ? 'Update Contact' : 'Add Contact'}</Button>
        </Form>
      </CardContent>
    </Card>
  );
}
