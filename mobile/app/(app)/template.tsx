import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fillTemplate, templateVariableCount, type Template } from '@smart-reply/shared';
import { useApprovedTemplates } from '@/features/content/hooks';
import { useSendTemplate, useStartConversation } from '@/features/conversations/hooks';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Pill } from '@/ui/Chip';
import { Field } from '@/ui/Field';
import { SearchBar } from '@/ui/SearchBar';
import { EmptyView, ErrorView, Loading } from '@/ui/States';
import { useToast } from '@/ui/Toast';
import { useTheme } from '@/ui/theme';

function TemplateItem({ tpl, onPress }: { tpl: Template; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tpl.name}, ${tpl.category}, ${tpl.language}. ${tpl.body}`}
      onPress={onPress}
      style={[styles.item, { borderBottomColor: t.rule }]}
    >
      <View style={styles.itemHead}>
        <Text style={[styles.itemName, { color: t.text }]}>{tpl.name}</Text>
        <Pill label={`${tpl.category} · ${tpl.language}`} color={t.text2} bg={t.chip} />
      </View>
      <Text numberOfLines={3} style={[styles.itemBody, { color: t.text2 }]}>
        {tpl.body}
      </Text>
    </Pressable>
  );
}

function TemplateForm({ tpl, busy, error, onBack, onSend }: {
  tpl: Template;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onSend: (vars: string[]) => void;
}) {
  const t = useTheme();
  const count = Math.max(tpl.variableCount, templateVariableCount(tpl.body));
  const [vars, setVars] = useState<string[]>(() => Array.from({ length: count }, () => ''));
  const missing = vars.some(v => !v.trim());
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: t.text2 }]}>Preview</Text>
        <View style={[styles.preview, { backgroundColor: t.bubbleOut }]}>
          {tpl.headerText ? <Text style={[styles.previewHeader, { color: t.text }]}>{tpl.headerText}</Text> : null}
          <Text style={[styles.previewBody, { color: t.text }]}>{fillTemplate(tpl.body, vars.map(v => v.trim() || ''))}</Text>
          {tpl.footer ? <Text style={[styles.previewFooter, { color: t.text3 }]}>{tpl.footer}</Text> : null}
          {tpl.buttons.map(b => (
            <Text key={b.text} style={[styles.previewButton, { color: t.info, borderTopColor: t.rule }]}>
              {b.text}
            </Text>
          ))}
        </View>
        {vars.map((v, i) => (
          <Field
            key={i}
            label={`Variable {{${i + 1}}}`}
            value={v}
            onChangeText={text => setVars(prev => prev.map((p, j) => (j === i ? text : p)))}
            maxLength={1024}
          />
        ))}
        {error ? (
          <Text accessibilityRole="alert" style={[styles.error, { color: t.bad }]}>
            {error}
          </Text>
        ) : null}
        <Button title="Send template" onPress={() => onSend(vars.map(v => v.trim()))} loading={busy} disabled={missing} />
        <Button title="Choose another" variant="ghost" onPress={onBack} style={styles.back} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Pick an approved template, fill its variables and send it — to an open chat or to start one. */
export default function TemplateScreen() {
  const { conversationId, contactId } = useLocalSearchParams<{ conversationId?: string; contactId?: string }>();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const templates = useApprovedTemplates();
  const sendTemplate = useSendTemplate(conversationId ?? '');
  const start = useStartConversation();
  const [picked, setPicked] = useState<Template | null>(null);
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = (templates.data ?? []).filter(x => x.status === 'approved');
    return q ? list.filter(x => x.name.toLowerCase().includes(q) || x.body.toLowerCase().includes(q)) : list;
  }, [templates.data, search]);

  const busy = sendTemplate.isPending || start.isPending;
  const error = sendTemplate.error ?? start.error;

  const onSend = (variables: string[]) => {
    if (!picked) return;
    if (conversationId) {
      sendTemplate.mutate(
        { templateId: picked.id, variables },
        {
          onSuccess: () => {
            toast('Template sent', 'success');
            router.back();
          }
        }
      );
    } else if (contactId) {
      start.mutate(
        { contactId, templateId: picked.id, variables },
        { onSuccess: conv => router.replace({ pathname: '/chat/[id]', params: { id: conv.id } }) }
      );
    }
  };

  if (picked) {
    return (
      <View style={[styles.flex, { backgroundColor: t.bg }]}>
        <TemplateForm tpl={picked} busy={busy} error={error ? errorMessage(error) : null} onBack={() => setPicked(null)} onSend={onSend} />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: t.bg }]}>
      <SearchBar value={search} onChange={setSearch} placeholder="Search templates" />
      {templates.isPending ? (
        <Loading />
      ) : templates.isError ? (
        <ErrorView error={templates.error} onRetry={() => void templates.refetch()} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={x => x.id}
          renderItem={({ item }) => <TemplateItem tpl={item} onPress={() => setPicked(item)} />}
          ListEmptyComponent={
            <EmptyView icon="document-text-outline" title="No approved templates" text="Your manager creates templates on the web. Meta must approve them first." />
          }
          contentContainerStyle={items.length === 0 ? styles.grow : undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
  item: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  itemName: { fontSize: 15, fontWeight: '700', flexShrink: 1 },
  itemBody: { fontSize: 14 },
  form: { padding: 16 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  preview: { borderRadius: 12, padding: 12, marginBottom: 18 },
  previewHeader: { fontWeight: '700', marginBottom: 4 },
  previewBody: { fontSize: 15, lineHeight: 21 },
  previewFooter: { fontSize: 12, marginTop: 6 },
  previewButton: { textAlign: 'center', paddingTop: 8, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, fontWeight: '600' },
  error: { marginBottom: 12, fontSize: 14 },
  back: { marginTop: 8 }
});
