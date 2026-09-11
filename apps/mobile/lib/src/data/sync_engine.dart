import 'contracts.dart';
import '../domain/models.dart';

class SyncReport {
  const SyncReport({required this.synced, required this.pending, this.error});
  final int synced;
  final int pending;
  final Object? error;
  bool get isComplete => pending == 0 && error == null;
}

class WorkoutSyncEngine {
  WorkoutSyncEngine({required this.store, required this.remote});

  final WorkoutStore store;
  final FitCoreRemote remote;

  Future<SyncReport> flush() async {
    var queue = [...store.readQueue()];
    var synced = 0;

    while (queue.isNotEmpty) {
      final operation = queue.first;
      try {
        await _execute(operation);
        queue = queue.sublist(1);
        await store.saveQueue(queue);
        synced += 1;
      } catch (error) {
        queue[0] = operation.copyWith(attempts: operation.attempts + 1);
        await store.saveQueue(queue);
        return SyncReport(synced: synced, pending: queue.length, error: error);
      }
    }

    return SyncReport(synced: synced, pending: 0);
  }

  Future<void> _execute(SyncOperation operation) async {
    switch (operation.type) {
      case SyncOperationType.startWorkout:
        final workoutId = '${operation.payload['workout_id'] ?? ''}';
        final remoteId = await remote.startWorkout(workoutId);
        await store.mapExecutionId(operation.localExecutionId, remoteId);
      case SyncOperationType.upsertSet:
        final remoteId = _requireRemoteId(operation.localExecutionId);
        await remote.upsertSet(
          remoteId,
          (operation.payload['exercise_index'] as num?)?.toInt() ?? 0,
          (operation.payload['set_index'] as num?)?.toInt() ?? 0,
          WorkoutSetLog.fromJson(operation.payload),
          clientOperationId: operation.id,
        );
      case SyncOperationType.completeExercise:
        final remoteId = _requireRemoteId(operation.localExecutionId);
        await remote.completeExercise(
          remoteId,
          (operation.payload['index'] as num?)?.toInt() ?? 0,
          observation: operation.payload['observation']?.toString(),
        );
      case SyncOperationType.finishWorkout:
        final remoteId = _requireRemoteId(operation.localExecutionId);
        await remote.finishWorkout(
          remoteId,
          effort: (operation.payload['effort'] as num?)?.toInt() ?? 5,
          durationMinutes:
              (operation.payload['duration_minutes'] as num?)?.toInt() ?? 1,
        );
    }
  }

  String _requireRemoteId(String localId) {
    final remoteId = store.resolveRemoteExecutionId(localId);
    if (remoteId == null || remoteId.isEmpty) {
      throw StateError('Execução ainda não possui ID remoto.');
    }
    return remoteId;
  }
}
