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

const closenessColors: Record<string, string> = {
  friend: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  close_colleague: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  colleague: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  career_contact: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  acquaintance: 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  linkedin_only: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
  never_met: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
};

const outreachStatusColors: Record<string, string> = {
  not_reached_out: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  reached_out: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  meeting_scheduled: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  meeting_completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  ongoing: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
};

const warmthColors: Record<string, string> = {
  hot: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warm: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  lukewarm: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  cold: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
};

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
