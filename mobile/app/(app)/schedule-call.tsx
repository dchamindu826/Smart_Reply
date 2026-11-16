import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Contact } from '@smart-reply/shared';
import { useScheduleCall } from '@/features/calls/hooks';
import { useContactList } from '@/features/contacts/hooks';
import { flatItems } from '@/features/paged';
import { errorMessage } from '@/lib/errors';
import { dateTime } from '@/lib/time';
import { useDebounced } from '@/lib/useNow';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Row } from '@/ui/Row';
import { SearchBar } from '@/ui/SearchBar';
import { Loading } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

function inAnHour(): Date {
  const d = new Date(Date.now() + 3_600_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return d;
}

function ContactChooser({ onPick }: { onPick: (c: Contact) => void }) {
  const t = useTheme();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 350);
  const list = useContactList(q, '');
  const items = flatItems(list.data);
  return (
    <View style={styles.flex}>
      <Text style={[styles.label, { color: t.text2 }]}>Who should be called?</Text>
      <SearchBar value={search} onChange={setSearch} placeholder="Search customers" />
      {list.isPending ? (
        <Loading />
      ) : (
        <FlatList
          data={items}
          keyExtractor={c => c.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Row title={item.name} subtitle={item.phone} onPress={() => onPick(item)} right={<Avatar initials={item.initials} color={item.avatarColor} size={32} />} chevron={false} />
          )}
          onEndReached={() => list.hasNextPage && !list.isFetchingNextPage && void list.fetchNextPage()}
        />
      )}
    </View>
  );
}

export default function ScheduleCallScreen() {
  const params = useLocalSearchParams<{ contactId?: string; contactName?: string }>();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const schedule = useScheduleCall();
  const [contact, setContact] = useState<{ id: string; name: string } | null>(
    params.contactId ? { id: params.contactId, name: params.contactName ?? 'Customer' } : null
  );
  const [when, setWhen] = useState<Date>(inAnHour);
  const [note, setNote] = useState('');

  if (!contact) return <ContactChooser onPick={c => setContact({ id: c.id, name: c.name })} />;

  const openAndroid = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: when,
      mode,
      is24Hour: true,
      minimumDate: new Date(),
      onChange: (e: DateTimePickerEvent, d?: Date) => {
        if (e.type === 'set' && d) setWhen(d);
      }
    });

  const past = when.getTime() < Date.now();
  const submit = () =>
    schedule.mutate(
      { contactId: contact.id, scheduledAt: when.toISOString(), note: note.trim() },
      {
        onSuccess: () => {
          toast('Call scheduled', 'success');
          router.back();
        }
      }
    );

  return (
    <KeyboardAvoidingView style={[styles.flex, { backgroundColor: t.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Row icon="person-outline" title={contact.name} subtitle="Change customer" onPress={params.contactId ? undefined : () => setContact(null)} />
        <Text style={[styles.label, { color: t.text2 }]}>When</Text>
        {Platform.OS === 'android' ? (
          <View style={styles.row}>
            <Button title={when.toLocaleDateString()} variant="secondary" onPress={() => openAndroid('date')} style={styles.flex} />
            <Button title={dateTime(when.toISOString()).split(', ')[1] ?? ''} variant="secondary" onPress={() => openAndroid('time')} style={styles.flex} />
          </View>
        ) : (
          <DateTimePicker
            value={when}
            mode="datetime"
            display="inline"
            minimumDate={new Date()}
            onChange={(_e: DateTimePickerEvent, d?: Date) => d && setWhen(d)}
            accentColor={t.primary}
          />
        )}
        <Text style={[styles.summary, { color: past ? t.bad : t.text2 }]}>{past ? 'Choose a time in the future.' : dateTime(when.toISOString())}</Text>
        <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={300} multiline />
        {schedule.error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: t.bad }]}>
            {errorMessage(schedule.error)}
          </Text>
        ) : null}
        <Button title="Schedule call" onPress={submit} loading={schedule.isPending} disabled={past} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8, paddingHorizontal: 12 },
  row: { flexDirection: 'row', gap: 10 },
  summary: { fontSize: 14, marginVertical: 12 },
  error: { marginBottom: 12, fontSize: 14 }
});
