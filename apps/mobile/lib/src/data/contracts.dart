import '../domain/models.dart';

abstract class WorkoutStore {
  WorkoutSession? readActiveSession();
  Future<void> saveActiveSession(WorkoutSession? session);
  List<WorkoutPlan> readWorkoutPlans();
  Future<void> saveWorkoutPlans(List<WorkoutPlan> plans);
  List<SyncOperation> readQueue();
  Future<void> saveQueue(List<SyncOperation> queue);
  Future<void> enqueue(SyncOperation operation);
  String? resolveRemoteExecutionId(String localId);
  Future<void> mapExecutionId(String localId, String remoteId);
  Future<String?> readCookie();
  Future<void> writeCookie(String? cookie);
  Future<void> clearAuth();
}

abstract class FitCoreRemote {
  Future<FitCoreUser> login({
    required String identifier,
    required String secret,
    String? tenantSlug,
  });
  Future<FitCoreUser> profile();
  Future<void> logout();
  Future<List<WorkoutPlan>> myWorkouts();
  Future<String> startWorkout(String workoutId);
  Future<void> upsertSet(
    String executionId,
    int exerciseIndex,
    int setIndex,
    WorkoutSetLog log, {
    String? clientOperationId,
  });
  Future<void> completeExercise(
    String executionId,
    int index, {
    String? observation,
  });
  Future<void> finishWorkout(
    String executionId, {
    required int effort,
    required int durationMinutes,
  });
  Future<EvolutionSummary> myEvolution();
}
