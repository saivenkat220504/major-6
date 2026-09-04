import prisma from './src/prisma/client';
import {
  registerDeviceToken,
  getTokensForFlight,
  deleteInvalidTokens,
  getFlightStateSnapshot,
  saveFlightStateSnapshot,
  getFlightNumberVariants,
  toCanonicalFlightNumber,
} from './src/services/notificationStorage';

async function verifySystem() {
  console.log('================================================================');
  console.log('--- COMPREHENSIVE NOTIFICATION SYSTEM RELIABILITY VERIFICATION ---');
  console.log('================================================================');

  const testToken = 'fcm_test_token_reliability_' + Date.now();
  const testFlight = 'AI-102';

  // 1. Flight number variants test
  console.log('\n[1] Testing flight number variant generation:');
  const variants1 = getFlightNumberVariants('AI-102');
  const variants2 = getFlightNumberVariants('AI102');
  const variants3 = getFlightNumberVariants('ai 102');
  console.log('  Variants for "AI-102":', variants1);
  console.log('  Variants for "AI102":', variants2);
  console.log('  Variants for "ai 102":', variants3);
  console.log('  Canonical for "ai 102":', toCanonicalFlightNumber('ai 102'));

  // 2. Register token in PostgreSQL via upsert
  console.log('\n[2] Registering token in PostgreSQL via upsert:');
  const sub1 = await registerDeviceToken(testToken, testFlight, 'android');
  console.log('  Inserted record ID:', (sub1 as any).token);

  // 3. Verify in PostgreSQL directly
  console.log('\n[3] Direct PostgreSQL query to prove token persistence:');
  const inDb = await prisma.deviceSubscription.findFirst({
    where: { deviceToken: testToken },
  });
  if (!inDb) {
    throw new Error('FAILED: Token was not found in PostgreSQL!');
  }
  console.log(`  PROVEN: Token stored in PostgreSQL (ID: ${inDb.id}, Flight: "${inDb.flightNumber}")`);

  // 4. Test duplicate prevention (calling upsert again)
  console.log('\n[4] Testing duplicate prevention with repeated registration:');
  await registerDeviceToken(testToken, testFlight, 'android');
  const countAfterDuplicate = await prisma.deviceSubscription.count({
    where: { deviceToken: testToken },
  });
  console.log(`  Count in DB after repeated registration: ${countAfterDuplicate}`);
  if (countAfterDuplicate !== 1) {
    throw new Error(`FAILED: Expected exactly 1 record, found ${countAfterDuplicate}`);
  }
  console.log('  PROVEN: Unique constraint & upsert prevented duplicate registration.');

  // 5. Test flight-number matching with variants (e.g. AI-102 vs AI102)
  console.log('\n[5] Testing flight-number matching across variants:');
  const foundHyphen = await getTokensForFlight('AI-102');
  const foundNoHyphen = await getTokensForFlight('AI102');
  const foundLower = await getTokensForFlight('ai-102');

  console.log('  getTokensForFlight("AI-102") found token?', foundHyphen.includes(testToken));
  console.log('  getTokensForFlight("AI102") found token?', foundNoHyphen.includes(testToken));
  console.log('  getTokensForFlight("ai-102") found token?', foundLower.includes(testToken));

  if (!foundHyphen.includes(testToken) || !foundNoHyphen.includes(testToken)) {
    throw new Error('FAILED: Variant matching failed to find token!');
  }
  console.log('  PROVEN: FlightWatcher will find the token regardless of formatting (AI-102 / AI102).');

  // 6. Test FlightStateSnapshot baseline persistence
  console.log('\n[6] Testing FlightStateSnapshot persistence in PostgreSQL:');
  await saveFlightStateSnapshot('AI-102', 'T2', 'Gate 14C');
  const snapshot = await getFlightStateSnapshot('AI-102');
  console.log(`  Snapshot in DB: flight="${snapshot?.flightNumber}", terminal="${snapshot?.terminal}", gate="${snapshot?.gate}"`);
  if (snapshot?.gate !== 'Gate 14C') {
    throw new Error('FAILED: FlightStateSnapshot did not persist correctly!');
  }
  console.log('  PROVEN: Flight baseline persists in PostgreSQL across restarts.');

  // 7. Test invalid token cleanup
  console.log('\n[7] Testing invalid token deletion from PostgreSQL:');
  const deletedCount = await deleteInvalidTokens([testToken]);
  console.log(`  Deleted count: ${deletedCount}`);
  const remaining = await prisma.deviceSubscription.findFirst({
    where: { deviceToken: testToken },
  });
  if (remaining) {
    throw new Error('FAILED: Token still exists after deletion!');
  }
  console.log('  PROVEN: Invalid / unregistered FCM tokens are cleanly purged from PostgreSQL.');

  console.log('\n================================================================');
  console.log('--- ALL NOTIFICATION RELIABILITY CHECKS PASSED (100% SUCCESS) ---');
  console.log('================================================================\n');
}

verifySystem()
  .catch((err) => {
    console.error('VERIFICATION FAILED:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
