import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { radius, useTheme } from './theme';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}

export function SearchBar({ value, onChange, placeholder }: Props) {
  const t = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: t.card2 }]}>
      <Ionicons name="search" size={18} color={t.text3} />
      <TextInput
        accessibilityLabel={placeholder}
        accessibilityRole="search"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.text3}
        autoCorrect={false}
        returnKeyType="search"
        style={[styles.input, { color: t.text }]}
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChange('')} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={t.text3} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 10, paddingHorizontal: 12, height: 40, borderRadius: radius.pill, gap: 8 },
  input: { flex: 1, fontSize: 15, paddingVertical: 0 }
});
