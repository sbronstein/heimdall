// D-08 job-lead state machine.
// Mirrors src/lib/domain/pipeline.ts shape (single source of truth for
// canTransition + transition graph + terminal states).
//
// Both PATCH /api/job-leads/[id]/status and POST /api/job-leads/[id]/search
// import canJobLeadTransition — no hand-coded equality checks.

export const jobLeadTransitions: Record<string, string[]> = {
  pending: ['scraping'],
  scraping: ['scraped', 'pending'],
  scraped: ['queued'],
  queued: ['searching', 'failed'],
  searching: ['found', 'failed'],
  found: ['ready', 'actioned', 'archived'],
  ready: ['actioned', 'archived'],
  actioned: ['archived'],
  failed: ['queued'],
  archived: []
};

// 'failed' is recoverable (failed -> queued retry path per D-08); only
// 'archived' is truly terminal.
export const jobLeadTerminalStates = ['archived'];

export function canJobLeadTransition(from: string, to: string): boolean {
  if (jobLeadTerminalStates.includes(from)) return false;
  return jobLeadTransitions[from]?.includes(to) ?? false;
}
