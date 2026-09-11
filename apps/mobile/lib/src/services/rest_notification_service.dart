import 'dart:io';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/timezone.dart' as tz;

class RestNotificationService {
  RestNotificationService({FlutterLocalNotificationsPlugin? plugin})
    : _plugin = plugin ?? FlutterLocalNotificationsPlugin();

  static const _notificationId = 4501;
  static const _channelId = 'fitcore_rest_timer';
  final FlutterLocalNotificationsPlugin _plugin;
  bool _permissionRequested = false;

  Future<void> initialize() async {
    const android = AndroidInitializationSettings('ic_stat_fitcore');
    const ios = IOSInitializationSettings(
      requestAlertPermission: false,
      requestBadgePermission: false,
      requestSoundPermission: false,
    );
    const settings = InitializationSettings(android: android, iOS: ios);
    await _plugin.initialize(settings: settings);
  }

  Future<void> scheduleRestComplete({
    required Duration duration,
    required String exerciseName,
  }) async {
    await _ensurePermission();
    await cancelRest();
    await _plugin.zonedSchedule(
      id: _notificationId,
      title: 'Descanso concluído',
      body:
          'Hora de continuar${exerciseName.isEmpty ? '' : ' • $exerciseName'}.',
      scheduledDate: tz.TZDateTime.now(tz.UTC).add(duration),
      notificationDetails: const NotificationDetails(
        android: AndroidNotificationDetails(
          _channelId,
          'Timer de descanso',
          channelDescription: 'Avisos quando o intervalo entre séries termina.',
          importance: Importance.high,
          priority: Priority.high,
          icon: 'ic_stat_fitcore',
        ),
        iOS: DarwinNotificationDetails(presentAlert: true, presentSound: true),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      payload: 'rest_complete',
    );
  }

  Future<void> cancelRest() => _plugin.cancel(id: _notificationId);

  Future<void> _ensurePermission() async {
    if (_permissionRequested) return;
    _permissionRequested = true;
    if (Platform.isAndroid) {
      await _plugin
          .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin
          >()
          ?.requestNotificationsPermission();
      return;
    }
    if (Platform.isIOS) {
      await _plugin
          .resolvePlatformSpecificImplementation<
            IOSFlutterLocalNotificationsPlugin
          >()
          ?.requestPermissions(alert: true, badge: false, sound: true);
    }
  }
}
