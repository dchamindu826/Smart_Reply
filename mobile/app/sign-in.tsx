import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View, type TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { getServer, isValidServer, loadServer } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { brand, useTheme } from '@/ui/theme';

export default function SignInScreen() {
  const t = useTheme();
  const { signIn, endedReason } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [server, setServer] = useState(getServer());
  const [showServer, setShowServer] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(endedReason);
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    void loadServer().then(setServer);
  }, []);

  const submit = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (!isValidServer(server)) {
      setShowServer(true);
      setError('Enter a valid server address, for example https://api.example.com');
      return;
    }
    setBusy(true);
    try {
      await signIn(email, password, server);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <View style={[styles.logo, { backgroundColor: brand.primary }]}>
              <Ionicons name="chatbubble-ellipses" size={40} color="#FFFFFF" />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { color: t.text }]}>
              Smart Reply
            </Text>
            <Text style={[styles.subtitle, { color: t.text2 }]}>Chats and calls for your team, on the WhatsApp Business Platform</Text>
          </View>

          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <View>
            <Field
              ref={passwordRef}
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={() => void submit()}
              style={styles.passwordInput}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
              onPress={() => setShowPassword(v => !v)}
              style={styles.eye}
              hitSlop={8}
            >
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={t.text2} />
            </Pressable>
          </View>

          {showServer ? (
            <Field
              label="Server address"
              value={server}
              onChangeText={setServer}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              hint="Ask your manager if you are not sure."
            />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setShowServer(true)} style={styles.serverLink}>
              <Text style={[styles.serverText, { color: t.text3 }]}>Server: {server}</Text>
              <Text style={[styles.serverChange, { color: t.primary }]}>Change</Text>
            </Pressable>
          )}

          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: t.bad, backgroundColor: t.badBg }]}>
              {error}
            </Text>
          ) : null}

          <Button title="Sign in" onPress={() => void submit()} loading={busy} />
          <Link href="/forgot-password" asChild>
            <Pressable accessibilityRole="link" style={styles.forgot}>
              <Text style={[styles.forgotText, { color: t.primary }]}>Forgot password?</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  body: { padding: 24, paddingTop: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: 32 },
  logo: { width: 76, height: 76, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', marginTop: 16 },
  subtitle: { fontSize: 14, marginTop: 6, textAlign: 'center' },
  passwordInput: { paddingRight: 48 },
  eye: { position: 'absolute', right: 14, top: 36 },
  serverLink: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingVertical: 4 },
  serverText: { fontSize: 13, flex: 1 },
  serverChange: { fontSize: 13, fontWeight: '600' },
  error: { padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 14 },
  forgot: { alignItems: 'center', padding: 16 },
  forgotText: { fontSize: 15, fontWeight: '600' }
});
