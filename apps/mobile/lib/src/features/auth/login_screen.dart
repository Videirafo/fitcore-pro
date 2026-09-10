import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key, this.errorMessage});
  final String? errorMessage;

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _identifier = TextEditingController();
  final _secret = TextEditingController();
  final _tenant = TextEditingController(text: 'demo');
  bool _obscure = true;

  @override
  void dispose() {
    _identifier.dispose();
    _secret.dispose();
    _tenant.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final loading = ref.watch(fitCoreControllerProvider).isLoading;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 460),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _LoginBrand(),
                  const SizedBox(height: 38),
                  Text(
                    'Seu treino, sem atrito.',
                    style: Theme.of(context).textTheme.displaySmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Entre para acessar treinos aprovados, registrar sua execução e acompanhar sua evolução.',
                    style: TextStyle(
                      color: Colors.blueGrey.shade600,
                      height: 1.5,
                    ),
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: _identifier,
                    textInputAction: TextInputAction.next,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                      labelText: 'E-mail ou identificador',
                      prefixIcon: Icon(Icons.person_outline_rounded),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _secret,
                    obscureText: _obscure,
                    textInputAction: TextInputAction.next,
                    decoration: InputDecoration(
                      labelText: 'Senha ou código de acesso',
                      prefixIcon: const Icon(Icons.lock_outline_rounded),
                      suffixIcon: IconButton(
                        onPressed: () => setState(() => _obscure = !_obscure),
                        icon: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _tenant,
                    textInputAction: TextInputAction.done,
                    decoration: const InputDecoration(
                      labelText: 'Unidade',
                      prefixIcon: Icon(Icons.apartment_rounded),
                    ),
                    onSubmitted: (_) => _submit(),
                  ),
                  if (widget.errorMessage != null) ...[
                    const SizedBox(height: 14),
                    _ErrorBox(message: _friendlyError(widget.errorMessage!)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton.icon(
                    onPressed: loading ? null : _submit,
                    icon: loading
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white,
                            ),
                          )
                        : const Icon(Icons.arrow_forward_rounded),
                    label: Text(loading ? 'Entrando...' : 'Entrar no FitCore'),
                  ),
                  const SizedBox(height: 18),
                  const Text(
                    'O acesso usa a mesma conta segura do FitCore. Seus dados de treino permanecem disponíveis no aparelho quando a conexão oscilar.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 12,
                      height: 1.45,
                      color: Color(0xFF667085),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (_identifier.text.trim().isEmpty || _secret.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Preencha seu acesso para continuar.')),
      );
      return;
    }
    await ref
        .read(fitCoreControllerProvider.notifier)
        .login(_identifier.text.trim(), _secret.text, _tenant.text.trim());
  }

  String _friendlyError(String raw) {
    if (raw.contains('credencial_invalida') ||
        raw.toLowerCase().contains('inválido')) {
      return 'Acesso não reconhecido. Confira o identificador, a senha e a unidade.';
    }
    return 'Não foi possível entrar agora. Confira sua conexão e tente novamente.';
  }
}

class _LoginBrand extends StatelessWidget {
  const _LoginBrand();

  @override
  Widget build(BuildContext context) => Row(
    children: [
      Container(
        width: 50,
        height: 50,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(17),
          gradient: const LinearGradient(
            colors: [Color(0xFF3157F6), Color(0xFF6C4DFF)],
          ),
        ),
        child: const Icon(Icons.bolt_rounded, color: Colors.white, size: 28),
      ),
      const SizedBox(width: 12),
      const Text(
        'FitCore',
        style: TextStyle(
          fontSize: 25,
          fontWeight: FontWeight.w900,
          letterSpacing: -1,
        ),
      ),
    ],
  );
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color: const Color(0xFFFFF1F0),
      borderRadius: BorderRadius.circular(16),
    ),
    child: Row(
      children: [
        const Icon(Icons.error_outline_rounded, color: Color(0xFFB42318)),
        const SizedBox(width: 10),
        Expanded(
          child: Text(
            message,
            style: const TextStyle(color: Color(0xFF912018), height: 1.35),
          ),
        ),
      ],
    ),
  );
}
