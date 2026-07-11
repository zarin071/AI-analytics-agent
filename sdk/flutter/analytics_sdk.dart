/// AI Analytics — Flutter/Dart SDK.
///
/// Mirrors the TypeScript core: batching, retry, offline persistence via
/// shared_preferences, anonymous ids, identify, super properties.
///
/// ```dart
/// final analytics = await AiAnalytics.init(
///   apiKey: 'pk_...',
///   host: 'https://analytics.yourapp.com',
/// );
/// analytics.identify('user_42', traits: {'plan': 'pro'});
/// analytics.track('checkout_completed', properties: {'revenue': 49.0});
/// ```
library ai_analytics;

import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class AiAnalytics {
  AiAnalytics._(this._apiKey, this._host, this._prefs, this._flushInterval);

  final String _apiKey;
  final String _host;
  final SharedPreferences _prefs;
  final Duration _flushInterval;

  final List<Map<String, dynamic>> _queue = [];
  Timer? _timer;
  String? _userId;
  late String _anonymousId;
  Map<String, dynamic> _superProps = {};

  static const _maxBatch = 25;
  static const _maxQueue = 1000;

  static Future<AiAnalytics> init({
    required String apiKey,
    required String host,
    Duration flushInterval = const Duration(seconds: 5),
  }) async {
    final prefs = await SharedPreferences.getInstance();
    final sdk = AiAnalytics._(apiKey, host, prefs, flushInterval);
    sdk._anonymousId = prefs.getString('aa_anonymous_id') ?? _uuid();
    await prefs.setString('aa_anonymous_id', sdk._anonymousId);
    sdk._userId = prefs.getString('aa_user_id');
    final saved = prefs.getString('aa_queue');
    if (saved != null) {
      sdk._queue.addAll((jsonDecode(saved) as List).cast<Map<String, dynamic>>());
    }
    sdk._timer = Timer.periodic(flushInterval, (_) => sdk.flush());
    return sdk;
  }

  void track(String name, {Map<String, dynamic> properties = const {}}) {
    _enqueue({
      'name': name,
      'userId': _userId,
      'anonymousId': _anonymousId,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'properties': {..._superProps, ...properties},
      'context': {
        'sdk': {'name': 'ai_analytics_flutter', 'version': '1.0.0'},
        'device': {'type': 'mobile'},
      },
    });
  }

  void screen(String name, {Map<String, dynamic> properties = const {}}) =>
      track('screen_viewed', properties: {'screen_name': name, ...properties});

  void identify(String userId, {Map<String, dynamic> traits = const {}}) {
    _userId = userId;
    _prefs.setString('aa_user_id', userId);
    _enqueue({
      'name': r'$identify',
      'userId': userId,
      'anonymousId': _anonymousId,
      'timestamp': DateTime.now().toUtc().toIso8601String(),
      'properties': traits,
      'context': const {},
    });
  }

  void register(Map<String, dynamic> props) => _superProps = {..._superProps, ...props};

  void reset() {
    _userId = null;
    _anonymousId = _uuid();
    _superProps = {};
    _prefs.setString('aa_anonymous_id', _anonymousId);
    _prefs.remove('aa_user_id');
  }

  Future<void> flush() async {
    if (_queue.isEmpty) return;
    final batch = _queue.take(_maxBatch).toList();
    _queue.removeRange(0, batch.length);
    await _persist();
    try {
      final res = await http.post(
        Uri.parse('$_host/v1/track'),
        headers: {'content-type': 'application/json', 'authorization': 'Bearer $_apiKey'},
        body: jsonEncode({'events': batch}),
      );
      if (res.statusCode >= 500 || res.statusCode == 429) throw Exception('retryable');
    } catch (_) {
      _queue.insertAll(0, batch);
      if (_queue.length > _maxQueue) _queue.removeRange(_maxQueue, _queue.length);
      await _persist();
    }
  }

  Future<void> dispose() async {
    _timer?.cancel();
    await flush();
  }

  void _enqueue(Map<String, dynamic> event) {
    _queue.add(event);
    if (_queue.length > _maxQueue) _queue.removeAt(0);
    if (_queue.length >= _maxBatch) flush();
    _persist();
  }

  Future<void> _persist() =>
      _prefs.setString('aa_queue', jsonEncode(_queue.take(200).toList()));

  static String _uuid() {
    final rnd = Random.secure();
    String hex(int n) => List.generate(n, (_) => rnd.nextInt(16).toRadixString(16)).join();
    return '${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + rnd.nextInt(4)).toRadixString(16)}${hex(3)}-${hex(12)}';
  }
}
