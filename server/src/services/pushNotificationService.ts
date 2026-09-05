import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getMessaging, MulticastMessage } from 'firebase-admin/messaging';
import path from 'path';
import fs from 'fs';

let firebaseApp: App | null = null;

function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

let credentialsConfiguredButInvalid = false;

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

    // Detect and reject client-side google-services.json format
    if (obj.project_info && !obj.private_key) {
      console.error(
        '[PushNotificationService] ❌ Detected client "google-services.json" format in FIREBASE_SERVICE_ACCOUNT_KEY instead of Firebase Admin Service Account Private Key.'
      );
      console.error(
        '[PushNotificationService] ℹ️ Fix required: In Firebase Console -> Project Settings -> Service Accounts -> click "Generate new private key", and paste that JSON into FIREBASE_SERVICE_ACCOUNT_KEY on Render.'
      );
      return null;
    }

    // Convert escaped newlines in private_key into actual newlines
    if (typeof obj.private_key === 'string' && obj.private_key.includes('\\n')) {
      obj.private_key = obj.private_key.replace(/\\n/g, '\n');
    }

    // Validate required fields for Firebase Admin SDK cert()
    if (!obj.project_id || typeof obj.project_id !== 'string') {
      console.error('[PushNotificationService] ❌ Service account validation failed: missing string "project_id".');
      return null;
    }

    if (!obj.client_email || typeof obj.client_email !== 'string') {
      console.error('[PushNotificationService] ❌ Service account validation failed: missing string "client_email".');
      return null;
    }

    if (!obj.private_key || typeof obj.private_key !== 'string') {
      console.error('[PushNotificationService] ❌ Service account validation failed: missing string "private_key".');
      return null;
    }

    return obj;
  } catch (err: any) {
    console.error('[PushNotificationService] ❌ JSON parse error on FIREBASE_SERVICE_ACCOUNT_KEY:', err.message);
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
    if (jsonEnv && jsonEnv.trim().length > 0) {
      const serviceAccount = parseAndValidateServiceAccount(jsonEnv);
      if (serviceAccount) {
        firebaseApp = initializeApp({
          credential: cert(serviceAccount),
        });
        credentialsConfiguredButInvalid = false;
        console.log(`[PushNotificationService] ✅ Firebase Admin initialized successfully for project: ${serviceAccount.project_id}`);
        return true;
      } else {
        credentialsConfiguredButInvalid = true;
        console.error('[PushNotificationService] ❌ CRITICAL: FIREBASE_SERVICE_ACCOUNT_KEY environment variable is present but invalid. Push notifications will NOT fall back silently to mock mode.');
        return false;
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
        credentialsConfiguredButInvalid = false;
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
        credentialsConfiguredButInvalid = false;
        console.log(`[PushNotificationService] ✅ Firebase Admin initialized from local firebase-service-account.json (${serviceAccount.project_id})`);
        return true;
      }
    }

    console.warn('[PushNotificationService] ⚠️ No Firebase Admin credentials configured. Server operating in mock notification mode (local dev only).');
    return false;
  } catch (err: any) {
    console.error('[PushNotificationService] Failed to initialize Firebase Admin:', err.message);
    return false;
  }
}

import { deleteInvalidTokens } from './notificationStorage';

export interface PushNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Dispatch real FCM push notifications to a list of device tokens.
 * Uses high priority for Android to ensure delivery when screen is locked or app is closed.
 * Never logs complete tokens or private keys.
 * Automatically deletes unregistered / invalid tokens reported by Firebase.
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

  if (credentialsConfiguredButInvalid) {
    console.error(
      `[PushNotificationService] ❌ Failed to dispatch push notification: FIREBASE_SERVICE_ACCOUNT_KEY is configured on server but has invalid format. (${tokens.length} recipients blocked)`,
    );
    return { successCount: 0, failureCount: tokens.length, mocked: false };
  }

  if (!isReady || !firebaseApp) {
    console.log(
      `[PushNotificationService] 📢 [DEV/TEST MOCK DISPATCH] Dispatched to ${tokens.length} token(s) | Title: "${payload.title}" | Body: "${payload.body}"`,
    );
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
        ttl: 86400, // 24h TTL so device receives even after brief offline period
        collapseKey: payload.data?.flightNumber ?? 'flight_update',
        notification: {
          sound: 'default',
          channelId: 'flight_alerts_v2', // High importance channel created in the client app
          priority: 'max',
          visibility: 'public',
          defaultVibrateTimings: true,
          defaultSound: true,
          clickAction: 'FLIGHT_TRACKING_NOTIFICATION_CLICK',
        },
      },
    };

    const messaging = getMessaging(firebaseApp);
    const response = await messaging.sendEachForMulticast(message);
    console.log(
      `[PushNotificationService] ✅ [DISPATCH-SUCCESS] FCM batch sent: ${response.successCount} success, ${response.failureCount} failed (total targets: ${tokens.length})`,
    );

    // Inspect individual token outcomes and clean up dead tokens
    if (response.failureCount > 0) {
      const invalidTokensToDelete: string[] = [];

      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const errorCode = resp.error?.code || 'unknown_code';
          const errorMessage = resp.error?.message || 'Unknown failure';
          console.warn(
            `[PushNotificationService] ❌ [DISPATCH-FAILURE] FCM delivery failed for token [${maskToken(tokens[idx])}]: safe_code="${errorCode}", reason="${errorMessage}"`,
          );

          if (
            errorCode === 'messaging/registration-token-not-registered' ||
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/invalid-argument'
          ) {
            invalidTokensToDelete.push(tokens[idx]);
          }
        }
      });

      if (invalidTokensToDelete.length > 0) {
        console.log(
          `[PushNotificationService] Purging ${invalidTokensToDelete.length} obsolete/invalid FCM token(s) from PostgreSQL...`,
        );
        await deleteInvalidTokens(invalidTokensToDelete);
      }
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      mocked: false,
    };
  } catch (err: any) {
    console.error('[PushNotificationService] Error dispatching multicast message:', err.message || err);
    return {
      successCount: 0,
      failureCount: tokens.length,
      mocked: false,
    };
  }
}

