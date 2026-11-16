import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useCounts } from '@/features/conversations/hooks';
import { useTheme } from '@/ui/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

function icon(name: IconName, focusedName: IconName) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} size={size} color={color} />
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const counts = useCounts();
  const unread = counts.data?.unread ?? 0;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.header },
        headerTintColor: t.onHeader,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.text3,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.rule },
        sceneStyle: { backgroundColor: t.bg }
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Chats',
          headerTitle: 'Smart Reply',
          tabBarIcon: icon('chatbubbles-outline', 'chatbubbles'),
          tabBarBadge: unread > 0 ? (unread > 99 ? '99+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: t.primary, color: t.onPrimary }
        }}
      />
      <Tabs.Screen name="calls" options={{ title: 'Calls', tabBarIcon: icon('call-outline', 'call') }} />
      <Tabs.Screen name="customers" options={{ title: 'Customers', tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
