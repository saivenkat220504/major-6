import { Router } from 'express';
import { decodeBarcodeHandler } from '../controllers/barcodeController';

const router = Router();

router.post('/', decodeBarcodeHandler);

export default router;
