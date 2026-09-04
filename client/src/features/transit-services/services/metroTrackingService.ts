const API_BASE = '/api/metro-tracking';

export interface MetroOfficialWebsite {
  title?: string;
  url: string;
  description?: string;
}

export interface MetroOfficialApp {
  name: string;
  playStoreUrl: string;
  packageName?: string;
  description: string;
  recommendationPrompt: string;
}

export interface QuickMetroSummary {
  nearestStation: string;
  operatingHours: string;
  fareRange: string;
  travelTime: string;
}

export interface NoMetroDetails {
  message: string;
  nearestStation?: string;
  shuttleAlternatives?: string[];
  taxiOrBusAlternatives?: string[];
}

export interface MetroNetworkInfo {
  name: string | null;
  airportStation: string | null;
  authority: string | null;
  officialWebsite?: string | null;
}

export interface TrackingCapabilities {
  source: boolean;
  destination: boolean;
  fare: boolean;
  distance: boolean;
  eta: boolean;
  totalTime: boolean;
  nextTrain: boolean;
  serviceStatus: boolean;
  routeInfo: boolean;
  transfers: boolean;
}

export interface TrackingWebsite {
  rank: number;
  name: string;
  url: string;
  provider: string;
  providerType: 'official' | 'government' | 'third-party';
  description: string;
  isLiveData: boolean;
  liveDataNote?: string;
  capabilities: TrackingCapabilities;
  sourceUrl?: string;
}

export interface SourceChecked {
  url: string;
  title: string;
  type: string;
  credibilityNote: string;
}

export type MetroOperationalStatus =
  | 'operational'
  | 'suspended'
  | 'planned'
  | 'under_construction'
  | 'announced'
  | 'proposed'
  | 'historical_closed'
  | 'nearby_not_direct'
  | 'unknown';

export interface MetroInvestigationResult {
  success: boolean;
  timestamp?: string;
  airportCode?: string;
  airportName?: string;
  city?: string;
  country?: string;
  hasMetro?: boolean | 'unknown';
  statusMessage?: string;
  officialSystemName?: string;
  authority?: string;
  officialWebsite?: MetroOfficialWebsite;
  officialApp?: MetroOfficialApp;
  quickSummary?: QuickMetroSummary;
  noMetroDetails?: NoMetroDetails;
  metroStatus?: MetroOperationalStatus;
  noMetroReason?: string;
  alternatives?: string[];
  metroNetwork?: MetroNetworkInfo;
  trackingWebsites?: TrackingWebsite[];
  sourceInfo?: string;
  sourcesChecked?: SourceChecked[];
  sourcesConflict?: boolean;
  sourcesConflictNote?: string;
  sourceConflict?: boolean;
  conflictNote?: string;
  error?: string;
}

export interface InvestigatePayload {
  airportName: string;
  airportCode: string;
  city: string;
  country: string;
}

export async function investigateAirportMetro(
  payload: InvestigatePayload
): Promise<MetroInvestigationResult> {
  // Simulate network delay for realistic feel
  await new Promise(resolve => setTimeout(resolve, 800));
  
  try {
    const { resolveMetro } = await import('./transitResolver');
    return resolveMetro(payload.airportCode, payload.airportName, payload.city);
  } catch (err: any) {
    return {
      success: false,
      error: 'Failed to resolve metro information locally.',
      airportName: payload.airportName,
      airportCode: payload.airportCode,
    };
  }
}
