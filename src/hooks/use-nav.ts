'use client';

import { useMemo } from 'react';
import type { NavItem } from '@/types';

/**
 * Hook to filter navigation items.
 * Simplified for single-user app (no org/RBAC checks needed).
 */
export function useFilteredNavItems(items: NavItem[]) {
  return useMemo(() => {
    return items
      .filter((item) => !item.access?.requireOrg)
      .map((item) => {
        if (item.items && item.items.length > 0) {
          return {
            ...item,
            items: item.items.filter(
              (child) => !child.access?.requireOrg
            )
          };
        }
        return item;
      });
  }, [items]);
}
