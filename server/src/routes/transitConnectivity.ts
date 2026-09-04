import { Router } from 'express';
import { checkTransitConnectivity } from '../controllers/transitConnectivityController';

const router = Router();

// POST /api/transit-connectivity/check
router.post('/check', checkTransitConnectivity);

export default router;
