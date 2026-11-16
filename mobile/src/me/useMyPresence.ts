import type { StaffMember } from '@smart-reply/shared';
import { useMe } from '@/features/me/hooks';
import { useStaff } from '@/features/team/hooks';

/** My own call and chat status, from the staff list (kept live by `presence.updated`). */
export function useMyPresence(): { me: StaffMember | undefined; loading: boolean } {
  const me = useMe().data;
  const staff = useStaff(!!me);
  return { me: staff.data?.find(s => s.id === me?.user.id), loading: staff.isPending };
}
