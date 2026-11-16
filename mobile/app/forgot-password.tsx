import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { forgotPasswordSchema } from '@smart-reply/shared';
import { request } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { useTheme } from '@/ui/theme';

export default function ForgotPasswordScreen() {
  const t = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: (body: { email: string }) => request<{ sent: boolean }>('POST', '/auth/forgot-password', { auth: false, body })
  });

  const submit = () => {
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError('Enter the email you sign in with.');
      return;
    }
    setFieldError(null);
    send.mutate(parsed.data);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      {send.isSuccess ? (
        <>
          <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
            Check your email
          </Text>
          <Text style={[styles.text, { color: t.text2 }]}>
            If an account uses {email.trim()}, we sent it a link to choose a new password. The link opens in your browser.
          </Text>
          <Button title="Back to sign in" onPress={() => router.back()} />
        </>
      ) : (
        <>
          <Text style={[styles.text, { color: t.text2 }]}>Enter your email and we will send you a link to choose a new password.</Text>
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            error={fieldError ?? (send.error ? errorMessage(send.error) : null)}
            onSubmitEditing={submit}
          />
          <Button title="Send link" onPress={submit} loading={send.isPending} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 12 },
  text: { fontSize: 15, marginBottom: 20, lineHeight: 21 }
});
