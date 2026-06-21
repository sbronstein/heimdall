import {
  deriveConnectionYears,
  filterByConnectionYearRange,
  clampConnectionYear,
  MIN_CONNECTION_YEAR
} from './connection-year';

// Fixture: { id, linkedinConnectionDate } — no DB
const fixture = [
  { id: '1', linkedinConnectionDate: new Date('2019-03-15') },
  { id: '2', linkedinConnectionDate: new Date('2021-06-01') },
  { id: '3', linkedinConnectionDate: new Date('2021-11-20') },
  { id: '4', linkedinConnectionDate: new Date('2022-01-05') },
  { id: '5', linkedinConnectionDate: null }
];

describe('MIN_CONNECTION_YEAR', () => {
  it('is 1990', () => {
    expect(MIN_CONNECTION_YEAR).toBe(1990);
  });
});

describe('deriveConnectionYears', () => {
  it('returns distinct years sorted descending', () => {
    const result = deriveConnectionYears(fixture);
    expect(result).toEqual([2022, 2021, 2019]);
  });

  it('returns [] for empty array', () => {
    expect(deriveConnectionYears([])).toEqual([]);
  });

  it('returns [] when all dates are null', () => {
    const nullOnly = [{ id: '1', linkedinConnectionDate: null }];
    expect(deriveConnectionYears(nullOnly)).toEqual([]);
  });

  it('deduplicates repeated years', () => {
    // fixture has two 2021 entries — result should have 2021 only once
    const result = deriveConnectionYears(fixture);
    const count2021 = result.filter((y) => y === 2021).length;
    expect(count2021).toBe(1);
  });
});

describe('filterByConnectionYearRange', () => {
  it('returns all contacts including null-date when both bounds are null', () => {
    const result = filterByConnectionYearRange(fixture, null, null);
    expect(result).toHaveLength(5);
  });

  it('filters to single year when only start is set (end null)', () => {
    const result = filterByConnectionYearRange(fixture, 2021, null);
    expect(result).toHaveLength(2);
    result.forEach((c) => {
      expect(new Date(c.linkedinConnectionDate!).getFullYear()).toBe(2021);
    });
  });

  it('filters to single year when only end is set (start null)', () => {
    const result = filterByConnectionYearRange(fixture, null, 2019);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('keeps both years in an inclusive two-year range and excludes outside', () => {
    const result = filterByConnectionYearRange(fixture, 2021, 2022);
    expect(result).toHaveLength(3);
    const ids = result.map((c) => c.id).sort();
    expect(ids).toEqual(['2', '3', '4']);
  });

  it('handles reversed range args identically (start > end)', () => {
    const result = filterByConnectionYearRange(fixture, 2022, 2021);
    expect(result).toHaveLength(3);
  });

  it('excludes null-date contacts when any bound is set', () => {
    const result = filterByConnectionYearRange(fixture, 2021, 2022);
    const hasNull = result.some((c) => c.linkedinConnectionDate == null);
    expect(hasNull).toBe(false);
  });

  it('excludes adjacent years outside the range', () => {
    const result = filterByConnectionYearRange(fixture, 2021, 2022);
    const has2019 = result.some((c) => c.id === '1');
    expect(has2019).toBe(false);
  });
});

describe('clampConnectionYear', () => {
  it('returns null for null input', () => {
    expect(clampConnectionYear(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(clampConnectionYear(undefined)).toBeNull();
  });

  it('returns null for values below MIN_CONNECTION_YEAR (e.g. 1900)', () => {
    expect(clampConnectionYear(1900)).toBeNull();
  });

  it('returns null for unreasonably large values (e.g. 99999999)', () => {
    expect(clampConnectionYear(99999999)).toBeNull();
  });

  it('accepts a valid year within bounds', () => {
    expect(clampConnectionYear(2021)).toBe(2021);
  });

  it('accepts the boundary year MIN_CONNECTION_YEAR (1990)', () => {
    expect(clampConnectionYear(MIN_CONNECTION_YEAR)).toBe(MIN_CONNECTION_YEAR);
  });

  it('accepts current year + 1', () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(clampConnectionYear(nextYear)).toBe(nextYear);
  });

  it('returns null for NaN', () => {
    expect(clampConnectionYear(NaN)).toBeNull();
  });
});
