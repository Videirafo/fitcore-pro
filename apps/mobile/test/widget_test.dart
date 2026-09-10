import 'package:fitcore_mobile/src/features/body/body_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('body map alternates front and back muscle groups', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: BodyScreen())));

    expect(find.text('Mapa corporal'), findsOneWidget);
    expect(find.text('Peito'), findsWidgets);
    expect(find.text('Costas'), findsOneWidget);

    await tester.tap(find.text('Costas'));
    await tester.pumpAndSettle();

    expect(find.text('Glúteos'), findsOneWidget);
    expect(find.text('Posterior'), findsOneWidget);
  });
}
