import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mime/mime.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Error from the Smart Reply API: `{ error: { code, message } }`.
class ApiException implements Exception {
  final int status;
  final String code;
  final String message;
  ApiException(this.status, this.code, this.message);
  @override
  String toString() => message;
}

/// Where the API lives. Set on the sign-in screen and saved on the phone.
class ServerConfig {
  static const _key = 'server_url';
  // Android emulator → the computer running the API. Change on the sign-in screen for a real phone.
  static const defaultUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');

  static Future<String> load() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_key) ?? defaultUrl;
  }

  static Future<void> save(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, url.trim().replaceAll(RegExp(r'/+$'), ''));
  }
}

/// Access and refresh tokens, kept in the phone's secure storage.
class TokenStore {
  static const _storage = FlutterSecureStorage();
  String? access;
  String? refresh;

  Future<void> load() async {
    access = await _storage.read(key: 'access');
    refresh = await _storage.read(key: 'refresh');
  }

  Future<void> save(String a, String r) async {
    access = a;
    refresh = r;
    await _storage.write(key: 'access', value: a);
    await _storage.write(key: 'refresh', value: r);
  }

  Future<void> clear() async {
    access = null;
    refresh = null;
    await _storage.delete(key: 'access');
    await _storage.delete(key: 'refresh');
  }
}

/// HTTP client. Sends the bearer token, refreshes it once on 401, and turns API errors into
/// [ApiException] with a message you can show.
class Api {
  Api(this.baseUrl, this.tokens) {
    _dio = Dio(BaseOptions(
      baseUrl: '$baseUrl/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'x-sr-client': 'mobile'},
    ));
  }

  final String baseUrl;
  final TokenStore tokens;
  late final Dio _dio;
  Future<bool>? _refreshing;

  /// Called when the session cannot be refreshed any more.
  void Function()? onSignedOut;

  /// Get a new access token with the refresh token. True when it worked.
  Future<bool> refreshTokens() => _refresh();

  Future<bool> _refresh() {
    return _refreshing ??= () async {
      try {
        final r = tokens.refresh;
        if (r == null) return false;
        final res = await Dio(BaseOptions(baseUrl: '$baseUrl/api/v1', headers: {'x-sr-client': 'mobile'}))
            .post('/auth/refresh', data: {'refreshToken': r});
        final t = (res.data as Map)['tokens'] as Map?;
        if (t == null) return false;
        await tokens.save(t['accessToken'] as String, t['refreshToken'] as String);
        return true;
      } catch (_) {
        return false;
      } finally {
        Future.delayed(Duration.zero, () => _refreshing = null);
      }
    }();
  }

  Future<dynamic> _send(String method, String path, {Object? data, Map<String, dynamic>? query, bool retried = false}) async {
    try {
      final res = await _dio.request(
        path,
        data: data,
        queryParameters: query?..removeWhere((k, v) => v == null || v == ''),
        options: Options(method: method, headers: {if (tokens.access != null) 'Authorization': 'Bearer ${tokens.access}'}),
      );
      return res.data;
    } on DioException catch (e) {
      final status = e.response?.statusCode ?? 0;
      if (status == 401 && !retried && !path.startsWith('/auth/')) {
        if (await _refresh()) return _send(method, path, data: data, query: query, retried: true);
        onSignedOut?.call();
      }
      final body = e.response?.data;
      if (body is Map && body['error'] is Map) {
        final err = body['error'] as Map;
        throw ApiException(status, '${err['code'] ?? 'ERROR'}', '${err['message'] ?? 'Something went wrong.'}');
      }
      if (status == 0) throw ApiException(0, 'NETWORK', 'Cannot reach the server. Check the internet and the server address.');
      throw ApiException(status, 'HTTP_$status', 'Request failed ($status).');
    }
  }

  Future<dynamic> get(String path, [Map<String, dynamic>? query]) => _send('GET', path, query: query);
  Future<dynamic> post(String path, [Object? data]) => _send('POST', path, data: data ?? <String, dynamic>{});
  Future<dynamic> put(String path, [Object? data]) => _send('PUT', path, data: data ?? <String, dynamic>{});
  Future<dynamic> patch(String path, [Object? data]) => _send('PATCH', path, data: data ?? <String, dynamic>{});
  Future<dynamic> delete(String path) => _send('DELETE', path);

  /// Upload a file: get a ticket, PUT the bytes, return the file id.
  Future<String> upload(File file, {String purpose = 'message', String? name, String? mime}) async {
    final fileName = name ?? file.uri.pathSegments.last;
    final type = mime ?? lookupMimeType(file.path) ?? 'application/octet-stream';
    final size = await file.length();
    final ticket = await post('/files', {'name': fileName, 'mime': type, 'sizeBytes': size, 'purpose': purpose}) as Map;
    final headers = Map<String, dynamic>.from((ticket['headers'] as Map?) ?? {});
    await Dio().put(
      ticket['uploadUrl'] as String,
      data: file.openRead(),
      options: Options(headers: {...headers, Headers.contentLengthHeader: size}),
    );
    return ticket['fileId'] as String;
  }
}

String errorText(Object e) => e is ApiException ? e.message : 'Something went wrong. Try again.';
