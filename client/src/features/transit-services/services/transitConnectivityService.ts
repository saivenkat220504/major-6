const API_BASE = '/api/transit-connectivity';

// ─── Shared Interfaces ────────────────────────────────────────────────────────

export interface ConnectivityOfficialWebsite {
  name: string;
  description: string;
  url: string;
}

export interface ConnectivityRecommendedApp {
  name: string;
  type: 'Official' | 'Third-party';
  description: string;
  url: string | null;
}

export interface ConnectivityTrackingInformation {
  liveTrackingAvailable: boolean;
  details: string;
}

export interface TransitConnectivityPayload {
  airportName: string;
  airportCode: string;
  city: string;
  country: string;
  service: 'metro' | 'bus';
}

export interface TransitConnectivityResult {
  success: boolean;
  airportName?: string;
  airportCode?: string;
  city?: string;
  country?: string;
  service?: 'metro' | 'bus';
  timestamp?: string;

  // Availability verdict
  status?: 'Available' | 'Not available' | 'Unclear';
  reason?: string;

  // Only present when status === 'Available'
  officialWebsite?: ConnectivityOfficialWebsite;
  recommendedApp?: ConnectivityRecommendedApp;
  trackingInformation?: ConnectivityTrackingInformation;

  error?: string;
}

// ─── Service Function ─────────────────────────────────────────────────────────

export async function checkTransitConnectivity(
  payload: TransitConnectivityPayload
): Promise<TransitConnectivityResult> {
  try {
    const response = await fetch(`${API_BASE}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        success: false,
        error: errData?.error || `Server error (${response.status})`,
      };
    }

    const data = await response.json();
    return data as TransitConnectivityResult;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Network error. Please check your connection and try again.',
    };
  }
}
