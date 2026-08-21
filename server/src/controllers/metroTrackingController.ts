import { Request, Response } from 'express';
import axios from 'axios';
import OpenAI from 'openai';

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface MetroOfficialWebsite {
  title: string;
  url: string;
}

interface MetroOfficialApp {
  name: string;
  playStoreUrl: string;
}

interface GroundedMetroResult {
  hasMetro: boolean;
  officialSystemName: string | null;
  authority: string | null;
  officialWebsite: MetroOfficialWebsite | null;
  officialApp: MetroOfficialApp | null;
  noMetroDetails: {
    message: string;
    nearestStation: string | null;
  } | null;
}

function isClearlyPlaceholderName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;

  return [
    'airport metro',
    'metro app',
    'airport metro app',
    'official metro app',
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
    'airport', 'international', 'service', 'services', 'metro', 'rail', 'transport',
    'tracking', 'app', 'official', 'line', 'express', 'city', 'the', 'and', 'for',
  ]);

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !stop.has(term));
}

function isMetroAppEvidenceRelevant(
  appResult: SearchResult,
  operator: string | null,
  systemName: string | null
): boolean {
  const text = `${appResult.title} ${appResult.snippet}`.toLowerCase();
  const hasMetroHint = ['metro', 'rail', 'transport', 'transit', 'tracker', 'tracking'].some((hint) => text.includes(hint));

  const normalizedOperator = operator?.trim().toLowerCase() || '';
  if (normalizedOperator) {
    return text.includes(normalizedOperator);
  }

  const normalizedSystem = systemName?.trim().toLowerCase() || '';
  if (normalizedSystem) {
    const systemTerms = getDistinctTerms(systemName).filter((term) => term.length >= 5);
    const matchedCount = systemTerms.filter((term) => text.includes(term)).length;
    const hasMetroRailHint = text.includes('metro') || text.includes('rail');
    return matchedCount >= 2 || (matchedCount >= 1 && hasMetroRailHint);
  }

  return hasMetroHint;
}

function findResultByText(results: SearchResult[], value: string | null): SearchResult | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return results.find((item) => `${item.title} ${item.snippet}`.toLowerCase().includes(normalized)) || null;
}

async function searchMetro(query: string): Promise<SearchResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.error('[MetroTrackingController] SERPER_API_KEY is not configured.');
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
    console.error('[MetroTrackingController] Search error:', error.message);
    return [];
  }
}

async function summarizeMetro(
  airportName: string,
  airportCode: string,
  city: string,
  country: string,
  results: SearchResult[]
): Promise<GroundedMetroResult | null> {
  const apiKey = process.env.LLM_API || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('[MetroTrackingController] No LLM API key configured.');
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
- Select an app only when it is associated with the identified metro system/operator in the supplied results.

For metro service:
- return the most specific service/system name explicitly supported by the results.
- return the authority/operator if explicitly stated.
- if information is unavailable, return null.
- Do not output broad labels like "Airport Metro" when a specific proper-name system is not explicitly shown.

Source priority to follow when selecting answers:
1) official airport website
2) official transport operator/authority
3) official app/store listing
4) reputable transport source
5) other relevant sources

Return strict JSON only with this exact shape:
{
  "hasMetro": true,
  "officialSystemName": "string or null",
  "authority": "string or null",
  "officialWebsite": { "title": "string", "url": "string" } or null,
  "officialApp": { "name": "string", "playStoreUrl": "string" } or null,
  "noMetroDetails": { "message": "string", "nearestStation": "string or null" } or null
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

    if (typeof parsed?.hasMetro !== 'boolean') return null;

    return {
      hasMetro: parsed.hasMetro,
      officialSystemName: typeof parsed.officialSystemName === 'string' ? parsed.officialSystemName : null,
      authority: typeof parsed.authority === 'string' ? parsed.authority : null,
      officialWebsite:
        parsed.officialWebsite &&
        typeof parsed.officialWebsite.title === 'string' &&
        typeof parsed.officialWebsite.url === 'string'
          ? {
              title: parsed.officialWebsite.title,
              url: parsed.officialWebsite.url,
            }
          : null,
      officialApp:
        parsed.officialApp &&
        typeof parsed.officialApp.name === 'string' &&
        typeof parsed.officialApp.playStoreUrl === 'string'
          ? {
              name: parsed.officialApp.name,
              playStoreUrl: parsed.officialApp.playStoreUrl,
            }
          : null,
      noMetroDetails:
        parsed.noMetroDetails && typeof parsed.noMetroDetails.message === 'string'
          ? {
              message: parsed.noMetroDetails.message,
              nearestStation:
                typeof parsed.noMetroDetails.nearestStation === 'string'
                  ? parsed.noMetroDetails.nearestStation
                  : null,
            }
          : null,
    };
  } catch (error: any) {
    console.error('[MetroTrackingController] LLM summarize error:', error.message);
    return null;
  }
}

function sanitizeGroundedMetro(summary: GroundedMetroResult, results: SearchResult[]): GroundedMetroResult {
  const sanitized: GroundedMetroResult = {
    hasMetro: summary.hasMetro,
    officialSystemName: null,
    authority: summary.authority?.trim() || null,
    officialWebsite: null,
    officialApp: null,
    noMetroDetails: summary.noMetroDetails
      ? {
          message: summary.noMetroDetails.message.trim() || 'Metro connectivity is not currently available for this airport.',
          nearestStation: summary.noMetroDetails.nearestStation?.trim() || null,
        }
      : null,
  };

  const systemName = summary.officialSystemName?.trim() || '';
  if (systemName) {
    const placeholder = isClearlyPlaceholderName(systemName);
    if (!placeholder || appearsInResults(results, systemName)) {
      sanitized.officialSystemName = systemName;
    }
  }

  if (summary.officialWebsite?.url) {
    const matched = findResultByUrl(results, summary.officialWebsite.url);
    if (matched) {
      sanitized.officialWebsite = {
        title: summary.officialWebsite.title?.trim() || matched.title || 'Official metro website',
        url: matched.url,
      };
    }
  }

  if (summary.officialApp?.playStoreUrl && isPlayStoreUrl(summary.officialApp.playStoreUrl)) {
    const matched = findResultByUrl(results, summary.officialApp.playStoreUrl);
    const llmName = summary.officialApp.name?.trim() || '';
    const titleName = matched ? extractPlayStoreAppName(matched.title) : null;
    const appName = llmName || titleName || '';
    const placeholder = appName ? isClearlyPlaceholderName(appName) : true;

    if (
      matched &&
      appName &&
      (!placeholder || textContainsName(results, appName)) &&
      isMetroAppEvidenceRelevant(matched, summary.authority, summary.officialSystemName)
    ) {
      sanitized.officialApp = {
        name: appName,
        playStoreUrl: matched.url,
      };
    }
  }

  return sanitized;
}

export async function investigateMetro(req: Request, res: Response) {
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
      `[MetroTrackingController] Investigating metro for ${normalizedName} (${code}), ${normalizedCity}, ${normalizedCountry}`
    );

    const searchQuery = `${normalizedName} ${code} ${normalizedCity} ${normalizedCountry} airport metro rail service operator route tracking app Google Play Play Store official website`;

    const searchResults = await searchMetro(searchQuery);
    if (searchResults.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'Unable to obtain current web-search results for metro investigation.',
        airportName: normalizedName,
        airportCode: code,
        city: normalizedCity,
        country: normalizedCountry,
        timestamp: checkedAt,
      });
    }

    const summarized = await summarizeMetro(
      normalizedName,
      code,
      normalizedCity,
      normalizedCountry,
      searchResults
    );

    if (!summarized) {
      return res.status(502).json({
        success: false,
        error: 'Unable to structure metro information from current search results.',
        airportName: normalizedName,
        airportCode: code,
        city: normalizedCity,
        country: normalizedCountry,
        timestamp: checkedAt,
      });
    }

    const finalData = sanitizeGroundedMetro(summarized, searchResults);
    const systemEvidence = findResultByText(searchResults, finalData.officialSystemName);
    const operatorEvidence = findResultByText(searchResults, finalData.authority);
    const websiteEvidence = finalData.officialWebsite
      ? findResultByUrl(searchResults, finalData.officialWebsite.url)
      : null;
    const appEvidence = finalData.officialApp
      ? findResultByUrl(searchResults, finalData.officialApp.playStoreUrl)
      : null;

    return res.status(200).json({
      success: true,
      timestamp: checkedAt,
      airportCode: code,
      airportName: normalizedName,
      city: normalizedCity,
      country: normalizedCountry,
      hasMetro: finalData.hasMetro,
      statusMessage: finalData.hasMetro
        ? 'Metro Connectivity Available'
        : 'Metro connectivity is not currently available for this airport.',
      officialSystemName: finalData.officialSystemName,
      authority: finalData.authority,
      officialWebsite: finalData.officialWebsite
        ? {
            title: finalData.officialWebsite.title,
            url: finalData.officialWebsite.url,
            description: 'Official website found in supplied search results.',
          }
        : undefined,
      officialApp: finalData.officialApp
        ? {
            name: finalData.officialApp.name,
            playStoreUrl: finalData.officialApp.playStoreUrl,
            description: 'Store listing found in supplied search results.',
            recommendationPrompt: `Use ${finalData.officialApp.name} for live metro information.`,
          }
        : undefined,
      noMetroDetails: finalData.hasMetro
        ? undefined
        : {
            message:
              finalData.noMetroDetails?.message ||
              'Metro connectivity is not currently available for this airport.',
            nearestStation: finalData.noMetroDetails?.nearestStation || undefined,
          },
      metroStatus: finalData.hasMetro ? 'operational' : 'nearby_not_direct',
      noMetroReason: finalData.hasMetro
        ? undefined
        : finalData.noMetroDetails?.message || 'Metro connectivity is not currently available for this airport.',
      metroNetwork: finalData.hasMetro
        ? {
            name: finalData.officialSystemName,
            airportStation: null,
            authority: finalData.authority,
            officialWebsite: finalData.officialWebsite?.url || null,
          }
        : undefined,
      evidence: {
        service: systemEvidence,
        operator: operatorEvidence,
        officialWebsite: websiteEvidence,
        app: appEvidence,
      },
      searchResults: includeSearchResults ? searchResults : undefined,
    });
  } catch (error: any) {
    console.error('[MetroTrackingController] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to investigate metro information right now. Please try again.',
      timestamp: checkedAt,
    });
  }
}
