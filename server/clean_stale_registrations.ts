/**
 * clean_stale_registrations.ts
 *
 * Purges all device subscriptions that were registered under malformed or
 * ICAO-prefixed flight numbers (e.g. ING6E241, IGO6E241, AIC102).
 *
 * Also reports the remaining clean state of the DeviceSubscription table.
 *
 * Run: npx ts-node clean_stale_registrations.ts
 */
import prisma from './src/prisma/client';

const ICAO_PREFIXES = ['ING', 'IGO', 'IAC', 'AIC', 'AIE', 'AIX', 'SXB', 'SEJ', 'GOW', 'VTI', 'CTM', 'BTI'];

function maskToken(token: string): string {
  if (!token || token.length <= 10) return '***';
  return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
}

async function cleanStaleRegistrations() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  PostgreSQL Device Subscription Cleanup Script');
  console.log('══════════════════════════════════════════════════════════════');

  try {
    // 1. Show current state before cleanup
    const all: any[] = await (prisma as any).deviceSubscription.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    console.log(`\n[Cleanup] 📊 Current total device subscriptions: ${all.length}`);
    if (all.length > 0) {
      console.log('[Cleanup] Existing records:');
      for (const r of all) {
        console.log(`  ⦿ flight="${r.flightNumber}" | token=${maskToken(r.deviceToken)} | platform=${r.platform} | updated=${r.updatedAt.toISOString()}`);
      }
    }

    // 2. Find malformed registrations (ICAO-prefixed flight numbers)
    const malformedPatterns = ICAO_PREFIXES.map((pfx) => `${pfx}%`);
    const malformedRecords: any[] = await (prisma as any).deviceSubscription.findMany({
      where: {
        OR: ICAO_PREFIXES.map((pfx) => ({
          flightNumber: { startsWith: pfx },
        })),
      },
    });

    console.log(`\n[Cleanup] 🔍 Found ${malformedRecords.length} malformed (ICAO-prefixed) registration(s):`);
    for (const r of malformedRecords) {
      console.log(`  ✗ flight="${r.flightNumber}" | token=${maskToken(r.deviceToken)} — WILL BE DELETED`);
    }

    // 3. Delete malformed registrations
    if (malformedRecords.length > 0) {
      const deleteResult = await (prisma as any).deviceSubscription.deleteMany({
        where: {
          OR: ICAO_PREFIXES.map((pfx) => ({
            flightNumber: { startsWith: pfx },
          })),
        },
      });
      console.log(`\n[Cleanup] 🗑️  Deleted ${deleteResult.count} malformed registration(s) from PostgreSQL.`);
    } else {
      console.log('\n[Cleanup] ✅ No malformed registrations found.');
    }

    // 4. Also clean stale FlightStateSnapshot entries
    const snapshots: any[] = await (prisma as any).flightStateSnapshot.findMany();
    console.log(`\n[Cleanup] 📋 FlightStateSnapshot records: ${snapshots.length}`);
    for (const s of snapshots) {
      console.log(`  ⦿ flight="${s.flightNumber}" | terminal="${s.terminal}" | gate="${s.gate}"`);
    }

    const staleSnapshots: any[] = await (prisma as any).flightStateSnapshot.findMany({
      where: {
        OR: ICAO_PREFIXES.map((pfx) => ({
          flightNumber: { startsWith: pfx },
        })),
      },
    });
    if (staleSnapshots.length > 0) {
      await (prisma as any).flightStateSnapshot.deleteMany({
        where: {
          OR: ICAO_PREFIXES.map((pfx) => ({
            flightNumber: { startsWith: pfx },
          })),
        },
      });
      console.log(`[Cleanup] 🗑️  Deleted ${staleSnapshots.length} malformed FlightStateSnapshot(s).`);
    }

    // 5. Final clean state
    const remaining: any[] = await (prisma as any).deviceSubscription.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    console.log(`\n[Cleanup] ✅ CLEAN STATE — Remaining device subscriptions: ${remaining.length}`);
    for (const r of remaining) {
      console.log(`  ✓ flight="${r.flightNumber}" | token=${maskToken(r.deviceToken)} | platform=${r.platform}`);
    }

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  Cleanup complete. Now rebuild APK and scan real boarding pass.');
    console.log('══════════════════════════════════════════════════════════════\n');
  } catch (err: any) {
    console.error('[Cleanup] ❌ Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanStaleRegistrations();
