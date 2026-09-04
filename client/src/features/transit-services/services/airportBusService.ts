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
  // Simulate network delay for realistic feel
  await new Promise(resolve => setTimeout(resolve, 800));
  
  try {
    const { resolveBus } = await import('./transitResolver');
    return resolveBus(payload.airportCode, payload.airportName, payload.city);
  } catch (err: any) {
    return {
      success: false,
      error: 'Failed to resolve bus information locally.',
      airportName: payload.airportName,
      airportCode: payload.airportCode,
    };
  }
}
