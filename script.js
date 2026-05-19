(function () {
  // ---------- Data ----------
  const CITY_DB = {
    mumbai:     { city: "Mumbai",     station: "Mumbai Central",          busStand: "Mumbai Central Bus Depot" },
    delhi:      { city: "Delhi",      station: "New Delhi Railway Station", busStand: "Kashmere Gate ISBT" },
    "new delhi":{ city: "Delhi",      station: "New Delhi Railway Station", busStand: "Kashmere Gate ISBT" },
    jaipur:     { city: "Jaipur",     station: "Jaipur Junction",         busStand: "Sindhi Camp Bus Stand" },
    bangalore:  { city: "Bangalore",  station: "KSR Bengaluru",           busStand: "Majestic Bus Stand" },
    bengaluru:  { city: "Bangalore",  station: "KSR Bengaluru",           busStand: "Majestic Bus Stand" },
    chennai:    { city: "Chennai",    station: "MGR Chennai Central",     busStand: "CMBT Koyambedu" },
    hyderabad:  { city: "Hyderabad",  station: "Secunderabad Junction",   busStand: "MGBS Hyderabad" },
    kolkata:    { city: "Kolkata",    station: "Howrah Junction",         busStand: "Esplanade Bus Terminus" },
    pune:       { city: "Pune",       station: "Pune Junction",           busStand: "Swargate Bus Stand" },
    ahmedabad:  { city: "Ahmedabad",  station: "Ahmedabad Junction",      busStand: "Geeta Mandir Bus Stand" },
    lucknow:    { city: "Lucknow",    station: "Lucknow Charbagh",        busStand: "Alambagh Bus Terminal" },
    goa:        { city: "Goa",        station: "Madgaon Junction",        busStand: "Kadamba Bus Stand, Panaji" },
    agra:       { city: "Agra",       station: "Agra Cantt",              busStand: "Idgah Bus Stand" },
    varanasi:   { city: "Varanasi",   station: "Varanasi Junction",       busStand: "Varanasi Cantt Bus Stand" },
    udaipur:    { city: "Udaipur",    station: "Udaipur City",            busStand: "Udiapol Bus Stand" },
    jodhpur:    { city: "Jodhpur",    station: "Jodhpur Junction",        busStand: "Raika Bagh Bus Stand" },
    chandigarh: { city: "Chandigarh", station: "Chandigarh Junction",     busStand: "Sector 17 ISBT" },
    kochi:      { city: "Kochi",      station: "Ernakulam Junction",      busStand: "Ernakulam KSRTC" },
    mysore:     { city: "Mysore",     station: "Mysuru Junction",         busStand: "Mysuru Bus Stand" },
  };

  // Rough distances (km) for common pairs. Missing pairs use 400km fallback.
  const DISTANCES = {
    "mumbai-jaipur": 1160, "mumbai-delhi": 1400, "mumbai-pune": 150,
    "mumbai-bangalore": 980, "mumbai-goa": 590, "mumbai-ahmedabad": 530,
    "mumbai-hyderabad": 710, "delhi-jaipur": 280, "delhi-agra": 230,
    "delhi-varanasi": 820, "delhi-lucknow": 555, "delhi-chandigarh": 260,
    "delhi-kolkata": 1470, "bangalore-chennai": 350, "bangalore-hyderabad": 570,
    "bangalore-mysore": 145, "chennai-hyderabad": 630, "jaipur-udaipur": 400,
    "jaipur-jodhpur": 330, "jaipur-agra": 240, "kolkata-varanasi": 680,
    "hyderabad-pune": 560, "pune-goa": 450, "chennai-kochi": 680,
  };

  function getCityInfo(input) {
    if (!input) return null;
    const key = input.trim().toLowerCase();
    if (CITY_DB[key]) return CITY_DB[key];
    const cap = input.trim().replace(/\b\w/g, c => c.toUpperCase());
    return {
      city: cap,
      station: `${cap} Railway Station`,
      busStand: `${cap} Bus Stand`,
    };
  }

  function getDistance(from, to) {
    const a = from.trim().toLowerCase();
    const b = to.trim().toLowerCase();
    return DISTANCES[`${a}-${b}`] || DISTANCES[`${b}-${a}`] || 400;
  }

  // ---------- Live data (free public APIs, no key needed) ----------
  const BACKEND_URL = "http://localhost:3001";
  const geoCache = new Map();
  const distCache = new Map();
  const wikiCache = new Map();
  const trainsCache = new Map();

  async function fetchRealTrains(from, to) {
    const key = `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`;
    if (trainsCache.has(key)) return trainsCache.get(key);
    try {
      const url = `${BACKEND_URL}/api/trains?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(url);
      if (!res.ok) throw 0;
      const data = await res.json();
      if (!data.trains || !data.trains.length) throw 0;
      trainsCache.set(key, data.trains);
      return data.trains;
    } catch {
      trainsCache.set(key, null);
      return null;
    }
  }

  // Map erail category -> default booking class + per-km fare (INR)
  // Fares are indicative (erail.in does not expose a simple fare API).
  const TRAIN_CLASS_BY_CATEGORY = {
    "Rajdhani":       { type: "3rd AC (3A)",    ppk: 1.30, base: 220 },
    "Duranto":        { type: "3rd AC (3A)",    ppk: 1.25, base: 220 },
    "Shatabdi":       { type: "Chair Car (CC)", ppk: 1.10, base: 180 },
    "Garib Rath":     { type: "3rd AC (3A)",    ppk: 0.80, base: 150 },
    "Super Fast":     { type: "Sleeper (SL)",   ppk: 0.55, base: 80  },
    "Mail & Express": { type: "Sleeper (SL)",   ppk: 0.45, base: 60  },
    "Special":        { type: "Sleeper (SL)",   ppk: 0.50, base: 70  },
    "Passenger":      { type: "Sleeper (SL)",   ppk: 0.35, base: 40  },
  };

  // erail duration format "14.30 hr" = 14h 30m
  function parseErailHours(d) {
    if (!d) return null;
    const m = /^(\d{1,2})\.(\d{1,2})/.exec(d);
    if (!m) return null;
    return Number(m[1]) + Number(m[2]) / 60;
  }

  function parseHHMM(s) {
    if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return 720;
    const [h, m] = s.split(":").map(Number);
    return h * 60 + m;
  }

  function realTrainsToOptions(realTrains, fallbackDistance) {
    const cap = Math.min(realTrains.length, 8);
    const out = [];
    for (let i = 0; i < cap; i++) {
      const t = realTrains[i];
      const spec = TRAIN_CLASS_BY_CATEGORY[t.category] || TRAIN_CLASS_BY_CATEGORY["Super Fast"];
      const distKm = Number((t.distance || "").replace(/[^\d]/g, "")) || fallbackDistance;
      const hours = parseErailHours(t.duration) || (distKm / 60);
      const departMin = parseHHMM(t.departTime);
      const price = roundTo(spec.base + distKm * spec.ppk, 10);

      out.push({
        id: `real-${t.trainNo}`,
        mode: "Train",
        icon: "🚆",
        name: `${t.trainName} (${t.trainNo})`,
        type: `${spec.type} · boards at ${t.fromCode} · ${t.category || "Express"}`,
        price,
        hours,
        departMin,
        isReal: true,
      });
    }
    return out;
  }

  async function geocodeCity(name) {
    if (!name) return null;
    const key = name.trim().toLowerCase();
    if (geoCache.has(key)) return geoCache.get(key);
    try {
      const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(name)}&country=India&format=json&limit=1`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw 0;
      const data = await res.json();
      if (!data.length) throw 0;
      const hit = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      geoCache.set(key, hit);
      return hit;
    } catch {
      geoCache.set(key, null);
      return null;
    }
  }

  async function fetchRoadDistanceKm(from, to) {
    const key = `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`;
    if (distCache.has(key)) return distCache.get(key);
    const [a, b] = await Promise.all([geocodeCity(from), geocodeCity(to)]);
    if (!a || !b) { distCache.set(key, null); return null; }
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
      const res = await fetch(url);
      if (!res.ok) throw 0;
      const data = await res.json();
      const meters = data.routes && data.routes[0] && data.routes[0].distance;
      if (!meters) throw 0;
      const km = Math.round(meters / 1000);
      distCache.set(key, km);
      return km;
    } catch {
      distCache.set(key, null);
      return null;
    }
  }

  // Returns { coords: [[lat,lon],...], km } for the road route, or null on failure.
  // Uses OSRM with overview=full + geometries=geojson so we can draw a polyline.
  const routeCache = new Map();
  async function fetchRouteGeometry(from, to) {
    const key = `${from.trim().toLowerCase()}|${to.trim().toLowerCase()}`;
    if (routeCache.has(key)) return routeCache.get(key);
    const [a, b] = await Promise.all([geocodeCity(from), geocodeCity(to)]);
    if (!a || !b) { routeCache.set(key, null); return null; }
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) throw 0;
      const data = await res.json();
      const route = data.routes && data.routes[0];
      if (!route || !route.geometry) throw 0;
      const coords = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
      const out = { coords, km: Math.round(route.distance / 1000), from: a, to: b };
      routeCache.set(key, out);
      return out;
    } catch {
      routeCache.set(key, null);
      return null;
    }
  }

  async function fetchWeather(lat, lon) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=7`;
      const res = await fetch(url);
      if (!res.ok) throw 0;
      return await res.json();
    } catch {
      return null;
    }
  }

  async function fetchWikiSummary(city) {
    const key = city.trim().toLowerCase();
    if (wikiCache.has(key)) return wikiCache.get(key);
    try {
      const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`;
      const res = await fetch(url);
      if (!res.ok) throw 0;
      const data = await res.json();
      if (!data.extract) throw 0;
      const out = { extract: data.extract, thumb: data.thumbnail && data.thumbnail.source, url: data.content_urls && data.content_urls.desktop && data.content_urls.desktop.page };
      wikiCache.set(key, out);
      return out;
    } catch {
      wikiCache.set(key, null);
      return null;
    }
  }

  const WEATHER_ICONS = {
    0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
    45: "🌫️", 48: "🌫️",
    51: "🌦️", 53: "🌦️", 55: "🌦️",
    61: "🌧️", 63: "🌧️", 65: "🌧️",
    71: "❄️", 73: "❄️", 75: "❄️",
    80: "🌦️", 81: "🌧️", 82: "⛈️",
    95: "⛈️", 96: "⛈️", 99: "⛈️",
  };
  function weatherIcon(code) { return WEATHER_ICONS[code] || "🌡️"; }

  // Deterministic pseudo-random [0,1) from string — keeps prices stable per route
  function seedRand(str, i) {
    let h = 2166136261;
    const s = str + ":" + i;
    for (let k = 0; k < s.length; k++) {
      h ^= s.charCodeAt(k);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 10000) / 10000;
  }

  function roundTo(n, step) { return Math.round(n / step) * step; }

  function fmtHours(hours) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m} min`;
    return m ? `${h}h ${m}m` : `${h}h`;
  }

  function fmtTime(minutes) {
    minutes = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(minutes / 60);
    const m = Math.floor(minutes % 60);
    const pad = n => n.toString().padStart(2, "0");
    return `${pad(h)}:${pad(m)}`;
  }

  function generateOptions(from, to, distance) {
    const key = `${from.toLowerCase()}-${to.toLowerCase()}`;

    const trainSpecs = [
      { name: "Passenger Express", type: "Sleeper (SL)",    speed: 50, ppk: 0.35, base: 60,  depart: 420  },
      { name: "Superfast Express", type: "3rd AC (3A)",     speed: 65, ppk: 0.90, base: 150, depart: 1385 },
      { name: "Shatabdi Express",  type: "Chair Car (CC)",  speed: 75, ppk: 1.10, base: 180, depart: 390  },
      { name: "Rajdhani Express",  type: "2nd AC (2A)",     speed: 78, ppk: 1.30, base: 220, depart: 1150 },
    ];

    const busSpecs = [
      { name: "State Transport",   type: "Non-AC Seater",   speed: 40, ppk: 0.70, base: 40,  depart: 360  },
      { name: "VRL Travels",       type: "AC Seater",       speed: 50, ppk: 1.00, base: 80,  depart: 840  },
      { name: "IntrCity SmartBus", type: "Non-AC Sleeper",  speed: 48, ppk: 1.25, base: 100, depart: 1260 },
      { name: "Volvo Multi-Axle",  type: "AC Sleeper",      speed: 55, ppk: 1.75, base: 150, depart: 1320 },
    ];

    const opts = [];

    trainSpecs.forEach((s, i) => {
      const jitter = 0.9 + seedRand(key, i) * 0.2;        // 0.9–1.1
      const priceJit = 0.92 + seedRand(key, i + 100) * 0.16;
      const hours = (distance / s.speed) * jitter;
      const price = roundTo(s.base + distance * s.ppk * priceJit, 10);
      const departMin = s.depart + Math.floor(seedRand(key, i + 200) * 30);
      opts.push({
        id: `train-${i}`,
        mode: "Train",
        icon: "🚆",
        name: s.name,
        type: s.type,
        price,
        hours,
        departMin,
      });
    });

    busSpecs.forEach((s, i) => {
      const jitter = 0.9 + seedRand(key, i + 500) * 0.2;
      const priceJit = 0.92 + seedRand(key, i + 600) * 0.16;
      const hours = (distance / s.speed) * jitter;
      const price = roundTo(s.base + distance * s.ppk * priceJit, 10);
      const departMin = s.depart + Math.floor(seedRand(key, i + 700) * 30);
      opts.push({
        id: `bus-${i}`,
        mode: "Bus",
        icon: "🚌",
        name: s.name,
        type: s.type,
        price,
        hours,
        departMin,
      });
    });

    return opts;
  }

  // ---------- Hotel data ----------
  const HOTEL_TIERS = [
    { tier: "Hostel",       priceLow: 500,  priceHigh: 900,   ratingLow: 3.8, ratingHigh: 4.4,
      names: ["Zostel", "The Hosteller", "Madpackers", "GoStops", "Moustache Hostel"],
      amenities: ["Free WiFi", "Common lounge", "Dorm beds"] },
    { tier: "Budget Hotel", priceLow: 1200, priceHigh: 1800, ratingLow: 3.6, ratingHigh: 4.2,
      names: ["OYO Rooms", "Hotel Rajshree", "Ginger", "FabHotel Prime"],
      amenities: ["AC", "Free WiFi", "24/7 front desk"] },
    { tier: "Guest House",  priceLow: 1500, priceHigh: 2400, ratingLow: 4.0, ratingHigh: 4.6,
      names: ["Heritage Haveli", "Serene Stays", "Whispering Palms", "Tranquil Inn"],
      amenities: ["AC", "Breakfast", "Free WiFi"] },
    { tier: "Mid-Range",    priceLow: 2500, priceHigh: 3800, ratingLow: 3.9, ratingHigh: 4.5,
      names: ["Treebo Trend", "Lemon Tree", "Keys Prima", "Fortune Select"],
      amenities: ["AC", "Breakfast", "WiFi", "Room service"] },
    { tier: "Upscale",      priceLow: 5000, priceHigh: 7500, ratingLow: 4.2, ratingHigh: 4.7,
      names: ["Radisson", "Novotel", "Courtyard Marriott", "Crowne Plaza"],
      amenities: ["Pool", "Gym", "Breakfast", "Spa"] },
    { tier: "Luxury",       priceLow: 9000, priceHigh: 14000, ratingLow: 4.5, ratingHigh: 4.9,
      names: ["Taj Hotel", "The Leela Palace", "ITC Hotel", "The Oberoi"],
      amenities: ["Pool", "Spa", "Fine dining", "Concierge"] },
  ];

  // 8 hotels per destination — spread across tiers
  const HOTEL_MIX = ["Hostel", "Budget Hotel", "Budget Hotel", "Guest House", "Mid-Range", "Mid-Range", "Upscale", "Luxury"];

  function generateHotels(city) {
    const key = city.toLowerCase();
    return HOTEL_MIX.map((tierName, i) => {
      const tier = HOTEL_TIERS.find(t => t.tier === tierName);
      const nameIdx = Math.floor(seedRand(key, i + 1000) * tier.names.length);
      const priceJit = seedRand(key, i + 1100);
      const ratingJit = seedRand(key, i + 1200);
      const distJit = seedRand(key, i + 1300);

      const price = roundTo(tier.priceLow + (tier.priceHigh - tier.priceLow) * priceJit, 50);
      const rating = Math.round((tier.ratingLow + (tier.ratingHigh - tier.ratingLow) * ratingJit) * 10) / 10;
      const distance = Math.round((0.5 + distJit * 6) * 10) / 10;
      const quiet = seedRand(key, i + 1400) > 0.55;

      return {
        id: `hotel-${i}`,
        name: `${tier.names[nameIdx]} ${city}`,
        tier: tier.tier,
        price,
        rating,
        distance,
        amenities: tier.amenities,
        quiet,
      };
    });
  }

  // ---------- Safety & activity data ----------
  const NATIONWIDE_SAFETY = {
    numbers: [
      { label: "Emergency (all)", number: "112" },
      { label: "Police",          number: "100" },
      { label: "Ambulance",       number: "108" },
      { label: "Fire",            number: "101" },
      { label: "Women Help",      number: "1091" },
      { label: "Tourist Help",    number: "1363" },
    ],
    commonScams: [
      "Auto/taxi drivers skipping the meter — insist on meter or use prepaid counter / Ola / Uber.",
      "Touts at stations saying your hotel is 'closed' or 'full' — ignore, call your hotel directly.",
      "Pressured 'free' temple tours or tea invitations that end with a bill — polite refusal is fine.",
    ],
  };

  const CITY_EXTRAS = {
    jaipur: {
      hospital: "SMS Hospital, Jaipur",
      cityScam: "Gemstone shops offering wholesale 'export' deals — don't buy to ship abroad.",
      activities: [
        { name: "Nahargarh Fort sunset",    type: "🌅 Viewpoint",  time: "Evening",       tip: "Arrive an hour before sunset for a calm spot." },
        { name: "Albert Hall Museum",       type: "🏛️ Museum",    time: "Afternoon",     tip: "Quietest between 4–6 PM." },
        { name: "Anokhi Cafe (C-Scheme)",   type: "☕ Quiet cafe", time: "Morning",       tip: "Great for slow mornings with a book." },
        { name: "Central Park walk",        type: "🌳 Park",       time: "Early morning", tip: "Calm before 8 AM." },
        { name: "Old City heritage walk",   type: "🚶 Walk",       time: "Early morning", tip: "6–8 AM: soft light, few people." },
        { name: "Bookworm bookstore",       type: "📚 Bookstore",  time: "Afternoon",     tip: "Usually empty on weekdays." },
      ],
    },
    mumbai: {
      hospital: "Kokilaben Dhirubhai Ambani Hospital",
      cityScam: "'Fixed-rate' cabs outside stations — use prepaid counter or Ola/Uber instead.",
      activities: [
        { name: "Marine Drive dawn walk",      type: "🚶 Walk",       time: "Dawn",       tip: "5:30–7 AM is peaceful." },
        { name: "Kala Ghoda art galleries",    type: "🏛️ Art",       time: "Afternoon",  tip: "Weekday afternoons are calmest." },
        { name: "Kitab Khana bookstore",       type: "📚 Bookstore",  time: "Afternoon",  tip: "Hidden cafe upstairs, rarely busy." },
        { name: "Worli Sea Face",              type: "🌅 Viewpoint",  time: "Evening",    tip: "Quieter than Marine Drive at sunset." },
        { name: "Prithvi Cafe (Juhu)",         type: "☕ Quiet cafe", time: "Anytime",    tip: "Theater garden vibes, very calm." },
        { name: "Sanjay Gandhi National Park", type: "🌳 Nature",     time: "Morning",    tip: "Weekday mornings are near-empty." },
      ],
    },
    delhi: {
      hospital: "AIIMS, New Delhi",
      cityScam: "'Your hotel is closed, let me take you to a partner' — always ignore and call your hotel.",
      activities: [
        { name: "Lodhi Gardens morning walk",   type: "🌳 Park",       time: "Morning",        tip: "6–8 AM: joggers leave by 8." },
        { name: "Humayun's Tomb at golden hour",type: "🏛️ Monument",   time: "Late afternoon", tip: "4 PM onwards, light is magical." },
        { name: "Kunzum Travel Cafe",           type: "☕ Quiet cafe", time: "Afternoon",      tip: "Quiet corners, book-friendly." },
        { name: "Mehrauli Archaeological Park", type: "🚶 Walk",       time: "Morning",        tip: "Very calm, crowd-free." },
        { name: "Midland Book Shop",            type: "📚 Bookstore",  time: "Afternoon",      tip: "Stacked shelves, rarely busy." },
        { name: "Hauz Khas Lake walk",          type: "🌅 Viewpoint",  time: "Evening",        tip: "Sunset side is quieter." },
      ],
    },
    bangalore: {
      hospital: "Manipal Hospital, Old Airport Road",
      cityScam: "Auto drivers skipping the meter — insist or use Rapido / Uber Auto.",
      activities: [
        { name: "Cubbon Park morning walk",        type: "🌳 Park",       time: "Early morning", tip: "6–8 AM: birdsong, few people." },
        { name: "Blossom Book House",              type: "📚 Bookstore",  time: "Afternoon",     tip: "Calm upper floors, go weekdays." },
        { name: "Third Wave Coffee (Indiranagar)", type: "☕ Quiet cafe", time: "Morning",       tip: "Laptop-friendly, calm mornings." },
        { name: "Lalbagh Botanical Garden",        type: "🌳 Nature",     time: "Morning",       tip: "West gate entry is quieter." },
        { name: "Bangalore Palace grounds",        type: "🏛️ Heritage",   time: "Afternoon",     tip: "Wander slowly, rarely full." },
        { name: "Nandi Hills sunrise",             type: "🌅 Viewpoint",  time: "Sunrise",       tip: "Leave by 4 AM for less crowd." },
      ],
    },
    goa: {
      hospital: "Goa Medical College, Bambolim",
      cityScam: "Bike rental 'damage' scams — photograph scratches before you ride.",
      activities: [
        { name: "Palolem Beach morning swim",     type: "🌊 Beach",      time: "Early morning", tip: "Before 8 AM, the beach is yours." },
        { name: "Fontainhas heritage walk",       type: "🚶 Walk",       time: "Morning",       tip: "Colourful, sleepy Portuguese lanes." },
        { name: "Cafe Artjuna (Anjuna)",          type: "☕ Quiet cafe", time: "Afternoon",     tip: "Shaded garden, calm afternoons." },
        { name: "Chapora Fort sunset",            type: "🌅 Viewpoint",  time: "Evening",       tip: "Climb early to claim a rock." },
        { name: "Literati Bookshop (Calangute)",  type: "📚 Bookstore",  time: "Afternoon",     tip: "Tiny old villa, almost empty." },
        { name: "Galgibaga Beach",                type: "🌳 Nature",     time: "Anytime",       tip: "Protected turtle beach, peaceful." },
      ],
    },
    agra: {
      hospital: "SN Medical College, Agra",
      cityScam: "Guides claiming Taj Mahal is 'closed' — it's not. Verify at the official entry.",
      activities: [
        { name: "Taj Mahal at sunrise",      type: "🏛️ Monument",   time: "Sunrise",    tip: "First entry (6 AM) is blissfully quiet." },
        { name: "Mehtab Bagh",               type: "🌳 Park",       time: "Evening",    tip: "Across the river — Taj at sunset, calm." },
        { name: "Agra Fort",                 type: "🏛️ Heritage",   time: "Afternoon",  tip: "Go after 3 PM for fewer crowds." },
        { name: "Taj Nature Walk",           type: "🚶 Walk",       time: "Morning",    tip: "Green trail beside the Taj, rarely busy." },
        { name: "Sheroes Hangout cafe",      type: "☕ Quiet cafe", time: "Afternoon",  tip: "Run by acid-attack survivors — meaningful, calm." },
        { name: "Kinari Bazaar slow walk",   type: "🚶 Walk",       time: "Morning",    tip: "Old-city charm before the rush." },
      ],
    },
  };

  const GENERIC_ACTIVITIES = (city) => [
    { name: `${city} central park`,          type: "🌳 Park",       time: "Early morning", tip: "Mornings are calmest before 8 AM." },
    { name: `Independent bookstore in ${city}`, type: "📚 Bookstore", time: "Afternoon",  tip: "Weekday afternoons are near-empty." },
    { name: `Local artisan cafe`,            type: "☕ Quiet cafe", time: "Morning",       tip: "Go before the lunch crowd." },
    { name: `${city} regional museum`,       type: "🏛️ Museum",    time: "Afternoon",     tip: "Late afternoon sees fewer visitors." },
    { name: `Heritage neighbourhood walk`,   type: "🚶 Walk",       time: "Early morning", tip: "6–8 AM feels magical and quiet." },
    { name: `Evening lake/river walk`,       type: "🌅 Viewpoint",  time: "Evening",       tip: "Golden hour, low crowds." },
  ];

  function getCityExtras(city) {
    const key = city.toLowerCase();
    const found = CITY_EXTRAS[key];
    if (found) return found;
    return {
      hospital: `Search: "${city} government hospital" on Google Maps.`,
      cityScam: null,
      activities: GENERIC_ACTIVITIES(city),
    };
  }

  function estimateFares(distanceKm) {
    const round5 = n => Math.round(n / 5) * 5;
    const auto = Math.max(40,  round5(30 + 20 * distanceKm));
    const cab  = Math.max(100, round5(60 + 25 * distanceKm));
    const bus  = distanceKm < 5 ? 20 : 40;
    return { auto, cab, bus };
  }

  // ---------- State ----------
  const state = {
    step: 1,
    fromCity: "",
    toCity: "",
    fromStation: "",
    toStation: "",
    days: 0,
    passengers: 1,
    returnTrip: false,
    options: [],
    selectedId: null,
    hotels: [],
    selectedHotelId: null,
    skipHotel: false,
    purpose: "fun",
    nightOnly: false,
    quietOnly: false,
    selectedActivities: new Set(),
  };

  // ---------- DOM ----------
  const form = document.getElementById("tripForm");
  const steps = form.querySelectorAll(".step");
  const progressBar = document.getElementById("progressBar");
  const stepLabels = document.querySelectorAll(".step-label");
  const totalSteps = 6;

  const fromCityInput = document.getElementById("fromCity");
  const toCityInput = document.getElementById("toCity");
  const fromAuto = document.getElementById("fromAuto");
  const toAuto = document.getElementById("toAuto");
  const fromStationText = document.getElementById("fromStationText");
  const toStationText = document.getElementById("toStationText");
  const fromStationInput = document.getElementById("fromStation");
  const toStationInput = document.getElementById("toStation");

  const routeSubtitle = document.getElementById("routeSubtitle");
  const statsGrid = document.getElementById("statsGrid");
  const optionList = document.getElementById("optionList");
  const continueBtn = document.getElementById("continueBtn");
  const sortBy = document.getElementById("sortBy");
  const tabs = form.querySelectorAll(".tab");
  const summaryEl = document.getElementById("summary");
  const totalBox = document.getElementById("totalBox");
  const restartBtn = document.getElementById("restartBtn");

  const staySubtitle = document.getElementById("staySubtitle");
  const hotelList = document.getElementById("hotelList");
  const sortHotel = document.getElementById("sortHotel");
  const skipHotelBox = document.getElementById("skipHotel");
  const nightOnlyBox = document.getElementById("nightOnly");
  const quietOnlyBox = document.getElementById("quietOnly");

  const exploreTitle = document.getElementById("exploreTitle");
  const arrivalContent = document.getElementById("arrivalContent");
  const activitiesCard = document.getElementById("activitiesCard");
  const activityCity = document.getElementById("activityCity");
  const activitiesList = document.getElementById("activitiesList");
  const safetyContent = document.getElementById("safetyContent");
  const weatherCard = document.getElementById("weatherCard");
  const weatherCity = document.getElementById("weatherCity");
  const weatherContent = document.getElementById("weatherContent");
  const cityInfoCard = document.getElementById("cityInfoCard");
  const cityInfoName = document.getElementById("cityInfoName");
  const cityInfoContent = document.getElementById("cityInfoContent");
  const mapCard = document.getElementById("mapCard");
  const mapMeta = document.getElementById("mapMeta");
  const mapTabs = document.querySelectorAll(".map-tab");
  const carbonCard = document.getElementById("carbonCard");
  const carbonContent = document.getElementById("carbonContent");

  let currentTab = "all";
  let mapInstance = null;
  let mapLayers = { route: null, dest: null };
  let mapView = "route";

  // ---------- Step nav ----------
  function showStep(n) {
    steps.forEach(s => s.classList.remove("active"));
    const target = form.querySelector(`.step[data-step="${n}"]`);
    if (target) target.classList.add("active");

    progressBar.setAttribute("data-progress", Math.min(n, totalSteps));
    stepLabels.forEach(l => {
      const step = Number(l.dataset.step);
      l.classList.toggle("active", step <= n && n <= totalSteps);
    });
    state.step = n;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep(n) {
    const stepEl = form.querySelector(`.step[data-step="${n}"]`);
    if (!stepEl) return true;
    const fields = stepEl.querySelectorAll("input[required]");
    let ok = true, firstInvalid = null;

    fields.forEach(f => {
      f.classList.remove("error");
      if (!f.value.trim()) {
        f.classList.add("error"); ok = false;
        if (!firstInvalid) firstInvalid = f;
      } else if (f.type === "number") {
        const v = Number(f.value);
        if (isNaN(v) || v < Number(f.min || 1) || v > Number(f.max || 999)) {
          f.classList.add("error"); ok = false;
          if (!firstInvalid) firstInvalid = f;
        }
      }
    });
    if (firstInvalid && firstInvalid.focus) firstInvalid.focus();
    return ok;
  }

  // ---------- Auto station resolving ----------
  function resolveStations() {
    const fromInfo = getCityInfo(fromCityInput.value);
    const toInfo = getCityInfo(toCityInput.value);

    if (fromInfo && fromCityInput.value.trim()) {
      state.fromCity = fromInfo.city;
      if (!fromStationInput.value.trim()) state.fromStation = fromInfo.station;
      else state.fromStation = fromStationInput.value.trim();
      fromStationText.textContent = state.fromStation;
      fromAuto.hidden = false;
    } else {
      fromAuto.hidden = true;
    }

    if (toInfo && toCityInput.value.trim()) {
      state.toCity = toInfo.city;
      if (!toStationInput.value.trim()) state.toStation = toInfo.station;
      else state.toStation = toStationInput.value.trim();
      toStationText.textContent = state.toStation;
      toAuto.hidden = false;
    } else {
      toAuto.hidden = true;
    }
  }

  [fromCityInput, toCityInput].forEach(inp => {
    inp.addEventListener("change", () => {
      inp.classList.remove("error");
      resolveStations();
    });
  });

  // ---------- City dropdown population ----------
  async function fetchSupportedCities() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/cities`);
      if (!res.ok) throw 0;
      const data = await res.json();
      if (!data.cities || !data.cities.length) throw 0;
      return data.cities.map(c => c.display);
    } catch {
      return null;
    }
  }

  function fallbackCities() {
    // Pull unique display names from the frontend's hardcoded CITY_DB.
    const seen = new Set();
    const out = [];
    for (const key of Object.keys(CITY_DB)) {
      const display = CITY_DB[key].city;
      if (seen.has(display)) continue;
      seen.add(display);
      out.push(display);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }

  function populateCitySelect(sel, cities) {
    const current = sel.value;
    sel.innerHTML = `<option value="" selected disabled>Choose a city…</option>` +
      cities.map(c => `<option value="${c}">${c}</option>`).join("");
    if (cities.includes(current)) sel.value = current;
  }

  (async () => {
    const hint = document.getElementById("cityHint");
    const live = await fetchSupportedCities();
    const cities = live || fallbackCities();
    populateCitySelect(fromCityInput, cities);
    populateCitySelect(toCityInput, cities);
    if (hint) {
      hint.textContent = live
        ? `${cities.length} cities with live train data available.`
        : `Backend offline — showing ${cities.length} cities with estimated data.`;
    }
  })();

  form.querySelectorAll(".link-btn[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      const which = btn.dataset.edit;
      if (which === "from") {
        fromAuto.hidden = true;
        fromStationInput.hidden = false;
        fromStationInput.value = state.fromStation || "";
        fromStationInput.focus();
      } else {
        toAuto.hidden = true;
        toStationInput.hidden = false;
        toStationInput.value = state.toStation || "";
        toStationInput.focus();
      }
    });
  });

  fromStationInput.addEventListener("blur", () => {
    if (fromStationInput.value.trim()) {
      state.fromStation = fromStationInput.value.trim();
      fromStationText.textContent = state.fromStation;
    }
    fromStationInput.hidden = true;
    if (fromCityInput.value.trim()) fromAuto.hidden = false;
  });

  toStationInput.addEventListener("blur", () => {
    if (toStationInput.value.trim()) {
      state.toStation = toStationInput.value.trim();
      toStationText.textContent = state.toStation;
    }
    toStationInput.hidden = true;
    if (toCityInput.value.trim()) toAuto.hidden = false;
  });

  // ---------- Compare screen ----------
  async function buildComparison() {
    state.selectedId = null;
    continueBtn.disabled = true;
    routeSubtitle.textContent =
      `${state.fromCity} → ${state.toCity} · fetching live data…`;
    statsGrid.innerHTML = "";
    optionList.innerHTML = `<p class="disclaimer">Loading live data from OpenStreetMap & erail.in…</p>`;

    const [liveKm, realTrains] = await Promise.all([
      fetchRoadDistanceKm(state.fromCity, state.toCity),
      fetchRealTrains(state.fromCity, state.toCity),
    ]);

    const distance = liveKm != null ? liveKm : getDistance(state.fromCity, state.toCity);
    const distSource = liveKm != null ? "live via OSM" : "estimate";
    state.distanceKm = distance;

    const estimated = generateOptions(state.fromCity, state.toCity, distance);
    if (realTrains && realTrains.length) {
      const trainOpts = realTrainsToOptions(realTrains, distance);
      const busOpts = estimated.filter(o => o.mode === "Bus");
      state.options = [...trainOpts, ...busOpts];
      state.trainSource = "real";
    } else {
      state.options = estimated;
      state.trainSource = "estimate";
    }

    const trainMsg = state.trainSource === "real"
      ? `${realTrains.length} live trains via erail.in`
      : "train list estimated (backend offline)";

    routeSubtitle.textContent =
      `${state.fromCity} → ${state.toCity} · about ${distance} km (${distSource}) · ${trainMsg}.`;

    renderStats();

    // Loud warning if we fell back to estimated trains (so users / judges
    // never mistake the 4 generic train names for real schedules).
    if (state.trainSource !== "real") {
      statsGrid.insertAdjacentHTML("afterbegin", `
        <div class="fallback-banner">
          ⚠️ <strong>Showing estimated trains.</strong>
          The live data backend at <code>localhost:3001</code> is unreachable, so the train names below are generic templates, not real IRCTC schedules.
          Start the backend (<code>cd travel-site/backend &amp;&amp; npm start</code>) and reload to see the real list.
        </div>
      `);
    }

    renderOptions();
  }

  function renderStats() {
    const trains = state.options.filter(o => o.mode === "Train");
    const buses = state.options.filter(o => o.mode === "Bus");

    const cheapTrain = trains.reduce((a, b) => a.price < b.price ? a : b);
    const fastTrain = trains.reduce((a, b) => a.hours < b.hours ? a : b);
    const cheapBus = buses.reduce((a, b) => a.price < b.price ? a : b);
    const fastBus = buses.reduce((a, b) => a.hours < b.hours ? a : b);

    statsGrid.innerHTML = `
      <div class="stat">
        <span class="stat-label">Cheapest train</span>
        <div class="stat-value">₹${cheapTrain.price}</div>
        <div class="stat-sub">${fmtHours(cheapTrain.hours)} · ${cheapTrain.type}</div>
      </div>
      <div class="stat">
        <span class="stat-label">Fastest train</span>
        <div class="stat-value">${fmtHours(fastTrain.hours)}</div>
        <div class="stat-sub">₹${fastTrain.price} · ${fastTrain.name}</div>
      </div>
      <div class="stat">
        <span class="stat-label">Cheapest bus</span>
        <div class="stat-value">₹${cheapBus.price}</div>
        <div class="stat-sub">${fmtHours(cheapBus.hours)} · ${cheapBus.type}</div>
      </div>
      <div class="stat">
        <span class="stat-label">Fastest bus</span>
        <div class="stat-value">${fmtHours(fastBus.hours)}</div>
        <div class="stat-sub">₹${fastBus.price} · ${fastBus.name}</div>
      </div>
    `;
  }

  function renderOptions() {
    const cheapestAll = state.options.reduce((a, b) => a.price < b.price ? a : b);
    const fastestAll = state.options.reduce((a, b) => a.hours < b.hours ? a : b);

    let list = state.options.slice();
    if (currentTab !== "all") list = list.filter(o => o.mode === currentTab);
    if (state.nightOnly) {
      list = list.filter(o => o.departMin >= 18 * 60 || o.departMin <= 5 * 60);
    }

    const sort = sortBy.value;
    list.sort((a, b) =>
      sort === "duration" ? a.hours - b.hours :
      sort === "depart"   ? a.departMin - b.departMin :
                            a.price - b.price
    );

    if (!list.length) {
      optionList.innerHTML = `<p class="disclaimer">No options match this filter. Try turning it off.</p>`;
      return;
    }
    optionList.innerHTML = list.map(o => {
      const arriveMin = o.departMin + o.hours * 60;
      const badges = [];
      if (o.isReal) badges.push(`<span class="badge live">LIVE</span>`);
      if (o.id === cheapestAll.id) badges.push(`<span class="badge cheap">Cheapest</span>`);
      if (o.id === fastestAll.id)  badges.push(`<span class="badge fast">Fastest</span>`);

      return `
        <div class="option ${state.selectedId === o.id ? "selected" : ""}" data-id="${o.id}" role="button" tabindex="0">
          ${badges.length ? `<div class="badges">${badges.join("")}</div>` : ""}
          <div class="option-mode">${o.icon}</div>
          <div class="option-info">
            <div class="option-name">${o.name}</div>
            <div class="option-type">${o.type}</div>
          </div>
          <div class="option-times">
            <div class="depart-arrive">${fmtTime(o.departMin)} → ${fmtTime(arriveMin)}</div>
            <div class="duration">${fmtHours(o.hours)}</div>
          </div>
          <div class="option-price">
            <div class="price">₹${o.price}</div>
            <div class="per">per person</div>
          </div>
        </div>
      `;
    }).join("");

    optionList.querySelectorAll(".option").forEach(el => {
      el.addEventListener("click", () => selectOption(el.dataset.id));
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectOption(el.dataset.id);
        }
      });
    });
  }

  function selectOption(id) {
    state.selectedId = id;
    continueBtn.disabled = false;
    optionList.querySelectorAll(".option").forEach(el => {
      el.classList.toggle("selected", el.dataset.id === id);
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      renderOptions();
    });
  });

  sortBy.addEventListener("change", renderOptions);
  nightOnlyBox.addEventListener("change", () => {
    state.nightOnly = nightOnlyBox.checked;
    renderOptions();
  });

  // ---------- Hotel screen ----------
  function buildHotels() {
    state.hotels = generateHotels(state.toCity);
    state.selectedHotelId = null;
    state.skipHotel = false;
    skipHotelBox.checked = false;
    staySubtitle.textContent =
      `Near ${state.toStation} in ${state.toCity} — sorted cheapest first.`;
    renderHotels();
  }

  function renderHotels() {
    const cheapest = state.hotels.reduce((a, b) => a.price < b.price ? a : b);
    const topRated = state.hotels.reduce((a, b) => a.rating > b.rating ? a : b);

    const sort = sortHotel.value;
    let list = state.hotels.slice();
    if (state.quietOnly) list = list.filter(h => h.quiet || h.distance < 2);
    list.sort((a, b) =>
      sort === "rating"   ? b.rating - a.rating :
      sort === "distance" ? a.distance - b.distance :
                            a.price - b.price
    );

    if (!list.length) {
      hotelList.innerHTML = `<p class="disclaimer">No stays match this filter. Try turning it off.</p>`;
      return;
    }
    hotelList.innerHTML = list.map(h => {
      const total = h.price * state.days;
      const badges = [];
      if (h.id === cheapest.id) badges.push(`<span class="badge cheap">Cheapest</span>`);
      if (h.id === topRated.id) badges.push(`<span class="badge fast">Top rated</span>`);

      const chips = [
        h.distance < 2 ? `<span class="chip quiet">Near station</span>` : "",
        h.quiet ? `<span class="chip quiet">Quiet area</span>` : "",
        ...h.amenities.slice(0, 2).map(a => `<span class="chip">${a}</span>`),
      ].filter(Boolean).join("");

      return `
        <div class="option ${state.selectedHotelId === h.id ? "selected" : ""}" data-id="${h.id}" role="button" tabindex="0">
          ${badges.length ? `<div class="badges">${badges.join("")}</div>` : ""}
          <div class="option-mode">🏨</div>
          <div class="option-info">
            <div class="option-name">${h.name}</div>
            <div class="option-type">${h.tier} · ${h.distance} km from station</div>
            <div class="rating">★ ${h.rating}</div>
            <div class="amenities">${chips}</div>
          </div>
          <div class="option-times"></div>
          <div class="option-price">
            <div class="price">₹${h.price}</div>
            <div class="per">per night</div>
            <div class="total-sub">₹${total} for ${state.days} ${state.days == 1 ? "night" : "nights"}</div>
          </div>
        </div>
      `;
    }).join("");

    hotelList.querySelectorAll(".option").forEach(el => {
      el.addEventListener("click", () => selectHotel(el.dataset.id));
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectHotel(el.dataset.id);
        }
      });
    });

    hotelList.style.opacity = state.skipHotel ? "0.4" : "1";
    hotelList.style.pointerEvents = state.skipHotel ? "none" : "auto";
  }

  function selectHotel(id) {
    state.selectedHotelId = id;
    hotelList.querySelectorAll(".option").forEach(el => {
      el.classList.toggle("selected", el.dataset.id === id);
    });
  }

  sortHotel.addEventListener("change", renderHotels);

  skipHotelBox.addEventListener("change", () => {
    state.skipHotel = skipHotelBox.checked;
    if (state.skipHotel) state.selectedHotelId = null;
    renderHotels();
  });

  quietOnlyBox.addEventListener("change", () => {
    state.quietOnly = quietOnlyBox.checked;
    renderHotels();
  });

  // ---------- Route map (Leaflet) ----------
  // Project a "near the station" point for the hotel marker. The hotel's `distance`
  // is just a km figure (synthetic data), so we offset deterministically from the
  // destination station — same hotel id always lands in the same direction.
  function offsetLatLon(lat, lon, km, bearingDeg) {
    const R = 6371;
    const br = (bearingDeg * Math.PI) / 180;
    const dr = km / R;
    const lat1 = (lat * Math.PI) / 180;
    const lon1 = (lon * Math.PI) / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(dr) + Math.cos(lat1) * Math.sin(dr) * Math.cos(br));
    const lon2 = lon1 + Math.atan2(
      Math.sin(br) * Math.sin(dr) * Math.cos(lat1),
      Math.cos(dr) - Math.sin(lat1) * Math.sin(lat2)
    );
    return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
  }

  function makePin(emoji, kind) {
    return L.divIcon({
      className: "",
      html: `<div class="map-pin ${kind}"><span>${emoji}</span></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 30],
      popupAnchor: [0, -28],
    });
  }

  function clearMapLayers() {
    if (!mapInstance) return;
    Object.values(mapLayers).forEach(layer => {
      if (layer) mapInstance.removeLayer(layer);
    });
    mapLayers = { route: null, dest: null };
  }

  async function setupMap() {
    if (typeof L === "undefined") {
      mapCard.hidden = true;
      return;
    }
    mapCard.hidden = false;

    // Lazy-init the map on first reveal
    if (!mapInstance) {
      mapInstance = L.map("routeMap", {
        zoomControl: true,
        scrollWheelZoom: false,
      }).setView([22.5, 78.9], 4); // India centroid as a holding view
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "© OpenStreetMap",
      }).addTo(mapInstance);
    } else {
      clearMapLayers();
    }

    mapMeta.textContent = "Loading route…";

    const [fromGeo, toGeo, route] = await Promise.all([
      geocodeCity(state.fromCity),
      geocodeCity(state.toCity),
      fetchRouteGeometry(state.fromCity, state.toCity),
    ]);

    if (!fromGeo || !toGeo) {
      mapCard.hidden = true;
      return;
    }

    // ---- Route layer ----
    const routeLayer = L.layerGroup();
    L.marker([fromGeo.lat, fromGeo.lon], { icon: makePin("🚉", "") })
      .bindPopup(`<div class="map-popup-title">${state.fromCity}</div><div class="map-popup-sub">${state.fromStation}</div>`)
      .addTo(routeLayer);
    L.marker([toGeo.lat, toGeo.lon], { icon: makePin("📍", "dest") })
      .bindPopup(`<div class="map-popup-title">${state.toCity}</div><div class="map-popup-sub">${state.toStation}</div>`)
      .addTo(routeLayer);

    if (route && route.coords.length) {
      L.polyline(route.coords, {
        color: "#5b8a72", weight: 4, opacity: 0.85, lineJoin: "round",
      }).addTo(routeLayer);
      mapMeta.textContent = `${route.km} km by road · tiles © OpenStreetMap · routing © OSRM`;
    } else {
      // Fallback: dashed straight line if OSRM is unavailable
      L.polyline([[fromGeo.lat, fromGeo.lon], [toGeo.lat, toGeo.lon]], {
        color: "#5b8a72", weight: 3, opacity: 0.6, dashArray: "6 6",
      }).addTo(routeLayer);
      mapMeta.textContent = "Routing unavailable — showing direct line. Tiles © OpenStreetMap.";
    }
    mapLayers.route = routeLayer;

    // ---- Destination zoom layer ----
    const destLayer = L.layerGroup();
    L.marker([toGeo.lat, toGeo.lon], { icon: makePin("🚉", "dest") })
      .bindPopup(`<div class="map-popup-title">${state.toStation}</div><div class="map-popup-sub">Arrival station</div>`)
      .addTo(destLayer);

    const hotel = state.hotels.find(h => h.id === state.selectedHotelId);
    if (hotel) {
      const bearing = (parseInt(hotel.id.replace(/\D/g, ""), 10) * 47) % 360;
      const [hLat, hLon] = offsetLatLon(toGeo.lat, toGeo.lon, hotel.distance, bearing);
      L.marker([hLat, hLon], { icon: makePin("🏨", "hotel") })
        .bindPopup(`<div class="map-popup-title">${hotel.name}</div><div class="map-popup-sub">${hotel.tier} · ${hotel.distance} km from station</div>`)
        .addTo(destLayer);
      L.polyline([[toGeo.lat, toGeo.lon], [hLat, hLon]], {
        color: "#b8860b", weight: 3, opacity: 0.7, dashArray: "4 6",
      }).addTo(destLayer);
    }
    mapLayers.dest = destLayer;

    applyMapView(mapView);
  }

  function applyMapView(view) {
    if (!mapInstance) return;
    mapView = view;
    mapTabs.forEach(t => t.classList.toggle("active", t.dataset.mapview === view));

    Object.entries(mapLayers).forEach(([k, layer]) => {
      if (!layer) return;
      if (k === view) layer.addTo(mapInstance);
      else mapInstance.removeLayer(layer);
    });

    // Fit bounds for the active layer
    setTimeout(() => {
      mapInstance.invalidateSize();
      const layer = mapLayers[view];
      if (!layer) return;
      const group = L.featureGroup(layer.getLayers());
      const bounds = group.getBounds();
      if (bounds.isValid()) {
        if (view === "dest") mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
        else mapInstance.fitBounds(bounds, { padding: [30, 30] });
      }
    }, 60);
  }

  mapTabs.forEach(t => {
    t.addEventListener("click", () => applyMapView(t.dataset.mapview));
  });

  // ---------- Carbon footprint ----------
  // g CO2 per passenger-km. Sources: UK DEFRA 2023 (rail/bus/car/flight),
  // adjusted for Indian Railways' electrification mix (~85% electric, mostly coal).
  const CO2_PER_PKM = {
    train:  14,
    bus:    27,
    car:    170,
    flight: 255,
  };

  function fmtCo2(grams) {
    if (grams >= 1000) return `${(grams / 1000).toFixed(1)} kg`;
    return `${Math.round(grams)} g`;
  }

  function renderCarbon(distanceKm) {
    if (!distanceKm || distanceKm < 1) {
      carbonCard.hidden = true;
      return;
    }
    const chosen = state.options.find(o => o.id === state.selectedId);
    if (!chosen) {
      carbonCard.hidden = true;
      return;
    }
    carbonCard.hidden = false;

    const pax = state.passengers;
    const trips = state.returnTrip ? 2 : 1;
    const totalKm = distanceKm * trips;

    const modes = [
      { key: "train",  label: "🚆 Train",  g: CO2_PER_PKM.train  * totalKm * pax },
      { key: "bus",    label: "🚌 Bus",    g: CO2_PER_PKM.bus    * totalKm * pax },
      { key: "car",    label: "🚗 Car",    g: CO2_PER_PKM.car    * totalKm * pax },
      { key: "flight", label: "✈️ Flight", g: CO2_PER_PKM.flight * totalKm * pax },
    ];
    const max = Math.max(...modes.map(m => m.g));

    // Map the user's selection to one of the four modes
    const chosenKey =
      chosen.mode === "Bus" ? "bus" :
      chosen.mode === "Train" ? "train" :
      chosen.mode === "Flight" ? "flight" : "train";
    const chosenG = modes.find(m => m.key === chosenKey).g;

    // Compare against the most polluting alternative (flight) for the savings line
    const worstAlt = modes.filter(m => m.key !== chosenKey).reduce((a, b) => a.g > b.g ? a : b);
    const saved = Math.max(0, worstAlt.g - chosenG);
    const treeDays = saved / 60; // 1 mature tree absorbs ~60 g CO₂/day (rough but standard)

    const headline = `
      <div class="carbon-headline">
        <div class="carbon-figure">${fmtCo2(chosenG)}</div>
        <div class="carbon-headline-sub">
          CO₂ for your ${trips === 2 ? "round" : "one-way"} trip
          ${pax > 1 ? `(${pax} passengers, ${distanceKm} km each way)` : `(${distanceKm} km each way)`}
        </div>
      </div>
    `;

    const bars = modes.map(m => {
      const pct = Math.max(2, (m.g / max) * 100);
      const isChosen = m.key === chosenKey;
      return `
        <div class="carbon-bar-row ${isChosen ? "chosen" : ""}">
          <div class="carbon-bar-label">${m.label}</div>
          <div class="carbon-bar-track">
            <div class="carbon-bar-fill ${m.key}" style="width:${pct}%"></div>
          </div>
          <div class="carbon-bar-value">${fmtCo2(m.g)}</div>
        </div>
      `;
    }).join("");

    let footer = "";
    if (saved > 0 && chosenKey !== "flight") {
      footer = `
        <div class="carbon-savings">
          🌿 By choosing ${chosen.mode.toLowerCase()} over ${worstAlt.label.replace(/^\S+\s/, "").toLowerCase()}, you saved <strong>${fmtCo2(saved)}</strong> of CO₂.
        </div>
        <div class="carbon-equiv">
          That's roughly what <strong>${treeDays >= 365 ? `${(treeDays / 365).toFixed(1)} mature trees absorb in a year` : `one mature tree absorbs in ${Math.round(treeDays)} days`}</strong>.
        </div>
      `;
    }

    carbonContent.innerHTML = headline + `<div class="carbon-bars">${bars}</div>` + footer;
  }

  // ---------- Explore screen ----------
  async function buildExplore() {
    const extras = getCityExtras(state.toCity);
    const chosenHotel = state.hotels.find(h => h.id === state.selectedHotelId);
    const distKm = chosenHotel ? chosenHotel.distance : 3.0;
    const fares = estimateFares(distKm);

    exploreTitle.textContent =
      state.purpose === "fun" ? `Before you explore ${state.toCity}` : `Before you land in ${state.toCity}`;

    // Arrival card
    const dest = chosenHotel ? chosenHotel.name : "your hotel";
    arrivalContent.innerHTML = `
      <div class="distance-line">
        From <strong>${state.toStation}</strong> to <strong>${dest}</strong>
        ${chosenHotel ? `· about <strong>${distKm} km</strong>` : `· estimate based on 3 km`}
      </div>
      <div class="fare-grid">
        <div class="fare-card">
          <div class="fare-icon">🛺</div>
          <div class="fare-label">Auto</div>
          <div class="fare-price">~₹${fares.auto}</div>
        </div>
        <div class="fare-card">
          <div class="fare-icon">🚕</div>
          <div class="fare-label">Cab / Uber</div>
          <div class="fare-price">~₹${fares.cab}</div>
        </div>
        <div class="fare-card">
          <div class="fare-icon">🚌</div>
          <div class="fare-label">Local bus</div>
          <div class="fare-price">~₹${fares.bus}</div>
        </div>
      </div>
      <div class="tip-row">
        💡 Use the <strong>prepaid auto/taxi counter</strong> at the station — it fixes the fare upfront and saves arguments. Most major stations have one.
      </div>
    `;

    // Activities card (fun trips only)
    if (state.purpose === "fun") {
      activitiesCard.hidden = false;
      activityCity.textContent = state.toCity;
      state.selectedActivities = new Set(extras.activities.map((_, i) => i));
      activitiesList.innerHTML = extras.activities.map((a, i) => `
        <label class="activity">
          <input type="checkbox" data-activity="${i}" checked />
          <div class="activity-info">
            <div class="activity-name">${a.name}</div>
            <div class="activity-meta">${a.type} · ${a.time}</div>
            <div class="activity-tip">💭 ${a.tip}</div>
          </div>
        </label>
      `).join("");

      activitiesList.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => {
          const i = Number(cb.dataset.activity);
          if (cb.checked) state.selectedActivities.add(i);
          else state.selectedActivities.delete(i);
        });
      });
    } else {
      activitiesCard.hidden = true;
      state.selectedActivities = new Set();
    }

    // City info card (live Wikipedia) + Weather card (live Open-Meteo)
    cityInfoName.textContent = state.toCity;
    cityInfoCard.hidden = false;
    cityInfoContent.innerHTML = `<p class="disclaimer">Loading live info from Wikipedia…</p>`;

    weatherCity.textContent = state.toCity;
    weatherCard.hidden = false;
    weatherContent.innerHTML = `<p class="disclaimer">Loading live forecast from Open-Meteo…</p>`;

    // Route map (don't await — render rest of explore screen immediately)
    setupMap().catch(() => { mapCard.hidden = true; });

    // Carbon footprint comparison (synchronous — uses state.distanceKm from Step 3)
    renderCarbon(state.distanceKm);

    // Fire both in parallel; do not block the rest of the UI
    Promise.all([fetchWikiSummary(state.toCity), geocodeCity(state.toCity)])
      .then(async ([wiki, geo]) => {
        if (wiki) {
          cityInfoContent.innerHTML = `
            ${wiki.thumb ? `<img class="city-thumb" src="${wiki.thumb}" alt="${state.toCity}" />` : ""}
            <p class="city-extract">${wiki.extract}</p>
            ${wiki.url ? `<p class="disclaimer">Source: <a href="${wiki.url}" target="_blank" rel="noopener">Wikipedia</a> · live.</p>` : ""}
          `;
        } else {
          cityInfoCard.hidden = true;
        }

        if (!geo) { weatherCard.hidden = true; return; }
        const wx = await fetchWeather(geo.lat, geo.lon);
        if (!wx || !wx.daily) { weatherCard.hidden = true; return; }
        const d = wx.daily;
        const days = d.time.map((t, i) => {
          const date = new Date(t);
          const label = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
          const rain = d.precipitation_probability_max[i] != null ? d.precipitation_probability_max[i] : 0;
          return `
            <div class="weather-day">
              <div class="weather-day-label">${label}</div>
              <div class="weather-day-icon">${weatherIcon(d.weather_code[i])}</div>
              <div class="weather-day-temp">${Math.round(d.temperature_2m_min[i])}° / ${Math.round(d.temperature_2m_max[i])}°</div>
              <div class="weather-day-rain">💧 ${rain}%</div>
            </div>
          `;
        }).join("");
        weatherContent.innerHTML = `
          <div class="weather-grid">${days}</div>
          <p class="disclaimer">Live from Open-Meteo · updated hourly.</p>
        `;
      });

    // Safety card
    const scams = NATIONWIDE_SAFETY.commonScams.slice();
    if (extras.cityScam) scams.unshift(extras.cityScam);

    safetyContent.innerHTML = `
      <div class="emergency-grid">
        ${NATIONWIDE_SAFETY.numbers.map(n => `
          <div class="emergency">
            <div class="emergency-label">${n.label}</div>
            <div class="emergency-number">${n.number}</div>
          </div>
        `).join("")}
      </div>
      <div class="hospital-line">
        🏥 <strong>Nearest major hospital:</strong> ${extras.hospital}
      </div>
      <div class="scams-title">Watch out for</div>
      <ul class="scams">
        ${scams.map(s => `<li>${s}</li>`).join("")}
      </ul>
    `;
  }

  // ---------- Review ----------
  function buildSummary() {
    const chosen = state.options.find(o => o.id === state.selectedId);
    const hotel = state.hotels.find(h => h.id === state.selectedHotelId);
    const arriveMin = chosen.departMin + chosen.hours * 60;

    const travelTotal = chosen.price * state.passengers * (state.returnTrip ? 2 : 1);
    const stayTotal = hotel ? hotel.price * state.days : 0;
    const grandTotal = travelTotal + stayTotal;

    const fareLine =
      state.returnTrip
        ? `₹${chosen.price} × ${state.passengers} × 2 = ₹${travelTotal}`
        : `₹${chosen.price} × ${state.passengers} = ₹${travelTotal}`;

    const rows = {
      "Route":           `${state.fromCity} → ${state.toCity}`,
      "Boarding point":  state.fromStation,
      "Drop-off point":  state.toStation,
      "Stay duration":   `${state.days} ${state.days == 1 ? "day" : "days"}`,
      "Passengers":      `${state.passengers}`,
      "Return trip":     state.returnTrip ? "Yes" : "No",
      "Mode":            `${chosen.icon} ${chosen.mode} — ${chosen.name}`,
      "Class":           chosen.type,
      "Departure":       `${fmtTime(chosen.departMin)} from ${state.fromStation}`,
      "Arrival":         `${fmtTime(arriveMin)} at ${state.toStation}`,
      "Travel time":     fmtHours(chosen.hours),
      "Travel fare":     state.passengers === 1 && !state.returnTrip ? `₹${chosen.price}` : fareLine,
      "Hotel":           hotel ? `🏨 ${hotel.name} (${hotel.tier})` : "To be arranged on your own",
    };

    if (hotel) {
      rows["Hotel rating"] = `★ ${hotel.rating} · ${hotel.distance} km from station`;
      rows["Hotel cost"] = `₹${hotel.price} × ${state.days} = ₹${stayTotal}`;
    }

    rows["Trip purpose"] = state.purpose === "fun" ? "🌿 Fun / Leisure" : "💼 Work / Meeting";

    if (state.purpose === "fun" && state.selectedActivities.size) {
      const extras = getCityExtras(state.toCity);
      const picks = [...state.selectedActivities]
        .map(i => extras.activities[i].name)
        .join(" · ");
      rows["Things to do"] = picks;
    }

    summaryEl.innerHTML = "";
    Object.entries(rows).forEach(([k, v]) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="label">${k}</span><span class="value">${v}</span>`;
      summaryEl.appendChild(li);
    });

    totalBox.innerHTML = `
      <div class="total-row"><span>Travel</span><span>₹${travelTotal}</span></div>
      ${hotel ? `<div class="total-row"><span>Stay (${state.days} ${state.days == 1 ? "night" : "nights"})</span><span>₹${stayTotal}</span></div>` : ""}
      <div class="total-row grand"><span>Estimated total</span><span>₹${grandTotal}</span></div>
    `;
  }

  // ---------- Buttons ----------
  form.querySelectorAll(".next-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (state.step === 1) {
        if (!validateStep(1)) return;
        resolveStations();
        if (!state.fromStation || !state.toStation) return;
        showStep(2);
      } else if (state.step === 2) {
        if (!validateStep(2)) return;
        state.days = Number(form.days.value);
        state.passengers = Number(form.passengers.value);
        state.returnTrip = form.returnTrip.checked;
        const pick = form.querySelector('input[name="purpose"]:checked');
        state.purpose = pick ? pick.value : "fun";
        showStep(3);
        await buildComparison();
      } else if (state.step === 3) {
        if (!state.selectedId) return;
        buildHotels();
        showStep(4);
      } else if (state.step === 4) {
        if (!state.skipHotel && !state.selectedHotelId) {
          alert("Pick a hotel, or tick \"I'll arrange my own stay\".");
          return;
        }
        showStep(5);
        await buildExplore();
      } else if (state.step === 5) {
        buildSummary();
        showStep(6);
      }
    });
  });

  form.querySelectorAll(".prev-btn").forEach(btn => {
    btn.addEventListener("click", () => showStep(Math.max(1, state.step - 1)));
  });

  form.addEventListener("submit", e => {
    e.preventDefault();
    if (!state.selectedId) return;
    showStep(7);
  });

  restartBtn.addEventListener("click", () => {
    form.reset();
    state.selectedId = null;
    state.selectedHotelId = null;
    state.skipHotel = false;
    state.nightOnly = false;
    state.quietOnly = false;
    state.purpose = "fun";
    state.passengers = 1;
    state.selectedActivities = new Set();
    state.fromCity = state.toCity = state.fromStation = state.toStation = "";
    fromAuto.hidden = true;
    toAuto.hidden = true;
    fromStationInput.hidden = true;
    toStationInput.hidden = true;
    showStep(1);
  });

  // Init
  showStep(1);
})();
