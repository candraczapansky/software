import { useState, useCallback } from 'react';

interface PaginationOptions {
  initialPage?: number;
  initialPerPage?: number;
}

export function usePagination({ initialPage = 1, initialPerPage = 10 }: PaginationOptions = {}) {
  const [page, setPage] = useState(initialPage);
  const [perPage, setPerPage] = useState(initialPerPage);

  const onPageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const onPerPageChange = useCallback((newPerPage: number) => {
    setPerPage(newPerPage);
    setPage(1); // Reset to first page when changing items per page
  }, []);

  return {
    page,
    perPage,
    onPageChange,
    onPerPageChange,
  };
}
