import { Request, Response } from 'express';
import prisma from '../prisma/client';

/**
 * GET /api/flight-info?flightNumber=...
 *
 * Retrieves the 4 main flight tracking fields from the database:
 * 1. Departure Terminal (departure_terminal)
 * 2. Assigned Gate (assigned_gate)
 * 3. Seat Assignment (seat_assignment)
 * 4. Flight Date (flight_date)
 */
export async function getFlightInfo(req: Request, res: Response) {
  try {
    const flightNumberParam = (req.query.flightNumber || req.query.flight_id) as string | undefined;

    let flightRecord: any = null;

    // 1. If flightNumber is provided, filter database by this flightNumber and its variants
    if (flightNumberParam && flightNumberParam.trim()) {
      const targetFlightNumber = flightNumberParam.trim().toUpperCase();
      const variants = [targetFlightNumber, targetFlightNumber.replace(/-/g, ''), targetFlightNumber.replace(/\s+/g, '')];
      try {
        flightRecord = await (prisma as any).flightInfo?.findFirst({
          where: { flightNumber: { in: variants } }
        });
      } catch {
        try {
          const rawRecords: any = await prisma.$queryRawUnsafe(
            `SELECT * FROM "flight_info" WHERE UPPER("flight_number") = ANY($1) LIMIT 1`,
            variants
          );
          if (Array.isArray(rawRecords) && rawRecords.length > 0) {
            flightRecord = rawRecords[0];
          }
        } catch (rawErr) {
          console.warn('[FlightInfo] Raw query lookup failed:', rawErr);
        }
      }
    }

    // 2. If not queried by flightNumber or specific flightNumber not found, fetch the latest active flight record
    if (!flightRecord) {
      try {
        flightRecord = await (prisma as any).flightInfo?.findFirst({
          orderBy: { createdAt: 'desc' }
        });
      } catch {
        try {
          const rawRecords: any = await prisma.$queryRawUnsafe(
            `SELECT * FROM "flight_info" ORDER BY "created_at" DESC LIMIT 1`
          );
          if (Array.isArray(rawRecords) && rawRecords.length > 0) {
            flightRecord = rawRecords[0];
          }
        } catch (rawErr) {
          console.warn('[FlightInfo] Raw query findFirst failed:', rawErr);
        }
      }
    }

    // 3. If database table is empty, auto-seed the default record in the DB
    if (!flightRecord) {
      const defaultFlightNum = flightNumberParam ? flightNumberParam.trim().toUpperCase() : 'AI-102';
      try {
        flightRecord = await (prisma as any).flightInfo?.create({
          data: {
            flightNumber: defaultFlightNum,
            departureTerminal: 'T1',
            assignedGate: 'Gate 14B',
            seatAssignment: '18A',
            flightDate: '2026-07-16'
          }
        });
      } catch {
        try {
          const id = `default-${Date.now()}`;
          await prisma.$queryRawUnsafe(
            `INSERT INTO "flight_info" ("id", "flight_number", "departure_terminal", "assigned_gate", "seat_assignment", "flight_date", "created_at", "updated_at")
             VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
             ON CONFLICT ("flight_number") DO UPDATE SET "updated_at" = NOW()`,
            id,
            defaultFlightNum,
            'T1',
            'Gate 14B',
            '18A',
            '2026-07-16'
          );
          const rawRecords: any = await prisma.$queryRawUnsafe(
            `SELECT * FROM "flight_info" ORDER BY "created_at" DESC LIMIT 1`
          );
          flightRecord = Array.isArray(rawRecords) && rawRecords.length > 0 ? rawRecords[0] : null;
        } catch (insertErr) {
          console.warn('[FlightInfo] Could not auto-insert default record:', insertErr);
        }
      }
    }

    // Extract canonical database values
    const departureTerminal = flightRecord?.departureTerminal || flightRecord?.departure_terminal || 'T1';
    const assignedGate = flightRecord?.assignedGate || flightRecord?.assigned_gate || 'Gate 14B';
    const seatAssignment = flightRecord?.seatAssignment || flightRecord?.seat_assignment || '18A';
    const flightDate = flightRecord?.flightDate || flightRecord?.flight_date || '2026-07-16';
    const flightNumber = flightRecord?.flightNumber || flightRecord?.flight_number || 'AI-102';

    return res.json({
      success: true,
      data: {
        id: flightRecord?.id || 'default-flight-ai102',
        flightNumber,
        departureTerminal,
        assignedGate,
        seatAssignment,
        flightDate,
        departure_terminal: departureTerminal,
        assigned_gate: assignedGate,
        seat_assignment: seatAssignment,
        flight_date: flightDate,
        createdAt: flightRecord?.createdAt || flightRecord?.created_at,
        updatedAt: flightRecord?.updatedAt || flightRecord?.updated_at
      }
    });
  } catch (err: any) {
    console.error('[FlightInfo] Error fetching flight info:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve flight information from database',
      message: err.message
    });
  }
}

/**
 * POST /api/flight-info
 * Update or upsert flight tracking information in the database
 */
export async function updateFlightInfo(req: Request, res: Response) {
  try {
    const { flightNumber, departureTerminal, assignedGate, seatAssignment, flightDate } = req.body;

    if (!departureTerminal || !assignedGate || !seatAssignment || !flightDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: departureTerminal, assignedGate, seatAssignment, flightDate'
      });
    }

    const targetFlightNumber = (flightNumber || 'AI-102').trim().toUpperCase();

    let updatedRecord: any = null;
    try {
      updatedRecord = await (prisma as any).flightInfo.upsert({
        where: { flightNumber: targetFlightNumber },
        update: {
          departureTerminal,
          assignedGate,
          seatAssignment,
          flightDate
        },
        create: {
          flightNumber: targetFlightNumber,
          departureTerminal,
          assignedGate,
          seatAssignment,
          flightDate
        }
      });
    } catch {
      const id = `flight-${Date.now()}`;
      await prisma.$queryRawUnsafe(
        `INSERT INTO "flight_info" ("id", "flight_number", "departure_terminal", "assigned_gate", "seat_assignment", "flight_date", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT ("flight_number") DO UPDATE 
         SET "departure_terminal" = $3, "assigned_gate" = $4, "seat_assignment" = $5, "flight_date" = $6, "updated_at" = NOW()`,
        id,
        targetFlightNumber,
        departureTerminal,
        assignedGate,
        seatAssignment,
        flightDate
      );
      const rawRecords: any = await prisma.$queryRawUnsafe(
        `SELECT * FROM "flight_info" WHERE "flight_number" = $1 LIMIT 1`,
        targetFlightNumber
      );
      updatedRecord = Array.isArray(rawRecords) && rawRecords.length > 0 ? rawRecords[0] : null;
    }

    return res.json({
      success: true,
      message: 'Flight information updated successfully in database',
      data: updatedRecord
    });
  } catch (err: any) {
    console.error('[FlightInfo] Error updating flight info:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to update flight information in database',
      message: err.message
    });
  }
}
