import { BusServiceResult } from './airportBusService';
import { MetroInvestigationResult } from './metroTrackingService';

type AirportCode = 'HYD' | 'DEL' | 'BOM' | 'BLR' | string;

export function resolveMetro(airportCode: AirportCode, airportName: string, city: string): MetroInvestigationResult {
  const code = airportCode.toUpperCase();
  
  if (code === 'HYD') {
    return {
      success: true,
      hasMetro: false,
      timestamp: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      noMetroDetails: {
        message: 'Not connected to this airport. Try some other means of transport.',
        nearestStation: 'Raidurg (Blue Line) - ~32 km away, no direct connection to airport terminal',
        shuttleAlternatives: [
          'Pushpak Airport Liner (TSRTC AC Express Bus Service - 24/7)',
          'Pre-paid Airport Taxis (Available at Arrivals)',
          'App-based cabs (Uber / Ola designated pickup zones)'
        ],
        taxiOrBusAlternatives: [
          'Pushpak Bus Route AL: RGIA to Secunderabad via AC Guards',
          'Pushpak Bus Route AC: RGIA to JNTU / Miyapur',
          'Pushpak Bus Route AJ: RGIA to Mehdipatnam'
        ]
      }
    };
  }

  if (code === 'DEL') {
    return {
      success: true,
      hasMetro: true,
      timestamp: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      officialSystemName: 'Delhi Metro Orange Line (Airport Express)',
      authority: 'DMRC',
      quickSummary: {
        nearestStation: 'IGI Airport T3 Station',
        operatingHours: '04:45 AM - 11:40 PM',
        fareRange: '₹10 - ₹60',
        travelTime: '~23 mins to New Delhi Station'
      },
      officialWebsite: {
        url: 'https://www.delhimetrorail.com/',
      },
      officialApp: {
        name: 'DMRC Momentum 2.0',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.dmrc.momentum',
        description: 'Official DMRC App',
        recommendationPrompt: 'Use Momentum 2.0 for QR tickets and live tracking.'
      },
      sourcesChecked: [
        {
          url: 'https://www.delhimetrorail.com/',
          title: 'Delhi Metro Rail Corporation',
          type: 'official',
          credibilityNote: 'Official Operator'
        }
      ]
    };
  }

  if (code === 'BLR') {
    return {
      success: true,
      hasMetro: false,
      timestamp: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      noMetroDetails: {
        message: 'Direct Metro connection to BLR is currently under construction (Blue Line).',
        nearestStation: 'KR Puram / Baiyappanahalli',
        taxiOrBusAlternatives: ['Vayu Vajra BMTC Volvo Buses', 'Airport Taxis']
      }
    };
  }
  
  if (code === 'BOM') {
    return {
      success: true,
      hasMetro: true,
      timestamp: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      officialSystemName: 'Mumbai Metro Line 3 (Aqua Line)',
      authority: 'MMRC',
      quickSummary: {
        nearestStation: 'CSMIA T2 / T1 Stations',
        operatingHours: '06:00 AM - 11:00 PM',
        fareRange: '₹10 - ₹50',
        travelTime: '~30 mins to SEEPZ/BKC'
      },
      officialWebsite: {
        url: 'https://mmrcl.com/',
      },
      sourcesChecked: [
        {
          url: 'https://mmrcl.com/',
          title: 'Mumbai Metro Rail Corporation',
          type: 'official',
          credibilityNote: 'Official Operator'
        }
      ]
    };
  }

  return {
    success: true,
    hasMetro: false,
    timestamp: new Date().toISOString(),
    airportCode,
    airportName,
    city,
    noMetroDetails: {
      message: `No verified direct metro connectivity found for ${airportName}.`,
      taxiOrBusAlternatives: ['Local Airport Taxis', 'App-based ride sharing', 'Local Buses']
    }
  };
}

export function resolveBus(airportCode: AirportCode, airportName: string, city: string): BusServiceResult {
  const code = airportCode.toUpperCase();
  
  if (code === 'HYD') {
    return {
      success: true,
      hasBusService: true,
      lastUpdated: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      serviceName: 'Pushpak Airport Liner',
      operator: 'TSRTC',
      fareRange: '₹200 - ₹300',
      operatingHours: '24/7',
      frequency: 'Every 30 mins',
      busStops: ['Secunderabad', 'JNTU', 'Miyapur', 'LB Nagar'],
      officialWebsiteObj: {
        url: 'https://www.tsrtc.telangana.gov.in/',
        isLiveTrackingAvailable: true
      },
      officialAppObj: {
        name: 'TSRTC Gamyam',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.tsrtc.gamyam',
        description: 'Live bus tracking app by TSRTC',
        recommendationPrompt: 'Highly recommended to track exact bus location in real-time.'
      }
    };
  }

  if (code === 'BLR') {
    return {
      success: true,
      hasBusService: true,
      lastUpdated: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      serviceName: 'Vayu Vajra',
      operator: 'BMTC',
      fareRange: '₹150 - ₹320',
      operatingHours: '24/7',
      frequency: 'Every 15-30 mins',
      busStops: ['Majestic', 'Hebbal', 'Electronic City', 'Whitefield'],
      officialWebsiteObj: {
        url: 'https://mybmtc.karnataka.gov.in/',
        isLiveTrackingAvailable: true
      },
      officialAppObj: {
        name: 'Namma BMTC',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.bmtc.nammabmtc',
        description: 'Official route and tracking app',
        recommendationPrompt: 'Use Namma BMTC to check routes and live ETA.'
      }
    };
  }

  if (code === 'BOM') {
    return {
      success: true,
      hasBusService: true,
      lastUpdated: new Date().toISOString(),
      airportCode,
      airportName,
      city,
      serviceName: 'BEST AC Airport Service',
      operator: 'BEST',
      fareRange: '₹50 - ₹150',
      operatingHours: '05:00 AM - 11:30 PM',
      frequency: 'Every 30 mins',
      busStops: ['Andheri Station', 'Vile Parle', 'Borivali'],
      officialWebsiteObj: {
        url: 'https://www.bestundertaking.com/',
        isLiveTrackingAvailable: true
      },
      officialAppObj: {
        name: 'Chalo App',
        playStoreUrl: 'https://play.google.com/store/apps/details?id=com.chalo.app',
        description: 'Live tracking & tickets for BEST buses',
        recommendationPrompt: 'Purchase tickets and track buses live.'
      }
    };
  }

  return {
    success: true,
    hasBusService: false,
    lastUpdated: new Date().toISOString(),
    airportCode,
    airportName,
    city,
    alternatives: ['Local Taxis', 'Ride-hailing Apps (Uber/Ola/Lyft)', 'Private Shuttles']
  };
}
