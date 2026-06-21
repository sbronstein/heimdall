import type { Contact } from '@/lib/domain/types';
import { contactClosenessValues } from '@/lib/domain/types';
import { filterByConnectionYearRange } from '@/features/contacts/lib/connection-year';

export interface BuilderFilters {
  connectionYearStart: number | null;
  connectionYearEnd: number | null;
  closeness: string | null;
  howMet: string | null;
  outreachStatus: string | null;
}

/**
 * Pure in-memory filter + closeness sort for the campaign builder.
 * All active filters compose with AND semantics; null/empty values are no-ops.
 * Returns a new array ordered closest-first per contactClosenessValues (D-04/D-05/CD-04).
 * Does NOT mutate the input array.
 */
export function applyBuilderFilters(
  contacts: Contact[],
  filters: BuilderFilters
): Contact[] {
  let result: Contact[] = [...contacts];

  // Connection year range (reuse established helper)
  if (
    filters.connectionYearStart != null ||
    filters.connectionYearEnd != null
  ) {
    result = filterByConnectionYearRange(
      result,
      filters.connectionYearStart,
      filters.connectionYearEnd
    );
  }

  // Closeness equality — contacts missing this field are excluded when filter is active
  if (filters.closeness) {
    result = result.filter((c) => c.closeness === filters.closeness);
  }

  // howMet case-insensitive substring (CAMP-01)
  if (filters.howMet && filters.howMet.trim() !== '') {
    const query = filters.howMet.toLowerCase();
    result = result.filter((c) => c.howMet?.toLowerCase().includes(query));
  }

  // Outreach status equality (CAMP-04); default applied by caller (BuilderFilterBar defaults to 'not_reached_out')
  if (filters.outreachStatus) {
    result = result.filter((c) => c.outreachStatus === filters.outreachStatus);
  }

  // D-04: sort by closeness index ascending (close_friend = 0 is first; null treated as never_met = last)
  result.sort(
    (a, b) =>
      contactClosenessValues.indexOf(
        (a.closeness as (typeof contactClosenessValues)[number]) ?? 'never_met'
      ) -
      contactClosenessValues.indexOf(
        (b.closeness as (typeof contactClosenessValues)[number]) ?? 'never_met'
      )
  );

  return result;
}
