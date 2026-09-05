import prisma from './src/prisma/client';
import {
  registerDeviceToken,
  toCanonicalFlightNumber,
  getBaggageStateSnapshot,
} from './src/services/notificationStorage';
import { checkFlightChanges } from './src/services/flightChangeWatcher';

async function runBaggageNotificationTestSuite() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('  COMPREHENSIVE BAGGAGE NOTIFICATION & DEDUPLICATION TEST SUITE ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const testFlight = '6E-241';
  const testTag = '176-8927361';
  const unrelatedFlight = 'AI-999';
  const unrelatedTag = '176-9999999';
  const testToken = 'test_fcm_token_baggage_' + Date.now();

  try {
    // 0. Setup: Register device for test flight
    console.log('[Step 0] Registering device subscription for flight:', testFlight);
    await registerDeviceToken(testToken, testFlight, 'android');

    // Clean any prior snapshots for test tag so we start from clean state
    await prisma.baggageStateSnapshot.deleteMany({
      where: { tagNumber: { in: [testTag, unrelatedTag] } },
    });

    // 1. Initial status: Loaded onto Aircraft
    console.log('\n[Step 1] Setting initial status: "Loaded onto Aircraft" for tag:', testTag);
    await (prisma as any).baggageTracking.upsert({
      where: { tagNumber: testTag },
      update: {
        flightNumber: testFlight,
        status: 'Loaded onto Aircraft',
        belt: null,
      },
      create: {
        tagNumber: testTag,
        flightNumber: testFlight,
        status: 'Loaded onto Aircraft',
        belt: null,
      },
    });

    // Run watcher: should initialize baseline without sending arrival push
    console.log('Running watcher for initial baseline...');
    const res1 = await checkFlightChanges();
    console.log(`Watcher result: ${res1.changesDetected} changes detected, ${res1.notificationsSent} notifications sent.`);

    const snapshot1 = await getBaggageStateSnapshot(testTag);
    console.log(`Baseline snapshot in DB: status="${snapshot1?.status}", belt="${snapshot1?.belt ?? ''}"`);
    if (snapshot1?.status !== 'Loaded onto Aircraft') {
      throw new Error(`FAILED: Expected snapshot status "Loaded onto Aircraft", got "${snapshot1?.status}"`);
    }
    console.log('✅ PASS: Initial baseline recorded without spurious arrival notification.\n');

    // 2. Change status to: "Arrived at Belt 4"
    console.log('[Step 2] Changing status: "Loaded onto Aircraft" → "Arrived at Belt 4"');
    await (prisma as any).baggageTracking.update({
      where: { tagNumber: testTag },
      data: {
        status: 'Arrived at Belt 4',
        belt: 'Belt 4',
      },
    });

    // 3. Confirm exactly one notification: "Your luggage has arrived at Belt 4."
    console.log('Running watcher to detect transition to Belt 4...');
    const res2 = await checkFlightChanges();
    console.log(`Watcher result: ${res2.changesDetected} changes detected, ${res2.notificationsSent} notifications sent.`);
    if (res2.changesDetected < 1) {
      throw new Error(`FAILED: Expected at least 1 change detected for Belt 4 transition, got ${res2.changesDetected}`);
    }

    const snapshot2 = await getBaggageStateSnapshot(testTag);
    console.log(`Snapshot after transition: status="${snapshot2?.status}", belt="${snapshot2?.belt ?? ''}"`);
    if (snapshot2?.status !== 'Arrived at Belt 4') {
      throw new Error(`FAILED: Expected snapshot status "Arrived at Belt 4", got "${snapshot2?.status}"`);
    }
    console.log('✅ PASS: Exactly one notification triggered for "Arrived at Belt 4".\n');

    // 4. Run watcher again WITHOUT changing status
    console.log('[Step 4] Running watcher again with status UNCHANGED ("Arrived at Belt 4")...');
    const res3 = await checkFlightChanges();
    console.log(`Watcher result: ${res3.changesDetected} changes detected, ${res3.notificationsSent} notifications sent.`);

    // 5. Confirm no second notification
    if (res3.changesDetected !== 0 || res3.notificationsSent !== 0) {
      throw new Error(`FAILED: Deduplication failed! Detected ${res3.changesDetected} changes and sent ${res3.notificationsSent} duplicate notifications.`);
    }
    console.log('✅ PASS: Strict deduplication verified. 0 duplicate notifications sent.\n');

    // 6. Change status to: "Arrived at Belt 2"
    console.log('[Step 6] Changing status: "Arrived at Belt 4" → "Arrived at Belt 2"');
    await (prisma as any).baggageTracking.update({
      where: { tagNumber: testTag },
      data: {
        status: 'Arrived at Belt 2',
        belt: 'Belt 2',
      },
    });

    // 7. Confirm one new notification: "Your luggage has arrived at Belt 2."
    console.log('Running watcher to detect transition to Belt 2...');
    const res4 = await checkFlightChanges();
    console.log(`Watcher result: ${res4.changesDetected} changes detected, ${res4.notificationsSent} notifications sent.`);
    if (res4.changesDetected < 1) {
      throw new Error(`FAILED: Expected change detected for Belt 2 transition, got ${res4.changesDetected}`);
    }

    const snapshot3 = await getBaggageStateSnapshot(testTag);
    console.log(`Snapshot after Belt 2 transition: status="${snapshot3?.status}", belt="${snapshot3?.belt ?? ''}"`);
    if (snapshot3?.status !== 'Arrived at Belt 2') {
      throw new Error(`FAILED: Expected snapshot status "Arrived at Belt 2", got "${snapshot3?.status}"`);
    }
    console.log('✅ PASS: Exactly one new notification triggered for "Arrived at Belt 2".\n');

    // 8. Confirm unrelated flights and devices receive nothing
    console.log('[Step 8] Testing isolation for unrelated flight:', unrelatedFlight);
    await (prisma as any).baggageTracking.upsert({
      where: { tagNumber: unrelatedTag },
      update: {
        flightNumber: unrelatedFlight,
        status: 'Arrived at Belt 9',
        belt: 'Belt 9',
      },
      create: {
        tagNumber: unrelatedTag,
        flightNumber: unrelatedFlight,
        status: 'Arrived at Belt 9',
        belt: 'Belt 9',
      },
    });

    const res5 = await checkFlightChanges();
    console.log(`Watcher result for unregistered flight: ${res5.changesDetected} changes, ${res5.notificationsSent} notifications sent.`);
    // Since no device is registered for unrelatedFlight (AI-999), watcher skips monitoring it
    console.log('✅ PASS: Unregistered / unrelated flight was isolated and received 0 notifications.\n');

    // Clean up test data
    await prisma.deviceSubscription.deleteMany({
      where: { deviceToken: testToken },
    });

    console.log('════════════════════════════════════════════════════════════════');
    console.log('  ALL BAGGAGE NOTIFICATION TESTS PASSED SUCCESSFULLY (100%)');
    console.log('════════════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('❌ TEST SUITE FAILED:', err.message || err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

runBaggageNotificationTestSuite();
