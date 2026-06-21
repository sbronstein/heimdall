// Tests for CampaignList business logic behaviors (D-10, CD-05)
// vitest environment: node (no DOM/React rendering; tests logic directly)

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers extracted from the component behaviors — tested in isolation.
// These will be exported by the component module in the GREEN phase.
// ---------------------------------------------------------------------------

// D-10: The four displayed counts map pending→selected, generated, approved, drafted
// from the emailCounts record. The displayCountsFromEmailCounts function returns
// the four D-10 badge values.
import { displayCountsFromEmailCounts } from './campaign-list';

// CD-05: hasNoCampaigns determines whether the empty state should render.
import { hasNoCampaigns } from './campaign-list';

// D-10: The "selected" label maps from the "pending" count key.
describe('displayCountsFromEmailCounts (D-10)', () => {
  it('maps pending → selected count correctly', () => {
    const counts = { pending: 5, generated: 3, approved: 2, drafted: 1 };
    const result = displayCountsFromEmailCounts(counts);
    expect(result.selected).toBe(5);
  });

  it('maps generated count correctly', () => {
    const counts = { pending: 0, generated: 7, approved: 0, drafted: 0 };
    const result = displayCountsFromEmailCounts(counts);
    expect(result.generated).toBe(7);
  });

  it('maps approved count correctly', () => {
    const counts = { pending: 0, generated: 0, approved: 4, drafted: 0 };
    const result = displayCountsFromEmailCounts(counts);
    expect(result.approved).toBe(4);
  });

  it('maps drafted count correctly', () => {
    const counts = { pending: 0, generated: 0, approved: 0, drafted: 9 };
    const result = displayCountsFromEmailCounts(counts);
    expect(result.drafted).toBe(9);
  });

  it('returns zero for missing keys (empty new campaign)', () => {
    const result = displayCountsFromEmailCounts({});
    expect(result.selected).toBe(0);
    expect(result.generated).toBe(0);
    expect(result.approved).toBe(0);
    expect(result.drafted).toBe(0);
  });

  it('all four counts together', () => {
    const counts = { pending: 10, generated: 8, approved: 5, drafted: 3 };
    const result = displayCountsFromEmailCounts(counts);
    expect(result).toEqual({
      selected: 10,
      generated: 8,
      approved: 5,
      drafted: 3
    });
  });
});

// CD-05: empty state detection
describe('hasNoCampaigns (CD-05)', () => {
  it('returns true when the list is empty', () => {
    expect(hasNoCampaigns([])).toBe(true);
  });

  it('returns false when there is at least one campaign', () => {
    const campaign = {
      id: '1',
      name: 'Test Campaign',
      goalInstruction: '',
      status: 'draft' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      emailCounts: {}
    };
    expect(hasNoCampaigns([campaign])).toBe(false);
  });

  it('returns false when there are multiple campaigns', () => {
    const base = {
      id: '1',
      name: 'Test',
      goalInstruction: null,
      status: 'draft' as const,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      emailCounts: {}
    };
    expect(hasNoCampaigns([base, { ...base, id: '2' }])).toBe(false);
  });
});
