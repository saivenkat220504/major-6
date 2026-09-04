import { Router, Request, Response } from 'express';
import { getFlightInfo, updateFlightInfo } from '../controllers/flightInfoController';
import { registerDeviceToken, getDeviceSubscriptions } from '../services/notificationStorage';
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
  try {
    const { token, flightNumber, platform } = req.body;
    if (!token || !flightNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: token, flightNumber',
      });
    }

    const subscription = await registerDeviceToken(token, flightNumber, platform || 'android');
    return res.json({
      success: true,
      message: 'Device push token registered successfully',
      data: subscription,
    });
  } catch (err: any) {
    console.error('[FlightInfoRoute] Failed to register device:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal server error registering device',
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
