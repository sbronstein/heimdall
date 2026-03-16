'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JobLead } from '@/lib/domain/types';
import { UrlInputForm } from './url-input-form';
import { JobLeadCard } from './job-lead-card';

export function JobLeadsPage({ initialLeads }: { initialLeads: JobLead[] }) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);

  async function handleCreate(url: string) {
    const res = await fetch('/api/job-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkedinJobUrl: url })
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed to create job lead');
    }

    const { data } = await res.json();
    setLeads((prev) => [data, ...prev]);
    router.push(`/dashboard/job-leads/${data.id}`);
  }

  return (
    <div className='space-y-4'>
      <UrlInputForm onSubmit={handleCreate} />

      {leads.length === 0 ? (
        <div className='text-muted-foreground py-12 text-center'>
          <p>No job leads yet.</p>
          <p className='mt-1 text-sm'>
            Paste a LinkedIn job URL above to get started.
          </p>
        </div>
      ) : (
        <div className='space-y-2'>
          {leads.map((lead) => (
            <JobLeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
