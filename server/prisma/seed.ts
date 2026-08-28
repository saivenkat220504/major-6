import prisma from '../src/prisma/client';

async function main() {
  try {
    await prisma.luggageGuide.createMany({
      data: [
        { category: 'domestic', stepNumber: 1, title: 'Scan Boarding Pass', description: 'Scan your boarding pass at the kiosk or counter.', voiceText: 'Scan your boarding pass at the kiosk or counter.' },
        { category: 'domestic', stepNumber: 2, title: 'Print Baggage Tag', description: 'Print the baggage tag at the counter.', voiceText: 'Print the baggage tag at the counter.' },
        { category: 'domestic', stepNumber: 3, title: 'Attach Tag', description: 'Attach the printed tag to your luggage securely.', voiceText: 'Attach the printed tag to your luggage securely.' },
        { category: 'domestic', stepNumber: 4, title: 'Drop Luggage', description: 'Drop your luggage at the dedicated drop-off.', voiceText: 'Drop your luggage at the dedicated drop-off.' },
        { category: 'international', stepNumber: 1, title: 'Check Passport & Visa', description: 'Have passport and visa ready.', voiceText: 'Have passport and visa ready.' },
        { category: 'international', stepNumber: 2, title: 'Customs Declaration', description: 'Complete any customs declaration forms if required.', voiceText: 'Complete any customs declaration forms if required.' },
        { category: 'international', stepNumber: 3, title: 'Weigh & Tag', description: 'Weigh luggage and print tags at check-in.', voiceText: 'Weigh luggage and print tags at check-in.' },
        { category: 'international', stepNumber: 4, title: 'Drop Luggage', description: 'Proceed to the international drop-off area.', voiceText: 'Proceed to the international drop-off area.' }
      ],
      skipDuplicates: true
    });
    console.log('Seeded luggage guide');
  } catch (err) {
    console.log('Luggage guide already seeded or skipped');
  }

  try {
    await prisma.flight.createMany({
      data: [
        { flightNumber: 'AI202', arrivalTime: new Date('2026-06-20T10:00:00Z'), departureTime: new Date('2026-06-20T16:00:00Z'), gate: 'A12', status: 'ON_TIME' },
        { flightNumber: 'BA100', arrivalTime: null, departureTime: new Date('2026-06-20T18:00:00Z'), gate: 'B5', status: 'SCHEDULED' },
        { flightNumber: 'DL300', arrivalTime: new Date('2026-06-20T12:00:00Z'), departureTime: null, gate: null, status: 'ARRIVED' }
      ],
      skipDuplicates: true
    });
    console.log('Seeded flights');
  } catch (err) {
    console.log('Flights already seeded or skipped');
  }

  // Seed default FlightInfo for Flight Tracking UI
  await (prisma as any).flightInfo?.upsert({
    where: { flightNumber: 'AI-102' },
    update: {
      departureTerminal: 'T1',
      assignedGate: 'Gate 14B',
      seatAssignment: '18A',
      flightDate: '2026-07-16'
    },
    create: {
      flightNumber: 'AI-102',
      departureTerminal: 'T1',
      assignedGate: 'Gate 14B',
      seatAssignment: '18A',
      flightDate: '2026-07-16'
    }
  });
  console.log('Seeded flight info');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
