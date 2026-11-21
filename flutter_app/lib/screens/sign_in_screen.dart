import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../core/push.dart';
import '../core/theme.dart';
import '../state/app_state.dart';
import '../widgets/ui.dart';

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
    final ui = Ui.of(context);
    return Scaffold(
      backgroundColor: ui.dark ? Brand.darkPaper : Colors.white,
      body: Stack(children: [
        Positioned(top: -120, right: -110, child: _circle(330, Brand.magenta, ui.dark ? .30 : .20)),
        Positioned(top: 60, left: -95, child: _circle(250, Brand.blue, ui.dark ? .30 : .20)),
        SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: AutofillGroup(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const SizedBox(height: 24),
                    Center(child: Image.asset('assets/logo_mark.png', width: 76, semanticLabel: 'Smart Reply')),
                    const SizedBox(height: 10),
                    Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Text('Smart', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -.6, color: ui.dark ? Colors.white : Brand.navy)),
                      ShaderMask(
                        blendMode: BlendMode.srcIn,
                        shaderCallback: (r) => const LinearGradient(colors: [Brand.blue, Brand.magenta]).createShader(r),
                        child: const Text('Reply', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, letterSpacing: -.6, color: Colors.white)),
                      ),
                    ]),
                    Text('WhatsApp chats & calls for your team', textAlign: TextAlign.center, style: TextStyle(fontSize: 13, color: ui.muted)),
                    const SizedBox(height: 30),
                    Container(
                      padding: const EdgeInsets.fromLTRB(20, 24, 20, 14),
                      decoration: BoxDecoration(
                        color: ui.card,
                        borderRadius: BorderRadius.circular(28),
                        border: Border.all(color: ui.rule),
                        boxShadow: [BoxShadow(color: ui.shadow, blurRadius: 40, offset: const Offset(0, 18))],
                      ),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                        const Text('Sign in', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                        const SizedBox(height: 4),
                        Text('Use the login your company manager gave you.', style: TextStyle(fontSize: 13, color: ui.muted)),
                        const SizedBox(height: 18),
                        TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          autofillHints: const [AutofillHints.username],
                          decoration: const InputDecoration(labelText: 'Email', prefixIcon: Icon(Icons.alternate_email, color: Brand.blue)),
                        ),
                        const SizedBox(height: 12),
                        TextField(
                          controller: _password,
                          obscureText: true,
                          autofillHints: const [AutofillHints.password],
                          decoration: const InputDecoration(labelText: 'Password', prefixIcon: Icon(Icons.lock_outline, color: Brand.magenta)),
                          onSubmitted: (_) => _submit(),
                        ),
                        if (_error != null) ...[
                          const SizedBox(height: 12),
                          Text(_error!, style: const TextStyle(color: Brand.danger)),
                        ],
                        const SizedBox(height: 20),
                        GradientButton(label: _busy ? 'Signing in…' : 'Sign in', icon: _busy ? null : Icons.arrow_forward, onPressed: _busy ? null : _submit),
                        const SizedBox(height: 6),
                        TextButton(onPressed: _forgot, child: const Text('Forgot password?', style: TextStyle(fontWeight: FontWeight.w700))),
                      ]),
                    ),
                    const SizedBox(height: 18),
                    TextButton.icon(
                      onPressed: _changeServer,
                      icon: Icon(Icons.dns_outlined, size: 16, color: ui.muted),
                      label: Text('Server: $server · Change', overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12, color: ui.muted)),
                    ),
                    Text('Secured by LUMI AI', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: ui.muted)),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _circle(double size, Color c, double alpha) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, gradient: RadialGradient(colors: [c.withValues(alpha: alpha), c.withValues(alpha: alpha * .4)])),
      );
}
