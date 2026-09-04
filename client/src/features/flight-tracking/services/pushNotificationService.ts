import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

const SERVER_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://major-6-o85h.onrender.com'
).replace(/\/$/, '');

const FCM_STORAGE_KEY = 'smart_airport_fcm_token';

/**
 * Send device token and flight mapping to the backend PostgreSQL database.
 */
export async function sendTokenRegistration(token: string, flightNumber: string): Promise<boolean> {
  if (!token || !flightNumber) return false;
  try {
    const endpoint = `${SERVER_BASE}/api/flight-info/register-device`;
    console.log(`[PushService] Registering token for flight ${flightNumber} at: ${endpoint}`);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        flightNumber: flightNumber.trim().toUpperCase(),
        platform: 'android',
      }),
    });
    const data = await res.json();
    console.log('[PushService] Server registration response:', data);
    return data.success === true;
  } catch (err) {
    console.error('[PushService] Failed to send push token to server:', err);
    return false;
  }
}

/**
 * Update the registered flight on the server using the existing cached FCM token.
 */
export async function registerFlightSubscription(flightNumber = 'AI-102'): Promise<boolean> {
  const cachedToken = localStorage.getItem(FCM_STORAGE_KEY);
  if (cachedToken) {
    return await sendTokenRegistration(cachedToken, flightNumber);
  }
  return false;
}

let isListenersConfigured = false;

/**
 * Initialize Push Notifications on Android native device.
 * Requests notification permissions, sets up the high-importance notification channel,
 * registers with FCM, and saves the token to PostgreSQL.
 */
export async function initializePushNotifications(flightNumber = 'AI-102'): Promise<string | null> {
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
      console.warn('[PushService] Notification permission was not granted:', permStatus.receive);
      return null;
    }

    // 2. Create notification channel for Android (Oreo+)
    // 'flight_alerts_v2' ensures high-importance heads-up banner with sound & vibration
    await PushNotifications.createChannel({
      id: 'flight_alerts_v2',
      name: 'Flight Alerts',
      description: 'Real-time gate and terminal change alerts for your flight',
      importance: 5, // IMPORTANCE_HIGH (heads-up banner, plays sound, vibrates)
      visibility: 1, // VISIBILITY_PUBLIC (shows on lock screen)
      sound: 'default',
      vibration: true,
    });

    // 3. If token is already cached, register with server immediately
    const cached = localStorage.getItem(FCM_STORAGE_KEY);
    if (cached) {
      sendTokenRegistration(cached, flightNumber).catch(() => {});
    }

    // 4. Setup listeners once
    if (!isListenersConfigured) {
      isListenersConfigured = true;

      PushNotifications.addListener('registration', async (token: Token) => {
        console.log('[PushService] FCM device token acquired:', token.value);
        localStorage.setItem(FCM_STORAGE_KEY, token.value);
        await sendTokenRegistration(token.value, flightNumber);
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('[PushService] FCM registration error:', error);
      });

      PushNotifications.addListener('actionPerformed', (action: ActionPerformed) => {
        console.log('[PushService] User clicked notification banner:', action.notification);
      });
    }

    // 5. Trigger native FCM registration
    await PushNotifications.register();

    return cached || null;
  } catch (err) {
    console.error('[PushService] Error during push notification initialization:', err);
    return null;
  }
}

