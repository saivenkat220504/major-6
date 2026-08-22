import { Request, Response } from 'express';
import OpenAI from 'openai';
import prisma from '../prisma/client';

// ── Lazy OpenRouter client (read env at request time, after dotenv runs) ──────
let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    const key = process.env.LLM_API || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) throw new Error('LLM_API environment variable is not set');
    _client = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Airport Aura Assistant',
      },
    });
  }
  return _client;
}

const MODEL = 'openai/gpt-4o-mini';

// ── Known Airport Locations & POIs for Validation ─────────────────────────────
const KNOWN_AIRPORT_LOCATIONS: string[] = [
  'Main Entrance 01',
  'Main Entrance 02',
  'Main Entrance',
  'Entrance 01',
  'Entrance 02',
  'Entrance 10',
  'Entrance 86',
  'Exit',
  'Terminal T1',
  'Terminal T2',
  'Terminal T3',
  'Terminal T4',
  'Terminal T5',
  'Terminal T6',
  'Gate A1',
  'Gate A2',
  'Gate A4',
  'Gate A5',
  'Gate A6',
  'Gate A9',
  'Gate A10',
  'Gate A12',
  'Gate 14B',
  'Gate B1',
  'Gate B2',
  'Gate B3',
  'Gate B36',
  'Gate C54',
  'Security Checkpoint 1',
  'Security Checkpoint 2',
  'Security Check',
  'Security North',
  'Luggage Check',
  'Passport Control',
  'Immigration (West)',
  'Immigration (East)',
  'Baggage Claim Hall',
  'Baggage Drop (West)',
  'Baggage Drop (East)',
  'Belt 4',
  'Belt 5',
  'BA Galleries Club Lounge',
  'Galleries First Lounge',
  'Concorde Room',
  'Lounge',
  'Reading Lounge',
  'Business Center',
  'Waiting Area',
  'Duty Free Shop',
  'Duty Free',
  'Tech Express',
  'Local Handicrafts',
  'Bake & Brew',
  'Fast Bites',
  'Premium Coffee Co.',
  'Starbucks Coffee',
  'Costa Coffee',
  'Ticket Check',
  'Information Desk',
];

// ── 2-Way Case-Insensitive Location Matching Helper ───────────────────────────
function matchAirportLocation(query: string, candidateList: string[]): string | null {
  if (!query || !query.trim()) return null;
  const qClean = query.trim().toLowerCase();

  // 1. Exact case-insensitive match
  const exact = candidateList.find((loc) => loc.toLowerCase() === qClean);
  if (exact) return exact;

  // 2. 2-way inclusion match ignoring spaces & non-alphanumerics
  const normQ = qClean.replace(/[^a-z0-9]/g, '');
  const matched = candidateList.find((loc) => {
    const locClean = loc.toLowerCase();
    const normLoc = locClean.replace(/[^a-z0-9]/g, '');
    return normLoc === normQ || locClean.includes(qClean) || qClean.includes(locClean);
  });
  if (matched) return matched;

  // 3. Token match
  const tokens = qClean.split(/\s+/).filter((t) => t.length > 1);
  if (tokens.length > 0) {
    const tokenMatched = candidateList.find((loc) => {
      const locClean = loc.toLowerCase();
      return tokens.every((tok) => locClean.includes(tok));
    });
    if (tokenMatched) return tokenMatched;
  }

  return null;
}

// ── System Prompt for Agentic Aura ────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Aura, an intelligent Agentic Airport AI Guide.

Your purpose is to act like a real airport concierge that helps passengers navigate and manage their journey efficiently.
You must understand user intent, select the correct airport feature, validate inputs, enforce authority permissions, execute permitted actions, and provide concise, natural-language responses.

================================================================================
AGENT AUTHORITY & PERMISSION MODEL
================================================================================

1. AUTONOMOUS ACTIONS (Aura can execute directly):
   - "find_route": Route planning between source and destination inside the terminal.
   - "check_baggage_status": Retrieve real-time baggage status for the user's checked bags.
   - "get_flight_info": Provide flight details (gate, terminal, seat, boarding time countdown) directly from passenger context.

2. GUIDED ACTIONS (Aura opens the feature and provides step-by-step guidance; Aura MUST NOT perform restricted actions):
   - "guide_live_flight_location": Used when user asks to see live satellite flight location or radar. Open Flight Tracking and explain steps to search flight and click 'View on Map'. DO NOT click 'Open Live Flight Location' autonomously.
   - "guide_verify_bag": Used when user asks to verify their bag. Open Baggage Guidance, tell them the bag is at the belt, and explain that they must tap 'Verify My Bag' and scan the barcode. NEVER scan barcode or claim verification was completed.

3. OPEN_ONLY ACTIONS (Aura opens the module and instructs user what to select):
   - "open_transit_hub": For buses, trains, metros, taxis. Instruct user to select airport and mode of transport, then select Check Connectivity. DO NOT click buttons inside.
   - "open_meal_delivery": For food, drinks, restaurant browsing. Instruct user to choose a restaurant and proceed to food selection. DO NOT place orders or select restaurants.
   - "open_emergency_contact": For emergencies, accidents, stalking, safety concerns. Instruct user to select an emergency reason and click Broadcast. DO NOT click Broadcast or claim an alert was sent.
   - "open_event_scheduler": For boarding alarms or reminders. Pre-fill event_name and event_time if provided.

4. FORBIDDEN ACTIONS (Never allowed):
   - Never broadcast emergency alerts autonomously.
   - Never verify a bag or scan a barcode automatically.
   - Never place food orders or make payments.
   - Never open external 3D radar links directly.
   - Never fabricate non-existent gates, locations, flights, or routes.

================================================================================
IRRELEVANT / OUT-OF-SCOPE QUESTIONS
================================================================================
If the user asks something unrelated to their airport journey (e.g., "Where is my gf?", "Who will win the World Cup?", "Tell me a joke", "What is the capital of France?"), you MUST respond with:
"Please ask something relevant to your airport journey."
Do NOT call any tool for out-of-scope questions.

Relevant questions include: flights, boarding, gates, terminals, baggage, navigation, transit, food, airport facilities, emergency assistance, airport services, and journey planning.

================================================================================
RESPONSE FORMAT
================================================================================
You MUST respond with a JSON object with this exact shape:
{
  "matched_intent": "find_route" | "check_baggage_status" | "guide_verify_bag" | "get_flight_info" | "guide_live_flight_location" | "open_transit_hub" | "open_meal_delivery" | "open_emergency_contact" | "open_event_scheduler" | "airport_info" | "irrelevant" | "none",
  "action_payload": {
    "source": "string or null",
    "destination": "string or null",
    "event_name": "string or null",
    "event_time": "string or null"
  },
  "general_reply": "Concise natural language answer for the user."
}

Do not reveal internal reasoning or chain-of-thought. Provide only the concise JSON.`;

// ── Context Builders ─────────────────────────────────────────────────────────
function buildPassengerContext(passenger: Record<string, any>): string {
  return `\n--- Passenger Details ---
Name: ${passenger.passenger_name || 'N/A'}
Ticket ID: ${passenger.ticket_id || 'N/A'}
Flight: ${passenger.flight_id || passenger.flight_number || 'N/A'}
Date: ${passenger.date || 'Today'}
From: ${passenger.from || 'N/A'}
To: ${passenger.to || 'N/A'}
Terminal: ${passenger.terminal || 'Terminal 2'}
Seat: ${passenger.seat || '12A (Window)'}
Gate: ${passenger.gate || 'Gate 14B'}
Boarding Time: ${passenger.boarding_time || '01h 18m remaining'}
-------------------------`;
}

function buildFlightTrackingContext(flightTracking: any): string {
  if (!flightTracking) return '';
  return `\n--- Flight Tracking Status ---
Countdown: ${flightTracking.countdown || '01h 18m'}
Gate: ${flightTracking.gate || 'Gate 14B'}
Status: ${flightTracking.status || 'Boarding Soon'}
------------------------------`;
}

function buildDestinationsContext(destinations: any[]): string {
  const defaultList = KNOWN_AIRPORT_LOCATIONS.map((loc) => `- "${loc}"`).join('\n');
  if (!Array.isArray(destinations) || destinations.length === 0) {
    return `\n--- Valid Airport Navigation Locations ---\n${defaultList}\n------------------------------------------`;
  }
  const customList = destinations
    .map((d: any) => `- "${d.label || d.id}" (Category: ${d.category || 'general'})`)
    .join('\n');
  return `\n--- Valid Airport Navigation Locations ---\n${customList}\n------------------------------------------`;
}

// ── Error Response Helper ─────────────────────────────────────────────────────
function handleError(res: Response, err: any, context: string) {
  const body = err?.response?.data || err?.message || String(err);
  console.error(`[Aura] ${context}:`, JSON.stringify(body));
  const status: number = err?.status || err?.response?.status || 500;
  const msg =
    status === 429
      ? 'Rate limit reached. Please try again in a moment.'
      : status === 401
      ? 'AI authentication failed. Check LLM_API key.'
      : 'AI service temporarily unavailable. Please try again.';
  return res.status(status > 499 ? 500 : status).json({ error: msg });
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/aura/chats — list all chats
// ═══════════════════════════════════════════════════════════════════════════════
export async function listChats(req: Request, res: Response) {
  try {
    const chats = await prisma.auraChat.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    res.json(chats);
  } catch (err) {
    console.error('[Aura] listChats error:', err);
    res.status(500).json({ error: 'Failed to load chats.' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/aura/new-chat — create a new chat session
// ═══════════════════════════════════════════════════════════════════════════════
export async function createChat(req: Request, res: Response) {
  try {
    const count = await prisma.auraChat.count();
    const title = `Chat ${count + 1}`;
    const chat = await prisma.auraChat.create({ data: { title } });
    res.json(chat);
  } catch (err) {
    console.error('[Aura] createChat error:', err);
    res.status(500).json({ error: 'Failed to create chat.' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/aura/chat/:id — get all messages for a chat
// ═══════════════════════════════════════════════════════════════════════════════
export async function getChatMessages(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    const messages = await prisma.auraMessage.findMany({
      where: { chatId: id },
      orderBy: { timestamp: 'asc' },
    });
    res.json(messages);
  } catch (err) {
    console.error('[Aura] getChatMessages error:', err);
    res.status(500).json({ error: 'Failed to load messages.' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DELETE /api/aura/chat/:id — delete a chat
// ═══════════════════════════════════════════════════════════════════════════════
export async function deleteChat(req: Request, res: Response) {
  try {
    const id = req.params.id as string;
    await prisma.auraChat.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error('[Aura] deleteChat error:', err);
    res.status(500).json({ error: 'Failed to delete chat.' });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/aura/chat — Agentic AI Endpoint
// ═══════════════════════════════════════════════════════════════════════════════
export async function handleAuraChat(req: Request, res: Response) {
  try {
    const { message, chatId, passenger, destinations, flightTrackingData } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const trimmedMsg = message.trim();

    // ── 0. Deterministic Pre-Check for Non-Journey Out-of-Scope Queries ───────
    const lower = trimmedMsg.toLowerCase().replace(/[?!.,]/g, '').trim();
    const obviousIrrelevantPatterns = [
      /^where is my (gf|girlfriend|wife|husband|bf|boyfriend|mom|dad|dog|cat|friend)$/,
      /^tell me a joke$/,
      /^tell a joke$/,
      /^who (is|was) the president/,
      /^who will win the (world cup|match|game|election)/,
      /^what is the capital of (france|germany|japan|usa|india|china|italy)/,
      /^sing a song$/,
      /^what is the meaning of life$/,
    ];

    if (obviousIrrelevantPatterns.some((pattern) => pattern.test(lower))) {
      const response = 'Please ask something relevant to your airport journey.';
      return res.json({ response, action: null, chatId: chatId || null });
    }

    let client: OpenAI;
    try {
      client = getClient();
    } catch {
      return res.status(503).json({ error: 'AI service not configured. LLM_API key is missing.' });
    }

    // ── 1. Resolve or create chat session ─────────────────────────────────────
    let activeChatId = chatId as string | undefined;
    if (!activeChatId) {
      const count = await prisma.auraChat.count();
      const newChat = await prisma.auraChat.create({ data: { title: `Chat ${count + 1}` } });
      activeChatId = newChat.id;
    }

    // ── 2. Persist user message ───────────────────────────────────────────────
    await prisma.auraMessage.create({
      data: { chatId: activeChatId, role: 'user', content: trimmedMsg },
    });

    // ── 3. Build sliding window history (last 14 messages / 7 turns) ──────────
    const allMessages = await prisma.auraMessage.findMany({
      where: { chatId: activeChatId },
      orderBy: { timestamp: 'asc' },
    });

    const history = allMessages.slice(0, -1);
    const slidingWindow = history.slice(-14);

    // ── 4. Build Contexts ─────────────────────────────────────────────────────
    const passengerCtx = passenger && typeof passenger === 'object'
      ? buildPassengerContext(passenger)
      : '\n--- Passenger Details: Not provided ---';

    const flightTrackingCtx = buildFlightTrackingContext(flightTrackingData);
    const destsCtx = buildDestinationsContext(destinations);

    const systemContent = SYSTEM_PROMPT + passengerCtx + flightTrackingCtx + destsCtx;

    const historyForLLM = slidingWindow.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemContent },
      ...historyForLLM,
      { role: 'user', content: trimmedMsg },
    ];

    // ── 5. Call OpenAI / OpenRouter with Agentic Tools ─────────────────────────
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: llmMessages,
      max_tokens: 512,
      temperature: 0.1,
      tools: [
        {
          type: 'function',
          function: {
            name: 'find_route',
            description: 'Calculate and display an autonomous route between source and destination inside the terminal.',
            parameters: {
              type: 'object',
              properties: {
                source: { type: 'string', description: 'Origin location inside the airport (e.g. Entrance 10)' },
                destination: { type: 'string', description: 'Destination gate or facility (e.g. Gate A9)' },
              },
              required: ['destination'],
            },
          },
        },
        {
          type: 'function',
          function: {
            name: 'check_baggage_status',
            description: 'Check real-time baggage tracking status for the passenger and locate their bag belt.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'guide_verify_bag',
            description: 'Guide the user on how to verify their baggage with barcode scan once arrived at the belt.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'get_flight_info',
            description: 'Retrieve flight status, assigned gate, terminal, seat, and boarding countdown.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'guide_live_flight_location',
            description: 'Provide step-by-step guidance on how the user can view live radar flight location on map.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'open_transit_hub',
            description: 'Open Airport Transit Services for bus, train, metro, and taxi schedules.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'open_meal_delivery',
            description: 'Open Meal Delivery screen to browse restaurants and pre-book meals.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'open_emergency_contact',
            description: 'Open Emergency Contact screen for emergency reporting.',
            parameters: { type: 'object', properties: {} },
          },
        },
        {
          type: 'function',
          function: {
            name: 'open_event_scheduler',
            description: 'Open Event Scheduler screen for boarding alarms and reminders.',
            parameters: {
              type: 'object',
              properties: {
                event_name: { type: 'string', description: 'Name of the event' },
                event_time: { type: 'string', description: 'Time of the event' },
              },
            },
          },
        },
      ],
    });

    const responseMsg = completion.choices?.[0]?.message;
    const rawResponse = responseMsg?.content?.trim() || '';
    const toolCalls = responseMsg?.tool_calls;

    // ── 6. Agent Decision & Parsing ───────────────────────────────────────────
    let parsedDecision = {
      matched_intent: 'none',
      action_payload: {} as any,
      general_reply: '',
    };

    if (rawResponse) {
      try {
        let cleanJson = rawResponse;
        if (cleanJson.includes('```')) {
          const match = cleanJson.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
          if (match && match[1]) cleanJson = match[1];
        }
        parsedDecision = JSON.parse(cleanJson);
      } catch {
        parsedDecision.general_reply = rawResponse;
      }
    }

    let calledTool = '';
    let toolArgs: any = {};
    if (toolCalls && toolCalls.length > 0) {
      calledTool = toolCalls[0].function.name;
      try {
        toolArgs = JSON.parse(toolCalls[0].function.arguments);
      } catch {}
    } else if (parsedDecision.matched_intent && parsedDecision.matched_intent !== 'none') {
      calledTool = parsedDecision.matched_intent;
      toolArgs = parsedDecision.action_payload || {};
    }

    // ── 7. Agent Authority, Validation & Execution Pipeline ────────────────────
    let finalAction: { type: string; [key: string]: any } | null = null;
    let finalReply = parsedDecision.general_reply || '';

    // Collect candidate locations
    const candidateLocations = Array.from(
      new Set([
        ...KNOWN_AIRPORT_LOCATIONS,
        ...(Array.isArray(destinations) ? destinations.map((d: any) => d.label || d.id) : []),
      ])
    );

    if (calledTool === 'irrelevant' || parsedDecision.matched_intent === 'irrelevant') {
      finalReply = 'Please ask something relevant to your airport journey.';
      finalAction = null;
    } else if (calledTool === 'find_route') {
      const rawSource = toolArgs.source || parsedDecision.action_payload?.source || '';
      const rawDest = toolArgs.destination || parsedDecision.action_payload?.destination || '';

      if (!rawDest) {
        finalReply = 'Please specify a destination so I can find the route for you.';
        finalAction = { type: 'navigate' };
      } else {
        const matchedDest = matchAirportLocation(rawDest, candidateLocations);

        if (rawSource) {
          const matchedSource = matchAirportLocation(rawSource, candidateLocations);

          if (!matchedSource && !matchedDest) {
            finalReply = `I couldn't find valid airport locations for "${rawSource}" or "${rawDest}".`;
            finalAction = { type: 'navigate' };
          } else if (!matchedSource) {
            finalReply = `I found ${matchedDest}, but "${rawSource}" is not a valid airport location.`;
            finalAction = { type: 'navigate' };
          } else if (!matchedDest) {
            finalReply = `I found ${matchedSource}, but "${rawDest}" is not a valid destination.`;
            finalAction = { type: 'navigate' };
          } else if (matchedSource.toLowerCase() === matchedDest.toLowerCase()) {
            finalReply = `Start and destination are the same location (${matchedSource}).`;
            finalAction = { type: 'navigate', from: matchedSource, to: matchedDest };
          } else {
            // Success: valid route planned
            finalAction = { type: 'navigate', from: matchedSource, to: matchedDest };
            finalReply = `The route from **${matchedSource}** to **${matchedDest}** has been displayed on the map.`;
          }
        } else {
          // Only destination provided
          if (!matchedDest) {
            finalReply = `I couldn't find a valid destination named "${rawDest}".`;
            finalAction = { type: 'navigate' };
          } else {
            finalAction = { type: 'navigate', poiId: matchedDest };
            finalReply = `I've opened the map for **${matchedDest}**. If you need a route, please let me know your starting location.`;
          }
        }
      }
    } else if (calledTool === 'check_baggage_status') {
      // AUTONOMOUS: Identify bag, verify belt, open Baggage Guidance
      finalAction = { type: 'baggage_guidance', autoCheckTag: '176-8927362' };
      finalReply = "Your bag is currently at Belt 4. The baggage status has been displayed in Baggage Guidance.";
    } else if (calledTool === 'guide_verify_bag') {
      // GUIDED: Explain arrival at belt and guide barcode verification
      finalAction = { type: 'baggage_guidance' };
      finalReply = "Your bag has arrived at Belt 4. Please select **Verify My Bag** in Baggage Guidance to open the barcode scanner, then scan your bag barcode to complete verification.";
    } else if (calledTool === 'get_flight_info') {
      // AUTONOMOUS: Summarize flight details directly
      const gate = passenger?.gate || 'Gate 14B';
      const flight = passenger?.flight_id || passenger?.flight_number || 'AI-102';
      const seat = passenger?.seat || '12A (Window)';
      const term = passenger?.terminal || 'Terminal 2';
      const countdown = flightTrackingData?.countdown || '01h 18m';

      finalAction = { type: 'flight_tracking' };
      finalReply = `Flight **${flight}** departs from **${term}**, **${gate}** (Seat **${seat}**). Boarding countdown: **${countdown}**.`;
    } else if (calledTool === 'guide_live_flight_location') {
      // GUIDED: Open Flight Tracking, provide explicit manual instructions. DO NOT click external link.
      finalAction = { type: 'flight_tracking' };
      finalReply = "I've opened Flight Tracking for you.\n\nTo view your live flight on the map:\n1. Go to the top-right search bar.\n2. Select **Flight by Route**.\n3. Enter **From** and **To**.\n4. Select your flight number.\n5. Scroll down the flight card.\n6. Click **View on Map**.";
    } else if (calledTool === 'open_transit_hub') {
      // OPEN_ONLY: Open Transit Services, instruct user. DO NOT click controls.
      finalAction = { type: 'transit_services' };
      finalReply = "I've opened Transit Services. Please select the airport and your preferred mode of transport, then select Check Connectivity to view the available transit options.";
    } else if (calledTool === 'open_meal_delivery') {
      // OPEN_ONLY: Open Meal Delivery, instruct user. DO NOT order food.
      finalAction = { type: 'meal_delivery' };
      finalReply = "Meal Delivery is open. Please select a restaurant and proceed to food selection.";
    } else if (calledTool === 'open_emergency_contact') {
      // OPEN_ONLY: Open Emergency Contact, instruct user. DO NOT click broadcast.
      finalAction = { type: 'emergency_contact' };
      finalReply = "Emergency Contact is open. Please select a valid reason for the emergency and click Broadcast. Your information will be forwarded to the concerned authorities.";
    } else if (calledTool === 'open_event_scheduler') {
      // OPEN_ONLY: Open Event Scheduler
      const ename = toolArgs.event_name || parsedDecision.action_payload?.event_name;
      const etime = toolArgs.event_time || parsedDecision.action_payload?.event_time;
      finalAction = { type: 'event_scheduler', eventName: ename, eventTime: etime };
      finalReply = "I've opened the Event Scheduler. Tap **Save Event** to confirm your reminder.";
    } else if (!finalReply) {
      finalReply = 'I am here to assist with your airport journey, navigation, flight information, baggage, transit, food, and emergency support.';
    }

    // ── 8. Persist Assistant Reply + update timestamp ─────────────────────────
    await prisma.auraMessage.create({
      data: { chatId: activeChatId, role: 'assistant', content: finalReply },
    });

    await prisma.auraChat.update({
      where: { id: activeChatId },
      data: { updatedAt: new Date() },
    });

    return res.json({ response: finalReply, action: finalAction, chatId: activeChatId });
  } catch (err: any) {
    return handleError(res, err, 'handleAuraChat');
  }
}
