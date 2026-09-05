import prisma from './src/prisma/client';
import { toCanonicalFlightNumber } from './src/services/notificationStorage';

/**
 * Script to update or upsert a baggage tracking record in PostgreSQL.
 *
 * Usage:
 *   npx ts-node update_baggage_status.ts [tagNumber] [status] [belt] [flightNumber]
 * Example:
 *   npx ts-node update_baggage_status.ts 176-8927361 "Arrived at Belt 4" "Belt 4" "6E-241"
 */
async function updateBaggageStatus() {
  const args = process.argv.slice(2);
  const tagNumber = args[0] || '176-8927361';
  const status = args[1] || 'Arrived at Belt 4';
  const belt = args[2] || (status.includes('Belt') ? status.match(/Belt\s*[A-Za-z0-9]+/i)?.[0] || 'Belt 4' : 'Belt 4');
  const flightNumber = toCanonicalFlightNumber(args[3] || '6E-241');

  console.log('══════════════════════════════════════════════════════════════');
  console.log('  UPDATING BAGGAGE STATUS IN POSTGRESQL');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Tag Number    : ${tagNumber}`);
  console.log(`  Flight Number : ${flightNumber}`);
  console.log(`  Target Status : ${status}`);
  console.log(`  Belt          : ${belt}`);

  try {
    const existing = await (prisma as any).baggageTracking.findUnique({
      where: { tagNumber },
    });

    if (existing) {
      console.log(`\n[Before] Status: "${existing.status}" | Belt: "${existing.belt}" | Flight: "${existing.flightNumber}"`);
    } else {
      console.log(`\n[Before] Record does not exist yet (will create).`);
    }

    const updated = await (prisma as any).baggageTracking.upsert({
      where: { tagNumber },
      update: {
        status,
        belt,
        flightNumber,
        updatedAt: new Date(),
      },
      create: {
        tagNumber,
        flightNumber,
        status,
        belt,
        passengerName: 'Passenger',
        eta: status.includes('Belt') ? 'Arrived' : '2:45 PM (on time)',
        lastScanLocation: status.includes('Belt') ? `${belt} — Arrival Hall A` : 'Cargo Hold',
      },
    });

    console.log(`[After]  Status: "${updated.status}" | Belt: "${updated.belt}" | Flight: "${updated.flightNumber}"`);

    console.log('\n--- Active Registered Devices in PostgreSQL ---');
    const subs = await prisma.deviceSubscription.findMany();
    for (const s of subs) {
      const masked = `${s.deviceToken.substring(0, 6)}...${s.deviceToken.substring(s.deviceToken.length - 4)}`;
      console.log(`  📱 Flight: ${s.flightNumber.padEnd(8)} | Token: ${masked} | Platform: ${s.platform}`);
    }

    console.log('══════════════════════════════════════════════════════════════');
    console.log('  Baggage status updated successfully.');
    console.log('  FlightWatcher will detect this change and dispatch push notification.');
    console.log('══════════════════════════════════════════════════════════════');
  } catch (err: any) {
    console.error('Failed to update baggage status in DB:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateBaggageStatus();
