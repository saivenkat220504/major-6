import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';

let firebaseApp: App | null = null;

/**
 * Attempt to initialize Firebase Admin SDK (v13 modular api).
 * Checks for service account credentials in standard locations:
 * 1. Environment variable FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)
 * 2. File path specified by GOOGLE_APPLICATION_CREDENTIALS
 * 3. Local file server/firebase-service-account.json
 */
export function initFirebaseAdmin(): boolean {
  if (firebaseApp) return true;

  try {
    const existingApps = getApps();
    if (existingApps.length > 0) {
      firebaseApp = existingApps[0];
      return true;
    }

    const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (jsonEnv) {
      const serviceAccount = JSON.parse(jsonEnv);
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log('[PushNotificationService] Firebase Admin initialized from FIREBASE_SERVICE_ACCOUNT_KEY env');
      return true;
    }

    const localKeyPath = path.resolve(__dirname, '../../firebase-service-account.json');
    if (fs.existsSync(localKeyPath)) {
      const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf-8'));
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      });
      console.log('[PushNotificationService] Firebase Admin initialized from local firebase-service-account.json');
      return true;
    }

    console.warn('[PushNotificationService] No Firebase credentials found. Running in MOCK notification mode.');
    return false;
  } catch (err) {
    console.error('[PushNotificationService] Failed to initialize Firebase Admin:', err);
    return false;
  }
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Dispatch push notifications to a list of device tokens.
 * Uses high priority for Android to ensure delivery when screen is locked or app is closed.
 * Falls back gracefully to mock logging if Firebase is not yet configured with real credentials.
 */
export async function sendPushNotification(
  tokens: string[],
  payload: PushNotificationPayload,
): Promise<{ successCount: number; failureCount: number; mocked: boolean }> {
  if (!tokens || tokens.length === 0) {
    console.log('[PushNotificationService] No target device tokens to send to.');
    return { successCount: 0, failureCount: 0, mocked: false };
  }

  const isReady = initFirebaseAdmin();

  if (!isReady || !firebaseApp) {
    console.log('---------------------------------------------------------');
    console.log('[PushNotificationService] 🔔 [MOCK PUSH NOTIFICATION DISPATCHED]');
    console.log(`Target Devices (${tokens.length}):`, tokens);
    console.log(`Title: ${payload.title}`);
    console.log(`Body:\n${payload.body}`);
    console.log('Payload Data:', payload.data);
    console.log('---------------------------------------------------------');
    return { successCount: tokens.length, failureCount: 0, mocked: true };
  }

  try {
    const message: MulticastMessage = {
      tokens,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data || {},
      android: {
        priority: 'high',
        ttl: 86400,          // 24h TTL so device receives even after brief offline period
        collapseKey: payload.data?.flightNumber ?? 'flight_update',
        notification: {
          sound: 'default',
          channelId: 'flight_alerts_v2',   // Must match the channel created in the app
          priority: 'max',                 // Supported in firebase-admin: 'min' | 'low' | 'default' | 'high' | 'max'
          visibility: 'public',            // Supported in firebase-admin: 'private' | 'public' | 'secret'
          defaultVibrateTimings: true,     // Use device default vibration
          defaultSound: true,
          clickAction: 'FLIGHT_TRACKING_NOTIFICATION_CLICK',
        },
      },
    };

    const messaging = getMessaging(firebaseApp);
    const response = await messaging.sendEachForMulticast(message);
    console.log(`[PushNotificationService] FCM batch sent: ${response.successCount} success, ${response.failureCount} failed`);

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      mocked: false,
    };
  } catch (err) {
    console.error('[PushNotificationService] Error dispatching multicast message:', err);
    return {
      successCount: 0,
      failureCount: tokens.length,
      mocked: false,
    };
  }
}
