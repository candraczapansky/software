import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useQueryParams<T extends Record<string, string>>() {
  const [searchParams, setSearchParams] = useSearchParams();

  const params = useMemo(() => {
    const result: Partial<T> = {};
    searchParams.forEach((value, key) => {
      result[key as keyof T] = value;
    });
    return result;
  }, [searchParams]);

  const updateParams = useCallback(
    (newParams: Partial<T>) => {
      const current = new URLSearchParams(searchParams);
      Object.entries(newParams).forEach(([key, value]) => {
        if (value === undefined || value === null) {
          current.delete(key);
        } else {
          current.set(key, String(value));
        }
      });
      setSearchParams(current);
    },
    [searchParams, setSearchParams]
  );

  return [params, updateParams] as const;
}
