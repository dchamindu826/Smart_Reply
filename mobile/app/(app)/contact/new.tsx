import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { createContactSchema } from '@smart-reply/shared';
import { useCreateContact } from '@/features/contacts/hooks';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { useTheme } from '@/ui/theme';

type Errors = Partial<Record<'name' | 'phone' | 'city', string>>;

export default function NewContactScreen() {
  const t = useTheme();
  const router = useRouter();
  const create = useCreateContact();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [errors, setErrors] = useState<Errors>({});

  const submit = () => {
    const parsed = createContactSchema.safeParse({ name, phone, city });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === 'name' || key === 'phone' || key === 'city') && !next[key]) {
          next[key] = key === 'name' && !name.trim() ? 'Enter the customer’s name.' : issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(
      { name: parsed.data.name, phone: parsed.data.phone, city: parsed.data.city },
      { onSuccess: c => router.replace({ pathname: '/contact/[id]', params: { id: c.id } }) }
    );
  };

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: t.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" error={errors.name} maxLength={80} />
        <Field
          label="WhatsApp number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="+94 77 123 4567"
          hint="With the country code. A number starting with 0 uses your company's country."
          error={errors.phone}
        />
        <Field label="City (optional)" value={city} onChangeText={setCity} error={errors.city} maxLength={60} />
        {create.error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: t.bad }]}>
            {errorMessage(create.error)}
          </Text>
        ) : null}
        <Button title="Save customer" onPress={submit} loading={create.isPending} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: 16 },
  error: { marginBottom: 12, fontSize: 14 }
});
