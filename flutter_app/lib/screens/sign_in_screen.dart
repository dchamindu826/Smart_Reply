import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/push.dart';
import '../core/theme.dart';
import '../state/app_state.dart';

class SignInScreen extends StatefulWidget {
  const SignInScreen({super.key});

  @override
  State<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends State<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final state = context.read<AppState>();
    try {
      await state.signIn(_email.text.trim(), _password.text);
      await Push.register(state.api);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _changeServer() async {
    final state = context.read<AppState>();
    final ctrl = TextEditingController(text: state.api.baseUrl);
    final url = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Server address'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(hintText: 'https://app.yourcompany.com'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text), child: const Text('Save')),
        ],
      ),
    );
    if (url != null && url.trim().isNotEmpty) await state.useServer(url);
  }

  Future<void> _forgot() async {
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    if (_email.text.trim().isEmpty) {
      messenger.showSnackBar(const SnackBar(content: Text('Type your email first.')));
      return;
    }
    try {
      await state.api.post('/auth/forgot-password', {'email': _email.text.trim()});
      messenger.showSnackBar(const SnackBar(content: Text('If the email is registered, a reset link is on its way.')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final server = context.watch<AppState>().api.baseUrl;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: AutofillGroup(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.forum_rounded, size: 64, color: Brand.green),
                    const SizedBox(height: 8),
                    const Text('Smart Reply', textAlign: TextAlign.center, style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700)),
                    const Text('by LUMI AI', textAlign: TextAlign.center),
                    const SizedBox(height: 32),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autofillHints: const [AutofillHints.username],
                      decoration: const InputDecoration(labelText: 'Email'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _password,
                      obscureText: true,
                      autofillHints: const [AutofillHints.password],
                      decoration: const InputDecoration(labelText: 'Password'),
                      onSubmitted: (_) => _submit(),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: const TextStyle(color: Brand.danger)),
                    ],
                    const SizedBox(height: 20),
                    FilledButton(
                      onPressed: _busy ? null : _submit,
                      style: FilledButton.styleFrom(backgroundColor: Brand.green, padding: const EdgeInsets.all(14)),
                      child: Text(_busy ? 'Signing in…' : 'Sign in'),
                    ),
                    TextButton(onPressed: _forgot, child: const Text('Forgot password?')),
                    const SizedBox(height: 24),
                    TextButton.icon(
                      onPressed: _changeServer,
                      icon: const Icon(Icons.dns_outlined, size: 18),
                      label: Text('Server: $server · Change', overflow: TextOverflow.ellipsis),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
