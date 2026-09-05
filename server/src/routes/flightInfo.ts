import { Router, Request, Response } from 'express';
import { getFlightInfo, updateFlightInfo } from '../controllers/flightInfoController';
import { registerDeviceToken, getDeviceSubscriptions, getTokensForFlight, maskToken } from '../services/notificationStorage';
import { checkFlightChanges } from '../services/flightChangeWatcher';

const router = Router();

// GET /api/flight-info - Retrieves flight information from database (supports ?flightNumber= query)
router.get('/', getFlightInfo);

// POST /api/flight-info - Updates or creates flight information in database
router.post('/', updateFlightInfo);

/**
 * POST /api/flight-info/register-device
 * Registers an Android push notification token mapped to a flight number
 */
router.post('/register-device', async (req: Request, res: Response) => {
  const requestTime = new Date().toISOString();
  const rawToken = req.body?.token;
  const rawFlight = req.body?.flightNumber;
  const rawPlatform = req.body?.platform;

  console.log('================================================================================');
  console.log(`[DeviceRegistration] 📥 [${requestTime}] INCOMING REGISTRATION REQUEST`);
  console.log(`  - Origin: ${req.headers.origin || req.headers.host || 'unknown'}`);
  console.log(`  - User-Agent: ${req.headers['user-agent'] || 'unknown'}`);
  console.log(`  - Client IP: ${req.ip || req.socket.remoteAddress}`);
  console.log(`  - Flight Number Received: "${rawFlight}"`);
  console.log(`  - Platform Received: "${rawPlatform || 'android'}"`);
  console.log(`  - Token Provided: ${Boolean(rawToken)}`);
  console.log(`  - Token Length: ${rawToken ? rawToken.length : 0}`);
  console.log(`  - Token (masked): "${maskToken(rawToken || '')}"`);

  try {
    if (!rawToken || !rawFlight) {
      console.warn(`[DeviceRegistration] ❌ 400 Bad Request - Missing required fields:`, {
        hasToken: Boolean(rawToken),
        hasFlightNumber: Boolean(rawFlight),
      });
      console.log('================================================================================');
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: token, flightNumber',
      });
    }

    console.log(`[Flow] Registered flight received on Render: "${rawFlight}" for device [${maskToken(rawToken)}]`);
    console.log(`[DeviceRegistration] 🔄 Executing PostgreSQL upsert for flight "${rawFlight}"...`);
    const subscription = await registerDeviceToken(rawToken, rawFlight, rawPlatform || 'android');

    // Query active tokens for this flight to report exact database count
    const activeTokens = await getTokensForFlight(rawFlight);

    console.log(`[DeviceRegistration] 💾 PostgreSQL Upsert SUCCESS:`);
    console.log(`  - Canonical Flight Stored: "${subscription.flightNumber}"`);
    console.log(`  - Token Stored (masked): "${maskToken(subscription.token)}"`);
    console.log(`  - Platform: "${subscription.platform}"`);
    console.log(`  - Timestamp: ${subscription.updatedAt}`);
    console.log(`  - Total active devices in DB for flight "${rawFlight}": ${activeTokens.length}`);
    console.log('================================================================================');

    return res.json({
      success: true,
      message: 'Device push token registered successfully in PostgreSQL',
      data: subscription,
      activeDevicesForFlight: activeTokens.length,
    });
  } catch (err: any) {
    console.error('[DeviceRegistration] ❌ Database / Server Error:', err.message || err);
    console.log('================================================================================');
    return res.status(500).json({
      success: false,
      error: 'Internal server error registering device in database',
      message: err.message,
    });
  }
});


/**
 * GET /api/flight-info/registered-devices
 * Returns list of registered devices (for local debugging/inspection)
 */
router.get('/registered-devices', async (_req: Request, res: Response) => {
  try {
    const devices = await getDeviceSubscriptions();
    return res.json({
      success: true,
      count: devices.length,
      data: devices,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/flight-info/trigger-check
 * Manually trigger the database change check (useful for instant local verification)
 */
router.post('/trigger-check', async (_req: Request, res: Response) => {
  try {
    const result = await checkFlightChanges();
    return res.json({
      success: true,
      result,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
