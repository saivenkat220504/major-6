import { Router } from 'express';
import { getFlightInfo, updateFlightInfo } from '../controllers/flightInfoController';

const router = Router();

// GET /api/flight-info - Retrieves flight information from database (supports ?flightNumber= query)
router.get('/', getFlightInfo);

// POST /api/flight-info - Updates or creates flight information in database
router.post('/', updateFlightInfo);

export default router;
