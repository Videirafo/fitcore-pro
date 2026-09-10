import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key, required this.state});

  final FitCoreState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = state.user;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
      children: [
        Text('Perfil', style: Theme.of(context).textTheme.displaySmall),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 28,
                  backgroundColor: const Color(0xFFEEF2FF),
                  child: Text(
                    _initials(user?.name),
                    style: const TextStyle(
                      color: Color(0xFF3157F6),
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.name ?? 'Atleta',
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _roleLabel(user?.role),
                        style: const TextStyle(color: Color(0xFF667085)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 14),
        _InfoTile(
          icon: state.pendingSync > 0
              ? Icons.cloud_upload_outlined
              : Icons.cloud_done_outlined,
          title: state.pendingSync > 0
              ? 'Sincronização pendente'
              : 'Dados sincronizados',
          subtitle: state.pendingSync > 0
              ? '${state.pendingSync} alteração${state.pendingSync == 1 ? '' : 'ões'} aguardando conexão.'
              : 'Seu treino local está alinhado ao FitCore.',
        ),
        const SizedBox(height: 10),
        const _InfoTile(
          icon: Icons.shield_outlined,
          title: 'Sessão segura',
          subtitle: 'O aplicativo usa a autenticação canônica do FitCore e não cria uma conta paralela.',
        ),
        const SizedBox(height: 18),
        if (state.pendingSync > 0)
          OutlinedButton.icon(
            onPressed: () =>
                ref.read(fitCoreControllerProvider.notifier).syncNow(),
            icon: const Icon(Icons.sync_rounded),
            label: const Text('Sincronizar agora'),
          ),
        const SizedBox(height: 10),
        FilledButton.tonalIcon(
          onPressed: () =>
              ref.read(fitCoreControllerProvider.notifier).logout(),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Sair da conta'),
        ),
      ],
    );
  }

  static String _initials(String? name) {
    final parts = (name ?? '')
        .trim()
        .split(RegExp(r'\s+'))
        .where((item) => item.isNotEmpty)
        .toList();
    if (parts.isEmpty) return 'FC';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return '${parts.first.characters.first}${parts.last.characters.first}'
        .toUpperCase();
  }

  static String _roleLabel(String? role) {
    switch ((role ?? '').toLowerCase()) {
      case 'gestor':
        return 'Gestor';
      case 'professor':
        return 'Professor';
      default:
        return 'Aluno';
    }
  }
}

class _InfoTile extends StatelessWidget {
  const _InfoTile({
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  final IconData icon;
  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) => Card(
    child: ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 10),
      leading: Container(
        width: 46,
        height: 46,
        decoration: BoxDecoration(
          color: const Color(0xFFEEF2FF),
          borderRadius: BorderRadius.circular(15),
        ),
        child: Icon(icon, color: const Color(0xFF3157F6)),
      ),
      title: Text(title, style: const TextStyle(fontWeight: FontWeight.w800)),
      subtitle: Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(subtitle, style: const TextStyle(height: 1.35)),
      ),
    ),
  );
}
