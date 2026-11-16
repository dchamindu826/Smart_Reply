import { Ionicons } from '@expo/vector-icons';
import type { MessageStatus } from '@smart-reply/shared';
import { useTheme } from '@/ui/theme';

const LABEL: Record<MessageStatus, string> = {
  queued: 'Sending',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Not sent'
};

export function statusLabel(s: MessageStatus): string {
  return LABEL[s];
}

/** WhatsApp-style ticks: clock, ✓, ✓✓, blue ✓✓, red alert. */
export function StatusTicks({ status }: { status: MessageStatus }) {
  const t = useTheme();
  const common = { size: 15, accessibilityLabel: LABEL[status] };
  switch (status) {
    case 'queued':
      return <Ionicons name="time-outline" color={t.text3} {...common} />;
    case 'sent':
      return <Ionicons name="checkmark" color={t.text3} {...common} />;
    case 'delivered':
      return <Ionicons name="checkmark-done" color={t.text3} {...common} />;
    case 'read':
      return <Ionicons name="checkmark-done" color={t.read} {...common} />;
    case 'failed':
      return <Ionicons name="alert-circle" color={t.bad} {...common} />;
  }
}
