import { Router } from 'express';
import { investigateAirportBus } from '../controllers/airportBusController';

const router = Router();

// POST /api/airport-bus/investigate
router.post('/investigate', investigateAirportBus);

export default router;
