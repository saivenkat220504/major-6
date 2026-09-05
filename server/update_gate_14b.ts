import prisma from './src/prisma/client';

async function updateGateTo14B() {
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  MANUALLY UPDATING GATE NUMBER TO 14B IN POSTGRESQL');
  console.log('══════════════════════════════════════════════════════════════');

  try {
    const flightsToUpdate = ['6E-241', 'AI-102', '6E241', '6E2412'];

    for (const flightNum of flightsToUpdate) {
      const records: any[] = await (prisma as any).flightInfo.findMany({
        where: { flightNumber: flightNum },
      });

      for (const rec of records) {
        console.log(`[Before] Flight: ${rec.flightNumber} | Current Gate: "${rec.assignedGate}" | Terminal: "${rec.departureTerminal}"`);

        const updated = await (prisma as any).flightInfo.update({
          where: { id: rec.id },
          data: {
            assignedGate: 'Gate 14B',
            updatedAt: new Date(),
          },
        });

        console.log(`[After]  Flight: ${updated.flightNumber} | Updated Gate: "${updated.assignedGate}" | Terminal: "${updated.departureTerminal}"`);
      }
    }

    console.log('\n--- Final flight_info table state in PostgreSQL ---');
    const all = await (prisma as any).flightInfo.findMany();
    for (const f of all) {
      console.log(`  ✈ Flight: ${f.flightNumber.padEnd(8)} | Terminal: ${f.departureTerminal} | Gate: ${f.assignedGate}`);
    }
    console.log('══════════════════════════════════════════════════════════════');
  } catch (err: any) {
    console.error('Failed to update gate in DB:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateGateTo14B();
