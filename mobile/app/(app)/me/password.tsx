import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { changePasswordSchema } from '@smart-reply/shared';
import { useChangePassword } from '@/features/me/hooks';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

export default function PasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const parsed = changePasswordSchema.safeParse({ currentPassword: current, newPassword: next });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Check the passwords.');
      return;
    }
    if (next !== repeat) {
      setError('The new passwords do not match.');
      return;
    }
    setError(null);
    change.mutate(parsed.data, {
      onSuccess: () => {
        toast('Password changed', 'success');
        router.back();
      },
      onError: e => setError(errorMessage(e))
    });
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry autoComplete="new-password" hint="At least 8 characters." />
      <Field label="Repeat new password" value={repeat} onChangeText={setRepeat} secureTextEntry autoComplete="new-password" />
      {error ? (
        <Text accessibilityRole="alert" style={[styles.error, { color: t.bad }]}>
          {error}
        </Text>
      ) : null}
      <Button title="Change password" onPress={submit} loading={change.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  error: { marginBottom: 12, fontSize: 14 }
});
