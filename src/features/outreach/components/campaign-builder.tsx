'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { parseAsInteger, parseAsString, useQueryStates } from 'nuqs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { Contact } from '@/lib/domain/types';
import { deriveConnectionYears } from '@/features/contacts/lib/connection-year';
import { applyBuilderFilters } from '@/features/outreach/lib/builder-filters';
import { BuilderFilterBar } from './builder-filter-bar';
import { ContactSelectionList } from './contact-selection-list';
import { CampaignNamePanel } from './campaign-name-panel';

interface CampaignBuilderProps {
  /** All non-archived contacts, loaded by the RSC page (D-05/D-06) */
  contacts: Contact[];
}

export function CampaignBuilder({ contacts }: CampaignBuilderProps) {
  const router = useRouter();

  // Read filter nuqs params — same keys BuilderFilterBar writes (D-05)
  const [
    {
      connectionYearStart,
      connectionYearEnd,
      closeness,
      howMet,
      outreachStatus
    }
  ] = useQueryStates({
    connectionYearStart: parseAsInteger,
    connectionYearEnd: parseAsInteger,
    closeness: parseAsString,
    howMet: parseAsString,
    outreachStatus: parseAsString.withDefault('not_reached_out')
  });

  // Derive unique connection years for the filter bar controls
  const years = useMemo(() => deriveConnectionYears(contacts), [contacts]);

  // Client-side in-memory filter (D-05/D-06) — selection state is NEVER reset here
  const filteredContacts = useMemo(
    () =>
      applyBuilderFilters(contacts, {
        connectionYearStart,
        connectionYearEnd,
        closeness,
        howMet,
        outreachStatus
      }),
    [
      contacts,
      connectionYearStart,
      connectionYearEnd,
      closeness,
      howMet,
      outreachStatus
    ]
  );

  // Selection as Set<string> keyed by contact id — persists across filter changes (D-03)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleContact = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // D-08: select-all ADDS all currently-filtered contacts to the existing set (does NOT replace)
  const selectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      filteredContacts.forEach((c) => next.add(c.id));
      return next;
    });
  }, [filteredContacts]);

  // Campaign name + goal state
  const [campaignName, setCampaignName] = useState('');
  const [goalInstruction, setGoalInstruction] = useState('');

  // Tray expand/collapse state
  const [trayExpanded, setTrayExpanded] = useState(false);

  // Remove a single contact from the selection set
  const removeFromSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // D-14: save gate — name present AND at least one contact selected
  const canSave = campaignName.trim().length > 0 && selectedIds.size > 0;

  // CD-01: in-flight guard — prevents double-submit
  const [isSaving, setIsSaving] = useState(false);

  // D-12/CD-01/CD-02: two-POST save sequence
  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    try {
      // Step 1: create campaign
      // API requires goalInstruction.min(1); fall back to campaign name when blank (D-14 API constraint)
      const goalToSend = goalInstruction.trim() || campaignName.trim();

      const res1 = await fetch('/api/outreach-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          goalInstruction: goalToSend
        })
      });
      if (!res1.ok) {
        const body = await res1.json().catch(() => ({}));
        throw new Error(body?.error ?? 'Failed to create campaign');
      }
      const { data: campaign } = await res1.json();

      // Step 2: bulk-add contacts in batches of <=500 (API Zod max)
      const ids = Array.from(selectedIds);
      const BATCH_SIZE = 500;
      let bulkFailed = false;

      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const res2 = await fetch(
          `/api/outreach-campaigns/${campaign.id}/emails`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactIds: batch })
          }
        );
        if (!res2.ok) {
          bulkFailed = true;
          break;
        }
      }

      if (bulkFailed) {
        // CD-02: surface the partial failure; still navigate so the campaign is accessible
        toast.error(
          'Campaign created but some contacts could not be added — open the campaign to retry.'
        );
      }

      router.push(`/dashboard/outreach/${campaign.id}`);
    } catch (err) {
      console.error('Campaign save failed:', err);
      toast.error(
        err instanceof Error
          ? err.message
          : 'Failed to save campaign — please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  }, [canSave, isSaving, campaignName, goalInstruction, selectedIds, router]);

  // Resolve selected ids against the FULL contacts array (D-09) so out-of-filter
  // selections still appear in the tray
  const selectedContacts = useMemo(() => {
    if (selectedIds.size === 0) return [];
    const map = new Map(contacts.map((c) => [c.id, c]));
    return Array.from(selectedIds)
      .map((id) => map.get(id))
      .filter((c): c is Contact => c !== undefined);
  }, [contacts, selectedIds]);

  return (
    <div className='flex h-full flex-col gap-4 overflow-hidden'>
      {/* Top row: name + goal panel + save button */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start'>
        <div className='flex-1'>
          <CampaignNamePanel
            name={campaignName}
            onNameChange={setCampaignName}
            goalInstruction={goalInstruction}
            onGoalChange={setGoalInstruction}
          />
        </div>

        {/* Save button + selected count — always visible (D-14/CD-01) */}
        <div className='flex shrink-0 flex-col items-end gap-2 pt-1'>
          <Button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            className='min-w-32'
          >
            {isSaving ? 'Saving…' : 'Save Campaign'}
          </Button>
          {selectedIds.size > 0 && (
            <p className='text-muted-foreground text-sm'>
              {selectedIds.size} contact{selectedIds.size !== 1 ? 's' : ''}{' '}
              selected
            </p>
          )}
        </div>
      </div>

      {/* Filter bar (D-07) */}
      <BuilderFilterBar years={years} />

      {/* Selected tray (D-03/D-09): persistent across filter changes */}
      {selectedIds.size > 0 && (
        <div className='bg-muted/40 rounded-lg border px-4 py-3'>
          <div className='flex items-center justify-between gap-2'>
            <button
              type='button'
              className='text-sm font-medium hover:underline'
              onClick={() => setTrayExpanded((v) => !v)}
            >
              {trayExpanded ? '▾' : '▸'} {selectedIds.size} contact
              {selectedIds.size !== 1 ? 's' : ''} in campaign
            </button>
            <button
              type='button'
              className='text-muted-foreground hover:text-destructive text-xs underline'
              onClick={() => setSelectedIds(new Set())}
            >
              Clear all
            </button>
          </div>

          {/* Expanded tray: list selected contacts with remove buttons (D-09) */}
          {trayExpanded && (
            <ul className='mt-2 max-h-48 space-y-1 overflow-y-auto'>
              {selectedContacts.map((contact) => (
                <li
                  key={contact.id}
                  className='flex items-center justify-between gap-2 text-sm'
                >
                  <span>
                    {contact.firstName} {contact.lastName}
                    {contact.currentCompany ? (
                      <span className='text-muted-foreground ml-1 text-xs'>
                        @ {contact.currentCompany}
                      </span>
                    ) : null}
                  </span>
                  <button
                    type='button'
                    className='text-muted-foreground hover:text-destructive shrink-0 text-xs underline'
                    onClick={() => removeFromSelection(contact.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Contact selection list (D-03/D-08) — filters in memory, selection persists */}
      <div className='min-h-0 flex-1 overflow-y-auto'>
        {filteredContacts.length === 0 ? (
          <div className='py-12 text-center'>
            <p className='text-muted-foreground text-sm'>
              No contacts match the current filters — adjust the filters above
              to see contacts.
            </p>
          </div>
        ) : (
          <ContactSelectionList
            contacts={filteredContacts}
            selectedIds={selectedIds}
            onToggle={toggleContact}
            onSelectAll={selectAllFiltered}
          />
        )}
      </div>
    </div>
  );
}
