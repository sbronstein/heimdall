'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import type { Company, Contact } from '@/lib/domain/types';

interface NewApplicationDialogProps {
  companies: Company[];
  contacts?: Contact[];
}

export function NewApplicationDialog({
  companies,
  contacts = []
}: NewApplicationDialogProps) {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [source, setSource] = useState('');
  const [excitementLevel, setExcitementLevel] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!companyId || !roleTitle) {
      toast.error('Company and role title are required');
      return;
    }

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId,
        roleTitle,
        source: source || (referredBy ? 'referral' : undefined),
        excitementLevel: excitementLevel || undefined,
        referredBy: referredBy || undefined
      })
    });

    const json = await res.json();
    if (json.success) {
      toast.success('Application added to pipeline');
      setOpen(false);
      setCompanyId('');
      setRoleTitle('');
      setSource('');
      setExcitementLevel('');
      setReferredBy('');
      router.refresh();
    } else {
      toast.error(json.error || 'Failed to create application');
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size='sm'>
          <IconPlus className='mr-2 h-4 w-4' /> Add Application
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Application</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <Label>Company</Label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger>
                <SelectValue placeholder='Select company' />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Role Title</Label>
            <Input
              value={roleTitle}
              onChange={(e) => setRoleTitle(e.target.value)}
              placeholder='VP of Data & AI'
            />
          </div>
          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue placeholder='How did you find this?' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='referral'>Referral</SelectItem>
                <SelectItem value='recruiter_inbound'>Recruiter (Inbound)</SelectItem>
                <SelectItem value='recruiter_outbound'>Recruiter (Outbound)</SelectItem>
                <SelectItem value='linkedin'>LinkedIn</SelectItem>
                <SelectItem value='job_board'>Job Board</SelectItem>
                <SelectItem value='vc_talent_network'>VC Talent Network</SelectItem>
                <SelectItem value='direct_application'>Direct Application</SelectItem>
                <SelectItem value='networking'>Networking</SelectItem>
                <SelectItem value='conference'>Conference</SelectItem>
                <SelectItem value='other'>Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {contacts.length > 0 && (
            <div>
              <Label>Referred By</Label>
              <Select
                value={referredBy}
                onValueChange={(v) => {
                  setReferredBy(v);
                  if (v && !source) setSource('referral');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select contact (optional)' />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                      {c.currentCompany ? ` (${c.currentCompany})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Excitement Level</Label>
            <Select value={excitementLevel} onValueChange={setExcitementLevel}>
              <SelectTrigger>
                <SelectValue placeholder='How excited are you?' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='5_dream_role'>5 - Dream Role</SelectItem>
                <SelectItem value='4_very_excited'>4 - Very Excited</SelectItem>
                <SelectItem value='3_interested'>3 - Interested</SelectItem>
                <SelectItem value='2_lukewarm'>2 - Lukewarm</SelectItem>
                <SelectItem value='1_not_interested'>1 - Not Interested</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type='submit' className='w-full'>
            Add to Pipeline
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
