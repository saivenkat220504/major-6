const API_BASE = '/api/airport-bus';

export interface BusOfficialWebsite {
  url: string;
  isLiveTrackingAvailable: boolean;
  note?: string;
}

export interface BusOfficialApp {
  name: string;
  playStoreUrl: string;
  appStoreUrl?: string;
  packageName?: string;
  description: string;
  recommendationPrompt: string;
}

export interface NoBusServiceDetails {
  message: string;
  alternatives: string[];
}

export interface BusInvestigationPayload {
  airportName: string;
  airportCode: string;
  city: string;
  country: string;
}

export interface BusServiceResult {
  success: boolean;
  hasBusService?: boolean;
  statusMessage?: string;
  airportName?: string;
  airportCode?: string;
  city?: string;
  country?: string;
  serviceName?: string;
  operator?: string;
  busStops?: string[];
  fareRange?: string;
  operatingHours?: string;
  frequency?: string;
  travelTime?: string;
  officialWebsite?: string | BusOfficialWebsite;
  officialWebsiteObj?: BusOfficialWebsite;
  officialAppObj?: BusOfficialApp | null;
  recommendedApp?: string;
  noBusDetails?: NoBusServiceDetails;
  notes?: string;
  alternatives?: string[];
  sourcesConflict?: boolean;
  sourcesConflictNote?: string;
  lastUpdated?: string;
  cached?: boolean;
  error?: string;
}

export async function investigateAirportBus(
  payload: BusInvestigationPayload
): Promise<BusServiceResult> {
  try {
    const response = await fetch(`${API_BASE}/investigate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: data.error || `Server error (${response.status}). Please try again later.`,
        recommendedApp: data.recommendedApp,
        officialWebsite: data.officialWebsite,
        airportName: payload.airportName,
        airportCode: payload.airportCode,
      };
    }

    return data;
  } catch (err: any) {
    return {
      success: false,
      error: 'Network connection failed. Unable to fetch live bus information.',
      airportName: payload.airportName,
      airportCode: payload.airportCode,
    };
  }
}
