import prisma from './src/prisma/client';

async function updateGateTo16A() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  UPDATING GATE NUMBER TO 16A IN POSTGRESQL');
  console.log('══════════════════════════════════════════════════════════════');

  try {
    const flightsToUpdate = ['6E-241', 'AI-102', '6E241', '6E2412'];

    for (const flightNum of flightsToUpdate) {
      const records: any[] = await (prisma as any).flightInfo.findMany({
        where: { flightNumber: flightNum },
      });

      for (const rec of records) {
        console.log(`[Before] Flight: ${rec.flightNumber.padEnd(8)} | Current Gate: "${rec.assignedGate}" | Terminal: "${rec.departureTerminal}"`);

        const updated = await (prisma as any).flightInfo.update({
          where: { id: rec.id },
          data: {
            assignedGate: 'Gate 16A',
            updatedAt: new Date(),
          },
        });

        console.log(`[After]  Flight: ${updated.flightNumber.padEnd(8)} | Updated Gate: "${updated.assignedGate}" | Terminal: "${updated.departureTerminal}"`);
      }
    }

    console.log('\n--- Current flight_info records in PostgreSQL ---');
    const all = await (prisma as any).flightInfo.findMany();
    for (const f of all) {
      console.log(`  ✈ Flight: ${f.flightNumber.padEnd(8)} | Terminal: ${f.departureTerminal} | Gate: ${f.assignedGate}`);
    }

    console.log('\n--- Registered devices in PostgreSQL ---');
    const subs = await (prisma as any).deviceSubscription.findMany();
    for (const s of subs) {
      const masked = `${s.deviceToken.substring(0, 6)}...${s.deviceToken.substring(s.deviceToken.length - 4)}`;
      console.log(`  📱 Flight: ${s.flightNumber.padEnd(8)} | Token: ${masked} | Platform: ${s.platform}`);
    }

    console.log('══════════════════════════════════════════════════════════════');
    console.log('  Gate successfully updated to Gate 16A.');
    console.log('  FlightWatcher will detect this change and dispatch push notification.');
    console.log('══════════════════════════════════════════════════════════════');
  } catch (err: any) {
    console.error('Failed to update gate in DB:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateGateTo16A();
