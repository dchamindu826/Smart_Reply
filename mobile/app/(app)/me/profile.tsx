import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { NotifySettings } from '@smart-reply/shared';
import { useMe, useUpdateMe } from '@/features/me/hooks';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { Field } from '@/ui/Field';
import { SectionTitle } from '@/ui/Row';
import { Loading } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

type Language = 'en' | 'si' | 'ta';
const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'si', label: 'සිංහල' },
  { code: 'ta', label: 'தமிழ்' }
];

const NOTIFY: { key: keyof NotifySettings; label: string }[] = [
  { key: 'newChat', label: 'New chat or chat assigned to me' },
  { key: 'newMessage', label: 'New message in my chats' },
  { key: 'missedCall', label: 'Missed call' },
  { key: 'sound', label: 'Sound' }
];

export default function ProfileScreen() {
  const t = useTheme();
  const toast = useToast();
  const me = useMe();
  const update = useUpdateMe();
  const user = me.data?.user;
  const [name, setName] = useState('');
  const [signature, setSignature] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [notify, setNotify] = useState<NotifySettings | null>(null);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setSignature(user.signature);
    setLanguage(user.language === 'si' || user.language === 'ta' ? user.language : 'en');
    setNotify(user.notify);
  }, [user]);

  if (!user || !notify) return <Loading />;

  const save = () => {
    if (!name.trim()) {
      toast('Enter your name.', 'error');
      return;
    }
    update.mutate(
      { name: name.trim(), signature: signature.trim(), language, notify },
      { onSuccess: () => toast('Profile saved', 'success'), onError: e => toast(errorMessage(e), 'error') }
    );
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Field label="Name shown to customers" value={name} onChangeText={setName} maxLength={80} />
      <Field label="Signature" value={signature} onChangeText={setSignature} maxLength={200} multiline hint="Added to the end of your messages when turned on in the web app." />
      <Text style={[styles.label, { color: t.text2 }]}>Language</Text>
      <View style={styles.chips}>
        {LANGUAGES.map(l => (
          <Chip key={l.code} label={l.label} active={language === l.code} onPress={() => setLanguage(l.code)} />
        ))}
      </View>
      <SectionTitle>Notifications</SectionTitle>
      {NOTIFY.map(n => (
        <View key={n.key} style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: t.text }]}>{n.label}</Text>
          <Switch
            accessibilityLabel={n.label}
            value={notify[n.key]}
            onValueChange={v => setNotify(prev => (prev ? { ...prev, [n.key]: v } : prev))}
            trackColor={{ true: t.primary, false: t.rule }}
          />
        </View>
      ))}
      <Text style={[styles.email, { color: t.text3 }]}>Signed in as {user.email}</Text>
      <Button title="Save" onPress={save} loading={update.isPending} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  switchLabel: { flex: 1, fontSize: 15, marginRight: 12 },
  email: { fontSize: 13, marginVertical: 16 }
});
