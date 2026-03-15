'use client';

import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/ui/table/data-table-column-header';
import type { Contact } from '@/lib/domain/types';
import { Column, ColumnDef } from '@tanstack/react-table';
import { Text } from 'lucide-react';
import { CellAction } from './cell-action';
import {
  WARMTH_OPTIONS,
  RELATIONSHIP_OPTIONS,
  CLOSENESS_OPTIONS,
  OUTREACH_STATUS_OPTIONS
} from './options';
import { formatDistanceToNow } from 'date-fns';
import { closenessColors, warmthColors, outreachStatusColors } from '@/features/contacts/lib/closeness-colors';

export const columns: ColumnDef<Contact>[] = [
  {
    id: 'name',
    accessorFn: (row) => `${row.firstName} ${row.lastName}`,
    header: ({ column }: { column: Column<Contact, unknown> }) => (
      <DataTableColumnHeader column={column} title='Name' />
    ),
    cell: ({ row }) => (
      <div className='font-medium'>
        {row.original.firstName} {row.original.lastName}
      </div>
    ),
    meta: {
      label: 'Name',
      placeholder: 'Search contacts...',
      variant: 'text',
      icon: Text
    },
    enableColumnFilter: true
  },
  {
    accessorKey: 'title',
    header: 'Title',
    cell: ({ cell }) => <div>{cell.getValue<string>() || '-'}</div>
  },
  {
    accessorKey: 'currentCompany',
    header: 'Company',
    cell: ({ cell }) => <div>{cell.getValue<string>() || '-'}</div>
  },
  {
    id: 'relationship',
    accessorKey: 'relationship',
    header: ({ column }: { column: Column<Contact, unknown> }) => (
      <DataTableColumnHeader column={column} title='Relationship' />
    ),
    cell: ({ cell }) => {
      const value = cell.getValue<string>();
      const label = RELATIONSHIP_OPTIONS.find((o) => o.value === value)?.label || value;
      return <Badge variant='outline'>{label}</Badge>;
    },
    enableColumnFilter: true,
    meta: {
      label: 'Relationship',
      variant: 'multiSelect',
      options: RELATIONSHIP_OPTIONS
    }
  },
  {
    id: 'warmth',
    accessorKey: 'warmth',
    header: ({ column }: { column: Column<Contact, unknown> }) => (
      <DataTableColumnHeader column={column} title='Warmth' />
    ),
    cell: ({ cell }) => {
      const value = cell.getValue<string>();
      return (
        <Badge className={warmthColors[value] || ''} variant='outline'>
          {value}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: 'Warmth',
      variant: 'multiSelect',
      options: WARMTH_OPTIONS
    }
  },
  {
    id: 'closeness',
    accessorKey: 'closeness',
    header: ({ column }: { column: Column<Contact, unknown> }) => (
      <DataTableColumnHeader column={column} title='Closeness' />
    ),
    cell: ({ cell }) => {
      const value = cell.getValue<string>();
      if (!value) return <span className='text-muted-foreground'>-</span>;
      const label = CLOSENESS_OPTIONS.find((o) => o.value === value)?.label || value;
      return (
        <Badge className={closenessColors[value] || ''} variant='outline'>
          {label}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: 'Closeness',
      variant: 'multiSelect',
      options: CLOSENESS_OPTIONS
    }
  },
  {
    id: 'outreachStatus',
    accessorKey: 'outreachStatus',
    header: ({ column }: { column: Column<Contact, unknown> }) => (
      <DataTableColumnHeader column={column} title='Outreach' />
    ),
    cell: ({ cell }) => {
      const value = cell.getValue<string>();
      if (!value) return <span className='text-muted-foreground'>-</span>;
      const label = OUTREACH_STATUS_OPTIONS.find((o) => o.value === value)?.label || value;
      return (
        <Badge className={outreachStatusColors[value] || ''} variant='outline'>
          {label}
        </Badge>
      );
    },
    enableColumnFilter: true,
    meta: {
      label: 'Outreach',
      variant: 'multiSelect',
      options: OUTREACH_STATUS_OPTIONS
    }
  },
  {
    accessorKey: 'howMet',
    header: 'Known From',
    cell: ({ cell }) => <div>{cell.getValue<string>() || '-'}</div>
  },
  {
    accessorKey: 'linkedinConnectionDate',
    header: 'Connected On',
    cell: ({ cell }) => {
      const date = cell.getValue<Date | null>();
      if (!date) return <span className='text-muted-foreground'>-</span>;
      return <span>{new Date(date).toLocaleDateString()}</span>;
    }
  },
  {
    accessorKey: 'metDate',
    header: 'Met',
    cell: ({ cell }) => {
      const date = cell.getValue<Date | null>();
      if (!date) return <span className='text-muted-foreground'>-</span>;
      return <span>{new Date(date).toLocaleDateString()}</span>;
    }
  },
  {
    accessorKey: 'nextFollowUpDate',
    header: 'Follow Up',
    cell: ({ cell }) => {
      const date = cell.getValue<Date | null>();
      if (!date) return <span className='text-muted-foreground'>-</span>;
      const isOverdue = new Date(date) < new Date();
      return (
        <span className={isOverdue ? 'font-medium text-red-600' : ''}>
          {formatDistanceToNow(new Date(date), { addSuffix: true })}
        </span>
      );
    }
  },
  {
    id: 'actions',
    cell: ({ row }) => <CellAction data={row.original} />
  }
];
