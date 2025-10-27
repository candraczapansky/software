import { useState, useCallback } from 'react';

interface SortOptions {
  initialSortBy?: string;
  initialSortOrder?: 'asc' | 'desc';
}

export function useSorting({ initialSortBy = '', initialSortOrder = 'asc' }: SortOptions = {}) {
  const [sortBy, setSortBy] = useState(initialSortBy);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder);

  const onSort = useCallback((field: string) => {
    if (field === sortBy) {
      // Toggle sort order if clicking the same field
      setSortOrder(current => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      // Set new field and default to ascending
      setSortBy(field);
      setSortOrder('asc');
    }
  }, [sortBy]);

  return {
    sortBy,
    sortOrder,
    onSort,
  };
}
