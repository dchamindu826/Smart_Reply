import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/api.dart';
import '../models/models.dart';
import '../state/app_state.dart';
import '../widgets/avatar.dart';
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
    return Scaffold(
      appBar: AppBar(title: const Text('Customers')),
      floatingActionButton: FloatingActionButton(onPressed: _add, child: const Icon(Icons.person_add_alt_1)),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            decoration: const InputDecoration(prefixIcon: Icon(Icons.search), hintText: 'Search customers', isDense: true),
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
                        ? ListView(children: const [SizedBox(height: 120), Center(child: Text('No customers found.'))])
                        : ListView.builder(
                            itemCount: list.length,
                            itemBuilder: (_, i) {
                              final c = list[i];
                              return ListTile(
                                leading: Avatar(initials: c.initials, color: c.avatarColor),
                                title: Text(c.name),
                                subtitle: Text([c.phone, if (c.city.isNotEmpty) c.city, ...c.labels.map((l) => l.name)].join(' · ')),
                                onTap: () => _open(c),
                                trailing: IconButton(icon: const Icon(Icons.info_outline), onPressed: () => showContactSheet(context, c)),
                              );
                            },
                          ),
          ),
        ),
      ]),
    );
  }
}
