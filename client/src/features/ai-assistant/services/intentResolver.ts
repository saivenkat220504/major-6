export interface IntentAction {
  type: string;
  label: string;
  from?: string;
  to?: string;
  poiId?: string;
}

export interface IntentResponse {
  response: string;
  action?: IntentAction;
}

export function resolveIntent(message: string): IntentResponse {
  const text = message.toLowerCase();

  // 1. Emergency / Medical / Heart Attack Intent (Highest priority!)
  if (
    text.includes('heart') || text.includes('attack') || text.includes('chest pain') ||
    text.includes('stroke') || text.includes('unconscious') || text.includes('bleeding') ||
    text.includes('breathe') || text.includes('breathing') || text.includes('choking') ||
    text.includes('ambulance') || text.includes('doctor') || text.includes('medic') ||
    text.includes('hospital') || text.includes('emergency') || text.includes('help me') ||
    text.includes('urgent') || text.includes('first aid') || text.includes('collapse') ||
    text.includes('surfering') || text.includes('suffering')
  ) {
    return {
      response: "⚠️ **EMERGENCY MEDICAL ASSISTANCE**\n\nAirport medical responders have been alerted. Please stay calm, remain where you are or find the nearest airport official.\n\nClick below immediately to send your live location and connect to Emergency Services.",
      action: {
        type: 'emergency_contact',
        label: '🚨 Open Emergency Services'
      }
    };
  }

  // 2. Currency Exchange / Forex / Yen / Dollar / Cash Intent
  if (
    text.includes('yen') || text.includes('dollar') || text.includes('euro') || text.includes('pound') ||
    text.includes('currency') || text.includes('forex') || text.includes('exchange') ||
    text.includes('money') || text.includes('cash') || text.includes('atm') || text.includes('bank')
  ) {
    return {
      response: "Currency exchange counters (Forex & Travelex) and multi-currency ATMs are available across Departures and Arrivals (near Information Desk & Tech Express). Click below to view the route on the terminal map.",
      action: {
        type: 'route',
        label: '🗺️ View Route to Currency Exchange',
        from: 'Main Entrance 01',
        to: 'Information Desk'
      }
    };
  }

  // 3. Specific Gate Navigation (e.g. "Gate A9", "Gate A1", "Gate B2", "go to Gate A9 assist me")
  const gateMatch = text.match(/\b(gate\s*[a-z0-9]+)\b/i);
  if (gateMatch) {
    const rawGate = gateMatch[1].toUpperCase();
    const formattedGate = rawGate.replace(/(\w+)\s*(\w+)/, '$1 $2').trim();
    return {
      response: `I'll guide you directly to **${formattedGate}**. Security checks and boarding gates are clearly mapped. Click below to view your walking route.`,
      action: {
        type: 'route',
        label: `🗺️ View Route to ${formattedGate}`,
        from: 'Main Entrance 01',
        to: formattedGate
      }
    };
  }

  // 4. Specific Point-to-Point Route ("from X to Y", "take me from X to Y", "at X ... to Y")
  const routeRegex = /(?:take me from|from|at)\s+([a-zA-Z0-9\s]+?)\s+(?:and\s+)?(?:want\s+to\s+)?(?:to|reach|get to)\s+([a-zA-Z0-9\s]+)$/i;
  const routeMatch = text.match(routeRegex);
  if (routeMatch) {
    const from = routeMatch[1].trim();
    const to = routeMatch[2].trim();
    return {
      response: `I've prepared the route from **${from}** to **${to}**. Click below to open Terminal Navigation with step-by-step guidance.`,
      action: {
        type: 'route',
        label: `🗺️ View Route (${from} → ${to})`,
        from: from,
        to: to
      }
    };
  }

  // 5. Direct destination ("take me to X", "how do I get to X", "I want to go to X", "way to X", "where is X")
  const directNavMatch = text.match(/(?:how (?:do i|can i) (?:get|reach)|take me to|directions to|way to|where is|i want to go to|want to visit|reach|go to)\s+([a-zA-Z0-9\s]+?)(?:\s+assist me|\s+please|\s+now)?$/i);
  if (directNavMatch && directNavMatch[1] && !text.includes('food') && !text.includes('eat')) {
    const dest = directNavMatch[1].trim();
    return {
      response: `I can guide you to **${dest}**. Click below to view your interactive walking route on the map.`,
      action: {
        type: 'route',
        label: `🗺️ View Route to ${dest}`,
        from: 'Main Entrance 01',
        to: dest
      }
    };
  }

  // 6. Food / Dining / Cafe Intent
  if (
    text.includes('food') || text.includes('eat') || text.includes('restaurant') ||
    text.includes('hungry') || text.includes('meal') || text.includes('dining') ||
    text.includes('snack') || text.includes('coffee') || text.includes('drink') ||
    text.includes('cafe') || text.includes('order') || text.includes('starbucks') ||
    text.includes('burger') || text.includes('pizza') || text.includes('water')
  ) {
    return {
      response: "You can browse menus and order food & beverages directly from airport restaurants with gate or seat delivery. Click below to view options.",
      action: {
        type: 'meal_delivery',
        label: '🍔 Open Food & Dining'
      }
    };
  }

  // 7. General Terminal Navigation Intent
  if (
    text.includes('navigate') || text.includes('map') || text.includes('direction') ||
    text.includes('indoor map') || text.includes('terminal map') || text.includes('find gate') ||
    text.includes('where am i') || text.includes('terminal')
  ) {
    return {
      response: "I can help you navigate the terminal with interactive 2D maps, gates, checkpoints, and amenities. Click below to open Terminal Navigation.",
      action: {
        type: 'navigate',
        label: '🗺️ Open Terminal Navigation'
      }
    };
  }

  // 8. Metro / Train Intent
  if (text.includes('metro') || text.includes('train') || text.includes('subway')) {
    return {
      response: "Check verified metro connectivity, platform locations, and airport transit options. Click below to view transit details.",
      action: {
        type: 'transit_services',
        label: '🚇 View Transit Services'
      }
    };
  }

  // 9. Bus / Shuttle Intent
  if (text.includes('bus') || text.includes('shuttle') || text.includes('coach') || text.includes('pushpak')) {
    return {
      response: "Check verified airport bus and shuttle services, timings, and stops. Click below to view bus options.",
      action: {
        type: 'bus_service',
        label: '🚌 View Bus Services'
      }
    };
  }

  // 10. Flight Tracking Intent
  if (text.includes('flight') || text.includes('status') || text.includes('check my flight') || text.includes('boarding') || text.includes('delay')) {
    return {
      response: "Track live flight status, departure gates, delays, and boarding times. Click below to view flight details.",
      action: {
        type: 'flight_tracking',
        label: '✈️ Check Flight Status'
      }
    };
  }

  // 11. Washroom / Restroom Intent
  if (text.includes('washroom') || text.includes('toilet') || text.includes('restroom') || text.includes('loo')) {
    return {
      response: "Clean restrooms and accessible washrooms are located near each gate and waiting lounge. Click below to locate the nearest one on the map.",
      action: {
        type: 'navigate',
        label: '🚻 Find Nearest Washroom',
        poiId: 'washroom'
      }
    };
  }

  // 12. Baggage Intent
  if (text.includes('baggage') || text.includes('luggage') || text.includes('claim') || text.includes('lost bag') || text.includes('belt')) {
    return {
      response: "Track baggage reclaim belts, baggage drops, or report lost luggage. Click below for baggage guidance.",
      action: {
        type: 'baggage_guidance',
        label: '🧳 Track Baggage'
      }
    };
  }

  // 13. Image Translation / Board Scan Intent
  if (
    text.includes('translate') || text.includes('what does this') || text.includes('what does it say') ||
    text.includes('cannot understand') || text.includes("can't understand") || text.includes("don't understand") ||
    text.includes('scan') || text.includes('read this') || text.includes('sign') ||
    text.includes('what is written') || text.includes("what's written") ||
    text.includes('airport board') || text.includes('airport sign') || text.includes('airport notice') ||
    text.includes('explain this') || text.includes('upload') ||
    text.includes('image') || text.includes('photo') || text.includes('picture') ||
    text.includes('board') || text.includes('notice')
  ) {
    return {
      response: "Sure! Take a photo or upload an image of the board or notice, and I'll extract and translate the text for you.\n\nTip: You can select your preferred language using the dropdown below.",
      action: {
        type: 'scan_board',
        label: '📷 Scan / Upload Board'
      }
    };
  }

  // 14. Voice / Listen / Read-aloud Intent
  if (
    text.includes('listen') || text.includes('read out') || text.includes('read aloud') ||
    text.includes('speak') || text.includes('say it') || text.includes('play it') ||
    text.includes('hear') || text.includes('audio') || text.includes('voice')
  ) {
    return {
      response: "I can read any translated board aloud! Tap the 🔊 Listen button beneath any translated message, or upload a board photo to get started.",
      action: {
        type: 'scan_board',
        label: '📷 Scan / Upload Board'
      }
    };
  }

  // Default fallback
  return {
    response: "I'm your AI Concierge. I can help you with terminal navigation (like gates, currency exchange), finding food, transit services, flight tracking, translating airport signs, and emergency assistance. What would you like to do?",
    action: {
      type: 'navigate',
      label: '🗺️ Explore Airport Map'
    }
  };
}
