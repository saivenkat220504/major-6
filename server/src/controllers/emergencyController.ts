import { Request, Response } from 'express';
import { sendTelegramMessage, generateLocationString } from '../services/telegramService';
import prisma from '../prisma/client';
import { sendGuardianNotificationEmail } from '../services/mailerService';
import { decryptPassword } from '../utils/crypto';

interface EmergencyAlertPayload {
  passengerName: string;
  ticketId: string;
  emergencyType?: string;
  emergencyReason?: string;
  category?: 'Police' | 'Medical' | 'Operations' | 'Fire';
  primaryAgency?: string;
  additionalAgencies?: string[];
  priority?: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  terminal?: string;
  timestamp?: string;
}

interface ActiveAlertRecord {
  id: string;
  passengerName: string;
  ticketId: string;
  emergencyType: string;
  category: string;
  primaryAgency: string;
  additionalAgencies: string[];
  terminal: string;
  latitude: number;
  longitude: number;
  time: string;
  priority: string;
  status: 'PENDING' | 'ACCEPTED' | 'DISPATCHED' | 'ARRIVED' | 'RESOLVED';
}

const activeAlerts: ActiveAlertRecord[] = [
  {
    id: 'ALT-9402',
    passengerName: 'Sai Venkat',
    ticketId: '3409967503',
    emergencyType: 'Chest Pain / Heart Attack',
    category: 'Medical',
    primaryAgency: 'medical',
    additionalAgencies: ['operations'],
    terminal: 'Terminal 3 (Gate A12)',
    latitude: 17.3934,
    longitude: 78.4706,
    time: 'Just now',
    priority: 'CRITICAL',
    status: 'ACCEPTED',
  },
  {
    id: 'ALT-9398',
    passengerName: 'Rahul Sharma',
    ticketId: '1098452391',
    emergencyType: 'Suspicious or unattended baggage',
    category: 'Police',
    primaryAgency: 'police',
    additionalAgencies: ['operations', 'fire'],
    terminal: 'Terminal 3 Arrivals (Belt 4)',
    latitude: 17.2403,
    longitude: 78.4294,
    time: '4 mins ago',
    priority: 'CRITICAL',
    status: 'DISPATCHED',
  },
];

/**
 * POST /api/emergency-alert (also POST /api/emergency/alert)
 */

async function notifyGuardiansAsync(payload: EmergencyAlertPayload, userId: string) {
  try {
    let verifiedGuardians = await prisma.personalGuardian.findMany({
      where: { userId, guardianVerified: true },
    });

    if (!verifiedGuardians || verifiedGuardians.length === 0) {
      // Fallback for development/testing if passenger specific guardian is not found
      verifiedGuardians = await prisma.personalGuardian.findMany({
        where: { guardianVerified: true },
      });
    }

    if (!verifiedGuardians || verifiedGuardians.length === 0) {
      return;
    }

    for (const g of verifiedGuardians) {
      let config = await prisma.guardianEmailConfig.findUnique({
        where: { userId_guardianEmail: { userId: g.userId, guardianEmail: g.guardianEmail } },
      });
      
      if (!config) {
        config = await prisma.guardianEmailConfig.findFirst({
          where: { guardianEmail: g.guardianEmail },
        });
      }

      if (config) {
        const decryptedPassword = decryptPassword(config.smtpAppPassword);
        if (decryptedPassword) {
          const reasonText = payload.emergencyType || payload.emergencyReason || 'Unknown emergency';
          const text = `The passenger (${payload.passengerName}, Ticket ID: ${payload.ticketId}) is currently experiencing an emergency.\n\nEmergency Reason: ${reasonText}\nLocation: ${payload.terminal || 'Unknown'}\nCoordinates: ${payload.latitude}, ${payload.longitude}\n\nPlease be advised that the Airport Emergency Response teams have been notified.`;
          
          await sendGuardianNotificationEmail(
            g.guardianEmail,
            '🚨 URGENT: Passenger Emergency Alert',
            text,
            { smtpUser: config.smtpUser, smtpAppPassword: decryptedPassword }
          ).catch(e => console.error(`[Guardian Notification Warning] Failed to email guardian ${g.guardianEmail}:`, e?.message));
        }
      }
    }
  } catch (error) {
    console.error('[Emergency Controller] Guardian notification flow failed:', error);
  }
}

export async function sendEmergencyAlert(req: Request, res: Response) {
  try {
    const {
      passengerName = 'Sai Venkat',
      ticketId = '3409967503',
      emergencyType,
      emergencyReason,
      category = 'Medical',
      primaryAgency,
      additionalAgencies = [],
      priority = 'CRITICAL',
      latitude,
      longitude,
      accuracy,
      terminal = 'Terminal 3',
      timestamp,
    } = req.body as EmergencyAlertPayload;

    const reasonText = emergencyType || emergencyReason;

    if (!reasonText) {
      return res.status(400).json({
        error: 'Missing required field: emergencyType/emergencyReason',
      });
    }

    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        error: 'Valid GPS coordinates (latitude between -90 and 90, longitude between -180 and 180) are required to dispatch emergency services.',
      });
    }

    // Determine category & agencies automatically if missing
    let resolvedCategory = category;
    let resolvedPrimary = primaryAgency || 'medical';
    let resolvedAdditional = additionalAgencies;

    // Fire off guardian notification asynchronously in parallel
    const userId = (req as any).userId || 'dev_passenger_user_id';
    notifyGuardiansAsync(req.body as EmergencyAlertPayload, userId).catch(err => {
      console.error('[Emergency Controller] Unhandled async error in guardian notification:', err);
    });

    const lowerReason = reasonText.toLowerCase();

    if (lowerReason.includes('fire') || lowerReason.includes('gas') || lowerReason.includes('hazard') || lowerReason.includes('explosion')) {
      resolvedCategory = 'Fire';
      resolvedPrimary = 'fire';
      resolvedAdditional = ['police', 'operations'];
    } else if (lowerReason.includes('assault') || lowerReason.includes('theft') || lowerReason.includes('robbery') || lowerReason.includes('police') || lowerReason.includes('suspicious') || lowerReason.includes('missing')) {
      resolvedCategory = 'Police';
      resolvedPrimary = 'police';
      resolvedAdditional = lowerReason.includes('missing') || lowerReason.includes('suspicious') ? ['operations'] : [];
    } else if (lowerReason.includes('baggage') || lowerReason.includes('passport') || lowerReason.includes('wheelchair') || lowerReason.includes('elderly') || lowerReason.includes('help')) {
      resolvedCategory = 'Operations';
      resolvedPrimary = 'operations';
      resolvedAdditional = lowerReason.includes('passport') ? ['police'] : [];
    }

    // Determine header template for Telegram
    let headerText = '🚨 <b>AIRPORT EMERGENCY ALERT</b>';
    if (resolvedCategory === 'Medical') {
      headerText = '🚨 <b>AIRPORT MEDICAL EMERGENCY</b>';
    } else if (resolvedCategory === 'Police') {
      headerText = '🚨 <b>AIRPORT POLICE ALERT</b>';
    } else if (resolvedCategory === 'Fire') {
      headerText = '🚨 <b>FIRE & RESCUE ALERT</b>';
    } else if (resolvedCategory === 'Operations') {
      headerText = '🚨 <b>AIRPORT OPERATIONS ALERT</b>';
    }

    const mapsLink = `https://maps.google.com/?q=${latitude},${longitude}`;
    const formattedTime = timestamp
      ? new Date(timestamp).toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    const agencyLabelsMap: Record<string, string> = {
      police: 'Airport Police',
      medical: 'Airport Medical Team',
      operations: 'Airport Operations / Support',
      fire: 'Fire & Rescue Team',
    };

    const agencyListText = [resolvedPrimary, ...resolvedAdditional]
      .map((a) => agencyLabelsMap[a] || a)
      .join(', ');

    // Facility info
    const facilityText =
      resolvedCategory === 'Medical'
        ? 'Medical Room A (180 m)'
        : resolvedCategory === 'Police'
        ? 'Police Desk T3 (120 m)'
        : resolvedCategory === 'Fire'
        ? 'Fire Response Station #2 (250 m)'
        : 'Customer Service Counter B (90 m)';

    const telegramMessage = [
      headerText,
      '',
      `<b>Passenger Name:</b> ${passengerName}`,
      `<b>Ticket ID:</b> ${ticketId}`,
      `<b>Emergency Type:</b> ${reasonText}`,
      `<b>Category:</b> ${resolvedCategory}`,
      `<b>Responding Agencies:</b> ${agencyListText}`,
      `<b>Current Location:</b> ${terminal}`,
      `<b>Coordinates:</b> ${latitude}, ${longitude}`,
      accuracy != null ? `<b>Accuracy:</b> ±${Math.round(accuracy)} m` : '',
      `<b>Google Maps:</b> ${mapsLink}`,
      `<b>Nearest Facility:</b> ${facilityText}`,
      `<b>Time:</b> ${formattedTime}`,
      '',
      '⚠️ <b>Immediate assistance required.</b>',
    ].filter(Boolean).join('\n');

    // Send via Telegram
    try {
      await sendTelegramMessage(telegramMessage);
    } catch (e: any) {
      console.warn('[Telegram Dispatch Warning]:', e.message);
    }

    // Save alert record in memory
    const newAlertRecord: ActiveAlertRecord = {
      id: `ALT-${Math.floor(1000 + Math.random() * 9000)}`,
      passengerName,
      ticketId,
      emergencyType: reasonText,
      category: resolvedCategory,
      primaryAgency: resolvedPrimary,
      additionalAgencies: resolvedAdditional,
      terminal,
      latitude,
      longitude,
      time: 'Just now',
      priority,
      status: 'PENDING',
    };

    activeAlerts.unshift(newAlertRecord);

    return res.status(200).json({
      success: true,
      message: 'Multi-Agency Emergency Alert dispatched successfully.',
      alert: newAlertRecord,
    });
  } catch (err: any) {
    console.error('[Emergency Controller Error]', err);
    return res.status(500).json({
      error: err.message || 'Failed to send emergency alert.',
    });
  }
}

export async function getActiveAlerts(req: Request, res: Response) {
  res.json(activeAlerts);
}

export async function updateAlertStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = req.body;
  const alert = activeAlerts.find((a) => a.id === id);
  if (alert && status) {
    alert.status = status;
    return res.json({ success: true, alert });
  }
  res.status(404).json({ error: 'Alert not found' });
}
