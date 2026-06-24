import {
  inferSeniority,
  seniorityWeights
} from '@/features/job-leads/lib/seniority';
import { seniorityLevelValues } from '@/lib/domain/types';

describe('inferSeniority', () => {
  it('returns c_suite/100 for Chief Data Officer', () => {
    expect(inferSeniority('Chief Data Officer')).toEqual({
      level: 'c_suite',
      weight: 100
    });
  });

  it('returns vp/85 for VP of Engineering', () => {
    expect(inferSeniority('VP of Engineering')).toEqual({
      level: 'vp',
      weight: 85
    });
  });

  it('returns vp/85 for Vice President, Product', () => {
    expect(inferSeniority('Vice President, Product')).toEqual({
      level: 'vp',
      weight: 85
    });
  });

  it('returns director/70 for Senior Director of Data (director wins over senior due to rule order)', () => {
    expect(inferSeniority('Senior Director of Data')).toEqual({
      level: 'director',
      weight: 70
    });
  });

  it('returns senior_manager/55 for Senior Manager (rule-order regression guard)', () => {
    expect(inferSeniority('Senior Manager')).toEqual({
      level: 'senior_manager',
      weight: 55
    });
  });

  it('returns senior_manager/55 for Head of Growth', () => {
    expect(inferSeniority('Head of Growth')).toEqual({
      level: 'senior_manager',
      weight: 55
    });
  });

  it('returns manager/40 for Engineering Manager', () => {
    expect(inferSeniority('Engineering Manager')).toEqual({
      level: 'manager',
      weight: 40
    });
  });

  it('returns senior_ic/30 for Senior Staff Engineer', () => {
    expect(inferSeniority('Senior Staff Engineer')).toEqual({
      level: 'senior_ic',
      weight: 30
    });
  });

  it('returns ic/20 for Software Engineer (roleWordPattern fallback)', () => {
    expect(inferSeniority('Software Engineer')).toEqual({
      level: 'ic',
      weight: 20
    });
  });

  it('returns entry_level/10 for Junior Analyst', () => {
    expect(inferSeniority('Junior Analyst')).toEqual({
      level: 'entry_level',
      weight: 10
    });
  });

  it('returns unknown/15 for empty string', () => {
    expect(inferSeniority('')).toEqual({ level: 'unknown', weight: 15 });
  });

  it('returns unknown/15 for gibberish with no matching words', () => {
    expect(inferSeniority('Banana')).toEqual({ level: 'unknown', weight: 15 });
  });

  it('returns vp/85 for SVP (acronym, no word boundary inside SVP)', () => {
    expect(inferSeniority('SVP of Product')).toEqual({
      level: 'vp',
      weight: 85
    });
  });

  it('returns vp/85 for EVP', () => {
    expect(inferSeniority('EVP, Global Sales')).toEqual({
      level: 'vp',
      weight: 85
    });
  });

  it('returns vp/85 (not ic) for SVP, Strategy & Operations — regression for SVP-as-IC', () => {
    expect(
      inferSeniority('SVP, Strategy & Operations | Affordable Housing')
    ).toEqual({
      level: 'vp',
      weight: 85
    });
  });

  it('returns vp/85 for Senior Vice President, Internal Communications', () => {
    expect(
      inferSeniority('Senior Vice President, Internal Communications')
    ).toEqual({
      level: 'vp',
      weight: 85
    });
  });

  it('does NOT promote a bare AVP acronym to vp (over-ranking guard)', () => {
    expect(inferSeniority('AVP').level).not.toBe('vp');
  });
});

describe('seniorityWeights', () => {
  it('contains an entry for every SeniorityLevel enum value', () => {
    for (const level of seniorityLevelValues) {
      expect(seniorityWeights).toHaveProperty(level);
      expect(typeof seniorityWeights[level]).toBe('number');
    }
  });
});
