import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/workout_repository.dart';
import '../domain/models.dart';
import '../services/rest_notification_service.dart';

final workoutRepositoryProvider = Provider<WorkoutRepository>(
  (ref) => throw UnimplementedError(),
);

class FitCoreState {
  const FitCoreState({
    this.user,
    this.workouts = const [],
    this.session,
    this.evolution,
    this.tabIndex = 0,
    this.offline = false,
    this.pendingSync = 0,
    this.notice,
  });

  final FitCoreUser? user;
  final List<WorkoutPlan> workouts;
  final WorkoutSession? session;
  final EvolutionSummary? evolution;
  final int tabIndex;
  final bool offline;
  final int pendingSync;
  final String? notice;

  FitCoreState copyWith({
    FitCoreUser? user,
    bool clearUser = false,
    List<WorkoutPlan>? workouts,
    WorkoutSession? session,
    bool clearSession = false,
    EvolutionSummary? evolution,
    int? tabIndex,
    bool? offline,
    int? pendingSync,
    String? notice,
    bool clearNotice = false,
  }) => FitCoreState(
    user: clearUser ? null : user ?? this.user,
    workouts: workouts ?? this.workouts,
    session: clearSession ? null : session ?? this.session,
    evolution: evolution ?? this.evolution,
    tabIndex: tabIndex ?? this.tabIndex,
    offline: offline ?? this.offline,
    pendingSync: pendingSync ?? this.pendingSync,
    notice: clearNotice ? null : notice ?? this.notice,
  );
}

class FitCoreController extends AsyncNotifier<FitCoreState> {
  WorkoutRepository get _repo => ref.read(workoutRepositoryProvider);

  @override
  Future<FitCoreState> build() async {
    final user = await _repo.restoreUser();
    if (user == null) {
      return FitCoreState(
        session: _repo.activeSession,
        pendingSync: _repo.pendingSyncCount,
      );
    }
    return _load(user);
  }

  Future<FitCoreState> _load(FitCoreUser user) async {
    var offline = false;
    var plans = <WorkoutPlan>[];
    EvolutionSummary? evolution;
    try {
      await _repo.syncNow();
      plans = await _repo.loadWorkouts();
    } catch (_) {
      offline = true;
      try {
        plans = await _repo.loadWorkouts();
      } catch (_) {}
    }
    try {
      evolution = await _repo.loadEvolution();
    } catch (_) {
      offline = true;
    }
    return FitCoreState(
      user: user,
      workouts: plans,
      session: _repo.activeSession,
      evolution: evolution,
      offline: offline,
      pendingSync: _repo.pendingSyncCount,
    );
  }

  Future<void> login(String identifier, String secret, String tenant) async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      final user = await _repo.login(
        identifier: identifier,
        secret: secret,
        tenantSlug: tenant,
      );
      return _load(user);
    });
  }

  Future<void> logout() async {
    await _repo.logout();
    state = AsyncData(
      FitCoreState(
        session: _repo.activeSession,
        pendingSync: _repo.pendingSyncCount,
      ),
    );
  }

  void selectTab(int index) {
    final current = state.value;
    if (current == null) return;
    state = AsyncData(current.copyWith(tabIndex: index, clearNotice: true));
  }

  Future<void> refresh() async {
    final current = state.value;
    if (current?.user == null) return;
    state = AsyncData(await _load(current!.user!));
  }

  Future<void> startWorkout(WorkoutPlan plan) async {
    final current = state.requireValue;
    final session = await _repo.start(plan);
    state = AsyncData(
      current.copyWith(
        session: session,
        tabIndex: 1,
        pendingSync: _repo.pendingSyncCount,
        offline: _repo.pendingSyncCount > 0,
        clearNotice: true,
      ),
    );
  }

  Future<void> addSet(int exerciseIndex, WorkoutSetLog log) async {
    final current = state.requireValue;
    final session = await _repo.addSet(exerciseIndex, log);
    state = AsyncData(current.copyWith(session: session));
  }

  Future<void> completeExercise(int exerciseIndex) async {
    final current = state.requireValue;
    final session = await _repo.completeExercise(exerciseIndex);
    state = AsyncData(
      current.copyWith(
        session: session,
        pendingSync: _repo.pendingSyncCount,
        offline: _repo.pendingSyncCount > 0,
      ),
    );
  }

  Future<void> finishWorkout(int effort) async {
    final current = state.requireValue;
    final report = await _repo.finish(effort: effort);
    EvolutionSummary? evolution = current.evolution;
    if (report.isComplete) {
      try {
        evolution = await _repo.loadEvolution();
      } catch (_) {}
    }
    state = AsyncData(
      current.copyWith(
        clearSession: report.isComplete,
        evolution: evolution,
        tabIndex: report.isComplete ? 3 : 1,
        offline: !report.isComplete,
        pendingSync: report.pending,
        notice: report.isComplete
            ? 'Treino concluído e sincronizado.'
            : 'Treino salvo no aparelho. Sincronização pendente.',
      ),
    );
  }

  Future<void> syncNow() async {
    final current = state.requireValue;
    final report = await _repo.syncNow();
    state = AsyncData(
      current.copyWith(
        session: _repo.activeSession,
        offline: !report.isComplete,
        pendingSync: report.pending,
        notice: report.isComplete
            ? 'Tudo sincronizado.'
            : 'Ainda há dados aguardando conexão.',
      ),
    );
  }
}

final fitCoreControllerProvider =
    AsyncNotifierProvider<FitCoreController, FitCoreState>(
      FitCoreController.new,
    );

final restNotificationProvider = Provider<RestNotificationService>(
  (ref) => RestNotificationService(),
);
