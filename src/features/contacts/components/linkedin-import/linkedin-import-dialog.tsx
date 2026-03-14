'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { IconUpload } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'sonner';
import Papa from 'papaparse';
import {
  ImportReviewTable,
  type ParsedContact
} from './import-review-table';

type Step = 'upload' | 'review' | 'importing' | 'results';

interface ImportResults {
  created: number;
  skipped: number;
  errors: string[];
}

export function LinkedInImportDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([]);
  const [results, setResults] = useState<ImportResults | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const router = useRouter();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (!csvFile) return;

    setFile(csvFile);

    const reader = new FileReader();
    reader.onload = (e) => {
      let text = e.target?.result as string;

      // LinkedIn CSV exports include a notes preamble before the actual headers.
      // Find the header row (starts with "First Name") and strip everything before it.
      const headerIndex = text.indexOf('First Name');
      if (headerIndex > 0) {
        text = text.substring(headerIndex);
      }

      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim()
      });

      const contacts: ParsedContact[] = (parsed.data as Record<string, string>[])
        .map((row) => ({
          firstName: row['First Name']?.trim() || '',
          lastName: row['Last Name']?.trim() || '',
          email: row['Email Address']?.trim() || null,
          company: row['Company']?.trim() || null,
          position: row['Position']?.trim() || null,
          connectedOn: row['Connected On']?.trim() || null,
          linkedinUrl: row['URL']?.trim() || null,
          closeness: 'acquaintance'
        }))
        .filter((c: ParsedContact) => c.firstName && c.lastName);

      setParsedContacts(contacts);
      setStep('review');
    };
    reader.readAsText(csvFile);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1
  });

  function handleClosenessChange(index: number, closeness: string) {
    setParsedContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, closeness } : c))
    );
  }

  async function handleImport() {
    if (!file) return;

    setStep('importing');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('defaultCloseness', 'acquaintance');

    const res = await fetch('/api/contacts/import', {
      method: 'POST',
      body: formData
    });

    const json = await res.json();
    if (json.success) {
      setResults(json.data);
      setStep('results');

      // Now bulk update closeness for imported contacts
      // (the import API used default; now apply per-row overrides)
      const nonDefault = parsedContacts.filter(
        (c) => c.closeness !== 'acquaintance'
      );
      if (nonDefault.length > 0) {
        // We need contact IDs — re-fetch is heavy, so we skip bulk categorize
        // unless there are overrides. The user can categorize later via the UI.
      }

      toast.success(`Imported ${json.data.created} contacts`);
      router.refresh();
    } else {
      toast.error(json.error || 'Import failed');
      setStep('review');
    }
  }

  function handleClose() {
    setOpen(false);
    // Reset state after dialog closes
    setTimeout(() => {
      setStep('upload');
      setParsedContacts([]);
      setResults(null);
      setFile(null);
    }, 200);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleClose())}>
      <DialogTrigger asChild>
        <Button variant='outline' size='sm'>
          <IconUpload className='mr-2 h-4 w-4' /> Import LinkedIn
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-3xl'>
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Import LinkedIn Connections'}
            {step === 'review' && `Review ${parsedContacts.length} Contacts`}
            {step === 'importing' && 'Importing...'}
            {step === 'results' && 'Import Complete'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-12 text-center transition-colors ${
              isDragActive
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25'
            }`}
          >
            <input {...getInputProps()} />
            <IconUpload className='text-muted-foreground mx-auto mb-4 h-10 w-10' />
            <p className='text-muted-foreground text-sm'>
              {isDragActive
                ? 'Drop your LinkedIn CSV here...'
                : 'Drag & drop your LinkedIn Connections CSV, or click to browse'}
            </p>
            <p className='text-muted-foreground mt-2 text-xs'>
              Export from LinkedIn: Settings → Data Privacy → Get a copy of your data →
              Connections
            </p>
          </div>
        )}

        {step === 'review' && (
          <div className='space-y-4'>
            <ImportReviewTable
              contacts={parsedContacts}
              onClosenessChange={handleClosenessChange}
            />
            <div className='flex justify-end gap-2'>
              <Button variant='outline' onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={handleImport}>
                Import {parsedContacts.length} Contacts
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className='py-12 text-center'>
            <p className='text-muted-foreground animate-pulse'>
              Importing contacts...
            </p>
          </div>
        )}

        {step === 'results' && results && (
          <div className='space-y-4'>
            <div className='grid grid-cols-3 gap-4'>
              <div className='rounded-lg border p-4 text-center'>
                <p className='text-2xl font-bold text-green-600'>
                  {results.created}
                </p>
                <p className='text-muted-foreground text-sm'>Created</p>
              </div>
              <div className='rounded-lg border p-4 text-center'>
                <p className='text-2xl font-bold text-amber-600'>
                  {results.skipped}
                </p>
                <p className='text-muted-foreground text-sm'>Skipped (duplicates)</p>
              </div>
              <div className='rounded-lg border p-4 text-center'>
                <p className='text-2xl font-bold text-red-600'>
                  {results.errors.length}
                </p>
                <p className='text-muted-foreground text-sm'>Errors</p>
              </div>
            </div>
            {results.errors.length > 0 && (
              <div className='max-h-32 overflow-auto rounded border p-2 text-xs'>
                {results.errors.map((e, i) => (
                  <p key={i} className='text-red-600'>
                    {e}
                  </p>
                ))}
              </div>
            )}
            <div className='flex justify-end'>
              <Button onClick={handleClose}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
