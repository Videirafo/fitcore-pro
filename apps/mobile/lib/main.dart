import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app.dart';
import 'src/core/providers.dart';
import 'src/data/fitcore_api.dart';
import 'src/data/local_store.dart';
import 'src/data/workout_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = await LocalWorkoutStore.create();
  final api = FitCoreApi(store: store);
  final repository = WorkoutRepository(store: store, remote: api);
  runApp(
    ProviderScope(
      overrides: [workoutRepositoryProvider.overrideWithValue(repository)],
      child: const FitCoreApp(),
    ),
  );
}
