import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { radius, useTheme } from './theme';

interface Props {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, accessibilityHint }: Props) {
  const t = useTheme();
  const bg = { primary: t.primary, secondary: t.card2, danger: t.bad, ghost: 'transparent' }[variant];
  const fg = { primary: t.onPrimary, secondary: t.text, danger: '#FFFFFF', ghost: t.primary }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: off ? 0.55 : pressed ? 0.8 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.text, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  text: { fontSize: 16, fontWeight: '600' }
});
