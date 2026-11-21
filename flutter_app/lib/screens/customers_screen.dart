import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../core/theme.dart';
import '../widgets/avatar.dart';
import '../widgets/ui.dart';
import 'chat_screen.dart';
import 'contact_sheet.dart';
import 'template_sheet.dart';

class CustomersScreen extends StatefulWidget {
  const CustomersScreen({super.key});

  @override
  State<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends State<CustomersScreen> {
  List<Contact>? _list;
  String _search = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = Map<String, dynamic>.from(await context.read<AppState>().api.get('/contacts', {'search': _search, 'limit': 200}) as Map);
      if (mounted) setState(() => _list = ApiPage.fromJson(res, Contact.fromJson).items);
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _open(Contact c) async {
    final state = context.read<AppState>();
    final messenger = ScaffoldMessenger.of(context);
    final nav = Navigator.of(context);
    try {
      final conv = await state.conversationForContact(c.id);
      if (conv.lastMessageAt == null) {
        // Never messaged: the first message must be an approved template.
        if (!mounted) return;
        final sent = await showTemplateSheet(context, conversationId: conv.id, firstName: c.name.split(' ').first);
        if (sent != true) return;
      }
      await nav.push(MaterialPageRoute(builder: (_) => ChatScreen(conversationId: conv.id)));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  Future<void> _add() async {
    final name = TextEditingController();
    final phone = TextEditingController();
    final city = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('New customer'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          TextField(controller: name, decoration: const InputDecoration(labelText: 'Name')),
          const SizedBox(height: 8),
          TextField(controller: phone, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'WhatsApp number', hintText: '077 123 4567 or +94 …')),
          const SizedBox(height: 8),
          TextField(controller: city, decoration: const InputDecoration(labelText: 'City (optional)')),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Save')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await context.read<AppState>().api.post('/contacts', {'name': name.text.trim(), 'phone': phone.text.trim(), 'city': city.text.trim()});
      _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    }
  }

  @override
  Widget build(BuildContext context) {
    final list = _list;
    final ui = Ui.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Customers'),
        toolbarHeight: 64,
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: IconButton.filled(
              tooltip: 'Add customer',
              onPressed: _add,
              style: IconButton.styleFrom(backgroundColor: Brand.blue),
              icon: const Icon(Icons.person_add_alt_1, color: Colors.white),
            ),
          ),
        ],
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
          child: TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search customers', isDense: true),
            textInputAction: TextInputAction.search,
            onSubmitted: (v) {
              _search = v.trim();
              _load();
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _load,
            child: _error != null
                ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text(_error!))])
                : list == null
                    ? const Center(child: CircularProgressIndicator())
                    : list.isEmpty
                        ? ListView(children: [const SizedBox(height: 120), Center(child: Text('No customers found.', style: TextStyle(color: ui.muted)))])
                        : ListView.separated(
                            padding: const EdgeInsets.fromLTRB(12, 0, 12, 110),
                            itemCount: list.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 8),
                            itemBuilder: (_, i) {
                              final c = list[i];
                              return Panel(
                                onTap: () => _open(c),
                                padding: const EdgeInsets.fromLTRB(12, 10, 4, 10),
                                child: Row(children: [
                                  Avatar(initials: c.initials, color: c.avatarColor, size: 46),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                      Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                                      Text([c.phone, if (c.city.isNotEmpty) c.city].join(' · '), style: TextStyle(fontSize: 12.5, color: ui.muted)),
                                      if (c.labels.isNotEmpty)
                                        Padding(
                                          padding: const EdgeInsets.only(top: 6),
                                          child: Wrap(spacing: 6, runSpacing: 4, children: [
                                            for (final l in c.labels.take(3)) TonePill(l.name, tone: labelTone(l.color)),
                                          ]),
                                        ),
                                    ]),
                                  ),
                                  IconButton(tooltip: 'Customer info', icon: Icon(Icons.info_outline, color: ui.muted), onPressed: () => showContactSheet(context, c)),
                                ]),
                              );
                            },
                          ),
          ),
        ),
      ]),
    );
  }
}
