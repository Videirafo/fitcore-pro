import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/models.dart';
import 'contracts.dart';

class LocalWorkoutStore implements WorkoutStore {
  LocalWorkoutStore(this._prefs, this._secureStorage);

  static const _sessionKey = 'fitcore.active_session.v1';
  static const _plansKey = 'fitcore.workout_plans.v1';
  static const _queueKey = 'fitcore.sync_queue.v1';
  static const _idMapKey = 'fitcore.execution_id_map.v1';
  static const _cookieKey = 'fitcore.session_cookie.v1';

  final SharedPreferences _prefs;
  final FlutterSecureStorage _secureStorage;

  static Future<LocalWorkoutStore> create() async {
    final prefs = await SharedPreferences.getInstance();
    return LocalWorkoutStore(prefs, const FlutterSecureStorage());
  }

  @override
  WorkoutSession? readActiveSession() {
    final raw = _prefs.getString(_sessionKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return WorkoutSession.fromJson(
        Map<String, dynamic>.from(jsonDecode(raw) as Map),
      );
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> saveActiveSession(WorkoutSession? session) async {
    if (session == null) {
      await _prefs.remove(_sessionKey);
      return;
    }
    await _prefs.setString(_sessionKey, jsonEncode(session.toJson()));
  }

  @override
  List<WorkoutPlan> readWorkoutPlans() {
    final raw = _prefs.getString(_plansKey);
    if (raw == null || raw.isEmpty) return const [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((item) => WorkoutPlan.fromJson(Map<String, dynamic>.from(item)))
          .toList();
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<void> saveWorkoutPlans(List<WorkoutPlan> plans) => _prefs.setString(
    _plansKey,
    jsonEncode(plans.map((item) => item.toJson()).toList()),
  );

  @override
  List<SyncOperation> readQueue() {
    final raw = _prefs.getString(_queueKey);
    if (raw == null || raw.isEmpty) return const [];
    try {
      return (jsonDecode(raw) as List)
          .whereType<Map>()
          .map(
            (item) => SyncOperation.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList();
    } catch (_) {
      return const [];
    }
  }

  @override
  Future<void> saveQueue(List<SyncOperation> queue) => _prefs.setString(
    _queueKey,
    jsonEncode(queue.map((item) => item.toJson()).toList()),
  );

  @override
  Future<void> enqueue(SyncOperation operation) async {
    final queue = [...readQueue(), operation];
    await saveQueue(queue);
  }

  Map<String, String> _readExecutionIdMap() {
    final raw = _prefs.getString(_idMapKey);
    if (raw == null || raw.isEmpty) return const {};
    try {
      return Map<String, String>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return const {};
    }
  }

  @override
  Future<void> mapExecutionId(String localId, String remoteId) async {
    final map = {..._readExecutionIdMap(), localId: remoteId};
    await _prefs.setString(_idMapKey, jsonEncode(map));
    final session = readActiveSession();
    if (session?.localId == localId && session?.remoteId == null) {
      await saveActiveSession(session!.copyWith(remoteId: remoteId));
    }
  }

  @override
  String? resolveRemoteExecutionId(String localId) =>
      _readExecutionIdMap()[localId] ??
      (readActiveSession()?.localId == localId
          ? readActiveSession()?.remoteId
          : null);

  @override
  Future<void> writeCookie(String? cookie) async {
    if (cookie == null || cookie.isEmpty) {
      await _secureStorage.delete(key: _cookieKey);
      return;
    }
    await _secureStorage.write(key: _cookieKey, value: cookie);
  }

  @override
  Future<String?> readCookie() => _secureStorage.read(key: _cookieKey);

  @override
  Future<void> clearAuth() async {
    await _secureStorage.delete(key: _cookieKey);
    await _prefs.remove(_sessionKey);
    await _prefs.remove(_plansKey);
    await _prefs.remove(_queueKey);
    await _prefs.remove(_idMapKey);
  }
}
