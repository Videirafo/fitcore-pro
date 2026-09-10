import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../domain/models.dart';

class TodayScreen extends ConsumerWidget {
  const TodayScreen({super.key, required this.state});
  final FitCoreState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final approved = state.workouts.where((item) => item.approved).toList();
    return RefreshIndicator(
      onRefresh: ref.read(fitCoreControllerProvider.notifier).refresh,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 32),
        children: [
          Text(
            'Olá, ${_firstName(state.user?.name)}',
            style: Theme.of(context).textTheme.displaySmall,
          ),
          const SizedBox(height: 8),
          Text(
            state.session == null
                ? 'Seu próximo treino começa aqui.'
                : 'Você tem um treino em andamento.',
            style: TextStyle(fontSize: 16, color: Colors.blueGrey.shade600),
          ),
          if (state.notice != null) ...[
            const SizedBox(height: 16),
            _Notice(text: state.notice!),
          ],
          const SizedBox(height: 24),
          if (state.session != null)
            _ActiveWorkoutCard(session: state.session!)
          else if (approved.isNotEmpty)
            _WorkoutHero(plan: approved.first)
          else
            const _EmptyWorkout(),
          const SizedBox(height: 24),
          Row(
            children: [
              Text(
                'Seus treinos',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const Spacer(),
              Text(
                '${approved.length} aprovado${approved.length == 1 ? '' : 's'}',
                style: const TextStyle(color: Color(0xFF667085)),
              ),
            ],
          ),
          const SizedBox(height: 14),
          if (approved.isEmpty)
            const Text(
              'Quando seu professor liberar um treino, ele aparecerá aqui automaticamente.',
            )
          else
            ...approved.map(
              (plan) => Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _PlanTile(
                  plan: plan,
                  activeWorkoutId: state.session?.workoutId,
                ),
              ),
            ),
        ],
      ),
    );
  }

  String _firstName(String? name) {
    final value = (name ?? '').trim();
    return value.isEmpty ? 'atleta' : value.split(RegExp(r'\s+')).first;
  }
}

class _WorkoutHero extends ConsumerWidget {
  const _WorkoutHero({required this.plan});
  final WorkoutPlan plan;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Container(
    padding: const EdgeInsets.all(22),
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(28),
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF111827), Color(0xFF293B78)],
      ),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Row(
          children: [
            Icon(Icons.auto_awesome_rounded, color: Color(0xFFB9C6FF)),
            SizedBox(width: 8),
            Text(
              'PRONTO PARA HOJE',
              style: TextStyle(
                color: Color(0xFFB9C6FF),
                fontWeight: FontWeight.w800,
                letterSpacing: 0.8,
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        Text(
          plan.name,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 30,
            height: 1,
            fontWeight: FontWeight.w900,
            letterSpacing: -1,
          ),
        ),
        if (plan.goal != null) ...[
          const SizedBox(height: 8),
          Text(
            plan.goal!,
            style: const TextStyle(color: Color(0xFFD0D5DD), fontSize: 15),
          ),
        ],
        const SizedBox(height: 22),
        Row(
          children: [
            _HeroMetric(
              icon: Icons.format_list_numbered_rounded,
              text: '${plan.exercises.length} exercícios',
            ),
            const SizedBox(width: 12),
            const _HeroMetric(
              icon: Icons.offline_bolt_outlined,
              text: 'Funciona offline',
            ),
          ],
        ),
        const SizedBox(height: 22),
        FilledButton.icon(
          style: FilledButton.styleFrom(
            backgroundColor: Colors.white,
            foregroundColor: const Color(0xFF111827),
          ),
          onPressed: () =>
              ref.read(fitCoreControllerProvider.notifier).startWorkout(plan),
          icon: const Icon(Icons.play_arrow_rounded),
          label: const Text('Iniciar treino'),
        ),
      ],
    ),
  );
}

class _ActiveWorkoutCard extends ConsumerWidget {
  const _ActiveWorkoutCard({required this.session});
  final WorkoutSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Card(
    child: Padding(
      padding: const EdgeInsets.all(22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'TREINO EM ANDAMENTO',
            style: TextStyle(
              color: Color(0xFF3157F6),
              fontWeight: FontWeight.w800,
              letterSpacing: 0.7,
            ),
          ),
          const SizedBox(height: 10),
          Text(session.name, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 16),
          LinearProgressIndicator(
            value: session.progress,
            minHeight: 9,
            borderRadius: BorderRadius.circular(20),
          ),
          const SizedBox(height: 9),
          Text(
            '${session.doneCount} de ${session.exercises.length} exercícios concluídos',
            style: const TextStyle(color: Color(0xFF667085)),
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: () =>
                ref.read(fitCoreControllerProvider.notifier).selectTab(1),
            icon: const Icon(Icons.arrow_forward_rounded),
            label: const Text('Continuar treino'),
          ),
        ],
      ),
    ),
  );
}

class _PlanTile extends ConsumerWidget {
  const _PlanTile({required this.plan, required this.activeWorkoutId});
  final WorkoutPlan plan;
  final String? activeWorkoutId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final active = activeWorkoutId == plan.id;
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 18,
          vertical: 10,
        ),
        leading: Container(
          width: 48,
          height: 48,
          decoration: BoxDecoration(
            color: const Color(0xFFEEF2FF),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(
            Icons.fitness_center_rounded,
            color: Color(0xFF3157F6),
          ),
        ),
        title: Text(
          plan.name,
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          '${plan.exercises.length} exercícios${plan.goal == null ? '' : ' • ${plan.goal}'}',
        ),
        trailing: Icon(
          active ? Icons.play_circle_fill_rounded : Icons.chevron_right_rounded,
          color: const Color(0xFF3157F6),
        ),
        onTap: active
            ? () => ref.read(fitCoreControllerProvider.notifier).selectTab(1)
            : () => ref
                  .read(fitCoreControllerProvider.notifier)
                  .startWorkout(plan),
      ),
    );
  }
}

class _HeroMetric extends StatelessWidget {
  const _HeroMetric({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Expanded(
    child: Row(
      children: [
        Icon(icon, color: const Color(0xFFD0D5DD), size: 18),
        const SizedBox(width: 7),
        Flexible(
          child: Text(
            text,
            style: const TextStyle(
              color: Color(0xFFE4E7EC),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    ),
  );
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text});
  final String text;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFECFDF3),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        const Icon(
          Icons.check_circle_outline_rounded,
          color: Color(0xFF027A48),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            text,
            style: const TextStyle(
              color: Color(0xFF05603A),
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    ),
  );
}

class _EmptyWorkout extends StatelessWidget {
  const _EmptyWorkout();
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Icon(
            Icons.event_available_outlined,
            size: 42,
            color: Color(0xFF667085),
          ),
          const SizedBox(height: 12),
          Text(
            'Nenhum treino liberado',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 7),
          const Text(
            'Seu professor ainda não publicou um treino aprovado para você.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF667085)),
          ),
        ],
      ),
    ),
  );
}
