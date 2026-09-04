import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';

let firebaseApp: App | null = null;

/**
 * Helper to safely parse and validate a Firebase Admin Service Account JSON string.
 * Handles unescaping of newlines in private_key, base64 encoding, surrounding quotes,
 * and validates that project_id, client_email, and private_key exist.
 */
function parseAndValidateServiceAccount(raw: string): any | null {
  try {
    let text = raw.trim();
    if (!text) return null;

    // Strip wrapping quotes if added by environment variable configuration panels
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
      text = text.substring(1, text.length - 1).trim();
    }

    // Check if value is base64-encoded
    if (!text.startsWith('{') && /^[A-Za-z0-9+/=]+$/.test(text)) {
      try {
        const decoded = Buffer.from(text, 'base64').toString('utf-8').trim();
        if (decoded.startsWith('{')) {
          text = decoded;
        }
      } catch {
        // Not base64, continue with original text
      }
    }

    const obj = JSON.parse(text);

    // Check if client-side google-services.json was provided by mistake
    if (obj.project_info && !obj.private_key) {
      console.error(
        '[PushNotificationService] ⚠️ Detected client "google-services.json" format instead of Firebase Admin Service Account Private Key.'
      );
      console.error(
        '[PushNotificationService] ℹ️ Requirement: In Firebase Console -> Project Settings -> Service Accounts -> "Generate new private key". Paste that service-account JSON into FIREBASE_SERVICE_ACCOUNT_KEY on Render.'
      );
      return null;
    }

    // Fix escaped newlines in private_key if present
    if (typeof obj.private_key === 'string' && obj.private_key.includes('\\n')) {
      obj.private_key = obj.private_key.replace(/\\n/g, '\n');
    }

    // Validate required fields for Firebase Admin SDK cert()
    if (!obj.project_id || typeof obj.project_id !== 'string') {
      console.error('[PushNotificationService] Service account validation failed: missing string "project_id".');
      return null;
    }

    if (!obj.client_email || typeof obj.client_email !== 'string') {
      console.error('[PushNotificationService] Service account validation failed: missing string "client_email".');
      return null;
    }

    if (!obj.private_key || typeof obj.private_key !== 'string') {
      console.error('[PushNotificationService] Service account validation failed: missing string "private_key".');
      return null;
    }

    return obj;
  } catch (err: any) {
    console.error('[PushNotificationService] JSON parse error on FIREBASE_SERVICE_ACCOUNT_KEY:', err.message);
    return null;
  }
}

/**
 * Attempt to initialize Firebase Admin SDK (v13 modular api).
 * Checks for service account credentials in standard locations:
 * 1. Environment variable FIREBASE_SERVICE_ACCOUNT_KEY (JSON string or base64)
 * 2. File path specified by GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_PATH
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

    // 1. Check environment variable FIREBASE_SERVICE_ACCOUNT_KEY
    const jsonEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (jsonEnv) {
      const serviceAccount = parseAndValidateServiceAccount(jsonEnv);
      if (serviceAccount) {
        firebaseApp = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log(`[PushNotificationService] ✅ Firebase Admin initialized successfully for project: ${serviceAccount.project_id}`);
        return true;
      }
    }

    // 2. Check GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT_PATH file path
    const envPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (envPath && fs.existsSync(envPath)) {
      const fileContent = fs.readFileSync(envPath, 'utf-8');
      const serviceAccount = parseAndValidateServiceAccount(fileContent);
      if (serviceAccount) {
        firebaseApp = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log(`[PushNotificationService] ✅ Firebase Admin initialized from credentials file (${serviceAccount.project_id})`);
        return true;
      }
    }

    // 3. Check local file
    const localKeyPath = path.resolve(__dirname, '../../firebase-service-account.json');
    if (fs.existsSync(localKeyPath)) {
      const fileContent = fs.readFileSync(localKeyPath, 'utf-8');
      const serviceAccount = parseAndValidateServiceAccount(fileContent);
      if (serviceAccount) {
        firebaseApp = initializeApp({
          credential: cert(serviceAccount),
        });
        console.log(`[PushNotificationService] ✅ Firebase Admin initialized from local firebase-service-account.json (${serviceAccount.project_id})`);
        return true;
      }
    }

    console.warn('[PushNotificationService] ⚠️ No valid Firebase Admin credentials found. Server operating in mock notification mode.');
    return false;
  } catch (err: any) {
    console.error('[PushNotificationService] Failed to initialize Firebase Admin:', err.message);
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
