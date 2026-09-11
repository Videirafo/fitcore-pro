enum SyncOperationType {
  startWorkout,
  upsertSet,
  completeExercise,
  finishWorkout,
}

class FitCoreUser {
  const FitCoreUser({
    required this.id,
    required this.name,
    required this.role,
    this.loginIdentifier,
  });

  final String id;
  final String name;
  final String role;
  final String? loginIdentifier;

  factory FitCoreUser.fromJson(Map<String, dynamic> json) => FitCoreUser(
    id: '${json['id'] ?? ''}',
    name: '${json['nome'] ?? json['name'] ?? 'Usuário'}',
    role: '${json['papel'] ?? json['role'] ?? 'aluno'}',
    loginIdentifier: json['login_identifier']?.toString(),
  );
}

class WorkoutSetLog {
  const WorkoutSetLog({required this.reps, this.weightKg, this.rpe});

  final int reps;
  final double? weightKg;
  final int? rpe;

  factory WorkoutSetLog.fromJson(Map<String, dynamic> json) => WorkoutSetLog(
    reps: (json['reps'] as num?)?.toInt() ?? 0,
    weightKg: (json['weight_kg'] as num?)?.toDouble(),
    rpe: (json['rpe'] as num?)?.toInt(),
  );

  Map<String, dynamic> toJson() => {
    'reps': reps,
    'weight_kg': weightKg,
    'rpe': rpe,
  };
}

class WorkoutExercise {
  const WorkoutExercise({
    required this.index,
    required this.name,
    this.targetSets,
    this.targetReps,
    this.restSeconds = 90,
    this.done = false,
    this.logs = const [],
  });

  final int index;
  final String name;
  final int? targetSets;
  final String? targetReps;
  final int restSeconds;
  final bool done;
  final List<WorkoutSetLog> logs;

  factory WorkoutExercise.fromJson(Map<String, dynamic> json) {
    final rawSets = json['sets'] ?? json['series'];
    return WorkoutExercise(
      index: (json['index'] as num?)?.toInt() ?? 0,
      name: (json['nome'] ?? json['name'] ?? 'Exercício').toString(),
      targetSets: rawSets is num ? rawSets.toInt() : int.tryParse('$rawSets'),
      targetReps: (json['repeticoes'] ?? json['reps'])?.toString(),
      restSeconds: (json['rest_seconds'] as num?)?.toInt() ?? 90,
      done: (json['status'] ?? '') == 'feito' || json['done'] == true,
      logs:
          ((json['set_logs'] ?? json['logs'] ?? json['sets_done']) as List? ??
                  const [])
              .whereType<Map>()
              .map(
                (item) =>
                    WorkoutSetLog.fromJson(Map<String, dynamic>.from(item)),
              )
              .toList(),
    );
  }

  WorkoutExercise copyWith({bool? done, List<WorkoutSetLog>? logs}) =>
      WorkoutExercise(
        index: index,
        name: name,
        targetSets: targetSets,
        targetReps: targetReps,
        restSeconds: restSeconds,
        done: done ?? this.done,
        logs: logs ?? this.logs,
      );

  Map<String, dynamic> toJson() => {
    'index': index,
    'nome': name,
    'series': targetSets,
    'repeticoes': targetReps,
    'rest_seconds': restSeconds,
    'status': done ? 'feito' : 'pendente',
    'set_logs': logs.map((item) => item.toJson()).toList(),
  };
}

class WorkoutPlan {
  const WorkoutPlan({
    required this.id,
    required this.name,
    required this.status,
    this.goal,
    this.guidance,
    this.exercises = const [],
  });

  final String id;
  final String name;
  final String status;
  final String? goal;
  final String? guidance;
  final List<WorkoutExercise> exercises;

  bool get approved => status == 'aprovado';

  factory WorkoutPlan.fromJson(Map<String, dynamic> json) {
    final rawExercises = json['exercicios'] ?? const [];
    return WorkoutPlan(
      id: '${json['id'] ?? ''}',
      name: '${json['nome_treino'] ?? json['objetivo'] ?? 'Treino'}',
      status: '${json['status'] ?? ''}',
      goal: json['objetivo']?.toString(),
      guidance: json['orientacoes']?.toString(),
      exercises: (rawExercises as List? ?? const [])
          .whereType<Map>()
          .toList()
          .asMap()
          .entries
          .map((entry) {
            final data = Map<String, dynamic>.from(entry.value);
            data.putIfAbsent('index', () => entry.key);
            return WorkoutExercise.fromJson(data);
          })
          .toList(),
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'nome_treino': name,
    'status': status,
    'objetivo': goal,
    'orientacoes': guidance,
    'exercicios': exercises.map((item) => item.toJson()).toList(),
  };
}

class WorkoutSession {
  const WorkoutSession({
    required this.localId,
    required this.workoutId,
    required this.name,
    required this.startedAt,
    required this.exercises,
    this.remoteId,
    this.finishedAt,
    this.effort,
  });

  final String localId;
  final String workoutId;
  final String name;
  final DateTime startedAt;
  final DateTime? finishedAt;
  final String? remoteId;
  final int? effort;
  final List<WorkoutExercise> exercises;

  bool get isFinished => finishedAt != null;
  int get doneCount => exercises.where((item) => item.done).length;
  double get progress => exercises.isEmpty ? 0 : doneCount / exercises.length;

  WorkoutSession copyWith({
    String? remoteId,
    DateTime? finishedAt,
    int? effort,
    List<WorkoutExercise>? exercises,
  }) => WorkoutSession(
    localId: localId,
    workoutId: workoutId,
    name: name,
    startedAt: startedAt,
    exercises: exercises ?? this.exercises,
    remoteId: remoteId ?? this.remoteId,
    finishedAt: finishedAt ?? this.finishedAt,
    effort: effort ?? this.effort,
  );

  factory WorkoutSession.fromJson(Map<String, dynamic> json) => WorkoutSession(
    localId: '${json['local_id']}',
    workoutId: '${json['workout_id']}',
    name: '${json['name'] ?? 'Treino'}',
    startedAt: DateTime.parse('${json['started_at']}'),
    remoteId: json['remote_id']?.toString(),
    finishedAt: json['finished_at'] == null
        ? null
        : DateTime.parse('${json['finished_at']}'),
    effort: (json['effort'] as num?)?.toInt(),
    exercises: (json['exercises'] as List? ?? const [])
        .whereType<Map>()
        .map(
          (item) => WorkoutExercise.fromJson(Map<String, dynamic>.from(item)),
        )
        .toList(),
  );

  Map<String, dynamic> toJson() => {
    'local_id': localId,
    'workout_id': workoutId,
    'name': name,
    'started_at': startedAt.toIso8601String(),
    'remote_id': remoteId,
    'finished_at': finishedAt?.toIso8601String(),
    'effort': effort,
    'exercises': exercises.map((item) => item.toJson()).toList(),
  };
}

class SyncOperation {
  const SyncOperation({
    required this.id,
    required this.type,
    required this.localExecutionId,
    required this.createdAt,
    this.payload = const {},
    this.attempts = 0,
  });

  final String id;
  final SyncOperationType type;
  final String localExecutionId;
  final DateTime createdAt;
  final Map<String, dynamic> payload;
  final int attempts;

  SyncOperation copyWith({int? attempts}) => SyncOperation(
    id: id,
    type: type,
    localExecutionId: localExecutionId,
    createdAt: createdAt,
    payload: payload,
    attempts: attempts ?? this.attempts,
  );

  factory SyncOperation.fromJson(Map<String, dynamic> json) => SyncOperation(
    id: '${json['id']}',
    type: SyncOperationType.values.firstWhere(
      (item) => item.name == json['type'],
      orElse: () => SyncOperationType.startWorkout,
    ),
    localExecutionId: '${json['local_execution_id']}',
    createdAt: DateTime.parse('${json['created_at']}'),
    payload: Map<String, dynamic>.from(json['payload'] as Map? ?? const {}),
    attempts: (json['attempts'] as num?)?.toInt() ?? 0,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'type': type.name,
    'local_execution_id': localExecutionId,
    'created_at': createdAt.toIso8601String(),
    'payload': payload,
    'attempts': attempts,
  };
}

class EvolutionSummary {
  const EvolutionSummary({
    this.total = 0,
    this.completed = 0,
    this.weekly = 0,
    this.averageEffort,
    this.averageDuration,
  });

  final int total;
  final int completed;
  final int weekly;
  final double? averageEffort;
  final double? averageDuration;

  factory EvolutionSummary.fromJson(Map<String, dynamic> json) {
    final student = Map<String, dynamic>.from(
      json['student'] as Map? ?? const {},
    );
    return EvolutionSummary(
      total: (student['total_executions'] as num?)?.toInt() ?? 0,
      completed: (student['completed_executions'] as num?)?.toInt() ?? 0,
      weekly: (student['weekly_frequency'] as num?)?.toInt() ?? 0,
      averageEffort: (student['average_effort'] as num?)?.toDouble(),
      averageDuration: (student['average_duration'] as num?)?.toDouble(),
    );
  }
}
