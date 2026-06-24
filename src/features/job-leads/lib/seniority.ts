import type { SeniorityLevel } from '@/lib/domain/types';

type SeniorityRule = {
  patterns: RegExp;
  level: SeniorityLevel;
  weight: number;
};

const rules: SeniorityRule[] = [
  {
    patterns: /\b(chief|ceo|cto|cfo|coo|cmo|cpo|c-suite)\b/i,
    level: 'c_suite',
    weight: 100
  },
  {
    // [se]?vp matches vp / svp / evp; the spelled-out forms cover "Senior/Executive
    // Vice President". "Assistant Vice President" intentionally matches the bare
    // vice-president alternative (vp), not promoted — and "AVP" (no 'a' in the class)
    // falls through rather than being over-ranked.
    patterns:
      /\b([se]?vp|senior\s+vice\s+president|executive\s+vice\s+president|vice\s+president)\b/i,
    level: 'vp',
    weight: 85
  },
  {
    patterns: /\bdirector\b/i,
    level: 'director',
    weight: 70
  },
  {
    patterns: /\b(senior\s+manager|head\s+of)\b/i,
    level: 'senior_manager',
    weight: 55
  },
  {
    patterns: /\bmanager\b/i,
    level: 'manager',
    weight: 40
  },
  {
    patterns: /\b(senior|staff|principal|lead)\b/i,
    level: 'senior_ic',
    weight: 30
  },
  {
    patterns: /\b(entry|intern|junior|associate)\b/i,
    level: 'entry_level',
    weight: 10
  }
];

const roleWordPattern =
  /\b(engineer|developer|analyst|scientist|designer|architect|consultant|coordinator|specialist|strategist|recruiter|accountant|marketing|sales|product|program|project|operations|support)\b/i;

export function inferSeniority(title: string): {
  level: SeniorityLevel;
  weight: number;
} {
  if (!title) return { level: 'unknown', weight: 15 };

  const normalized = title.trim();

  for (const rule of rules) {
    if (rule.patterns.test(normalized)) {
      return { level: rule.level, weight: rule.weight };
    }
  }

  if (roleWordPattern.test(normalized)) {
    return { level: 'ic', weight: 20 };
  }

  return { level: 'unknown', weight: 15 };
}

export const seniorityWeights: Record<SeniorityLevel, number> = {
  c_suite: 100,
  vp: 85,
  director: 70,
  senior_manager: 55,
  manager: 40,
  senior_ic: 30,
  ic: 20,
  entry_level: 10,
  unknown: 15
};
