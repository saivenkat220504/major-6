import { Request, Response } from 'express';
import axios from 'axios';
import OpenAI from 'openai';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface SerperResult {
  title: string;
  snippet: string;
  link: string;
}

export interface ConnectivityResult {
  success: boolean;
  airportName: string;
  airportCode: string;
  city: string;
  country: string;
  service: 'metro' | 'bus';
  timestamp: string;

  // Availability
  status: 'Available' | 'Not available' | 'Unclear';
  reason: string;

  // Official website (only if available)
  officialWebsite?: {
    name: string;
    description: string;
    url: string;
  };

  // Recommended app (only if available)
  recommendedApp?: {
    name: string;
    type: 'Official' | 'Third-party';
    description: string;
    url: string | null;
  };

  // Tracking info
  trackingInformation?: {
    liveTrackingAvailable: boolean;
    details: string;
  };

  error?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function getLLMClient(): OpenAI {
  const apiKey =
    process.env.LLM_API ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('LLM API key not configured');
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:3000',
      'X-Title': 'Airport Transit Connectivity',
    },
  });
}

async function searchWeb(query: string): Promise<SerperResult[]> {
  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    console.error('[TransitConnectivity] SERPER_API_KEY not configured');
    return [];
  }
  try {
    const response = await axios.post(
      'https://google.serper.dev/search',
      { q: query, num: 8, gl: 'in', hl: 'en' },
      {
        headers: {
          'X-API-KEY': serperKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    const organic: any[] = Array.isArray(response.data?.organic)
      ? response.data.organic
      : [];
    return organic
      .map((item: any) => ({
        title: typeof item?.title === 'string' ? item.title : '',
        snippet: typeof item?.snippet === 'string' ? item.snippet : '',
        link: typeof item?.link === 'string' ? item.link : '',
      }))
      .filter((r) => r.title || r.snippet);
  } catch (err: any) {
    console.error('[TransitConnectivity] Search error:', err.message);
    return [];
  }
}

// ─── Step 1: Verify Availability ──────────────────────────────────────────────

async function verifyAvailability(
  airportName: string,
  service: string,
  results: SerperResult[]
): Promise<{ status: 'Available' | 'Not available' | 'Unclear'; reason: string }> {
  const llm = getLLMClient();

  const prompt = `You are a transit expert. Based ONLY on the following web search results, determine whether ${service} service is CURRENTLY AVAILABLE and OPERATIONALLY RUNNING to/from ${airportName}.

Important rules:
- "Available" = service is currently running/operational
- "Not available" = service does not exist, is only planned, under construction, proposed, or not yet approved
- "Unclear" = search results are ambiguous or insufficient

Search Results:
${JSON.stringify(results.map((r) => ({ title: r.title, snippet: r.snippet })))}

Respond in strict JSON only:
{
  "status": "Available" | "Not available" | "Unclear",
  "reason": "Clear one-sentence explanation based strictly on the results"
}`;

  try {
    const response = await llm.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 300,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    const status = ['Available', 'Not available', 'Unclear'].includes(parsed.status)
      ? parsed.status
      : 'Unclear';
    return {
      status: status as 'Available' | 'Not available' | 'Unclear',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
  } catch (err: any) {
    console.error('[TransitConnectivity] Availability LLM error:', err.message);
    return { status: 'Unclear', reason: 'Unable to process search results.' };
  }
}

// ─── Steps 2+3: Find Official Website + App ───────────────────────────────────

async function findOfficialResourcesAndApp(
  airportName: string,
  service: string,
  websiteResults: SerperResult[],
  appResults: SerperResult[]
): Promise<{
  officialWebsite: { name: string; description: string; url: string };
  recommendedApp: { name: string; type: 'Official' | 'Third-party'; description: string; url: string | null };
  trackingInformation: { liveTrackingAvailable: boolean; details: string };
}> {
  const llm = getLLMClient();

  const prompt = `You are a transit expert. Extract verified official resources for ${service} at ${airportName}.
Prefer official transport authority/corporation websites over random blogs or third-party sites.

Official website search results:
${JSON.stringify(websiteResults.map((r) => ({ title: r.title, snippet: r.snippet, link: r.link })))}

App search results:
${JSON.stringify(appResults.map((r) => ({ title: r.title, snippet: r.snippet, link: r.link })))}

Rules:
- Only return URLs that actually appear in the search results
- For the app, prefer the official operator's app
- Do not invent names or URLs
- For appType: "Official" if published by the transport authority, "Third-party" otherwise
- For trackingInformation.details: describe clearly if live tracking is available or not

Respond in strict JSON only:
{
  "officialWebsite": {
    "name": "Name of the website or authority",
    "description": "What this website provides (schedules, fares, routes, etc.)",
    "url": "Exact URL from results"
  },
  "recommendedApp": {
    "name": "App name",
    "type": "Official",
    "description": "What the app is useful for in context of this airport and service",
    "url": "App store URL from results, or null if not found"
  },
  "trackingInformation": {
    "liveTrackingAvailable": true,
    "details": "Specific tracking details or clear note if live tracking is not available"
  }
}`;

  try {
    const response = await llm.chat.completions.create({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return {
      officialWebsite: parsed.officialWebsite || { name: '', description: '', url: '' },
      recommendedApp: parsed.recommendedApp || { name: '', type: 'Third-party', description: '', url: null },
      trackingInformation: parsed.trackingInformation || { liveTrackingAvailable: false, details: 'Live tracking information not found.' },
    };
  } catch (err: any) {
    console.error('[TransitConnectivity] Resources LLM error:', err.message);
    return {
      officialWebsite: { name: 'Unknown', description: '', url: '' },
      recommendedApp: { name: 'Unknown', type: 'Third-party', description: '', url: null },
      trackingInformation: { liveTrackingAvailable: false, details: 'Unable to process tracking information.' },
    };
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────────

export async function checkTransitConnectivity(req: Request, res: Response) {
  const timestamp = new Date().toISOString();

  try {
    const { airportName, airportCode, city, country, service } = req.body;

    if (!airportName || !airportCode || !city || !country || !service) {
      return res.status(400).json({
        success: false,
        error: 'airportName, airportCode, city, country, and service are required.',
        timestamp,
      });
    }

    const normalizedService =
      service.trim().toLowerCase() === 'metro' ? 'Metro' : 'Bus';
    const normalizedName = String(airportName).trim();
    const normalizedCode = String(airportCode).toUpperCase().trim();
    const normalizedCity = String(city).trim();
    const normalizedCountry = String(country).trim();

    console.log(
      `[TransitConnectivity] Checking ${normalizedService} for ${normalizedName} (${normalizedCode})`
    );

    // ── Step 1: Verify Availability ───────────────────────────────────────────
    const availabilityQuery = `Is ${normalizedService} service available at ${normalizedName}?`;
    console.log(`[TransitConnectivity] Step 1 query: "${availabilityQuery}"`);
    const availabilityResults = await searchWeb(availabilityQuery);

    if (availabilityResults.length === 0) {
      return res.status(502).json({
        success: false,
        error: 'Unable to obtain search results. Please try again.',
        airportName: normalizedName,
        airportCode: normalizedCode,
        city: normalizedCity,
        country: normalizedCountry,
        service: normalizedService.toLowerCase(),
        timestamp,
      });
    }

    const availability = await verifyAvailability(
      normalizedName,
      normalizedService,
      availabilityResults
    );

    console.log(`[TransitConnectivity] Availability: ${availability.status} — ${availability.reason}`);

    // ── If Not Available or Unclear, stop here ─────────────────────────────────
    if (availability.status !== 'Available') {
      return res.status(200).json({
        success: true,
        airportName: normalizedName,
        airportCode: normalizedCode,
        city: normalizedCity,
        country: normalizedCountry,
        service: normalizedService.toLowerCase() as 'metro' | 'bus',
        timestamp,
        status: availability.status,
        reason: availability.reason,
      } as ConnectivityResult);
    }

    // ── Step 2: Find Official Website ─────────────────────────────────────────
    const websiteQuery = `Official website schedule routes fare ${normalizedService} ${normalizedName} ${normalizedCity}`;
    console.log(`[TransitConnectivity] Step 2 query: "${websiteQuery}"`);
    const websiteResults = await searchWeb(websiteQuery);

    // ── Step 3: Find Best App ─────────────────────────────────────────────────
    const appQuery = `Official app track ${normalizedService} ${normalizedName} ${normalizedCity} Google Play Store`;
    console.log(`[TransitConnectivity] Step 3 query: "${appQuery}"`);
    const appResults = await searchWeb(appQuery);

    // ── Synthesize results ─────────────────────────────────────────────────────
    const resources = await findOfficialResourcesAndApp(
      normalizedName,
      normalizedService,
      websiteResults,
      appResults
    );

    return res.status(200).json({
      success: true,
      airportName: normalizedName,
      airportCode: normalizedCode,
      city: normalizedCity,
      country: normalizedCountry,
      service: normalizedService.toLowerCase() as 'metro' | 'bus',
      timestamp,
      status: 'Available',
      reason: availability.reason,
      officialWebsite: resources.officialWebsite?.url ? resources.officialWebsite : undefined,
      recommendedApp: resources.recommendedApp?.name ? resources.recommendedApp : undefined,
      trackingInformation: resources.trackingInformation,
    } as ConnectivityResult);

  } catch (error: any) {
    console.error('[TransitConnectivity] Unexpected error:', error);
    return res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again.',
      timestamp,
    });
  }
}
