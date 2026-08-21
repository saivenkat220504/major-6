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

interface SearchResult {
  title: string;
  snippet: string;
  link: string;
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

function getStoreCandidate(item: SearchResult): AppStoreCandidate | null {
  const url = item.link;
  const title = item.title.trim();

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
          evidenceText: `${title}\n${item.snippet}`,
        }
      : null;
  } catch {
    return null;
  }
}

function formatSearchResults(results: SearchResult[]): string {
  return results
    .map((item) => `Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}`)
    .join('\n\n');
}

function getDistinctTerms(value: string): string[] {
  const ignoredTerms = new Set([
    'airport', 'international', 'express', 'service', 'services', 'bus', 'buses',
    'transport', 'transportation', 'airportbus', 'the', 'and', 'for', 'from', 'with',
  ]);

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !ignoredTerms.has(term));
}

function hasExplicitTransportAppAssociation(
  candidate: AppStoreCandidate,
  appSearchResults: SearchResult[],
  operator: string,
  serviceName: string
): boolean {
  const appName = candidate.name.toLowerCase();
  const associationPattern = /\b(official(?:\s+mobile)?\s+app|mobile\s+app|app\s+(?:by|from|for)|operated\s+by|provided\s+by|run\s+by|download\s+(?:the\s+)?app)\b/i;
  const operatorTerms = getDistinctTerms(operator);
  const serviceTerms = getDistinctTerms(serviceName);

  return appSearchResults.some((result) => {
    const evidence = `${result.title}\n${result.snippet}`.toLowerCase();
    const mentionsExactApp = evidence.includes(appName);
    const mentionsOperator = operatorTerms.some((term) => evidence.includes(term));
    const mentionsService = serviceTerms.some((term) => evidence.includes(term));

    return mentionsExactApp && (mentionsOperator || mentionsService) && associationPattern.test(evidence);
  });
}

async function searchAirportBusWebsites(query: string): Promise<SearchResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.error('[AirportBusController] SERPER_API_KEY is not configured.');
    return [];
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
    const organic = Array.isArray(resp.data?.organic) ? resp.data.organic : [];
    return organic.map((item: any) => ({
      title: typeof item.title === 'string' ? item.title : '',
      snippet: typeof item.snippet === 'string' ? item.snippet : '',
      link: typeof item.link === 'string' ? item.link : '',
    }));
  } catch (err: any) {
    console.error('[AirportBusController] Serper search error:', err.message);
    return [];
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
5. Do not identify, suggest, or infer any mobile app in this stage. App verification is a separate operator/service-specific step.
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
  "officialAppObj": null,
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

async function selectTransportServiceAppWithLLM(
  operator: string,
  serviceName: string,
  appSearchResults: SearchResult[],
  verifiedCandidates: AppStoreCandidate[]
): Promise<string | null> {
  if (verifiedCandidates.length === 0) return null;

  const openRouterKey = process.env.LLM_API || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!openRouterKey) return null;

  const client = new OpenAI({
    apiKey: openRouterKey,
    baseURL: (process.env.LLM_API || process.env.OPENROUTER_API_KEY) ? 'https://openrouter.ai/api/v1' : undefined,
  });

  const candidates = verifiedCandidates
    .map((candidate) => `- name="${candidate.name}", url="${candidate.url}"`)
    .join('\n');

  try {
    const response = await client.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Select an app only when the supplied evidence explicitly associates its exact name with the specified transport operator or service. Return strict JSON only. Never infer an association or construct a URL.',
        },
        {
          role: 'user',
          content: `Operator: ${operator}\nService: ${serviceName}\n\nSearch evidence:\n${formatSearchResults(appSearchResults)}\n\nPre-validated candidates:\n${candidates}\n\nReturn {"selectedStoreUrl":"one exact candidate URL"} or {"selectedStoreUrl":null}.`,
        },
      ],
      temperature: 0,
      max_tokens: 150,
    });
    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim());
    return typeof parsed.selectedStoreUrl === 'string' && verifiedCandidates.some((candidate) => candidate.url === parsed.selectedStoreUrl)
      ? parsed.selectedStoreUrl
      : null;
  } catch (err: any) {
    console.error('[AirportBusController] Transport app verification error:', err.message);
    return null;
  }
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

    const searchQuery = `${airportName} ${code} ${city} ${country} airport express bus airport bus airport shuttle official route fares schedule`;
    const transportSearchResults = await searchAirportBusWebsites(searchQuery);
    const transportSnippets = formatSearchResults(transportSearchResults);

    if (transportSnippets.length <= 50) {
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
      transportSnippets,
      []
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

    const operator = llmResult.operator;
    const serviceName = llmResult.serviceName;
    let officialAppObj: BusOfficialApp | null = null;

    if (llmResult.hasBusService && operator && serviceName) {
      const appSearchQuery = `${operator} ${serviceName} official mobile app Google Play App Store`;
      const appSearchResults = await searchAirportBusWebsites(appSearchQuery);
      const verifiedCandidates = appSearchResults
        .map(getStoreCandidate)
        .filter((candidate: AppStoreCandidate | null): candidate is AppStoreCandidate => candidate !== null)
        .filter((candidate) => hasExplicitTransportAppAssociation(candidate, appSearchResults, operator, serviceName));
      const selectedStoreUrl = await selectTransportServiceAppWithLLM(
        operator,
        serviceName,
        appSearchResults,
        verifiedCandidates
      );

      officialAppObj = selectVerifiedApp(
        { ...llmResult, officialAppObj: selectedStoreUrl ? { name: '', playStoreUrl: selectedStoreUrl, description: '', recommendationPrompt: '' } : undefined },
        verifiedCandidates
      );
    }

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
