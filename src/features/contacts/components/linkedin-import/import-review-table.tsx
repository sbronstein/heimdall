'use client';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

export interface ParsedContact {
  firstName: string;
  lastName: string;
  email: string | null;
  company: string | null;
  position: string | null;
  connectedOn: string | null;
  linkedinUrl: string | null;
  closeness: string;
}

interface ImportReviewTableProps {
  contacts: ParsedContact[];
  onClosenessChange: (index: number, closeness: string) => void;
}

export function ImportReviewTable({
  contacts,
  onClosenessChange
}: ImportReviewTableProps) {
  return (
    <div className='max-h-96 overflow-auto rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Position</TableHead>
            <TableHead>Connected</TableHead>
            <TableHead>Closeness</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((c, i) => (
            <TableRow key={i}>
              <TableCell className='font-medium'>
                {c.firstName} {c.lastName}
              </TableCell>
              <TableCell>{c.company || '-'}</TableCell>
              <TableCell className='max-w-40 truncate text-sm'>
                {c.position || '-'}
              </TableCell>
              <TableCell className='text-sm'>{c.connectedOn || '-'}</TableCell>
              <TableCell>
                <Select
                  value={c.closeness}
                  onValueChange={(v) => onClosenessChange(i, v)}
                >
                  <SelectTrigger className='h-8 w-36'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
