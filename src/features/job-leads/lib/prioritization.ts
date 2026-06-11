import type { Contact, Prospect, ProspectBridge } from '@/lib/domain/types';
import { seniorityWeights } from './seniority';

const closenessWeights: Record<string, number> = {
  close_friend: 100,
  close_colleague: 90,
  friend: 75,
  colleague: 60,
  close_career: 50,
  career: 40,
  acquaintance: 30,
  linkedin_only: 15,
  never_met: 5
};

function recencyWeight(lastContactDate: Date | null): number {
  if (!lastContactDate) return 0;
  const daysSince = (Date.now() - lastContactDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.max(0, 100 - daysSince / 3.65);
}

export type ProspectWithBridge = Prospect & {
  bridge: ProspectBridge;
};

export type PrioritizedRecommendation = {
  contact: Contact;
  score: number;
  prospects: Array<{
    prospect: Prospect;
    bridgeScore: number;
  }>;
};

export function computeBridgeScore(
  prospect: Prospect,
  contact: Contact
): number {
  const seniority = seniorityWeights[prospect.seniorityLevel] ?? 15;
  const closeness = closenessWeights[contact.closeness ?? 'acquaintance'] ?? 30;
  const recency = recencyWeight(contact.lastContactDate);

  return Math.round(0.4 * seniority + 0.35 * closeness + 0.25 * recency);
}

export function buildRecommendations(
  bridges: Array<{
    bridge: ProspectBridge;
    prospect: Prospect;
    contact: Contact;
  }>
): PrioritizedRecommendation[] {
  const byContact = new Map<string, PrioritizedRecommendation>();

  for (const { bridge, prospect, contact } of bridges) {
    // Hard exclusion: owner-flagged contacts are never recommended as intro paths
    if (contact.doNotUseForIntros) continue;

    const score = bridge.score ?? computeBridgeScore(prospect, contact);

    if (!byContact.has(contact.id)) {
      byContact.set(contact.id, {
        contact,
        score: 0,
        prospects: []
      });
    }

    const rec = byContact.get(contact.id)!;
    rec.prospects.push({ prospect, bridgeScore: score });
  }

  // Overall contact score = max of their bridge scores
  for (const rec of Array.from(byContact.values())) {
    rec.score = Math.max(...rec.prospects.map((p) => p.bridgeScore));
    rec.prospects.sort((a, b) => b.bridgeScore - a.bridgeScore);
  }

  return Array.from(byContact.values()).sort((a, b) => b.score - a.score);
}
