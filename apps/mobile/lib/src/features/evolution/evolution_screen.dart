import 'package:flutter/material.dart';

import '../../domain/models.dart';

class EvolutionScreen extends StatelessWidget {
  const EvolutionScreen({super.key, required this.summary});

  final EvolutionSummary? summary;

  @override
  Widget build(BuildContext context) {
    final data = summary;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
      children: [
        Text('Evolução', style: Theme.of(context).textTheme.displaySmall),
        const SizedBox(height: 8),
        const Text(
          'Indicadores calculados somente a partir das execuções registradas no FitCore.',
          style: TextStyle(color: Color(0xFF667085), height: 1.45),
        ),
        const SizedBox(height: 22),
        if (data == null)
          const _NoEvolutionData()
        else ...[
          _HeroCard(summary: data),
          const SizedBox(height: 16),
          _MetricsGrid(summary: data),
        ],
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.summary});

  final EvolutionSummary summary;

  @override
  Widget build(BuildContext context) => Container(
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
        const Text(
          'CONSISTÊNCIA RECENTE',
          style: TextStyle(
            color: Color(0xFFB9C6FF),
            fontWeight: FontWeight.w800,
          ),
        ),
        const SizedBox(height: 12),
        Text(
          '${summary.weekly} treino${summary.weekly == 1 ? '' : 's'} nos últimos 7 dias',
          style: const TextStyle(
            color: Colors.white,
            fontSize: 28,
            fontWeight: FontWeight.w900,
          ),
        ),
        const SizedBox(height: 8),
        const Text(
          'Frequência baseada no histórico real de execuções.',
          style: TextStyle(color: Color(0xFFD0D5DD)),
        ),
      ],
    ),
  );
}

class _MetricsGrid extends StatelessWidget {
  const _MetricsGrid({required this.summary});

  final EvolutionSummary summary;

  @override
  Widget build(BuildContext context) => GridView.count(
    crossAxisCount: 2,
    shrinkWrap: true,
    physics: const NeverScrollableScrollPhysics(),
    crossAxisSpacing: 12,
    mainAxisSpacing: 12,
    childAspectRatio: 1.25,
    children: [
      _MetricCard(
        label: 'Execuções',
        value: '${summary.total}',
        icon: Icons.history_rounded,
      ),
      _MetricCard(
        label: 'Concluídas',
        value: '${summary.completed}',
        icon: Icons.check_circle_outline_rounded,
      ),
      _MetricCard(
        label: 'Esforço médio',
        value: summary.averageEffort == null
            ? '—'
            : '${summary.averageEffort!.toStringAsFixed(1)}/10',
        icon: Icons.speed_rounded,
      ),
      _MetricCard(
        label: 'Duração média',
        value: summary.averageDuration == null
            ? '—'
            : '${summary.averageDuration!.round()} min',
        icon: Icons.timer_outlined,
      ),
    ],
  );
}

class _MetricCard extends StatelessWidget {
  const _MetricCard({
    required this.label,
    required this.value,
    required this.icon,
  });
  final String label;
  final String value;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, color: const Color(0xFF3157F6)),
          Text(
            value,
            style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w900),
          ),
          Text(
            label,
            style: const TextStyle(
              color: Color(0xFF667085),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    ),
  );
}

class _NoEvolutionData extends StatelessWidget {
  const _NoEvolutionData();

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          const Icon(
            Icons.insights_outlined,
            size: 44,
            color: Color(0xFF98A2B3),
          ),
          const SizedBox(height: 12),
          Text(
            'Ainda sem histórico',
            style: Theme.of(context).textTheme.titleLarge,
          ),
          const SizedBox(height: 8),
          const Text(
            'Conclua seu primeiro treino para começar a construir sua evolução.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Color(0xFF667085)),
          ),
        ],
      ),
    ),
  );
}
