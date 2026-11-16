import { useInfiniteQuery, type QueryKey } from '@tanstack/react-query';
import type { Page } from '@smart-reply/shared';
import { api, type QueryParams } from '@/lib/api';
import type { Pages } from '@/realtime/cache';

/** A cursor-paged list (`{ items, nextCursor }`) for infinite scrolling. */
export function usePaged<T>(key: QueryKey, path: string, query: QueryParams = {}, enabled = true) {
  return useInfiniteQuery<Page<T>, Error, Pages<T>, QueryKey, string | null>({
    queryKey: key,
    queryFn: ({ pageParam, signal }) => api.get<Page<T>>(path, { ...query, cursor: pageParam ?? undefined }, signal),
    initialPageParam: null,
    getNextPageParam: last => last.nextCursor ?? undefined,
    enabled
  });
}

export function flatItems<T>(data: Pages<T> | undefined): T[] {
  return data ? data.pages.flatMap(p => p.items) : [];
}
