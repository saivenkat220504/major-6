import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import chatRoutes from './routes/chat';
import transitRoutes from './routes/transit';
import luggageRoutes from './routes/luggage';
import emergencyRoutes from './routes/emergency';
import supportRoutes from './routes/support';
import auraRoutes from './routes/aura';
import baggageRoutes from './routes/baggage';
import transitServicesRoutes from './routes/transitServicesRoutes';
import metroTrackingRoutes from './routes/metroTracking';
import airportBusRoutes from './routes/airportBus';
import guardianRoutes from './routes/guardian';
import https from 'https';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { startTelegramLongPolling } from './services/telegramService';
import { upsertLocation } from './repositories/trackingRepository';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/transit', transitRoutes);
app.use('/api/luggage', luggageRoutes);
app.use('/api/emergency-alert', emergencyRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/aura', auraRoutes);
app.use('/api/transit-services', transitServicesRoutes);
app.use('/api/baggage', baggageRoutes);
app.use('/api/metro-tracking', metroTrackingRoutes);
app.use('/api/airport-bus', airportBusRoutes);
app.use('/api/guardian', guardianRoutes);

app.get('/api/tts', (req, res) => {
  const { text, lang } = req.query;
  if (!text || !lang) return res.status(400).send('Missing text or lang');

  const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text as string)}`;

  https.get(url, (googleRes) => {
    res.set('Content-Type', 'audio/mpeg');
    googleRes.pipe(res);
  }).on('error', (err) => {
    console.error('TTS proxy error:', err);
    res.status(500).send('TTS proxy error');
  });
});

const PORT = Number(process.env.PORT) || 4000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// ── Telegram → Prisma wiring ───────────────────────────────────────────────────
//
// pendingDriverId tracks which bus driver the passenger most recently requested.
// When a single Telegram chat is shared by one physical driver, this is the correct
// mapping: location updates from that chat are attributed to the last-requested driver.
//
// For a multi-driver deployment, this would be replaced with a driver-specific
// Telegram chat ID per driver stored in the BusTracking table.
//
let pendingDriverId: string | null = null;
let pendingDriverName: string | null = null;

/**
 * Called by the Decision Engine (via TelemetryManager) after a Telegram
 * location request is sent, so the daemon knows which driver to update.
 */
export function setPendingDriver(driverId: string, driverName: string): void {
  pendingDriverId = driverId;
  pendingDriverName = driverName;
}

// Start Telegram long polling loop
startTelegramLongPolling(
  // onMessageReceived — existing support chat handler (unchanged)
  (text) => {
    console.log('Telegram reply received:', text);
    io.emit('support-reply', {
      sender: 'staff',
      text,
      timestamp: new Date()
    });
  },
  // onLocationUpdate — persist driver location to Prisma
  async ({ latitude, longitude, timestampMs, livePeriodSeconds }) => {
    if (!pendingDriverId || !pendingDriverName) {
      // Location received but no driver request is pending — log and ignore
      console.warn(
        '[BusTracking] Location update received but no pending driver is set. Ignoring.',
      );
      return;
    }

    try {
      await upsertLocation({
        driverId: pendingDriverId,
        driverName: pendingDriverName,
        latitude,
        longitude,
        lastUpdatedMs: timestampMs,
        livePeriodSeconds,
      });
      console.log(
        `[BusTracking] Location persisted for driver "${pendingDriverName}" (${pendingDriverId}):`,
        latitude,
        longitude,
      );
    } catch (err) {
      console.error('[BusTracking] Failed to upsert location to Prisma:', err);
    }
  },
);

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on ${PORT}`);
});
