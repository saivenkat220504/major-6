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
  appStoreUrl?: string;
  packageName?: string;
  description: string;
  recommendationPrompt: string;
}

interface AppStoreCandidate {
  name: string;
  url: string;
  store: 'google-play' | 'app-store';
  evidenceText: string;
}

interface AirportBusSearchEvidence {
  snippets: string;
  appCandidates: AppStoreCandidate[];
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

function getStoreCandidate(item: any): AppStoreCandidate | null {
  const url = typeof item.link === 'string' ? item.link : '';
  const title = typeof item.title === 'string' ? item.title.trim() : '';

  try {
    const parsedUrl = new URL(url);
    const isGooglePlay =
      parsedUrl.hostname === 'play.google.com' && parsedUrl.pathname.startsWith('/store/apps');
    const isAppStore = parsedUrl.hostname === 'apps.apple.com';

    if (!title || (!isGooglePlay && !isAppStore)) return null;

    const name = title
      .replace(/\s*[-–|]\s*Apps on Google Play\s*$/i, '')
      .replace(/\s+on the App Store\s*$/i, '')
      .trim();

    return name
      ? {
          name,
          url,
          store: isGooglePlay ? 'google-play' : 'app-store',
          evidenceText: `${title}\n${typeof item.snippet === 'string' ? item.snippet : ''}`,
        }
      : null;
  } catch {
    return null;
  }
}

function isAirportRelevantAppCandidate(
  candidate: AppStoreCandidate,
  airportName: string,
  code: string,
  city: string
): boolean {
  const evidence = `${candidate.name}\n${candidate.evidenceText}`.toLowerCase();
  const airportTerms = airportName
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length >= 4 && !['airport', 'international'].includes(term));
  const terms = [city.toLowerCase(), code.toLowerCase(), ...airportTerms].filter((term) => term.length >= 3);

  return terms.some((term) => evidence.includes(term));
}

async function searchAirportBusWebsites(query: string): Promise<AirportBusSearchEvidence> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.error('[AirportBusController] SERPER_API_KEY is not configured.');
    return { snippets: '', appCandidates: [] };
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
    return {
      snippets: organic
        .map((item: any) => `Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`)
        .join('\n\n'),
      appCandidates: organic
        .map(getStoreCandidate)
        .filter((candidate: AppStoreCandidate | null): candidate is AppStoreCandidate => candidate !== null),
    };
  } catch (err: any) {
    console.error('[AirportBusController] Serper search error:', err.message);
    return { snippets: '', appCandidates: [] };
  }
}

async function verifyAirportBusWithLLM(
  airportName: string,
  code: string,
  city: string,
  country: string,
  snippets: string,
  appCandidates: AppStoreCandidate[]
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
5. App details may be selected ONLY from the verified store-listing candidates supplied below. Copy the candidate name and URL exactly; never invent, construct, or guess an app name or URL. Set officialAppObj to null and omit recommendedApp when no candidate is applicable.
6. If sources conflict, set sourcesConflict to true and explain the conflict.
7. Return strict valid JSON only, with no markdown.`;

  const userPrompt = `Airport: ${airportName} (${code}), City: ${city}, Country: ${country}

Live Search Results:
${snippets}

Verified store-listing candidates (the only permitted source for app name and URL):
${appCandidates.length > 0
  ? appCandidates.map((candidate) => `- ${candidate.store}: name="${candidate.name}", url="${candidate.url}"`).join('\n')
  : 'None'}

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
  "officialAppObj": { "name": "Exact candidate name", "playStoreUrl": "Exact Google Play candidate URL", "appStoreUrl": "Exact App Store candidate URL when selected", "description": "Supported description", "recommendationPrompt": "Supported recommendation" } OR null,
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

function selectVerifiedApp(
  llmResult: GroundedBusData,
  appCandidates: AppStoreCandidate[]
): BusOfficialApp | null {
  const requestedUrl = llmResult.officialAppObj?.playStoreUrl || llmResult.officialAppObj?.appStoreUrl;
  const selected = appCandidates.find((candidate) => candidate.url === requestedUrl);
  if (!selected) return null;

  const selectedApp: BusOfficialApp = {
    name: selected.name,
    playStoreUrl: selected.url,
    description: `Store listing returned by the supplied web-search results.`,
    recommendationPrompt: `Use ${selected.name} for the latest service information.`,
  };

  if (selected.store === 'app-store') {
    selectedApp.appStoreUrl = selected.url;
  }

  return selectedApp;
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

    const searchQuery = `${airportName} ${code} ${city} ${country} airport express bus airport bus airport shuttle official route fares schedule official mobile app Google Play App Store`;
    const searchEvidence = await searchAirportBusWebsites(searchQuery);
    const relevantAppCandidates = searchEvidence.appCandidates.filter((candidate) =>
      isAirportRelevantAppCandidate(candidate, airportName, code, city)
    );

    if (searchEvidence.snippets.length <= 50) {
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

    const llmResult = await verifyAirportBusWithLLM(
      airportName,
      code,
      city,
      country,
      searchEvidence.snippets,
      relevantAppCandidates
    );
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

    const officialAppObj = selectVerifiedApp(llmResult, relevantAppCandidates);

    return res.status(200).json({
      success: true,
      airportName,
      airportCode: code,
      city,
      country,
      ...llmResult,
      officialAppObj,
      recommendedApp: officialAppObj?.name,
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
