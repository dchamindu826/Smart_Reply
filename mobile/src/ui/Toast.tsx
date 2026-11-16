import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export type ToastLevel = 'info' | 'warn' | 'error' | 'success';
interface ToastItem {
  id: number;
  text: string;
  level: ToastLevel;
}

type Show = (text: string, level?: ToastLevel) => void;
const ToastContext = createContext<Show>(() => undefined);

export function useToast(): Show {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const queue = useRef<ToastItem[]>([]);
  const seq = useRef(0);

  const next = useCallback(() => {
    setCurrent(queue.current.shift() ?? null);
  }, []);

  const show = useCallback<Show>(
    (text, level = 'info') => {
      seq.current += 1;
      const item = { id: seq.current, text, level };
      setCurrent(cur => {
        if (cur) {
          queue.current.push(item);
          return cur;
        }
        return item;
      });
    },
    []
  );

  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      {current ? <ToastView key={current.id} item={current} onDone={next} /> : null}
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(item.level === 'error' ? 4500 : 3000),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true })
    ]);
    anim.start(({ finished }) => finished && onDone());
    return () => anim.stop();
  }, [item, onDone, opacity]);

  const bg = { info: t.header, warn: t.warn, error: t.bad, success: t.ok }[item.level];
  return (
    <Animated.View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8, opacity }]}>
      <Pressable accessibilityRole="alert" accessibilityLiveRegion="assertive" onPress={onDone} style={[styles.toast, { backgroundColor: bg }]}>
        <Text style={styles.text}>{item.text}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', zIndex: 1000, elevation: 20 },
  toast: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, maxWidth: 520, width: '100%' },
  text: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }
});
