import prisma from './src/prisma/client';
import { toCanonicalFlightNumber } from './src/services/notificationStorage';

async function main() {
  try {
    const flightNum = '6E-241';
    const canonical = toCanonicalFlightNumber(flightNum);

    // Upsert 6E-241 in flight_info table
    const existing = await (prisma as any).flightInfo.findFirst({
      where: {
        OR: [
          { flightNumber: '6E-241' },
          { flightNumber: '6E241' },
          { flightNumber: 'ING6E241' },
        ],
      },
    });

    if (existing) {
      await (prisma as any).flightInfo.update({
        where: { id: existing.id },
        data: {
          flightNumber: '6E-241',
          departureTerminal: 'T1',
          assignedGate: 'Gate 3A',
          updatedAt: new Date(),
        },
      });
      console.log(`Updated existing flight record to ${canonical} (Gate 3A)`);
    } else {
      await (prisma as any).flightInfo.create({
        data: {
          flightNumber: '6E-241',
          departureTerminal: 'T1',
          assignedGate: 'Gate 3A',
          seatAssignment: '12F',
          flightDate: '2026-09-05',
        },
      });
      console.log(`Created new flightInfo record for ${canonical} (Gate 3A)`);
    }

    const allFlights = await (prisma as any).flightInfo.findMany();
    console.log('All flight_info records in PostgreSQL:');
    for (const f of allFlights) {
      console.log(`  - ${f.flightNumber} | Terminal: ${f.departureTerminal} | Gate: ${f.assignedGate}`);
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
