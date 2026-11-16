import { Ionicons } from '@expo/vector-icons';
import type { StaffMember } from '@smart-reply/shared';
import { Avatar } from '@/ui/Avatar';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';
import { Loading } from '@/ui/States';
import { useTheme } from '@/ui/theme';

interface Props {
  visible: boolean;
  staff: StaffMember[] | undefined;
  currentOwnerId: string | null;
  onClose: () => void;
  onPick: (userId: string | null) => void;
}

export function OwnerPicker({ visible, staff, currentOwnerId, onClose, onPick }: Props) {
  const t = useTheme();
  const active = (staff ?? []).filter(s => s.status === 'active');
  return (
    <Sheet visible={visible} title="Change owner" onClose={onClose}>
      <Row
        icon="people-outline"
        title="Team queue"
        subtitle="No owner; anyone in the team can take it"
        onPress={() => onPick(null)}
        right={currentOwnerId === null ? <Ionicons name="checkmark" size={20} color={t.primary} /> : undefined}
        chevron={false}
      />
      {!staff ? <Loading /> : null}
      {active.map(s => (
        <Row
          key={s.id}
          title={s.name}
          subtitle={`${s.title || s.role} · ${s.stats.openChats} open chats`}
          onPress={() => onPick(s.id)}
          right={
            currentOwnerId === s.id ? (
              <Ionicons name="checkmark" size={20} color={t.primary} />
            ) : (
              <Avatar initials={s.initials} color={s.avatarColor} size={28} />
            )
          }
          chevron={false}
        />
      ))}
    </Sheet>
  );
}
