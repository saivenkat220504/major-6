import prisma from './src/prisma/client';

async function updateGateTo14C() {
  console.log('--- MANUAL DB SCRIPT: Updating AI-102 gate from Gate 5A to Gate 14C ---');
  try {
    const before: any = await (prisma as any).flightInfo.findUnique({
      where: { flightNumber: 'AI-102' }
    });

    console.log(`Current state : Flight ${before.flightNumber} | Gate: ${before.assignedGate} | Terminal: ${before.departureTerminal}`);

    const updated: any = await (prisma as any).flightInfo.update({
      where: { flightNumber: 'AI-102' },
      data: { assignedGate: 'Gate 14C' }
    });

    console.log(`Updated state : Flight ${updated.flightNumber} | Gate: ${updated.assignedGate} | Terminal: ${updated.departureTerminal}`);
    console.log('--- UPDATE SUCCESSFUL: Gate is now Gate 14C ---');
    console.log('Render watcher will detect this change within 3 seconds and dispatch a push notification.');
  } catch (err: any) {
    console.error('Failed to update gate:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

updateGateTo14C();
