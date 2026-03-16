'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconPlus, IconLoader2 } from '@tabler/icons-react';

interface UrlInputFormProps {
  onSubmit: (url: string) => Promise<void>;
}

export function UrlInputForm({ onSubmit }: UrlInputFormProps) {
  const [url, setUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onSubmit(url.trim());
      setUrl('');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes('linkedin.com/jobs/')) {
      e.preventDefault();
      setUrl(pasted.trim());
      // Auto-submit on paste
      setIsSubmitting(true);
      onSubmit(pasted.trim()).finally(() => {
        setIsSubmitting(false);
        setUrl('');
      });
    }
  }

  return (
    <form onSubmit={handleSubmit} className='flex gap-2'>
      <Input
        placeholder='Paste a LinkedIn job URL...'
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onPaste={handlePaste}
        disabled={isSubmitting}
        className='flex-1'
      />
      <Button type='submit' disabled={!url.trim() || isSubmitting}>
        {isSubmitting ? (
          <IconLoader2 className='mr-1 h-4 w-4 animate-spin' />
        ) : (
          <IconPlus className='mr-1 h-4 w-4' />
        )}
        Add
      </Button>
    </form>
  );
}
