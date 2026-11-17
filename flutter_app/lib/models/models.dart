// API objects from the Smart Reply API (`/api/v1`). Field names follow
// packages/shared/src/types.ts in the repository.

typedef Json = Map<String, dynamic>;

String _s(dynamic v, [String fallback = '']) => v is String ? v : fallback;
String? _sn(dynamic v) => v is String ? v : null;
int _i(dynamic v, [int fallback = 0]) => v is num ? v.toInt() : fallback;
bool _b(dynamic v, [bool fallback = false]) => v is bool ? v : fallback;
DateTime? _d(dynamic v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
List<Json> _list(dynamic v) => v is List ? v.whereType<Map>().map((e) => Map<String, dynamic>.from(e)).toList() : <Json>[];

class ApiPage<T> {
  final List<T> items;
  final String? nextCursor;
  ApiPage(this.items, this.nextCursor);

  static ApiPage<T> fromJson<T>(Json j, T Function(Json) item) =>
      ApiPage(_list(j['items']).map(item).toList(), _sn(j['nextCursor']));
}

class Permissions {
  final Map<String, bool> values;
  Permissions(this.values);
  bool operator [](String key) => values[key] ?? false;
  factory Permissions.fromJson(dynamic j) =>
      Permissions(j is Map ? j.map((k, v) => MapEntry(k.toString(), v == true)) : <String, bool>{});
}

class NotifySettings {
  bool newChat, newMessage, missedCall, sound, desktop;
  NotifySettings({required this.newChat, required this.newMessage, required this.missedCall, required this.sound, required this.desktop});
  factory NotifySettings.fromJson(Json j) => NotifySettings(
        newChat: _b(j['newChat'], true),
        newMessage: _b(j['newMessage'], true),
        missedCall: _b(j['missedCall'], true),
        sound: _b(j['sound'], true),
        desktop: _b(j['desktop'], true),
      );
  Json toJson() => {'newChat': newChat, 'newMessage': newMessage, 'missedCall': missedCall, 'sound': sound, 'desktop': desktop};
}

class MeUser {
  final String id, role, name, initials, title, email, language, signature, avatarColor;
  final String? phone;
  final NotifySettings notify;
  MeUser({
    required this.id,
    required this.role,
    required this.name,
    required this.initials,
    required this.title,
    required this.email,
    required this.language,
    required this.signature,
    required this.avatarColor,
    required this.phone,
    required this.notify,
  });
  factory MeUser.fromJson(Json j) => MeUser(
        id: _s(j['id']),
        role: _s(j['role']),
        name: _s(j['name']),
        initials: _s(j['initials']),
        title: _s(j['title']),
        email: _s(j['email']),
        language: _s(j['language'], 'en'),
        signature: _s(j['signature']),
        avatarColor: _s(j['avatarColor'], 'a1'),
        phone: _sn(j['phone']),
        notify: NotifySettings.fromJson(j['notify'] is Map ? Map<String, dynamic>.from(j['notify']) : <String, dynamic>{}),
      );
}

class Company {
  final String id, name, timezone;
  final String? displayPhone;
  Company({required this.id, required this.name, required this.timezone, this.displayPhone});
  factory Company.fromJson(Json j) =>
      Company(id: _s(j['id']), name: _s(j['name']), timezone: _s(j['timezone'], 'Asia/Colombo'), displayPhone: _sn(j['displayPhone']));
}

class Me {
  final MeUser user;
  final Company? company;
  final Permissions permissions;
  final bool aiAddon, calling, whatsappConnected;
  Me({required this.user, this.company, required this.permissions, required this.aiAddon, required this.calling, required this.whatsappConnected});
  bool get isManager => user.role == 'manager';
  bool can(String p) => isManager || permissions[p];
  factory Me.fromJson(Json j) {
    final f = j['features'] is Map ? Map<String, dynamic>.from(j['features']) : <String, dynamic>{};
    return Me(
      user: MeUser.fromJson(Map<String, dynamic>.from(j['user'] as Map)),
      company: j['company'] is Map ? Company.fromJson(Map<String, dynamic>.from(j['company'])) : null,
      permissions: Permissions.fromJson(j['permissions']),
      aiAddon: _b(f['aiAddon']),
      calling: _b(f['calling']),
      whatsappConnected: _b(f['whatsappConnected']),
    );
  }
}

class LabelRef {
  final String id, name, color;
  LabelRef(this.id, this.name, this.color);
  factory LabelRef.fromJson(Json j) => LabelRef(_s(j['id']), _s(j['name']), _s(j['color']));
}

class Contact {
  final String id, phone, name, initials, avatarColor, city, notes, permStatus;
  final String? waId, ownerUserId;
  final DateTime? permExpiresAt, firstSeenAt;
  final bool marketingOptIn, blocked;
  final List<LabelRef> labels;
  Contact({
    required this.id,
    required this.phone,
    required this.name,
    required this.initials,
    required this.avatarColor,
    required this.city,
    required this.notes,
    required this.permStatus,
    required this.waId,
    required this.ownerUserId,
    required this.permExpiresAt,
    required this.firstSeenAt,
    required this.marketingOptIn,
    required this.blocked,
    required this.labels,
  });
  bool get canCall => permStatus == 'temporary' || permStatus == 'permanent';
  factory Contact.fromJson(Json j) {
    final perm = j['callPermission'] is Map ? Map<String, dynamic>.from(j['callPermission']) : <String, dynamic>{};
    return Contact(
      id: _s(j['id']),
      phone: _s(j['phone']),
      name: _s(j['name'], 'Customer'),
      initials: _s(j['initials'], '?'),
      avatarColor: _s(j['avatarColor'], 'a1'),
      city: _s(j['city']),
      notes: _s(j['notes']),
      permStatus: _s(perm['status'], 'none'),
      waId: _sn(j['waId']),
      ownerUserId: _sn(j['ownerUserId']),
      permExpiresAt: _d(perm['expiresAt']),
      firstSeenAt: _d(j['firstSeenAt']),
      marketingOptIn: _b(j['marketingOptIn']),
      blocked: _b(j['blocked']),
      labels: _list(j['labels']).map(LabelRef.fromJson).toList(),
    );
  }
}

class FileRef {
  final String id, kind, name, mime, url;
  final int sizeBytes;
  final int? durationSeconds;
  final bool voice;
  FileRef({required this.id, required this.kind, required this.name, required this.mime, required this.url, required this.sizeBytes, this.durationSeconds, required this.voice});
  factory FileRef.fromJson(Json j) => FileRef(
        id: _s(j['id']),
        kind: _s(j['kind'], 'document'),
        name: _s(j['name']),
        mime: _s(j['mime']),
        url: _s(j['url']),
        sizeBytes: _i(j['sizeBytes']),
        durationSeconds: j['durationSeconds'] is num ? _i(j['durationSeconds']) : null,
        voice: _b(j['voice']),
      );
}

class Message {
  final String id, conversationId, direction, type, body, status;
  final String? senderName, senderKind, templateName, error;
  final List<String> buttons;
  final List<FileRef> attachments;
  final DateTime createdAt;
  Message({
    required this.id,
    required this.conversationId,
    required this.direction,
    required this.type,
    required this.body,
    required this.status,
    required this.senderName,
    required this.senderKind,
    required this.templateName,
    required this.error,
    required this.buttons,
    required this.attachments,
    required this.createdAt,
  });
  bool get outgoing => direction == 'out';
  bool get isNote => direction == 'note';
  bool get isSystem => direction == 'system';

  Message copyWith({String? status, String? error}) => Message(
        id: id,
        conversationId: conversationId,
        direction: direction,
        type: type,
        body: body,
        status: status ?? this.status,
        senderName: senderName,
        senderKind: senderKind,
        templateName: templateName,
        error: error ?? this.error,
        buttons: buttons,
        attachments: attachments,
        createdAt: createdAt,
      );

  factory Message.fromJson(Json j) {
    final sender = j['sender'] is Map ? Map<String, dynamic>.from(j['sender']) : <String, dynamic>{};
    return Message(
      id: _s(j['id']),
      conversationId: _s(j['conversationId']),
      direction: _s(j['direction'], 'in'),
      type: _s(j['type'], 'text'),
      body: _s(j['body']),
      status: _s(j['status'], 'sent'),
      senderName: _sn(sender['name']),
      senderKind: _sn(sender['kind']),
      templateName: _sn(j['templateName']),
      error: _sn(j['error']),
      buttons: (j['buttons'] is List) ? (j['buttons'] as List).map((e) => e.toString()).toList() : <String>[],
      attachments: _list(j['attachments']).map(FileRef.fromJson).toList(),
      createdAt: _d(j['createdAt']) ?? DateTime.now(),
    );
  }

  /// A bubble shown at once while the real message is being sent.
  factory Message.pending({required String conversationId, required String body, required bool note, String? senderName}) => Message(
        id: 'tmp-${DateTime.now().microsecondsSinceEpoch}',
        conversationId: conversationId,
        direction: note ? 'note' : 'out',
        type: note ? 'note' : 'text',
        body: body,
        status: 'queued',
        senderName: senderName,
        senderKind: 'user',
        templateName: null,
        error: null,
        buttons: const [],
        attachments: const [],
        createdAt: DateTime.now(),
      );
}

class Conversation {
  final String id, contactId, status, lastPreview;
  final Contact contact;
  final DateTime? lastMessageAt, windowExpiresAt;
  final int unreadCount;
  final bool botActive, favorite, archived;
  Conversation({
    required this.id,
    required this.contactId,
    required this.status,
    required this.lastPreview,
    required this.contact,
    required this.lastMessageAt,
    required this.windowExpiresAt,
    required this.unreadCount,
    required this.botActive,
    required this.favorite,
    required this.archived,
  });
  bool get windowOpen => windowExpiresAt != null && windowExpiresAt!.isAfter(DateTime.now());

  Conversation copyWith({int? unreadCount, Contact? contact}) => Conversation(
        id: id,
        contactId: contactId,
        status: status,
        lastPreview: lastPreview,
        contact: contact ?? this.contact,
        lastMessageAt: lastMessageAt,
        windowExpiresAt: windowExpiresAt,
        unreadCount: unreadCount ?? this.unreadCount,
        botActive: botActive,
        favorite: favorite,
        archived: archived,
      );

  factory Conversation.fromJson(Json j) => Conversation(
        id: _s(j['id']),
        contactId: _s(j['contactId']),
        status: _s(j['status'], 'open'),
        lastPreview: _s(j['lastPreview']),
        contact: Contact.fromJson(Map<String, dynamic>.from(j['contact'] as Map)),
        lastMessageAt: _d(j['lastMessageAt']),
        windowExpiresAt: _d(j['windowExpiresAt']),
        unreadCount: _i(j['unreadCount']),
        botActive: _b(j['botActive']),
        favorite: _b(j['favorite']),
        archived: _b(j['archived']),
      );
}

class ConversationCounts {
  final Map<String, int> values;
  ConversationCounts(this.values);
  int operator [](String k) => values[k] ?? 0;
  factory ConversationCounts.fromJson(Json j) => ConversationCounts(j.map((k, v) => MapEntry(k, _i(v))));
}

class Call {
  final String id, contactId, contactName, contactInitials, contactPhone, direction, outcome, note;
  final String? handledByName, recordingUrl, summary;
  final DateTime startedAt;
  final int? durationSeconds;

  /// Users being rung right now (incoming calls). Null when the server did not send it.
  final List<String>? ringingUserIds;
  Call({
    required this.id,
    required this.contactId,
    required this.contactName,
    required this.contactInitials,
    required this.contactPhone,
    required this.direction,
    required this.outcome,
    required this.note,
    required this.handledByName,
    required this.recordingUrl,
    required this.summary,
    required this.startedAt,
    required this.durationSeconds,
    this.ringingUserIds,
  });
  bool get live => outcome == 'ringing' || outcome == 'ongoing';

  /// Still ringing on this person's device? A device not in [ringingUserIds] stops ringing.
  bool isRinging(String? userId) => outcome == 'ringing' && (ringingUserIds == null || ringingUserIds!.contains(userId));
  factory Call.fromJson(Json j) {
    final c = j['contact'] is Map ? Map<String, dynamic>.from(j['contact']) : <String, dynamic>{};
    final h = j['handledBy'] is Map ? Map<String, dynamic>.from(j['handledBy']) : null;
    return Call(
      id: _s(j['id']),
      contactId: _s(j['contactId']),
      contactName: _s(c['name'], 'Customer'),
      contactInitials: _s(c['initials'], '?'),
      contactPhone: _s(c['phone']),
      direction: _s(j['direction'], 'in'),
      outcome: _s(j['outcome']),
      note: _s(j['note']),
      handledByName: h == null ? null : _sn(h['name']),
      recordingUrl: _sn(j['recordingUrl']),
      summary: _sn(j['summary']),
      startedAt: _d(j['startedAt']) ?? DateTime.now(),
      durationSeconds: j['durationSeconds'] is num ? _i(j['durationSeconds']) : null,
      ringingUserIds: j['ringingUserIds'] is List ? (j['ringingUserIds'] as List).map((e) => e.toString()).toList() : null,
    );
  }
}

class RingingCall {
  final Call call;
  final String? sdpOffer;
  RingingCall(this.call, this.sdpOffer);
  factory RingingCall.fromJson(Json j) => RingingCall(Call.fromJson(Map<String, dynamic>.from(j['call'] as Map)), _sn(j['sdpOffer']));
}

class ScheduledCall {
  final String id, contactId, contactName, userName, note, status;
  final DateTime scheduledAt;
  ScheduledCall({required this.id, required this.contactId, required this.contactName, required this.userName, required this.note, required this.status, required this.scheduledAt});
  factory ScheduledCall.fromJson(Json j) => ScheduledCall(
        id: _s(j['id']),
        contactId: _s(j['contactId']),
        contactName: _s(j['contactName']),
        userName: _s(j['userName']),
        note: _s(j['note']),
        status: _s(j['status']),
        scheduledAt: _d(j['scheduledAt']) ?? DateTime.now(),
      );
}

class Template {
  final String id, name, category, language, status, body;
  final int variableCount;
  Template({required this.id, required this.name, required this.category, required this.language, required this.status, required this.body, required this.variableCount});
  factory Template.fromJson(Json j) => Template(
        id: _s(j['id']),
        name: _s(j['name']),
        category: _s(j['category']),
        language: _s(j['language']),
        status: _s(j['status']),
        body: _s(j['body']),
        variableCount: _i(j['variableCount']),
      );
}

class QuickReply {
  final String id, command, title, text;
  final List<FileRef> attachments;
  QuickReply({required this.id, required this.command, required this.title, required this.text, required this.attachments});
  factory QuickReply.fromJson(Json j) => QuickReply(
        id: _s(j['id']),
        command: _s(j['command']),
        title: _s(j['title']),
        text: _s(j['text']),
        attachments: _list(j['attachments']).map(FileRef.fromJson).toList(),
      );
}

class Presence {
  final String status, reason;
  final DateTime? since;
  final int plannedMinutes;
  Presence({required this.status, required this.reason, required this.since, required this.plannedMinutes});
  factory Presence.fromJson(dynamic v) {
    final j = v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};
    return Presence(status: _s(j['status'], 'away'), reason: _s(j['reason']), since: _d(j['since']), plannedMinutes: _i(j['plannedMinutes']));
  }
}

class StaffMember {
  final String id, role, name, initials, title, avatarColor;
  final Presence call, chat;
  final int openChats;
  StaffMember({required this.id, required this.role, required this.name, required this.initials, required this.title, required this.avatarColor, required this.call, required this.chat, required this.openChats});
  factory StaffMember.fromJson(Json j) {
    final p = j['presence'] is Map ? Map<String, dynamic>.from(j['presence']) : <String, dynamic>{};
    final stats = j['stats'] is Map ? Map<String, dynamic>.from(j['stats']) : <String, dynamic>{};
    return StaffMember(
      id: _s(j['id']),
      role: _s(j['role'], 'staff'),
      name: _s(j['name']),
      initials: _s(j['initials'], '?'),
      title: _s(j['title']),
      avatarColor: _s(j['avatarColor'], 'a1'),
      call: Presence.fromJson(p['call']),
      chat: Presence.fromJson(p['chat']),
      openChats: _i(stats['openChats']),
    );
  }
}

class OwnerHistoryEntry {
  final DateTime at;
  final String? fromName, toName;
  final String actorName, reason;
  OwnerHistoryEntry({required this.at, required this.fromName, required this.toName, required this.actorName, required this.reason});
  factory OwnerHistoryEntry.fromJson(Json j) => OwnerHistoryEntry(
        at: _d(j['at']) ?? DateTime.now(),
        fromName: _sn(j['fromName']),
        toName: _sn(j['toName']),
        actorName: _s(j['actorName']),
        reason: _s(j['reason']),
      );
}

class MyDashboard {
  final int openChats, unread, closingSoon, callsToday, callsMissed, resolvedToday, targetPercent;
  final int? avgFirstReplySeconds;
  final List<ScheduledCall> scheduledCalls;
  MyDashboard({
    required this.openChats,
    required this.unread,
    required this.closingSoon,
    required this.callsToday,
    required this.callsMissed,
    required this.resolvedToday,
    required this.targetPercent,
    required this.avgFirstReplySeconds,
    required this.scheduledCalls,
  });
  factory MyDashboard.fromJson(Json j) => MyDashboard(
        openChats: _i(j['openChats']),
        unread: _i(j['unread']),
        closingSoon: _i(j['closingSoon']),
        callsToday: _i(j['callsToday']),
        callsMissed: _i(j['callsMissed']),
        resolvedToday: _i(j['resolvedToday']),
        targetPercent: _i(j['targetPercent']),
        avgFirstReplySeconds: j['avgFirstReplySeconds'] is num ? _i(j['avgFirstReplySeconds']) : null,
        scheduledCalls: _list(j['scheduledCalls']).map(ScheduledCall.fromJson).toList(),
      );
}

class BreakEntry {
  final String reason, scope;
  final DateTime startedAt;
  final int minutes;
  BreakEntry({required this.reason, required this.scope, required this.startedAt, required this.minutes});
  factory BreakEntry.fromJson(Json j) =>
      BreakEntry(reason: _s(j['reason']), scope: _s(j['scope']), startedAt: _d(j['startedAt']) ?? DateTime.now(), minutes: _i(j['minutes']));
}

class MyBreaks {
  final int usedMinutes, limitMinutes;
  final List<BreakEntry> entries;
  MyBreaks({required this.usedMinutes, required this.limitMinutes, required this.entries});
  factory MyBreaks.fromJson(Json j) =>
      MyBreaks(usedMinutes: _i(j['usedMinutes']), limitMinutes: _i(j['limitMinutes'], 60), entries: _list(j['entries']).map(BreakEntry.fromJson).toList());
}
