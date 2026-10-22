import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { PositionsResponse } from '../../../shared/types.js';
import { fetchJson, type ApiError } from '../../api.js';
import { pollInterval } from '../../query.js';

export function usePositions(date: string): UseQueryResult<PositionsResponse, ApiError> {
  return useQuery<PositionsResponse, ApiError>({
    queryKey: ['positions', date],
    queryFn: () => fetchJson<PositionsResponse>(`/api/positions?date=${date}`),
    refetchInterval: () => pollInterval(date, new Date()),
  });
}
