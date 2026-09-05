import { PushNotifications, Token, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

// Production Render Server Endpoint (always points to live Render service)
const SERVER_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'https://major-6-o85h.onrender.com'
).replace(/\/$/, '');

const FCM_STORAGE_KEY = 'smart_airport_fcm_token';

function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

// ─── ICAO → IATA Airline Code Mapping (Client-Side) ──────────────────────────
// Some PDF417 barcode decoders produce ICAO codes (3-letter, e.g. "ING") instead
// of IATA codes (2-letter, e.g. "6E"). This causes flight numbers like "ING6E241".
// We strip the ICAO prefix here before sending to the server.
const ICAO_TO_IATA: Record<string, string> = {
  ING: '6E', // IndiGo Airlines
  IGO: '6E', // IndiGo Airlines alternate ICAO
  IAC: '6E', // Legacy IndiGo ICAO
  AIC: 'AI', // Air India
  AIE: 'IX', // Air India Express
  AIX: 'IX', // Air India Express alternate
  SXB: 'SG', // SpiceJet
  SEJ: 'SG', // SpiceJet alternate
  GOW: 'G8', // GoAir/Go First
  VTI: 'UK', // Vistara
  CTM: 'QP', // Akasa Air
  BTI: '9W', // Jet Airways
};

/**
 * Strips any known ICAO prefix that was erroneously prepended to a flight number.
 * Handles two cases:
 *   a) ICAO + IATA + number  →  keep IATA + number   (e.g. ING6E241 → 6E241)
 *   b) ICAO + number only    →  replace with IATA     (e.g. ING241   → 6E241)
 */
function stripIcaoPrefix(raw: string): string {
  for (const [icao, iata] of Object.entries(ICAO_TO_IATA)) {
    if (!raw.startsWith(icao)) continue;
    const remainder = raw.substring(icao.length);
    if (remainder.startsWith(iata)) return remainder;       // case a
    if (/^[0-9]/.test(remainder)) return `${iata}${remainder}`; // case b
  }
  return raw;
}

/**
 * Normalize a raw flight number to canonical IATA format.
 *
 * Pipeline:
 *  1. Trim & uppercase
 *  2. Strip ICAO prefix   (ING6E241 → 6E241)
 *  3. Insert hyphen        (6E241 → 6E-241, AI102 → AI-102)
 *
 * This is intentionally a mirror of the server-side toCanonicalFlightNumber()
 * in notificationStorage.ts so both sides always agree.
 */
export function normalizeFlightNumber(flightNumber: string): string {
  if (!flightNumber) return '';
  const raw = flightNumber.trim().toUpperCase();

  const rawLog = raw;
  const deIcao = stripIcaoPrefix(raw);

  const match = deIcao.match(/^([A-Z]{2,3}|[A-Z0-9]{2})[\s\-_]*([0-9]+)$/);
  if (match) {
    const canonical = `${match[1]}-${match[2]}`;
    if (canonical !== rawLog) {
      console.log(`[FlightNorm] ✅ Client normalized: "${rawLog}" → "${canonical}"`);
    }
    return canonical;
  }

  if (deIcao !== raw) {
    console.log(`[FlightNorm] ✅ Client ICAO stripped: "${raw}" → "${deIcao}"`);
  }
  return deIcao;
}

let activeTargetFlight = ''; // Intentionally empty until set from real scanned data

/**
 * Send device token and flight mapping to the production Render backend with retries.
 * Tolerates Render cold starts with a 30s timeout and up to 3 automatic retries.
 */
export async function sendTokenRegistration(
  token: string,
  flightNumber: string,
  attempt = 1,
): Promise<boolean> {
  if (!token || !flightNumber) {
    console.warn('[PushRegistration] ❌ Cannot register: token or flightNumber is empty.');
    return false;
  }

  const endpoint = `${SERVER_BASE}/api/flight-info/register-device`;

  // ── Normalize flight number: strip ICAO prefix and insert hyphen ──────────
  // This is the critical fix: ING6E241 → 6E-241, AI102 → AI-102, 6E241 → 6E-241
  const rawFlight = flightNumber.trim().toUpperCase();
  const canonicalFlight = normalizeFlightNumber(rawFlight);
  const masked = maskToken(token);

  console.log('----------------------------------------------------------------');
  console.log(`[PushRegistration] 🚀 [Attempt ${attempt}/3] DISPATCHING REGISTRATION TO RENDER:`);
  console.log(`  - Target URL         : ${endpoint}`);
  console.log(`  - Raw flight received: "${rawFlight}"`);
  console.log(`  - Canonical flight   : "${canonicalFlight}"`);
  console.log(`  - Token (masked)     : "${masked}" (length: ${token.length})`);
  console.log(`  - Platform           : "android"`);
  console.log('----------------------------------------------------------------');

  if (!canonicalFlight) {
    console.warn('[PushRegistration] ❌ Canonical flight number is empty after normalization. Skipping registration.');
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        token,
        flightNumber: canonicalFlight, // Always send the canonical form
        platform: 'android',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log(`[PushRegistration] 📥 Render HTTP Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[PushRegistration] ❌ Render Server responded with error: ${res.status}`, errorText);
      throw new Error(`Server returned HTTP ${res.status}: ${errorText}`);
    }

    const data = await res.json();
    console.log('[PushRegistration] ✅ SUCCESSFUL REGISTRATION IN POSTGRESQL:');
    console.log(`  - Canonical flight stored : "${canonicalFlight}"`);
    console.log(`  - Active devices in DB    : ${data.activeDevicesForFlight ?? 1}`);
    return true;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[PushRegistration] ❌ Network/API Error on attempt ${attempt}:`, err.message || err);

    if (attempt < 3) {
      const delayMs = attempt * 2500;
      console.log(`[PushRegistration] ⏳ Retrying in ${delayMs / 1000}s (Render may be waking up)...`);
      await new Promise((r) => setTimeout(r, delayMs));
      return sendTokenRegistration(token, flightNumber, attempt + 1);
    }

    return false;
  }
}

/**
 * Re-register an existing cached FCM token for a different flight.
 * Always normalizes the flight number before registration.
 */
export async function registerFlightSubscription(flightNumber: string): Promise<boolean> {
  if (!flightNumber) {
    console.warn('[PushRegistration] registerFlightSubscription called with empty flight number. Skipped.');
    return false;
  }
  activeTargetFlight = normalizeFlightNumber(flightNumber);
  const cachedToken = localStorage.getItem(FCM_STORAGE_KEY);
  if (cachedToken) {
    console.log(`[PushRegistration] Re-registering cached token (${maskToken(cachedToken)}) for canonical flight "${activeTargetFlight}"`);
    return await sendTokenRegistration(cachedToken, activeTargetFlight);
  }
  console.log('[PushRegistration] No cached token found. Native FCM register() will handle registration.');
  return false;
}

let isListenersConfigured = false;

/**
 * Complete initialization flow on Android native device:
 * 1. Check & request notification permission (supports Android 13+ POST_NOTIFICATIONS).
 * 2. Create high-importance Android notification channel ('flight_alerts_v2').
 * 3. Set up listeners for token generation and notification clicks.
 * 4. Register with Firebase Cloud Messaging natively.
 * 5. Transmit token to Render PostgreSQL.
 */
export async function initializePushNotifications(flightNumber: string): Promise<string | null> {
  // Normalize immediately — this is where ING6E241 → 6E-241 is fixed
  const rawFlight = (flightNumber || '').trim().toUpperCase();
  activeTargetFlight = normalizeFlightNumber(rawFlight);

  if (!Capacitor.isNativePlatform()) {
    console.log('[PushRegistration] ℹ️ Web browser detected. Native FCM registration is skipped.');
    return null;
  }

  // Guard: do not register under an empty or clearly defaulted flight number.
  // Registration is deferred until the ticket has been scanned and flight is confirmed.
  if (!activeTargetFlight) {
    console.warn('[PushRegistration] ⚠️ No valid flight number available. Deferring FCM registration until ticket is scanned.');
    return null;
  }

  console.log('================================================================');
  console.log(`[PushRegistration] 📱 STARTING REAL ANDROID PUSH REGISTRATION:`);
  console.log(`  - Raw flight from ticket   : "${rawFlight}"`);
  console.log(`  - Canonical flight (target): "${activeTargetFlight}"`);
  console.log(`  - Production Backend Base  : "${SERVER_BASE}"`);
  console.log('================================================================');

  try {
    // 1. Android Notification Permission Check & Request
    let permStatus = await PushNotifications.checkPermissions();
    console.log(`[PushRegistration] [Step 1] Initial Notification Permission: "${permStatus.receive}"`);

    if (permStatus.receive !== 'granted') {
      console.log('[PushRegistration] [Step 1a] Requesting system notification permission from user...');
      permStatus = await PushNotifications.requestPermissions();
      console.log(`[PushRegistration] [Step 1b] User permission decision: "${permStatus.receive}"`);
    }

    if (permStatus.receive !== 'granted') {
      console.warn(`[PushRegistration] ⚠️ Permission not granted ("${permStatus.receive}"). Push alerts cannot be displayed.`);
      return null;
    }

    // 2. Android Notification Channel (Oreo / Android 8+)
    console.log('[PushRegistration] [Step 2] Creating notification channel "flight_alerts_v2" (Importance High, Sound, Vibration)...');
    await PushNotifications.createChannel({
      id: 'flight_alerts_v2',
      name: 'Flight Alerts',
      description: 'Real-time gate and terminal change alerts for your flight',
      importance: 5, // IMPORTANCE_HIGH (heads-up popup, plays sound, vibrates)
      visibility: 1, // VISIBILITY_PUBLIC (shows on lock screen)
      sound: 'default',
      vibration: true,
    });
    console.log('[PushRegistration] [Step 2] Notification channel created successfully.');

    // 3. Immediately register existing cached token if available
    const cached = localStorage.getItem(FCM_STORAGE_KEY);
    if (cached) {
      console.log(`[PushRegistration] [Step 3] Found cached token (${maskToken(cached)}), sending immediate registration...`);
      sendTokenRegistration(cached, activeTargetFlight).catch(() => {});
    }

    // 4. Setup FCM listeners once
    if (!isListenersConfigured) {
      isListenersConfigured = true;

      PushNotifications.addListener('registration', async (token: Token) => {
        const masked = maskToken(token.value);
        console.log('================================================================');
        console.log(`[PushRegistration] 🎯 [Step 4] NATIVE FCM TOKEN GENERATED BY GOOGLE:`);
        console.log(`  - Token (masked): "${masked}"`);
        console.log(`  - Token Length: ${token.value.length}`);
        console.log(`  - Binding to Flight: "${activeTargetFlight}"`);
        console.log('================================================================');

        localStorage.setItem(FCM_STORAGE_KEY, token.value);
        await sendTokenRegistration(token.value, activeTargetFlight);
      });

      PushNotifications.addListener('registrationError', (error: any) => {
        console.error('[PushRegistration] ❌ [Step 4 ERROR] FCM Native Registration Error:', error);
      });

      PushNotifications.addListener('actionPerformed', (action: ActionPerformed) => {
        console.log('[PushRegistration] 🔔 Notification banner clicked by user:', action.notification);
      });
    }

    // 5. Trigger native FCM registration with Google Play Services
    console.log('[PushRegistration] [Step 5] Invoking native PushNotifications.register()...');
    await PushNotifications.register();
    console.log('[PushRegistration] [Step 5] Native register() call dispatched.');

    return cached || null;
  } catch (err: any) {
    console.error('[PushRegistration] ❌ Initialization pipeline failed:', err.message || err);
    return null;
  }
}
