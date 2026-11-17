import 'package:intl/intl.dart';

DateTime _day(DateTime d) => DateTime(d.year, d.month, d.day);

/// `10:42`, `Yesterday`, `Mon`, or `12 Oct` — like WhatsApp's chat list.
String listTime(DateTime? d) {
  if (d == null) return '';
  final days = _day(DateTime.now()).difference(_day(d)).inDays;
  if (days <= 0) return DateFormat.Hm().format(d);
  if (days == 1) return 'Yesterday';
  if (days < 7) return DateFormat.E().format(d);
  return DateFormat('d MMM').format(d);
}

String clock(DateTime d) => DateFormat.Hm().format(d);

String dayLabel(DateTime d) {
  final days = _day(DateTime.now()).difference(_day(d)).inDays;
  if (days == 0) return 'Today';
  if (days == 1) return 'Yesterday';
  if (days < 7) return DateFormat.EEEE().format(d);
  return DateFormat('d MMMM y').format(d);
}

String duration(int? seconds) {
  final s = seconds ?? 0;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}

/// Time left in the 24-hour reply window: `3h 12m`, or null when closed.
String? windowLeft(DateTime? expires, [DateTime? now]) {
  if (expires == null) return null;
  final left = expires.difference(now ?? DateTime.now());
  if (left.isNegative) return null;
  return '${left.inHours}h ${(left.inMinutes % 60).toString().padLeft(2, '0')}m';
}

bool closingSoon(DateTime? expires, [DateTime? now]) {
  if (expires == null) return false;
  final left = expires.difference(now ?? DateTime.now());
  return !left.isNegative && left.inMinutes < 120;
}

String fileSize(int bytes) {
  if (bytes < 1024) return '$bytes B';
  if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(0)} KB';
  return '${(bytes / 1024 / 1024).toStringAsFixed(1)} MB';
}

String replyTime(int? seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return '${seconds}s';
  return '${seconds ~/ 60}m ${(seconds % 60).toString().padLeft(2, '0')}s';
}

/// Count `{{1}}`, `{{2}}` … in a template body.
int templateVariables(String body) => RegExp(r'\{\{(\d+)\}\}').allMatches(body).map((m) => m.group(1)).toSet().length;

const statusLabels = {
  'available': 'Available',
  'oncall': 'On a call',
  'brk': 'On break',
  'away': 'Away',
  'dnd': 'Do not disturb',
};
