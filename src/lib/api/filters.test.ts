import { parseCursor, parseLimit, parseArrayParam } from '@/lib/api/filters';

describe('parseCursor', () => {
  it('returns null for null input', () => {
    expect(parseCursor(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseCursor('')).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(parseCursor('not-a-date')).toBeNull();
  });

  it('returns a Date instance for a valid ISO datetime string', () => {
    const result = parseCursor('2026-01-15T12:00:00Z');
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe('2026-01-15T12:00:00.000Z');
  });

  it('returns a Date instance for a date-only ISO string', () => {
    const result = parseCursor('2026-01-15');
    expect(result).toBeInstanceOf(Date);
  });
});

describe('parseLimit', () => {
  it('returns 20 for null input', () => {
    expect(parseLimit(null)).toBe(20);
  });

  it('returns 20 for empty string', () => {
    expect(parseLimit('')).toBe(20);
  });

  it('returns 20 for zero (less than 1)', () => {
    expect(parseLimit('0')).toBe(20);
  });

  it('returns 20 for negative number', () => {
    expect(parseLimit('-5')).toBe(20);
  });

  it('returns 20 for non-numeric string', () => {
    expect(parseLimit('abc')).toBe(20);
  });

  it('returns the provided value when within bounds', () => {
    expect(parseLimit('50')).toBe(50);
  });

  it('clamps to default max of 100 when value exceeds it', () => {
    expect(parseLimit('500')).toBe(100);
  });

  it('clamps to provided max when value exceeds it', () => {
    expect(parseLimit('500', 200)).toBe(200);
  });
});

describe('parseArrayParam', () => {
  it('returns null for null input', () => {
    expect(parseArrayParam(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseArrayParam('')).toBeNull();
  });

  it('splits a comma-separated string into an array', () => {
    expect(parseArrayParam('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace and filters empty segments', () => {
    expect(parseArrayParam(' a , , b ')).toEqual(['a', 'b']);
  });

  it('returns a single-element array for a string with no commas', () => {
    expect(parseArrayParam('single')).toEqual(['single']);
  });
});
