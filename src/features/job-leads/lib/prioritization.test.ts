import { faker } from '@faker-js/faker';
import type { Contact, Prospect, ProspectBridge } from '@/lib/domain/types';
import { computeBridgeScore, buildRecommendations } from '@/features/job-leads/lib/prioritization';
import { seniorityLevelValues, contactClosenessValues } from '@/lib/domain/types';

function makeContact(overrides: Partial<Contact> = {}): Contact {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    firstName: 'Test',
    lastName: 'Contact',
    createdAt: now,
    updatedAt: now,
    email: null,
    phone: null,
    linkedinUrl: null,
    title: null,
    currentCompany: null,
    companyId: null,
    relationship: 'other',
    warmth: 'cold',
    closeness: 'acquaintance',
    outreachStatus: 'not_reached_out',
    outreachDate: null,
    introducedBy: null,
    linkedinConnectionDate: null,
    importSource: null,
    importedAt: null,
    notes: null,
    tags: null,
    howMet: null,
    metDate: null,
    lastContactDate: null,
    nextFollowUpDate: null,
    followUpNotes: null,
    triagedAt: null,
    archivedAt: null,
    ...overrides
  };
}

function makeProspect(overrides: Partial<Prospect> = {}): Prospect {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    jobLeadId: crypto.randomUUID(),
    name: 'Test Prospect',
    seniorityLevel: 'unknown',
    createdAt: now,
    updatedAt: now,
    title: null,
    linkedinUrl: null,
    profileSnippet: null,
    ...overrides
  };
}

function makeProspectBridge(overrides: Partial<ProspectBridge> = {}): ProspectBridge {
  return {
    id: crypto.randomUUID(),
    prospectId: crypto.randomUUID(),
    contactId: crypto.randomUUID(),
    score: null,
    createdAt: new Date(),
    ...overrides
  };
}

describe('computeBridgeScore', () => {
  it('computes the correct weighted composition: vp + close_friend + today = 94', () => {
    const prospect = makeProspect({ seniorityLevel: 'vp' });
    const contact = makeContact({
      closeness: 'close_friend',
      lastContactDate: new Date()
    });
    const score = computeBridgeScore(prospect, contact);
    // Math.round(0.4 * 85 + 0.35 * 100 + 0.25 * ~100)
    // = Math.round(34 + 35 + 25) = 94
    expect(score).toBe(94);
  });

  it('uses acquaintance (30) when closeness is null, and 0 for no recency: ic + null + null = 19', () => {
    const prospect = makeProspect({ seniorityLevel: 'ic' });
    const contact = makeContact({ closeness: null, lastContactDate: null });
    const score = computeBridgeScore(prospect, contact);
    // Math.round(0.4 * 20 + 0.35 * 30 + 0.25 * 0) = Math.round(8 + 10.5 + 0) = 19
    expect(score).toBe(19);
  });

  it('contributes 0 to recency when lastContactDate is null', () => {
    const prospect = makeProspect({ seniorityLevel: 'manager' });
    const withRecency = makeContact({ closeness: 'colleague', lastContactDate: new Date() });
    const withoutRecency = makeContact({ closeness: 'colleague', lastContactDate: null });
    expect(computeBridgeScore(prospect, withRecency)).toBeGreaterThan(
      computeBridgeScore(prospect, withoutRecency)
    );
  });

  it('returns a score within [0, 100] bounds for a fuzz batch of 50 inputs', () => {
    const pastDate = new Date(Date.now() - 5 * 365 * 24 * 60 * 60 * 1000);

    for (let i = 0; i < 50; i++) {
      const seniorityLevel = faker.helpers.arrayElement([...seniorityLevelValues]);
      const closeness = faker.helpers.arrayElement([...contactClosenessValues]);
      const lastContactDate = faker.datatype.boolean()
        ? faker.date.between({ from: pastDate, to: new Date() })
        : null;

      const prospect = makeProspect({ seniorityLevel });
      const contact = makeContact({ closeness, lastContactDate });
      const score = computeBridgeScore(prospect, contact);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('monotonicity: c_suite score >= ic score with all else fixed', () => {
    const cSuiteProspect = makeProspect({ seniorityLevel: 'c_suite' });
    const icProspect = makeProspect({ seniorityLevel: 'ic' });
    const contact = makeContact({ closeness: 'colleague', lastContactDate: null });

    const cSuiteScore = computeBridgeScore(cSuiteProspect, contact);
    const icScore = computeBridgeScore(icProspect, contact);

    expect(cSuiteScore).toBeGreaterThanOrEqual(icScore);
  });
});

describe('buildRecommendations', () => {
  it('groups multiple bridges for the same contact, using max score as contact score', () => {
    const contact1 = makeContact();
    const contact2 = makeContact();
    const prospect1 = makeProspect();
    const prospect2 = makeProspect();
    const prospect3 = makeProspect();

    const bridges = [
      {
        bridge: makeProspectBridge({ prospectId: prospect1.id, contactId: contact1.id, score: 70 }),
        prospect: prospect1,
        contact: contact1
      },
      {
        bridge: makeProspectBridge({ prospectId: prospect2.id, contactId: contact1.id, score: 40 }),
        prospect: prospect2,
        contact: contact1
      },
      {
        bridge: makeProspectBridge({ prospectId: prospect3.id, contactId: contact2.id, score: 90 }),
        prospect: prospect3,
        contact: contact2
      }
    ];

    const result = buildRecommendations(bridges);

    // Returns 2 PrioritizedRecommendations (one per unique contact)
    expect(result).toHaveLength(2);

    // Result is sorted desc by score — contact2 (score 90) appears first
    expect(result[0].contact.id).toBe(contact2.id);
    expect(result[0].score).toBe(90);

    // contact1 has max score of 70 (not 40)
    expect(result[1].contact.id).toBe(contact1.id);
    expect(result[1].score).toBe(70);

    // contact1's prospects are sorted desc by bridgeScore
    expect(result[1].prospects[0].bridgeScore).toBe(70);
    expect(result[1].prospects[1].bridgeScore).toBe(40);
  });
});
