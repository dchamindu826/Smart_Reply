import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../models/models.dart';
import '../state/app_state.dart';

/// Pick an approved template, fill {{1}}, {{2}} … and send it. Returns true when sent.
Future<bool?> showTemplateSheet(BuildContext context, {required String conversationId, String firstName = ''}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _TemplateSheet(conversationId: conversationId, firstName: firstName),
  );
}

class _TemplateSheet extends StatefulWidget {
  const _TemplateSheet({required this.conversationId, required this.firstName});
  final String conversationId;
  final String firstName;

  @override
  State<_TemplateSheet> createState() => _TemplateSheetState();
}

class _TemplateSheetState extends State<_TemplateSheet> {
  List<Template>? _templates;
  Template? _picked;
  List<TextEditingController> _vars = [];
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    context.read<AppState>().api.get('/templates', {'status': 'approved'}).then((res) {
      if (!mounted) return;
      setState(() => _templates = (res as List).map((e) => Template.fromJson(Map<String, dynamic>.from(e as Map))).where((t) => t.status == 'approved').toList());
    }).catchError((Object e) {
      if (mounted) setState(() => _error = errorText(e));
    });
  }

  void _pick(Template t) {
    setState(() {
      _picked = t;
      _vars = List.generate(t.variableCount, (i) => TextEditingController(text: i == 0 ? widget.firstName : ''));
    });
  }

  Future<void> _send() async {
    final t = _picked;
    if (t == null) return;
    if (_vars.any((c) => c.text.trim().isEmpty)) {
      setState(() => _error = 'Fill every blank first.');
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppState>().sendTemplate(widget.conversationId, t.id, _vars.map((c) => c.text.trim()).toList());
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _templates;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(left: 16, right: 16, top: 16, bottom: MediaQuery.of(context).viewInsets.bottom + 16),
        child: SizedBox(
          height: MediaQuery.of(context).size.height * 0.7,
          child: _picked == null
              ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Send a template', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                  if (list == null && _error == null) const LinearProgressIndicator(),
                  if (list != null && list.isEmpty) const Text('No approved templates yet. Your manager creates them on the web.'),
                  if (list != null)
                    Expanded(
                      child: ListView(children: [
                        for (final t in list)
                          ListTile(title: Text(t.name), subtitle: Text(t.body, maxLines: 3, overflow: TextOverflow.ellipsis), onTap: () => _pick(t)),
                      ]),
                    ),
                ])
              : ListView(children: [
                  Text(_picked!.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 8),
                  Text(_picked!.body),
                  const SizedBox(height: 12),
                  for (var i = 0; i < _vars.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: TextField(controller: _vars[i], decoration: InputDecoration(labelText: '{{${i + 1}}}')),
                    ),
                  if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
                  const SizedBox(height: 8),
                  Row(children: [
                    TextButton(onPressed: () => setState(() => _picked = null), child: const Text('Back')),
                    const Spacer(),
                    FilledButton(onPressed: _busy ? null : _send, child: Text(_busy ? 'Sending…' : 'Send template')),
                  ]),
                ]),
        ),
      ),
    );
  }
}
