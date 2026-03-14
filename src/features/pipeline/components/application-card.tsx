'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cva } from 'class-variance-authority';
import { IconGripVertical } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import type { PipelineApplication } from '../utils/store';

interface ApplicationCardProps {
  app: PipelineApplication;
  isOverlay?: boolean;
  onClick?: () => void;
}

export interface AppDragData {
  type: 'App';
  app: PipelineApplication;
}

function getDaysInStage(statusChangedAt: Date | string | null): number {
  if (!statusChangedAt) return 0;
  const changed = new Date(statusChangedAt);
  const now = new Date();
  return Math.floor((now.getTime() - changed.getTime()) / (1000 * 60 * 60 * 24));
}

export function ApplicationCard({ app, isOverlay, onClick }: ApplicationCardProps) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: app.id,
    data: { type: 'App', app } satisfies AppDragData,
    attributes: { roleDescription: 'Application' }
  });

  const style = {
    transition,
    transform: CSS.Translate.toString(transform)
  };

  const variants = cva('mb-2 cursor-pointer', {
    variants: {
      dragging: {
        over: 'ring-2 opacity-30',
        overlay: 'ring-2 ring-primary'
      }
    }
  });

  const days = getDaysInStage(app.statusChangedAt);
  const daysColor =
    days > 14 ? 'text-red-600' : days > 7 ? 'text-orange-500' : 'text-muted-foreground';

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={variants({
        dragging: isOverlay ? 'overlay' : isDragging ? 'over' : undefined
      })}
      onClick={onClick}
    >
      <CardHeader className='flex flex-row items-center gap-1 px-3 py-2'>
        <Button
          variant='ghost'
          {...attributes}
          {...listeners}
          className='text-secondary-foreground/50 -ml-2 h-auto cursor-grab p-1'
        >
          <span className='sr-only'>Move application</span>
          <IconGripVertical className='h-4 w-4' />
        </Button>
        <span className='truncate text-sm font-semibold'>
          {app.companyName}
        </span>
      </CardHeader>
      <CardContent className='px-3 pb-3'>
        <p className='text-muted-foreground mb-1 truncate text-xs'>
          {app.roleTitle}
        </p>
        {app.referredByName && (
          <p className='mb-1 truncate text-xs text-blue-600'>
            via {app.referredByName}
          </p>
        )}
        <div className='flex items-center justify-between'>
          {app.excitementLevel && (
            <Badge variant='outline' className='text-xs'>
              {app.excitementLevel.replace(/_/g, ' ')}
            </Badge>
          )}
          {days > 0 && (
            <span className={`text-xs ${daysColor}`}>
              {days}d
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
