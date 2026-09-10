import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../domain/models.dart';

class WorkoutScreen extends ConsumerStatefulWidget {
  const WorkoutScreen({super.key, required this.state});
  final FitCoreState state;

  @override
  ConsumerState<WorkoutScreen> createState() => _WorkoutScreenState();
}

class _WorkoutScreenState extends ConsumerState<WorkoutScreen> {
  Timer? _timer;
  int _restSeconds = 0;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final session = widget.state.session;
    if (session == null) return const _NoActiveWorkout();

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'TREINO ATUAL',
                    style: TextStyle(
                      color: Color(0xFF3157F6),
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 7),
                  Text(
                    session.name,
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                ],
              ),
            ),
            _ProgressRing(progress: session.progress),
          ],
        ),
        const SizedBox(height: 20),
        if (_restSeconds > 0) ...[
          _RestCard(seconds: _restSeconds, onSkip: _stopTimer),
          const SizedBox(height: 16),
        ],
        ...session.exercises.map(
          (exercise) => Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: _ExerciseCard(
              exercise: exercise,
              onAddSet: () => _addSet(exercise),
              onComplete: exercise.done
                  ? null
                  : () => _completeExercise(exercise),
            ),
          ),
        ),
        OutlinedButton.icon(
          onPressed: widget.state.pendingSync > 0
              ? () => ref.read(fitCoreControllerProvider.notifier).syncNow()
              : null,
          icon: const Icon(Icons.sync_rounded),
          label: Text(
            widget.state.pendingSync > 0
                ? 'Sincronizar agora'
                : 'Tudo sincronizado',
          ),
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: _finish,
          icon: const Icon(Icons.flag_rounded),
          label: const Text('Finalizar treino'),
        ),
      ],
    );
  }

  Future<void> _addSet(WorkoutExercise exercise) async {
    final reps = TextEditingController(
      text: exercise.targetReps == null
          ? ''
          : _numericHint(exercise.targetReps!),
    );
    final weight = TextEditingController();
    final rpe = TextEditingController();
    final result = await showDialog<WorkoutSetLog>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Registrar série • ${exercise.name}'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: reps,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Repetições'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: weight,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              decoration: const InputDecoration(
                labelText: 'Carga (kg) • opcional',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: rpe,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                labelText: 'Esforço da série (1–10) • opcional',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              final repsValue = int.tryParse(reps.text.trim());
              final rpeValue = int.tryParse(rpe.text.trim());
              if (repsValue == null || repsValue <= 0) return;
              Navigator.pop(
                context,
                WorkoutSetLog(
                  reps: repsValue,
                  weightKg: double.tryParse(
                    weight.text.trim().replaceAll(',', '.'),
                  ),
                  rpe: rpeValue?.clamp(1, 10),
                ),
              );
            },
            child: const Text('Salvar série'),
          ),
        ],
      ),
    );
    reps.dispose();
    weight.dispose();
    rpe.dispose();
    if (result == null || !mounted) return;
    await ref
        .read(fitCoreControllerProvider.notifier)
        .addSet(exercise.index, result);
    if (!mounted) return;
    _startTimer(exercise.restSeconds);
  }

  String _numericHint(String target) =>
      RegExp(r'\d+').firstMatch(target)?.group(0) ?? '';

  Future<void> _completeExercise(WorkoutExercise exercise) async {
    await ref
        .read(fitCoreControllerProvider.notifier)
        .completeExercise(exercise.index);
  }

  Future<void> _finish() async {
    double effort = 6;
    final value = await showModalBottomSheet<int>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  'Como foi o treino?',
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 8),
                const Text(
                  'Informe sua percepção geral de esforço.',
                  style: TextStyle(color: Color(0xFF667085)),
                ),
                const SizedBox(height: 22),
                Center(
                  child: Text(
                    '${effort.round()}/10',
                    style: const TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                Slider(
                  value: effort,
                  min: 1,
                  max: 10,
                  divisions: 9,
                  label: effort.round().toString(),
                  onChanged: (next) => setModalState(() => effort = next),
                ),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: () => Navigator.pop(context, effort.round()),
                  child: const Text('Concluir treino'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
    if (value == null || !mounted) return;
    await ref.read(fitCoreControllerProvider.notifier).finishWorkout(value);
  }

  void _startTimer(int seconds) {
    _timer?.cancel();
    setState(() => _restSeconds = seconds.clamp(15, 600));
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return timer.cancel();
      if (_restSeconds <= 1) {
        timer.cancel();
        setState(() => _restSeconds = 0);
      } else {
        setState(() => _restSeconds -= 1);
      }
    });
  }

  void _stopTimer() {
    _timer?.cancel();
    setState(() => _restSeconds = 0);
  }
}

class _ExerciseCard extends StatelessWidget {
  const _ExerciseCard({
    required this.exercise,
    required this.onAddSet,
    required this.onComplete,
  });
  final WorkoutExercise exercise;
  final VoidCallback onAddSet;
  final VoidCallback? onComplete;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: exercise.done
                      ? const Color(0xFFECFDF3)
                      : const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: exercise.done
                    ? const Icon(Icons.check_rounded, color: Color(0xFF027A48))
                    : Text(
                        '${exercise.index + 1}',
                        style: const TextStyle(
                          color: Color(0xFF3157F6),
                          fontWeight: FontWeight.w900,
                        ),
                      ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      exercise.name,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      _targetText(exercise),
                      style: const TextStyle(color: Color(0xFF667085)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (exercise.logs.isNotEmpty) ...[
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: exercise.logs
                  .asMap()
                  .entries
                  .map((entry) => _SetPill(index: entry.key, log: entry.value))
                  .toList(),
            ),
          ],
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: exercise.done ? null : onAddSet,
                  icon: const Icon(Icons.add_rounded),
                  label: const Text('Registrar série'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: FilledButton.icon(
                  onPressed: onComplete,
                  icon: Icon(
                    exercise.done
                        ? Icons.check_rounded
                        : Icons.done_all_rounded,
                  ),
                  label: Text(exercise.done ? 'Concluído' : 'Concluir'),
                ),
              ),
            ],
          ),
        ],
      ),
    ),
  );

  static String _targetText(WorkoutExercise exercise) {
    final values = <String>[];
    if (exercise.targetSets != null) {
      values.add('${exercise.targetSets} séries');
    }
    if (exercise.targetReps != null) values.add('${exercise.targetReps} reps');
    return values.isEmpty
        ? 'Siga a orientação do seu professor'
        : values.join(' • ');
  }
}

class _SetPill extends StatelessWidget {
  const _SetPill({required this.index, required this.log});
  final int index;
  final WorkoutSetLog log;

  @override
  Widget build(BuildContext context) {
    final weight = log.weightKg == null
        ? ''
        : ' • ${log.weightKg!.toStringAsFixed(log.weightKg! % 1 == 0 ? 0 : 1)} kg';
    final rpe = log.rpe == null ? '' : ' • RPE ${log.rpe}';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF2F4F7),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Text(
        '${index + 1}ª • ${log.reps} reps$weight$rpe',
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class _RestCard extends StatelessWidget {
  const _RestCard({required this.seconds, required this.onSkip});
  final int seconds;
  final VoidCallback onSkip;
  @override
  Widget build(BuildContext context) {
    final minutes = seconds ~/ 60;
    final remainder = (seconds % 60).toString().padLeft(2, '0');
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: const Color(0xFF111827),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Row(
        children: [
          const Icon(Icons.timer_outlined, color: Color(0xFFB9C6FF), size: 30),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'DESCANSO',
                  style: TextStyle(
                    color: Color(0xFFB9C6FF),
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  '$minutes:$remainder',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 28,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ),
          TextButton(onPressed: onSkip, child: const Text('Pular')),
        ],
      ),
    );
  }
}

class _ProgressRing extends StatelessWidget {
  const _ProgressRing({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) => SizedBox(
    width: 60,
    height: 60,
    child: Stack(
      alignment: Alignment.center,
      children: [
        CircularProgressIndicator(
          value: progress,
          strokeWidth: 6,
          backgroundColor: const Color(0xFFE4E7EC),
          strokeCap: StrokeCap.round,
        ),
        Text(
          '${(progress * 100).round()}%',
          style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w800),
        ),
      ],
    ),
  );
}

class _NoActiveWorkout extends ConsumerWidget {
  const _NoActiveWorkout();

  @override
  Widget build(BuildContext context, WidgetRef ref) => Center(
    child: Padding(
      padding: const EdgeInsets.all(28),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(
            Icons.fitness_center_rounded,
            size: 58,
            color: Color(0xFF98A2B3),
          ),
          const SizedBox(height: 16),
          Text(
            'Nenhum treino em andamento',
            style: Theme.of(context).textTheme.headlineSmall,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          const Text(
            'Abra a aba Hoje e escolha um treino aprovado para começar.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF667085)),
          ),
          const SizedBox(height: 20),
          FilledButton(
            onPressed: () =>
                ref.read(fitCoreControllerProvider.notifier).selectTab(0),
            child: const Text('Ver treinos'),
          ),
        ],
      ),
    ),
  );
}
