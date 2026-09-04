import prisma from './src/prisma/client';

async function main() {
  console.log('=== CHECKING POSTGRESQL DATABASE STATUS ===');

  const subs = await prisma.deviceSubscription.findMany();
  console.log(`Device subscriptions in DB: ${subs.length}`);
  subs.forEach((s, idx) => {
    const masked = s.deviceToken.length > 10 ? `${s.deviceToken.substring(0, 6)}...${s.deviceToken.substring(s.deviceToken.length - 4)}` : s.deviceToken;
    console.log(`  [${idx + 1}] ID: ${s.id} | Flight: "${s.flightNumber}" | Token: ${masked} | Platform: ${s.platform} | Updated: ${s.updatedAt}`);
  });

  const flights: any = await (prisma as any).flightInfo.findMany();
  console.log(`Flights in DB: ${flights.length}`);
  flights.forEach((f: any, idx: number) => {
    console.log(`  [${idx + 1}] Flight: "${f.flightNumber}" | Gate: "${f.assignedGate}" | Terminal: "${f.departureTerminal}"`);
  });

  const snapshots: any = await (prisma as any).flightStateSnapshot.findMany();
  console.log(`FlightStateSnapshots in DB: ${snapshots.length}`);
  snapshots.forEach((snap: any, idx: number) => {
    console.log(`  [${idx + 1}] Flight: "${snap.flightNumber}" | Gate: "${snap.gate}" | Terminal: "${snap.terminal}" | Recorded: ${snap.recordedAt}`);
  });
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
