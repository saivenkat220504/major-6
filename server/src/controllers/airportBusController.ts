import { Request, Response } from 'express';
import axios from 'axios';
import OpenAI from 'openai';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface BusOfficialWebsite {
  name: string;
  url: string;
}

interface BusTrackingApp {
  name: string;
  playStoreUrl: string;
}

interface GroundedBusResult {
  hasBusService: boolean;
  serviceName: string | null;
  operator: string | null;
  officialWebsite: BusOfficialWebsite | null;
  bestTrackingApp: BusTrackingApp | null;
}

function isClearlyPlaceholderName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;

  return [
    'airport bus service',
    'airport bus app',
    'official airport app',
    'airport app',
    'travel companion',
    'no app available',
    'not available',
  ].includes(normalized);
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/$/, '').toLowerCase();
}

function isPlayStoreUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.hostname === 'play.google.com' && parsed.pathname.startsWith('/store/apps');
  } catch {
    return false;
  }
}

function findResultByUrl(results: SearchResult[], url: string): SearchResult | null {
  const normalized = normalizeUrl(url);
  return results.find((item) => normalizeUrl(item.url) === normalized) || null;
}

function textContainsName(results: SearchResult[], name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (!normalized) return false;

  return results.some((item) => {
    const text = `${item.title} ${item.snippet}`.toLowerCase();
    return text.includes(normalized);
  });
}

function appearsInResults(results: SearchResult[], value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  return results.some((item) => `${item.title} ${item.snippet}`.toLowerCase().includes(normalized));
}

function extractPlayStoreAppName(title: string): string | null {
  const cleaned = title
    .replace(/\s*[-|:]\s*Apps on Google Play\s*$/i, '')
    .replace(/\s*on Google Play\s*$/i, '')
    .trim();
  return cleaned || null;
}

function getDistinctTerms(value: string | null): string[] {
  if (!value) return [];
  const stop = new Set([
    'airport', 'international', 'service', 'services', 'bus', 'transport', 'tracking',
    'app', 'official', 'line', 'express', 'city', 'the', 'and', 'for',
  ]);

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !stop.has(term));
}

function isBusAppEvidenceRelevant(
  appResult: SearchResult,
  operator: string | null,
  serviceName: string | null
): boolean {
  const text = `${appResult.title} ${appResult.snippet}`.toLowerCase();
  const hasBusHint = ['bus', 'shuttle', 'transport', 'transit', 'tracker', 'tracking'].some((hint) => text.includes(hint));

  const normalizedOperator = operator?.trim().toLowerCase() || '';
  if (normalizedOperator) {
    return text.includes(normalizedOperator);
  }

  const normalizedService = serviceName?.trim().toLowerCase() || '';
  if (normalizedService) {
    const serviceTerms = getDistinctTerms(serviceName).filter((term) => term.length >= 5);
    return serviceTerms.some((term) => text.includes(term));
  }

  return hasBusHint;
}

function findResultByText(results: SearchResult[], value: string | null): SearchResult | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return results.find((item) => `${item.title} ${item.snippet}`.toLowerCase().includes(normalized)) || null;
}

async function searchAirportBus(query: string): Promise<SearchResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.error('[AirportBusController] SERPER_API_KEY is not configured.');
    return [];
  }

  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 25, gl: 'in', hl: 'en' },
      {
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json',
        },
        timeout: 9000,
      }
    );

    const organic = Array.isArray(response.data?.organic) ? response.data.organic : [];
    return organic
      .map((item: any) => ({
        title: typeof item?.title === 'string' ? item.title : '',
        snippet: typeof item?.snippet === 'string' ? item.snippet : '',
        url: typeof item?.link === 'string' ? item.link : '',
      }))
      .filter((item: SearchResult) => item.title || item.snippet || item.url);
  } catch (error: any) {
    console.error('[AirportBusController] Search error:', error.message);
    return [];
  }
}

async function summarizeAirportBus(
  airportName: string,
  airportCode: string,
  city: string,
  country: string,
  results: SearchResult[]
): Promise<GroundedBusResult | null> {
  const apiKey = process.env.LLM_API || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[AirportBusController] No LLM API key configured.');
    return null;
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.LLM_API || process.env.OPENROUTER_API_KEY ? 'https://openrouter.ai/api/v1' : undefined,
  });

  const systemPrompt = `You are given current web-search results.

Answer ONLY using information contained in these results.
Do not use your prior knowledge.
Do not guess.
Do not invent names.
Do not invent URLs.
Do not create generic replacement names.

When a specific proper name exists in the results, preserve that exact name.

For app information:
- return the exact app name appearing in the search results
- return the exact store URL appearing in the search results
- if no specific app is present, return null.
- Do not reject a result merely because it does not contain a particular keyword pattern.
- Select an app only when it is associated with the identified bus service/operator in the supplied results.

For bus service:
- return the most specific service name explicitly supported by the results.
- return the operator if explicitly stated.
- if information is unavailable, return null.
- Do not output broad labels like "Airport Bus Service" when a specific proper-name service is not explicitly shown.

Source priority to follow when selecting answers:
1) official airport website
2) official transport operator/authority
3) official app/store listing
4) reputable transport source
5) other relevant sources

Return strict JSON only with this exact shape:
{
  "hasBusService": true,
  "serviceName": "string or null",
  "operator": "string or null",
  "officialWebsite": { "name": "string", "url": "string" } or null,
  "bestTrackingApp": { "name": "string", "playStoreUrl": "string" } or null
}`;

  const userPrompt = JSON.stringify(
    {
      airport: {
        name: airportName,
        code: airportCode,
        city,
        country,
      },
      searchResults: results,
    },
    null,
    2
  );

  try {
    const response = await client.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0,
      max_tokens: 900,
    });

    const raw = response.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed?.hasBusService !== 'boolean') return null;

    return {
      hasBusService: parsed.hasBusService,
      serviceName: typeof parsed.serviceName === 'string' ? parsed.serviceName : null,
      operator: typeof parsed.operator === 'string' ? parsed.operator : null,
      officialWebsite:
        parsed.officialWebsite &&
        typeof parsed.officialWebsite.name === 'string' &&
        typeof parsed.officialWebsite.url === 'string'
          ? {
              name: parsed.officialWebsite.name,
              url: parsed.officialWebsite.url,
            }
          : null,
      bestTrackingApp:
        parsed.bestTrackingApp &&
        typeof parsed.bestTrackingApp.name === 'string' &&
        typeof parsed.bestTrackingApp.playStoreUrl === 'string'
          ? {
              name: parsed.bestTrackingApp.name,
              playStoreUrl: parsed.bestTrackingApp.playStoreUrl,
            }
          : null,
    };
  } catch (error: any) {
    console.error('[AirportBusController] LLM summarize error:', error.message);
    return null;
  }
}

function sanitizeGroundedBusResult(summary: GroundedBusResult, results: SearchResult[]): GroundedBusResult {
  const sanitized: GroundedBusResult = {
    hasBusService: summary.hasBusService,
    serviceName: null,
    operator: summary.operator?.trim() || null,
    officialWebsite: null,
    bestTrackingApp: null,
  };

  const serviceName = summary.serviceName?.trim() || '';
  if (serviceName) {
    const placeholder = isClearlyPlaceholderName(serviceName);
    if (!placeholder || appearsInResults(results, serviceName)) {
      sanitized.serviceName = serviceName;
    }
  }

  if (summary.officialWebsite?.url) {
    const matched = findResultByUrl(results, summary.officialWebsite.url);
    if (matched) {
      sanitized.officialWebsite = {
        name: summary.officialWebsite.name?.trim() || matched.title || 'Official website',
        url: matched.url,
      };
    }
  }

  if (summary.bestTrackingApp?.playStoreUrl && isPlayStoreUrl(summary.bestTrackingApp.playStoreUrl)) {
    const matched = findResultByUrl(results, summary.bestTrackingApp.playStoreUrl);
    const llmName = summary.bestTrackingApp.name?.trim() || '';
    const titleName = matched ? extractPlayStoreAppName(matched.title) : null;
    const appName = llmName || titleName || '';
    const placeholder = appName ? isClearlyPlaceholderName(appName) : true;

    if (
      matched &&
      appName &&
      (!placeholder || textContainsName(results, appName)) &&
      isBusAppEvidenceRelevant(matched, summary.operator, summary.serviceName)
    ) {
      sanitized.bestTrackingApp = {
        name: appName,
        playStoreUrl: matched.url,
      };
    }
  }

  return sanitized;
}

export async function investigateAirportBus(req: Request, res: Response) {
  const checkedAt = new Date().toISOString();

  try {
    const { airportName, airportCode, city, country, includeSearchResults } = req.body;

    if (!airportName || !airportCode || !city || !country) {
      return res.status(400).json({
        success: false,
        error: 'airportName, airportCode, city, and country are required.',
      });
    }

    const code = String(airportCode).toUpperCase().trim();
    const normalizedName = String(airportName).trim();
    const normalizedCity = String(city).trim();
    const normalizedCountry = String(country).trim();

    console.log(
      `[AirportBusController] Investigating airport bus for ${normalizedName} (${code}), ${normalizedCity}, ${normalizedCountry}`
    );

    const searchQuery = `${normalizedName} ${code} ${normalizedCity} ${normalizedCountry} airport bus shuttle service operator route tracking app Google Play Play Store official website`;

    const searchResults = await searchAirportBus(searchQuery);
    if (searchResults.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'Unable to obtain current web-search results for airport bus investigation.',
        airportName: normalizedName,
        airportCode: code,
        city: normalizedCity,
        country: normalizedCountry,
        lastUpdated: checkedAt,
      });
    }

    const summarized = await summarizeAirportBus(
      normalizedName,
      code,
      normalizedCity,
      normalizedCountry,
      searchResults
    );

    if (!summarized) {
      return res.status(502).json({
        success: false,
        error: 'Unable to structure airport bus information from current search results.',
        airportName: normalizedName,
        airportCode: code,
        city: normalizedCity,
        country: normalizedCountry,
        lastUpdated: checkedAt,
      });
    }

    const finalData = sanitizeGroundedBusResult(summarized, searchResults);
    const serviceEvidence = findResultByText(searchResults, finalData.serviceName);
    const operatorEvidence = findResultByText(searchResults, finalData.operator);
    const websiteEvidence = finalData.officialWebsite
      ? findResultByUrl(searchResults, finalData.officialWebsite.url)
      : null;
    const appEvidence = finalData.bestTrackingApp
      ? findResultByUrl(searchResults, finalData.bestTrackingApp.playStoreUrl)
      : null;

    return res.status(200).json({
      success: true,
      airportName: normalizedName,
      airportCode: code,
      city: normalizedCity,
      country: normalizedCountry,
      hasBusService: finalData.hasBusService,
      serviceName: finalData.serviceName,
      operator: finalData.operator,
      officialWebsite: finalData.officialWebsite,
      officialWebsiteObj: finalData.officialWebsite
        ? { url: finalData.officialWebsite.url, isLiveTrackingAvailable: false, note: finalData.officialWebsite.name }
        : undefined,
      bestTrackingApp: finalData.bestTrackingApp,
      officialAppObj: finalData.bestTrackingApp
        ? {
            name: finalData.bestTrackingApp.name,
            playStoreUrl: finalData.bestTrackingApp.playStoreUrl,
            description: 'Store listing found in supplied search results.',
            recommendationPrompt: `Use ${finalData.bestTrackingApp.name} for the latest service information.`,
          }
        : null,
      recommendedApp: finalData.bestTrackingApp?.name || null,
      evidence: {
        service: serviceEvidence,
        operator: operatorEvidence,
        officialWebsite: websiteEvidence,
        app: appEvidence,
      },
      searchResults: includeSearchResults ? searchResults : undefined,
      lastUpdated: checkedAt,
    });
  } catch (error: any) {
    console.error('[AirportBusController] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to investigate airport bus information right now. Please try again.',
      lastUpdated: checkedAt,
    });
  }
}
