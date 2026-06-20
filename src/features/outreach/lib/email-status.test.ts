import {
  canEmailTransition,
  isEmailTerminalState,
  validEmailTransitions
} from '@/features/outreach/lib/email-status';
import { outreachEmailStatusValues } from '@/lib/domain/types';

describe('email-status state machine', () => {
  describe('canEmailTransition', () => {
    describe('valid moves accepted', () => {
      it('allows all valid transitions in the graph', () => {
        for (const [from, destinations] of Object.entries(
          validEmailTransitions
        )) {
          for (const to of destinations) {
            expect(canEmailTransition(from, to)).toBe(true);
          }
        }
      });

      it('allows explicit chain: pending → generated → edited → approved → drafted', () => {
        expect(canEmailTransition('pending', 'generated')).toBe(true);
        expect(canEmailTransition('generated', 'edited')).toBe(true);
        expect(canEmailTransition('edited', 'approved')).toBe(true);
        expect(canEmailTransition('approved', 'drafted')).toBe(true);
      });

      it('allows regenerate: edited → pending', () => {
        expect(canEmailTransition('edited', 'pending')).toBe(true);
      });

      it('allows regenerate: generated → pending', () => {
        expect(canEmailTransition('generated', 'pending')).toBe(true);
      });

      it('allows drafted → edited (D-05: revise after draft)', () => {
        expect(canEmailTransition('drafted', 'edited')).toBe(true);
      });
    });

    describe('invalid moves rejected', () => {
      it('rejects pending → drafted (skip-ahead jump)', () => {
        expect(canEmailTransition('pending', 'drafted')).toBe(false);
      });

      it('rejects approved → pending (skip backwards past regenerate gate)', () => {
        expect(canEmailTransition('approved', 'pending')).toBe(false);
      });

      it('rejects pending → approved (skip-ahead jump)', () => {
        expect(canEmailTransition('pending', 'approved')).toBe(false);
      });

      it('returns false for unknown from state', () => {
        expect(canEmailTransition('nonexistent', 'pending')).toBe(false);
      });
    });
  });

  describe('isEmailTerminalState', () => {
    it('returns false for every status in outreachEmailStatusValues (D-06: every state recoverable)', () => {
      for (const status of outreachEmailStatusValues) {
        expect(isEmailTerminalState(status)).toBe(false);
      }
    });
  });
});
