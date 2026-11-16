import { useQuery } from '@tanstack/react-query';
import type { StaffMember } from '@smart-reply/shared';
import { api, asItems } from '@/lib/api';
import { qk } from '../keys';

export function useStaff(enabled = true) {
  return useQuery({
    queryKey: qk.staff,
    queryFn: async ({ signal }) => asItems(await api.get<StaffMember[] | { items: StaffMember[] }>('/staff', undefined, signal)),
    enabled,
    staleTime: 60_000
  });
}

/** `userId → name`, for owner chips. */
export function useStaffNames(enabled = true): Map<string, string> {
  const { data } = useStaff(enabled);
  const map = new Map<string, string>();
  data?.forEach(s => map.set(s.id, s.name));
  return map;
}
