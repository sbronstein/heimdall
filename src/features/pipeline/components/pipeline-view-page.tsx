'use client';

import { useState } from 'react';
import { PipelineBoard } from './pipeline-board';
import { ApplicationDetailSheet } from './application-detail-sheet';
import type { PipelineApplication } from '../utils/store';
import type { PipelineStage, Company, Contact } from '@/lib/domain/types';
import { NewApplicationDialog } from './new-application-dialog';

interface PipelineViewPageProps {
  stages: PipelineStage[];
  applications: PipelineApplication[];
  companies: Company[];
  contacts?: Contact[];
}

export function PipelineViewPage({
  stages,
  applications,
  companies,
  contacts = []
}: PipelineViewPageProps) {
  const [selectedApp, setSelectedApp] = useState<PipelineApplication | null>(
    null
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  function handleCardClick(app: PipelineApplication) {
    setSelectedApp(app);
    setSheetOpen(true);
  }

  return (
    <>
      <div className='mb-4 flex justify-end'>
        <NewApplicationDialog companies={companies} contacts={contacts} />
      </div>
      <PipelineBoard
        stages={stages}
        initialApplications={applications}
        onCardClick={handleCardClick}
      />
      <ApplicationDetailSheet
        app={selectedApp}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
