import '../domain/models.dart';
import 'contracts.dart';
import 'sync_engine.dart';

class WorkoutRepository {
  WorkoutRepository({
    required WorkoutStore store,
    required FitCoreRemote remote,
  }) : _store = store,
       _remote = remote,
       _sync = WorkoutSyncEngine(store: store, remote: remote);

  final WorkoutStore _store;
  final FitCoreRemote _remote;
  final WorkoutSyncEngine _sync;

  WorkoutSession? get activeSession => _store.readActiveSession();
  int get pendingSyncCount => _store.readQueue().length;

  Future<FitCoreUser?> restoreUser() async {
    final cookie = await _store.readCookie();
    if (cookie == null || cookie.isEmpty) return null;
    try {
      return await _remote.profile();
    } catch (_) {
      return null;
    }
  }

  Future<FitCoreUser> login({
    required String identifier,
    required String secret,
    String? tenantSlug,
  }) async {
    final user = await _remote.login(
      identifier: identifier,
      secret: secret,
      tenantSlug: tenantSlug,
    );
    await _sync.flush();
    return user;
  }

  Future<void> logout() async {
    await _remote.logout();
  }

  Future<List<WorkoutPlan>> loadWorkouts() async {
    try {
      final plans = await _remote.myWorkouts();
      await _store.saveWorkoutPlans(plans);
      return plans;
    } catch (_) {
      final cached = _store.readWorkoutPlans();
      if (cached.isNotEmpty) return cached;
      rethrow;
    }
  }

  Future<EvolutionSummary> loadEvolution() => _remote.myEvolution();

  Future<WorkoutSession> start(WorkoutPlan plan) async {
    final current = _store.readActiveSession();
    if (current != null && !current.isFinished) return current;

    final now = DateTime.now();
    final localId = 'local-${now.microsecondsSinceEpoch}';
    final session = WorkoutSession(
      localId: localId,
      workoutId: plan.id,
      name: plan.name,
      startedAt: now,
      exercises: plan.exercises
          .map((item) => item.copyWith(done: false, logs: const []))
          .toList(),
    );
    await _store.saveActiveSession(session);
    await _store.enqueue(
      SyncOperation(
        id: 'start-${now.microsecondsSinceEpoch}',
        type: SyncOperationType.startWorkout,
        localExecutionId: localId,
        createdAt: now,
        payload: {'workout_id': plan.id},
      ),
    );
    await _sync.flush();
    return _store.readActiveSession() ?? session;
  }

  Future<WorkoutSession> addSet(int exerciseIndex, WorkoutSetLog log) async {
    final session = _requiredSession();
    final exercises = [...session.exercises];
    final target = exercises.firstWhere((item) => item.index == exerciseIndex);
    final updated = target.copyWith(logs: [...target.logs, log]);
    exercises[exercises.indexOf(target)] = updated;
    final next = session.copyWith(exercises: exercises);
    await _store.saveActiveSession(next);
    return next;
  }

  Future<WorkoutSession> completeExercise(int exerciseIndex) async {
    final session = _requiredSession();
    final exercises = [...session.exercises];
    final target = exercises.firstWhere((item) => item.index == exerciseIndex);
    if (target.done) return session;

    exercises[exercises.indexOf(target)] = target.copyWith(done: true);
    final next = session.copyWith(exercises: exercises);
    await _store.saveActiveSession(next);
    final now = DateTime.now();
    await _store.enqueue(
      SyncOperation(
        id: 'exercise-${now.microsecondsSinceEpoch}',
        type: SyncOperationType.completeExercise,
        localExecutionId: session.localId,
        createdAt: now,
        payload: {
          'index': exerciseIndex,
          'observation': target.logs.isEmpty
              ? 'Exercício concluído no app móvel.'
              : '${target.logs.length} série(s) registrada(s) no app móvel.',
        },
      ),
    );
    await _sync.flush();
    return _store.readActiveSession() ?? next;
  }

  Future<SyncReport> finish({required int effort}) async {
    final session = _requiredSession();
    final now = DateTime.now();
    final duration = now.difference(session.startedAt).inMinutes.clamp(1, 480);
    final finished = session.copyWith(finishedAt: now, effort: effort);
    await _store.saveActiveSession(finished);
    await _store.enqueue(
      SyncOperation(
        id: 'finish-${now.microsecondsSinceEpoch}',
        type: SyncOperationType.finishWorkout,
        localExecutionId: session.localId,
        createdAt: now,
        payload: {'effort': effort, 'duration_minutes': duration},
      ),
    );
    final report = await _sync.flush();
    if (report.isComplete) await _store.saveActiveSession(null);
    return report;
  }

  Future<SyncReport> syncNow() => _sync.flush();

  WorkoutSession _requiredSession() {
    final session = _store.readActiveSession();
    if (session == null) throw StateError('Nenhum treino em andamento.');
    return session;
  }
}
