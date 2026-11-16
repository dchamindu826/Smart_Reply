import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, useTheme } from './theme';

interface Props {
  visible: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
}

/** A bottom sheet built on Modal. */
export function Sheet({ visible, title, onClose, children }: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" accessibilityRole="button" style={[styles.backdrop, { backgroundColor: t.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: t.card, paddingBottom: insets.bottom + 12 }]}>
        <View style={[styles.handle, { backgroundColor: t.rule }]} />
        {title ? (
          <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
            {title}
          </Text>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '80%', borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 8, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: '700', paddingHorizontal: 16, paddingVertical: 8 }
});
