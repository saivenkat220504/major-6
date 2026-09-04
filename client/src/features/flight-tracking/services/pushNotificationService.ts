import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

const SERVER_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD ? 'https://major-6-o85h.onrender.com' : '');

/**
 * Initialize Push Notifications on Android native device.
 * Requests notification permissions, acquires FCM token, registers with server,
 * and sets up local notification listeners.
 */
export async function initializePushNotifications(flightNumber = 'AI-102'): Promise<string | null> {
  // Push notifications only run natively on Android/iOS via Capacitor
  if (!Capacitor.isNativePlatform()) {
    console.log('[PushService] Web platform detected. Native FCM registration is skipped.');
    return null;
  }

  try {
    // 1. Check & request notification permission
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === 'prompt') {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== 'granted') {
      console.warn('[PushService] User denied push notification permissions.');
      return null;
    }

    // 2. Create notification channel for Android (Oreo+).
    //    Use channel ID 'flight_alerts_v2' — Android ignores importance UPGRADES
    //    on existing channels, so a new ID forces creation of a fresh
    //    IMPORTANCE_HIGH channel with sound + vibration + heads-up banners.
    await PushNotifications.createChannel({
      id: 'flight_alerts_v2',
      name: 'Flight Alerts',
      description: 'Real-time gate and terminal change alerts for your flight',
      importance: 5, // IMPORTANCE_HIGH — shows heads-up, plays sound, vibrates
      visibility: 1, // VISIBILITY_PUBLIC — shows on lock screen
      sound: 'default',
      vibration: true,
    });

    // 3. Register with Google FCM / Apple APNS
    await PushNotifications.register();

    // 4. Listen for token registration
    return new Promise((resolve) => {
      PushNotifications.addListener('registration', async (token: Token) => {
        console.log('[PushService] Device push token received:', token.value);

        // Send token to server
        try {
          const endpoint = `${SERVER_BASE}/api/flight-info/register-device`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              token: token.value,
              flightNumber,
              platform: 'android',
            }),
          });
          const data = await res.json();
          console.log('[PushService] Server token registration response:', data);
        } catch (postErr) {
          console.error('[PushService] Failed to send push token to server:', postErr);
        }

        resolve(token.value);
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('[PushService] Push registration error:', error);
        resolve(null);
      });

      // Handle notification clicks (e.g. when app was in background or closed)
      PushNotifications.addListener('actionPerformed', (action: ActionPerformed) => {
        console.log('[PushService] Notification action clicked:', action.notification);
        // Can route to /flight-tracking or display notification detail
      });
    });
  } catch (err) {
    console.error('[PushService] Error during push notification initialization:', err);
    return null;
  }
}
