import { StyleSheet, Text, View } from 'react-native';
import { avatarColors, useTheme } from './theme';

interface Props {
  initials: string;
  color: string;
  size?: number;
}

export function Avatar({ initials, color, size = 48 }: Props) {
  const t = useTheme();
  const c = avatarColors(color, t.scheme);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.box, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg }]}
    >
      <Text style={[styles.text, { color: c.fg, fontSize: size * 0.38 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' }
});
