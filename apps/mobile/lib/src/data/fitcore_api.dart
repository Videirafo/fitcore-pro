import 'dart:convert';

import 'package:http/http.dart' as http;

import '../domain/models.dart';
import 'contracts.dart';

class FitCoreApiException implements Exception {
  FitCoreApiException(this.message, {this.statusCode});
  final String message;
  final int? statusCode;
  @override
  String toString() => message;
}

class FitCoreApi implements FitCoreRemote {
  FitCoreApi({required this.store, http.Client? client})
    : _client = client ?? http.Client();

  static const _defaultBaseUrl = 'https://fitcore.marcaia.app';
  static const baseUrl = String.fromEnvironment(
    'FITCORE_API_URL',
    defaultValue: _defaultBaseUrl,
  );

  final WorkoutStore store;
  final http.Client _client;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<Map<String, String>> _headers() async {
    final cookie = await store.readCookie();
    return {
      'accept': 'application/json',
      'content-type': 'application/json',
      if (cookie != null && cookie.isNotEmpty) 'cookie': cookie,
    };
  }

  Future<Map<String, dynamic>> _decode(http.Response response) async {
    final setCookie = response.headers['set-cookie'];
    if (setCookie != null && setCookie.isNotEmpty) {
      final cookie = setCookie.split(';').first.trim();
      await store.writeCookie(cookie.endsWith('=') ? null : cookie);
    }
    Map<String, dynamic> body = {};
    if (response.body.isNotEmpty) {
      try {
        body = Map<String, dynamic>.from(jsonDecode(response.body) as Map);
      } catch (_) {
        body = {};
      }
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw FitCoreApiException(
        '${body['mensagem'] ?? body['erro'] ?? 'Falha na API FitCore'}',
        statusCode: response.statusCode,
      );
    }
    return body;
  }

  Future<http.Response> _get(String path) async =>
      _client.get(_uri(path), headers: await _headers());

  Future<http.Response> _post(
    String path, [
    Map<String, dynamic> body = const {},
  ]) async => _client.post(
    _uri(path),
    headers: await _headers(),
    body: jsonEncode(body),
  );

  @override
  Future<FitCoreUser> login({
    required String identifier,
    required String secret,
    String? tenantSlug,
  }) async {
    final response = await _post('/api/mvp-19/login', {
      'login_identifier': identifier.trim(),
      'secret': secret,
      if (tenantSlug != null && tenantSlug.trim().isNotEmpty)
        'tenant_slug': tenantSlug.trim(),
    });
    final body = await _decode(response);
    return FitCoreUser.fromJson(
      Map<String, dynamic>.from(body['user'] as Map? ?? const {}),
    );
  }

  @override
  Future<FitCoreUser> profile() async {
    final body = await _decode(await _get('/api/mvp-19/credentials/me'));
    return FitCoreUser.fromJson(
      Map<String, dynamic>.from(body['user'] as Map? ?? const {}),
    );
  }

  @override
  Future<void> logout() async {
    try {
      await _decode(await _post('/api/mvp-15/session/logout'));
    } finally {
      await store.clearAuth();
    }
  }

  @override
  Future<List<WorkoutPlan>> myWorkouts() async {
    final body = await _decode(await _get('/api/mvp-24/my-workouts'));
    return (body['prescriptions'] as List? ?? const [])
        .whereType<Map>()
        .map((item) => WorkoutPlan.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  @override
  Future<String> startWorkout(String workoutId) async {
    final body = await _decode(
      await _post('/api/mvp-25/executions/start', {'workout_id': workoutId}),
    );
    final execution = Map<String, dynamic>.from(
      body['execution'] as Map? ?? const {},
    );
    final id = execution['id']?.toString() ?? '';
    if (id.isEmpty) {
      throw FitCoreApiException('A API não retornou a execução iniciada.');
    }
    return id;
  }

  @override
  Future<void> upsertSet(
    String executionId,
    int exerciseIndex,
    int setIndex,
    WorkoutSetLog log, {
    String? clientOperationId,
  }) async {
    await _decode(
      await _post(
        '/api/mvp-46/executions/$executionId/exercises/$exerciseIndex/sets/$setIndex',
        {
          ...log.toJson(),
          if (clientOperationId != null && clientOperationId.isNotEmpty)
            'client_operation_id': clientOperationId,
        },
      ),
    );
  }

  @override
  Future<void> completeExercise(
    String executionId,
    int index, {
    String? observation,
  }) async {
    await _decode(
      await _post('/api/mvp-25/executions/$executionId/exercises/$index/done', {
        if (observation != null && observation.isNotEmpty)
          'observacao': observation,
      }),
    );
  }

  @override
  Future<void> finishWorkout(
    String executionId, {
    required int effort,
    required int durationMinutes,
  }) async {
    await _decode(
      await _post('/api/mvp-25/executions/$executionId/finish', {
        'percepcao_esforco': effort,
        'duracao_minutos': durationMinutes,
      }),
    );
  }

  @override
  Future<EvolutionSummary> myEvolution() async {
    final body = await _decode(await _get('/api/mvp-26/my-evolution'));
    return EvolutionSummary.fromJson(body);
  }
}
