import { canTransition, isTerminalState, validTransitions, terminalStates } from '@/lib/domain/pipeline';
import { applicationStatusValues } from '@/lib/domain/types';

describe('pipeline', () => {
  describe('canTransition', () => {
    describe('valid forward moves', () => {
      it('allows all valid transitions in the graph', () => {
        for (const [from, destinations] of Object.entries(validTransitions)) {
          for (const to of destinations) {
            expect(canTransition(from, to)).toBe(true);
          }
        }
      });
    });

    describe('blocked transitions from terminal states', () => {
      it('blocks any transition from accepted', () => {
        expect(canTransition('accepted', 'applied')).toBe(false);
      });

      it('blocks any transition from rejected', () => {
        expect(canTransition('rejected', 'applied')).toBe(false);
      });

      it('blocks any transition from withdrawn', () => {
        expect(canTransition('withdrawn', 'applied')).toBe(false);
      });

      it('blocks any transition from ghosted', () => {
        expect(canTransition('ghosted', 'applied')).toBe(false);
      });

      it('blocks all destinations from every terminal state', () => {
        for (const t of terminalStates) {
          for (const s of applicationStatusValues) {
            expect(canTransition(t, s)).toBe(false);
          }
        }
      });
    });

    describe('blocked invalid jumps', () => {
      it('blocks researching → offer (invalid forward jump)', () => {
        expect(canTransition('researching', 'offer')).toBe(false);
      });

      it('blocks applied → accepted (skips intermediate stages)', () => {
        expect(canTransition('applied', 'accepted')).toBe(false);
      });

      it('blocks self-transition researching → researching', () => {
        expect(canTransition('researching', 'researching')).toBe(false);
      });

      it('blocks unknown from → applied', () => {
        expect(canTransition('nonexistent_state', 'applied')).toBe(false);
      });
    });
  });

  describe('isTerminalState', () => {
    it('returns true for accepted', () => {
      expect(isTerminalState('accepted')).toBe(true);
    });

    it('returns true for rejected', () => {
      expect(isTerminalState('rejected')).toBe(true);
    });

    it('returns true for withdrawn', () => {
      expect(isTerminalState('withdrawn')).toBe(true);
    });

    it('returns true for ghosted', () => {
      expect(isTerminalState('ghosted')).toBe(true);
    });

    it('returns false for all non-terminal statuses', () => {
      const nonTerminal = applicationStatusValues.filter((s) => !terminalStates.includes(s));
      for (const s of nonTerminal) {
        expect(isTerminalState(s)).toBe(false);
      }
    });
  });
});
