import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FileRef } from '@smart-reply/shared';
import { formatBytes } from '@/lib/upload';
import { mediaSource, reachableUrl } from '@/lib/urls';
import { useTheme } from '@/ui/theme';
import { AudioPlayer } from './AudioPlayer';

function sourceFor(file: FileRef) {
  return file.url.startsWith('file:') || file.url.startsWith('content:') ? { uri: file.url } : mediaSource(file.url);
}

async function openFile(file: FileRef) {
  const url = reachableUrl(file.url);
  try {
    await WebBrowser.openBrowserAsync(url);
  } catch {
    await Linking.openURL(url);
  }
}

function ImageAttachment({ file }: { file: FileRef }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable accessibilityRole="imagebutton" accessibilityLabel={`Photo ${file.name}. Open full screen`} onPress={() => setOpen(true)}>
        <Image source={sourceFor(file)} style={styles.image} contentFit="cover" transition={150} />
      </Pressable>
      <Modal visible={open} onRequestClose={() => setOpen(false)} animationType="fade" statusBarTranslucent>
        <SafeAreaView style={styles.viewer}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={() => setOpen(false)} style={styles.close}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
          <Image source={sourceFor(file)} style={styles.full} contentFit="contain" />
        </SafeAreaView>
      </Modal>
    </>
  );
}

function DocumentAttachment({ file }: { file: FileRef }) {
  const t = useTheme();
  const local = file.url.startsWith('file:');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Document ${file.name}. Open`}
      disabled={local}
      onPress={() => void openFile(file)}
      style={[styles.doc, { backgroundColor: t.card2 }]}
    >
      <Ionicons name={file.kind === 'video' ? 'videocam' : 'document-text'} size={28} color={t.primary} />
      <View style={styles.docText}>
        <Text numberOfLines={2} style={[styles.docName, { color: t.text }]}>
          {file.name}
        </Text>
        <Text style={[styles.docMeta, { color: t.text3 }]}>
          {[file.mime.split('/').pop()?.toUpperCase(), file.sizeBytes ? formatBytes(file.sizeBytes) : null].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
  );
}

export function Attachment({ file }: { file: FileRef }) {
  if (file.kind === 'image' || file.kind === 'sticker') return <ImageAttachment file={file} />;
  if (file.kind === 'audio') return <AudioPlayer file={file} />;
  return <DocumentAttachment file={file} />;
}

const styles = StyleSheet.create({
  image: { width: 230, height: 230, borderRadius: 10, marginBottom: 4 },
  viewer: { flex: 1, backgroundColor: '#000000' },
  close: { position: 'absolute', top: 48, right: 16, zIndex: 2, padding: 8 },
  full: { flex: 1 },
  doc: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, minWidth: 220, marginBottom: 4 },
  docText: { marginLeft: 10, flex: 1 },
  docName: { fontSize: 14, fontWeight: '600' },
  docMeta: { fontSize: 12, marginTop: 2 }
});
