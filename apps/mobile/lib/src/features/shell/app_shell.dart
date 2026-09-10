import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../body/body_screen.dart';
import '../evolution/evolution_screen.dart';
import '../profile/profile_screen.dart';
import '../today/today_screen.dart';
import '../workout/workout_screen.dart';

class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.state});
  final FitCoreState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pages = [
      TodayScreen(state: state),
      WorkoutScreen(state: state),
      const BodyScreen(),
      EvolutionScreen(summary: state.evolution),
      ProfileScreen(state: state),
    ];
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _StatusBar(state: state),
            Expanded(
              child: IndexedStack(index: state.tabIndex, children: pages),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: state.tabIndex,
        onDestinationSelected: ref
            .read(fitCoreControllerProvider.notifier)
            .selectTab,
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home_rounded),
            label: 'Hoje',
          ),
          NavigationDestination(
            icon: Icon(Icons.fitness_center_outlined),
            selectedIcon: Icon(Icons.fitness_center_rounded),
            label: 'Treino',
          ),
          NavigationDestination(
            icon: Icon(Icons.accessibility_new_outlined),
            selectedIcon: Icon(Icons.accessibility_new_rounded),
            label: 'Corpo',
          ),
          NavigationDestination(
            icon: Icon(Icons.show_chart_rounded),
            selectedIcon: Icon(Icons.insights_rounded),
            label: 'Evolução',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Perfil',
          ),
        ],
      ),
    );
  }
}

class _StatusBar extends ConsumerWidget {
  const _StatusBar({required this.state});
  final FitCoreState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) => Padding(
    padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
    child: Row(
      children: [
        Container(
          width: 38,
          height: 38,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(13),
            gradient: const LinearGradient(
              colors: [Color(0xFF3157F6), Color(0xFF6C4DFF)],
            ),
          ),
          child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 22),
        ),
        const SizedBox(width: 10),
        const Text(
          'FitCore',
          style: TextStyle(
            fontSize: 20,
            fontWeight: FontWeight.w900,
            letterSpacing: -0.8,
          ),
        ),
        const Spacer(),
        if (state.pendingSync > 0)
          ActionChip(
            avatar: const Icon(Icons.cloud_upload_outlined, size: 17),
            label: Text(
              '${state.pendingSync} pendente${state.pendingSync == 1 ? '' : 's'}',
            ),
            onPressed: () =>
                ref.read(fitCoreControllerProvider.notifier).syncNow(),
          )
        else
          const Chip(
            avatar: Icon(Icons.cloud_done_outlined, size: 17),
            label: Text('Sincronizado'),
            side: BorderSide.none,
          ),
      ],
    ),
  );
}
