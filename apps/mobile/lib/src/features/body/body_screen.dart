import 'package:flutter/material.dart';

class BodyScreen extends StatefulWidget {
  const BodyScreen({super.key});

  @override
  State<BodyScreen> createState() => _BodyScreenState();
}

class _BodyScreenState extends State<BodyScreen> {
  bool front = true;
  String selected = 'Peito';

  static const frontGroups = [
    'Peito',
    'Ombros',
    'Bíceps',
    'Abdômen',
    'Quadríceps',
  ];
  static const backGroups = [
    'Costas',
    'Tríceps',
    'Glúteos',
    'Posterior',
    'Panturrilhas',
  ];
  @override
  Widget build(BuildContext context) {
    final groups = front ? frontGroups : backGroups;
    if (!groups.contains(selected)) selected = groups.first;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 36),
      children: [
        Text('Mapa corporal', style: Theme.of(context).textTheme.displaySmall),
        const SizedBox(height: 8),
        const Text(
          'Explore regiões musculares sem estimativas artificiais. O FitCore mostra dados quando eles existem no seu treino.',
          style: TextStyle(color: Color(0xFF667085), height: 1.45),
        ),
        const SizedBox(height: 22),
        SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: true, label: Text('Frente')),
            ButtonSegment(value: false, label: Text('Costas')),
          ],
          selected: {front},
          onSelectionChanged: (value) => setState(() {
            front = value.first;
            selected = (front ? frontGroups : backGroups).first;
          }),
        ),
        const SizedBox(height: 18),
        Card(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
            child: Column(
              children: [
                SizedBox(
                  height: 310,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      const Icon(
                        Icons.accessibility_new_rounded,
                        size: 275,
                        color: Color(0xFFD0D5DD),
                      ),
                      _BodyLabel(
                        label: groups[0],
                        top: 70,
                        selected: selected == groups[0],
                        onTap: _select,
                      ),
                      _BodyLabel(
                        label: groups[1],
                        top: 115,
                        selected: selected == groups[1],
                        onTap: _select,
                      ),
                      _BodyLabel(
                        label: groups[2],
                        top: 155,
                        selected: selected == groups[2],
                        onTap: _select,
                      ),
                      _BodyLabel(
                        label: groups[3],
                        top: 205,
                        selected: selected == groups[3],
                        onTap: _select,
                      ),
                      _BodyLabel(
                        label: groups[4],
                        top: 250,
                        selected: selected == groups[4],
                        onTap: _select,
                      ),
                    ],
                  ),
                ),
                const Divider(height: 30),
                Text(
                  selected,
                  style: Theme.of(context).textTheme.headlineSmall,
                ),
                const SizedBox(height: 7),
                const Text(
                  'Selecione uma região para navegar. Exercícios e volume aparecem aqui somente quando houver dados reais vinculados.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Color(0xFF667085), height: 1.4),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _select(String value) => setState(() => selected = value);
}

class _BodyLabel extends StatelessWidget {
  const _BodyLabel({
    required this.label,
    required this.top,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final double top;
  final bool selected;
  final ValueChanged<String> onTap;

  @override
  Widget build(BuildContext context) => Positioned(
    top: top,
    child: InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () => onTap(label),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF3157F6) : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? const Color(0xFF3157F6) : const Color(0xFFD0D5DD),
          ),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 12,
              offset: Offset(0, 4),
            ),
          ],
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : const Color(0xFF344054),
            fontSize: 12,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
    ),
  );
}
