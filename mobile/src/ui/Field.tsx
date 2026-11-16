import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius, useTheme } from './theme';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
}

export const Field = forwardRef<TextInput, Props>(function Field({ label, error, hint, style, ...rest }, ref) {
  const t = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.text2 }]}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={t.text3}
        style={[styles.input, { color: t.text, backgroundColor: t.card2, borderColor: error ? t.bad : t.rule }, style]}
        {...rest}
      />
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.help, { color: t.bad }]}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={[styles.help, { color: t.text3 }]}>{hint}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  help: { fontSize: 12, marginTop: 4 }
});
