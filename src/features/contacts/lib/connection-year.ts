export const MIN_CONNECTION_YEAR = 1990;

export function deriveConnectionYears<
  T extends { linkedinConnectionDate: Date | null }
>(contacts: T[]): number[] {
  const years = contacts
    .map((c) => c.linkedinConnectionDate)
    .filter((d): d is Date => d != null)
    .map((d) => new Date(d).getFullYear());

  return Array.from(new Set(years)).sort((a, b) => b - a);
}

export function filterByConnectionYearRange<
  T extends { linkedinConnectionDate: Date | null }
>(contacts: T[], start: number | null, end: number | null): T[] {
  if (start == null && end == null) {
    return contacts;
  }

  const lo = Math.min(start ?? end!, end ?? start!);
  const hi = Math.max(start ?? end!, end ?? start!);

  return contacts.filter((c) => {
    if (c.linkedinConnectionDate == null) return false;
    const year = new Date(c.linkedinConnectionDate).getFullYear();
    return year >= lo && year <= hi;
  });
}

export function clampConnectionYear(
  value: number | null | undefined
): number | null {
  if (value == null) return null;
  if (!isFinite(value) || isNaN(value)) return null;

  const year = Math.trunc(value);
  const currentYear = new Date().getFullYear();

  if (year < MIN_CONNECTION_YEAR || year > currentYear + 1) return null;

  return year;
}
