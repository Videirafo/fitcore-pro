import 'package:fitcore_mobile/src/data/contracts.dart';
import 'package:fitcore_mobile/src/data/sync_engine.dart';
import 'package:fitcore_mobile/src/domain/models.dart';
import 'package:flutter_test/flutter_test.dart';

class MemoryStore implements WorkoutStore {
  WorkoutSession? session;
  List<WorkoutPlan> plans = [];
  List<SyncOperation> queue = [];
  final Map<String, String> ids = {};
  String? cookie;

  @override
  WorkoutSession? readActiveSession() => session;
  @override
  Future<void> saveActiveSession(WorkoutSession? value) async =>
      session = value;
  @override
  List<WorkoutPlan> readWorkoutPlans() => plans;
  @override
  Future<void> saveWorkoutPlans(List<WorkoutPlan> value) async => plans = value;
  @override
  List<SyncOperation> readQueue() => queue;
  @override
  Future<void> saveQueue(List<SyncOperation> value) async => queue = value;
  @override
  Future<void> enqueue(SyncOperation operation) async => queue.add(operation);
  @override
  String? resolveRemoteExecutionId(String localId) => ids[localId];
  @override
  Future<void> mapExecutionId(String localId, String remoteId) async =>
      ids[localId] = remoteId;
  @override
  Future<String?> readCookie() async => cookie;
  @override
  Future<void> writeCookie(String? value) async => cookie = value;
  @override
  Future<void> clearAuth() async => cookie = null;
}

class FakeRemote implements FitCoreRemote {
  final List<String> calls = [];
  bool failNext = false;

  void _maybeFail() {
    if (!failNext) return;
    failNext = false;
    throw StateError('offline');
  }

  @override
  Future<String> startWorkout(String workoutId) async {
    _maybeFail();
    calls.add('start:$workoutId');
    return 'remote-1';
  }

  @override
  Future<void> completeExercise(
    String executionId,
    int index, {
    String? observation,
  }) async {
    _maybeFail();
    calls.add('exercise:$executionId:$index');
  }

  @override
  Future<void> finishWorkout(
    String executionId, {
    required int effort,
    required int durationMinutes,
  }) async {
    _maybeFail();
    calls.add('finish:$executionId:$effort:$durationMinutes');
  }

  @override
  Future<FitCoreUser> login({
    required String identifier,
    required String secret,
    String? tenantSlug,
  }) => Future.value(const FitCoreUser(id: 'u1', name: 'Aluno', role: 'aluno'));
  @override
  Future<FitCoreUser> profile() =>
      Future.value(const FitCoreUser(id: 'u1', name: 'Aluno', role: 'aluno'));
  @override
  Future<void> logout() async {}
  @override
  Future<List<WorkoutPlan>> myWorkouts() async => const [];
  @override
  Future<EvolutionSummary> myEvolution() async => const EvolutionSummary();
}

SyncOperation op(SyncOperationType type, Map<String, dynamic> payload) =>
    SyncOperation(
      id: '${type.name}-${payload.hashCode}',
      type: type,
      localExecutionId: 'local-1',
      createdAt: DateTime.utc(2026, 9, 10),
      payload: payload,
    );
void main() {
  test('sync preserves start -> exercise -> finish order', () async {
    final store = MemoryStore();
    final remote = FakeRemote();
    store.queue = [
      op(SyncOperationType.startWorkout, {'workout_id': 'workout-1'}),
      op(SyncOperationType.completeExercise, {'index': 2}),
      op(SyncOperationType.finishWorkout, {
        'effort': 7,
        'duration_minutes': 48,
      }),
    ];

    final report = await WorkoutSyncEngine(
      store: store,
      remote: remote,
    ).flush();

    expect(report.isComplete, isTrue);
    expect(store.queue, isEmpty);
    expect(store.ids['local-1'], 'remote-1');
    expect(remote.calls, [
      'start:workout-1',
      'exercise:remote-1:2',
      'finish:remote-1:7:48',
    ]);
  });

  test('sync keeps failed operation queued and increments attempts', () async {
    final store = MemoryStore();
    final remote = FakeRemote()..failNext = true;
    store.queue = [
      op(SyncOperationType.startWorkout, {'workout_id': 'workout-1'}),
    ];

    final report = await WorkoutSyncEngine(
      store: store,
      remote: remote,
    ).flush();

    expect(report.isComplete, isFalse);
    expect(report.pending, 1);
    expect(store.queue.single.attempts, 1);
  });
}
