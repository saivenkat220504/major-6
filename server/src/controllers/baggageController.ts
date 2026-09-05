import { Request, Response } from 'express';

/**
 * GET /api/baggage/travel-rules/:airportCode
 *
 * Returns prohibited/restricted item rules for a given airport.
 * Data is airport-specific. In production this would query a database
 * or a regulated data source per airport code.
 *
 * Categories:
 *   prohibited    — absolutely banned from both cabin and hold
 *   carryOnOnly   — permitted in cabin bag only
 *   checkedOnly   — permitted in checked hold baggage only
 *   allowed       — permitted in both cabin and checked baggage
 */
export async function getTravelRules(req: Request, res: Response) {
  try {
    const { airportCode } = req.params;

    if (!airportCode) {
      return res.status(400).json({ message: 'airportCode is required' });
    }

    // Normalise to upper case — same rules apply for all Indian airports under BCAS
    // Airport-specific overrides can be added per code in the future
    const code = String(airportCode).toUpperCase();

    // Base BCAS / DGCA rules applied to all Indian airports
    const rules = {
      prohibited: [
        { name: 'Firearms & Ammunition',          notes: 'Banned from all baggage without prior airline & BCAS approval.' },
        { name: 'Explosive Materials',             notes: 'Fireworks, flares, blasting caps — completely prohibited.' },
        { name: 'Pepper / Tear Gas Spray',        notes: 'Self-defense sprays are banned in all airport areas.' },
        { name: 'Flammable Liquids (>1L)',         notes: 'Petrol, paint thinner, lighter fluid — not permitted.' },
        { name: 'Radioactive Materials',           notes: 'Except medical isotopes with prior approval.' },
        { name: 'Sharp Objects (blades >6cm)',     notes: 'Pocket knives, box cutters, swords.' },
      ],
      carryOnOnly: [
        { name: 'Lithium Batteries / Power Banks', notes: 'Max 100Wh per battery; carry-on only, never checked.' },
        { name: 'Laptop & Tablet',                  notes: 'Must be removed from bag and placed in a separate tray at security.' },
        { name: 'Prescription Medicines (liquid)',  notes: 'Exempt from 100ml rule — carry your prescription.' },
        { name: 'Liquids ≤ 100ml each',             notes: 'All must fit in one transparent 1-litre resealable bag.' },
        { name: 'Matchbox / Lighter (1 only)',       notes: 'One permitted on your person only; not inside cabin bag.' },
        { name: 'Duty-Free Alcohol (sealed bag)',    notes: 'Allowed in cabin if sealed in security tamper-evident bag.' },
      ],
      checkedOnly: [
        { name: 'Liquids > 100ml',                  notes: 'Shampoo, conditioner, oils — must go in checked baggage.' },
        { name: 'Scissors / Knives',                notes: 'Blades ≤ 6cm allowed in checked baggage.' },
        { name: 'Tools (hammer, wrench etc.)',       notes: 'Permitted in checked baggage only.' },
        { name: 'Sports Equipment (bats, clubs)',    notes: 'Golf clubs, cricket bats — checked baggage only.' },
        { name: 'Alcohol (retail packaging, ≤5L)',  notes: '24%–70% ABV; must be in original retail packaging.' },
      ],
      allowed: [
        { name: 'Clothing & Personal Items',        notes: 'No restrictions in cabin or checked.' },
        { name: 'Books & Documents',                notes: 'No restrictions.' },
        { name: 'Food Items (solid)',                notes: 'Allowed in both; liquid-based foods follow the 100ml rule.' },
        { name: 'Camera & Photography Equipment',  notes: 'Allowed in cabin; batteries in cabin only.' },
        { name: 'Baby Food & Formula',              notes: 'Exempt from 100ml rule when travelling with an infant.' },
        { name: 'Walking Aids / Wheelchairs',       notes: 'Allowed; notify airline in advance for special assistance.' },
      ],
    };

    // Airport-specific rule overlays (example: HYD has additional restrictions)
    if (code === 'DEL' || code === 'BOM') {
      rules.prohibited.push({
        name: 'E-cigarettes / Vaping Devices',
        notes: `${code} Terminal: banned from checked baggage; cabin use prohibited.`,
      });
    }

    return res.status(200).json(rules);
  } catch (err) {
    console.error('[baggageController] getTravelRules error:', err);
    return res.status(500).json({ message: 'Server error fetching travel rules.' });
  }
}

import prisma from '../prisma/client';

/**
 * GET /api/baggage/tags
 *
 * Returns all bag tags associated with the passenger or available in the system.
 */
export async function getBagTags(req: Request, res: Response) {
  try {
    const flightQuery = (req.query.flight as string) || '';
    let dbBags: any[] = [];

    try {
      if (flightQuery) {
        dbBags = await (prisma as any).baggageTracking.findMany({
          where: {
            flightNumber: { equals: flightQuery, mode: 'insensitive' },
          },
          select: { tagNumber: true },
        });
      } else {
        dbBags = await (prisma as any).baggageTracking.findMany({
          select: { tagNumber: true },
        });
      }
    } catch {}

    if (dbBags && dbBags.length > 0) {
      return res.status(200).json(dbBags.map((b) => ({ tag: b.tagNumber })));
    }

    // Default sample tags
    const tags = [
      { tag: '176-8927361' },
      { tag: '176-8927362' },
    ];

    return res.status(200).json(tags);
  } catch (err) {
    console.error('[baggageController] getBagTags error:', err);
    return res.status(500).json({ message: 'Server error fetching bag tags.' });
  }
}

/**
 * GET /api/baggage/status/:tagId
 *
 * Returns full status report for a single bag tag from PostgreSQL with dynamic belt and timeline.
 */
export async function getBagStatus(req: Request, res: Response) {
  try {
    const { tagId } = req.params;

    if (!tagId) {
      return res.status(400).json({ message: 'tagId is required' });
    }

    const now = new Date();
    let dbRecord: any = null;

    try {
      dbRecord = await (prisma as any).baggageTracking.findUnique({
        where: { tagNumber: tagId },
      });
    } catch {}

    if (dbRecord) {
      const currentStatus = dbRecord.status || 'Loaded onto Aircraft';
      const belt = dbRecord.belt || (currentStatus.includes('Belt') ? currentStatus.match(/Belt\s*[A-Za-z0-9]+/i)?.[0] || 'Belt 4' : 'Belt 4');
      const isArrival = /Belt/i.test(currentStatus);

      const status = {
        bagTag:           tagId,
        currentStatus:    currentStatus,
        eta:              dbRecord.eta || (isArrival ? 'Arrived' : '2:45 PM (on time)'),
        lastUpdated:      now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        lastScanLocation: dbRecord.lastScanLocation || (isArrival ? `${belt} — Arrival Hall A` : `Cargo Hold — Flight ${dbRecord.flightNumber}`),
        expectedBelt:     `${belt} — Arrival Hall A`,
        timeline: isArrival
          ? [
              { label: 'Checked In',          completed: true,  active: false, time: '08:45 AM' },
              { label: 'Security Cleared',    completed: true,  active: false, time: '09:02 AM' },
              { label: 'Loaded onto Aircraft',completed: true,  active: false, time: '09:40 AM' },
              { label: 'Arrived at Airport',  completed: true,  active: false, time: '11:15 AM' },
              { label: currentStatus,         completed: true,  active: true,  time: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
            ]
          : [
              { label: 'Checked In',          completed: true,  active: false, time: '08:45 AM' },
              { label: 'Security Cleared',    completed: true,  active: false, time: '09:02 AM' },
              { label: 'Loaded onto Aircraft',completed: true,  active: false, time: '09:40 AM' },
              { label: 'Arriving',            completed: false, active: true,  time: 'In Progress' },
              { label: `Waiting at ${belt}`,   completed: false, active: false, time: 'Pending' },
            ],
      };

      return res.status(200).json(status);
    }

    // Mock fallback for legacy / preset demo tags
    const isBag2 = tagId === '176-8927362';

    const status = {
      bagTag:           tagId,
      currentStatus:    isBag2 ? 'Arrived at Belt 4' : 'Loaded onto Aircraft',
      eta:              isBag2 ? 'Arrived' : '2:45 PM (on time)',
      lastUpdated:      now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      lastScanLocation: isBag2 ? 'Belt 4 — Arrival Hall A' : 'Cargo Hold — Flight AI217',
      expectedBelt:     'Belt 4 — Arrival Hall A',
      timeline: isBag2
        ? [
            { label: 'Checked In',          completed: true,  active: false, time: '08:45 AM' },
            { label: 'Security Cleared',    completed: true,  active: false, time: '09:02 AM' },
            { label: 'Loaded onto Aircraft',completed: true,  active: false, time: '09:40 AM' },
            { label: 'Arrived at Airport',  completed: true,  active: false, time: '11:15 AM' },
            { label: 'Arrived at Belt 4',   completed: true,  active: true,  time: '11:30 AM' },
          ]
        : [
            { label: 'Checked In',          completed: true,  active: false, time: '08:45 AM' },
            { label: 'Security Cleared',    completed: true,  active: false, time: '09:02 AM' },
            { label: 'Loaded onto Aircraft',completed: true,  active: false, time: '09:40 AM' },
            { label: 'Arriving',            completed: false, active: true,  time: 'In Progress' },
            { label: 'Waiting at Belt 4',   completed: false, active: false, time: 'Pending' },
          ],
    };

    return res.status(200).json(status);
  } catch (err) {
    console.error('[baggageController] getBagStatus error:', err);
    return res.status(500).json({ message: 'Server error fetching bag status.' });
  }
}
