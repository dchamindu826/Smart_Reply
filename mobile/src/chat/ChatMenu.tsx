import type { Conversation } from '@smart-reply/shared';
import { Row } from '@/ui/Row';
import { Sheet } from '@/ui/Sheet';

interface Props {
  visible: boolean;
  conversation: Conversation;
  onClose: () => void;
  onInfo: () => void;
  onResolve: (resolve: boolean) => void;
  onFavorite: (on: boolean) => void;
  onArchive: (on: boolean) => void;
  onBot: (active: boolean) => void;
  onSchedule: () => void;
}

export function ChatMenu({ visible, conversation: c, onClose, onInfo, onResolve, onFavorite, onArchive, onBot, onSchedule }: Props) {
  const act = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <Sheet visible={visible} title={c.contact.name} onClose={onClose}>
      <Row icon="person-circle-outline" title="Customer info" onPress={act(onInfo)} />
      {c.status === 'open' ? (
        <Row icon="checkmark-done-circle-outline" title="Mark resolved" onPress={act(() => onResolve(true))} chevron={false} />
      ) : (
        <Row icon="refresh-circle-outline" title="Reopen chat" onPress={act(() => onResolve(false))} chevron={false} />
      )}
      {c.botActive ? (
        <Row icon="hand-left-outline" title="Take over from the bot" subtitle="The bot stops replying in this chat" onPress={act(() => onBot(false))} chevron={false} />
      ) : (
        <Row icon="hardware-chip-outline" title="Hand back to the bot" onPress={act(() => onBot(true))} chevron={false} />
      )}
      <Row
        icon={c.favorite ? 'star' : 'star-outline'}
        title={c.favorite ? 'Remove from favourites' : 'Add to favourites'}
        onPress={act(() => onFavorite(!c.favorite))}
        chevron={false}
      />
      <Row
        icon={c.archived ? 'archive' : 'archive-outline'}
        title={c.archived ? 'Unarchive' : 'Archive'}
        onPress={act(() => onArchive(!c.archived))}
        chevron={false}
      />
      <Row icon="calendar-outline" title="Schedule a call" onPress={act(onSchedule)} />
    </Sheet>
  );
}
