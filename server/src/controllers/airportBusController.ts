import { Request, Response } from 'express';
import axios from 'axios';
import OpenAI from 'openai';

interface BusOfficialWebsite {
  url: string;
  isLiveTrackingAvailable: boolean;
  note?: string;
}

interface BusOfficialApp {
  name: string;
  playStoreUrl: string;
  packageName?: string;
  description: string;
  recommendationPrompt: string;
}

interface GroundedBusData {
  hasBusService: boolean;
  statusMessage: string;
  serviceName?: string;
  operator?: string;
  busStops?: string[];
  fareRange?: string;
  operatingHours?: string;
  frequency?: string;
  travelTime?: string;
  officialWebsiteObj?: BusOfficialWebsite;
  officialAppObj?: BusOfficialApp;
  recommendedApp?: string;
  noBusDetails?: { message: string; alternatives: string[] };
  notes?: string;
  sourcesConflict?: boolean;
  sourcesConflictNote?: string;
}

async function searchAirportBusWebsites(query: string): Promise<string> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.error('[AirportBusController] SERPER_API_KEY is not configured.');
    return '';
  }

  try {
    const resp = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 6, gl: 'us', hl: 'en' },
      {
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        timeout: 7000,
      }
    );
    const organic = resp.data?.organic || [];
    return organic
      .map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`)
      .join('\n\n');
  } catch (err: any) {
    console.error('[AirportBusController] Serper search error:', err.message);
    return '';
  }
}

async function verifyAirportBusWithLLM(
  airportName: string,
  code: string,
  city: string,
  country: string,
  snippets: string
): Promise<GroundedBusData | null> {
  const openRouterKey = process.env.LLM_API || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!openRouterKey) {
    console.error('[AirportBusController] No LLM API key is configured.');
    return null;
  }

  const client = new OpenAI({
    apiKey: openRouterKey,
    baseURL: (process.env.LLM_API || process.env.OPENROUTER_API_KEY) ? 'https://openrouter.ai/api/v1' : undefined,
  });

  const systemPrompt = `You are Airport Bus Intelligence. Produce accurate, source-backed airport express-bus connectivity information.

CRITICAL GROUNDING RULES:
1. Use ONLY the supplied live search results. Do not use memory or make assumptions.
2. Treat information as current only when the supplied results support that it is current; distinguish planned, suspended, and outdated services from operational ones.
3. Never invent routes, stops, fares, operating hours, frequencies, travel times, operators, websites, or apps.
4. If evidence is insufficient to confirm a direct airport bus, set hasBusService to false and explain the uncertainty in noBusDetails.message.
5. Include official website or Play Store app details only when explicitly supported by the supplied results; otherwise omit those objects.
6. If sources conflict, set sourcesConflict to true and explain the conflict.
7. Return strict valid JSON only, with no markdown.`;

  const userPrompt = `Airport: ${airportName} (${code}), City: ${city}, Country: ${country}

Live Search Results:
${snippets}

Return this exact JSON shape. Omit optional fields when the supplied results do not support them:
{
  "hasBusService": true,
  "statusMessage": "Airport bus connectivity available" OR "Airport bus connectivity could not be confirmed",
  "serviceName": "Official service name",
  "operator": "Official operator name",
  "busStops": ["Airport terminal or confirmed stop", "Confirmed destination"],
  "fareRange": "Confirmed fare or fare range",
  "operatingHours": "Confirmed operating hours",
  "frequency": "Confirmed frequency",
  "travelTime": "Confirmed travel time",
  "officialWebsiteObj": { "url": "https://official.example", "isLiveTrackingAvailable": false, "note": "Only if supported by results" },
  "officialAppObj": { "name": "Official app name", "playStoreUrl": "https://play.google.com/store/apps/details?id=...", "packageName": "Package name if supported", "description": "Supported description", "recommendationPrompt": "Use the official app for the latest service information." },
  "recommendedApp": "Official app name",
  "noBusDetails": { "message": "Why direct service could not be confirmed, including uncertainty when applicable.", "alternatives": ["Only alternatives explicitly supported by results"] },
  "notes": "Brief evidence-based caveat",
  "sourcesConflict": false,
  "sourcesConflictNote": "Explanation when sources conflict"
}`;

  try {
    const response = await client.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    const raw = response.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.hasBusService === 'boolean') {
      return parsed as GroundedBusData;
    }
  } catch (err: any) {
    console.error('[AirportBusController] LLM verification error:', err.message);
  }

  return null;
}

export async function investigateAirportBus(req: Request, res: Response) {
  const checkedAt = new Date().toISOString();

  try {
    const { airportName, airportCode, city, country } = req.body;

    if (!airportName || !airportCode || !city || !country) {
      return res.status(400).json({
        success: false,
        error: 'airportName, airportCode, city, and country are required.',
      });
    }

    const code = (airportCode as string).toUpperCase().trim();
    console.log(`[AirportBusController] Investigating airport bus service for ${airportName} (${code}), ${city}, ${country}`);

    const searchQuery = `${airportName} ${code} ${city} ${country} airport express bus airport bus airport shuttle official route fares schedule`;
    const searchSnippets = await searchAirportBusWebsites(searchQuery);

    if (searchSnippets.length <= 50) {
      return res.status(502).json({
        success: false,
        error: 'Unable to obtain sufficient current web-search results for airport bus verification.',
        airportName,
        airportCode: code,
        city,
        country,
        lastUpdated: checkedAt,
      });
    }

    const llmResult = await verifyAirportBusWithLLM(airportName, code, city, country, searchSnippets);
    if (!llmResult) {
      return res.status(502).json({
        success: false,
        error: 'Unable to structure current airport bus information right now. Please try again.',
        airportName,
        airportCode: code,
        city,
        country,
        lastUpdated: checkedAt,
      });
    }

    return res.status(200).json({
      success: true,
      airportName,
      airportCode: code,
      city,
      country,
      ...llmResult,
      officialWebsite: llmResult.officialWebsiteObj,
      alternatives: llmResult.noBusDetails?.alternatives || [],
      lastUpdated: checkedAt,
      cached: false,
    });
  } catch (err: any) {
    console.error('[AirportBusController] Unexpected error:', err);
    return res.status(500).json({
      success: false,
      error: 'Unable to verify current airport bus information right now. Please try again.',
      timestamp: new Date().toISOString(),
    });
  }
}
