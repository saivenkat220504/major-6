import prisma from './src/prisma/client';

async function updateGateTo3A() {
  console.log('--- MANUAL DB SCRIPT: Updating AI-102 gate to Gate 3A ---');
  try {
    const before: any = await (prisma as any).flightInfo.findUnique({
      where: { flightNumber: 'AI-102' },
    });

    console.log(
      `Current state : Flight ${before?.flightNumber} | Gate: ${before?.assignedGate} | Terminal: ${before?.departureTerminal}`,
    );

    const updated: any = await (prisma as any).flightInfo.update({
      where: { flightNumber: 'AI-102' },
      data: { assignedGate: 'Gate 3A' },
    });

    console.log(
      `Updated state : Flight ${updated.flightNumber} | Gate: ${updated.assignedGate} | Terminal: ${updated.departureTerminal}`,
    );
    console.log('--- UPDATE SUCCESSFUL: Gate is now Gate 3A ---');
    console.log(
      'The Render FlightWatcher daemon will detect this change and dispatch the FCM push notification.',
    );
  } catch (err: any) {
    console.error('Failed to update gate:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateGateTo3A();
