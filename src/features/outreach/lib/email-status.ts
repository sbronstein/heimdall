const validEmailTransitions: Record<string, string[]> = {
  pending: ['generated', 'failed'],
  generated: ['edited', 'approved', 'failed', 'pending'], // pending = regenerate (D-04)
  edited: ['approved', 'pending'], // pending = regenerate (D-04)
  approved: ['drafted', 'edited'], // edited = un-approve (D-06)
  drafted: ['edited'], // revise after draft (D-05, DRFT-03)
  failed: ['pending'] // retry
};

const terminalEmailStates: string[] = []; // empty — every state recoverable (D-06)

export function canEmailTransition(from: string, to: string): boolean {
  if (terminalEmailStates.includes(from)) return false;
  return validEmailTransitions[from]?.includes(to) ?? false;
}

export function isEmailTerminalState(status: string): boolean {
  return terminalEmailStates.includes(status);
}

export { validEmailTransitions, terminalEmailStates };
