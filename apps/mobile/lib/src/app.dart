import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/providers.dart';
import 'core/theme.dart';
import 'features/auth/login_screen.dart';
import 'features/shell/app_shell.dart';

class FitCoreApp extends ConsumerWidget {
  const FitCoreApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final appState = ref.watch(fitCoreControllerProvider);
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'FitCore',
      theme: FitCoreTheme.light(),
      home: appState.when(
        loading: () => const _StartupScreen(),
        error: (error, _) => LoginScreen(errorMessage: error.toString()),
        data: (value) =>
            value.user == null ? const LoginScreen() : AppShell(state: value),
      ),
    );
  }
}

class _StartupScreen extends StatelessWidget {
  const _StartupScreen();

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          _FitCoreMark(),
          SizedBox(height: 24),
          SizedBox(
            width: 28,
            height: 28,
            child: CircularProgressIndicator(strokeWidth: 3),
          ),
        ],
      ),
    ),
  );
}

class _FitCoreMark extends StatelessWidget {
  const _FitCoreMark();

  @override
  Widget build(BuildContext context) => Container(
    width: 72,
    height: 72,
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(24),
      gradient: const LinearGradient(
        colors: [Color(0xFF3157F6), Color(0xFF6C4DFF)],
      ),
    ),
    child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 38),
  );
}
