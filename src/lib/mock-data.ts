import type { RouteOption, Segment, MapMarker, Story, SafetyReport, HelpPoint, UserProfile, LngLat } from "@/types";

export const CURRENT_LOCATION = "Sector 14 Market, Gurugram";
export const DESTINATIONS = ["Cyber Hub", "Huda City Centre Metro", "Medanta Hospital", "Sector 29 Market"];
export const AREA_SUMMARY = { score: 78, note: "Mostly well-lit with steady foot traffic this evening." };

// Shared 0-100 -> [lng, lat] projection so the legacy SVG paths and the real
// MapLibre geometry describe the same layout. Not a real street network.
const xy = (x: number, y: number): LngLat => [+(77.02 + x * 0.0009).toFixed(4), +(28.5 - y * 0.0009).toFixed(4)];
export const ORIGIN: LngLat = xy(10, 80);
export const DESTINATION: LngLat = xy(85, 20);

export const segments: Segment[] = [
  { id: "a", name: "Ring Road", path: "M10 80 L40 80", coords: [xy(10, 80), xy(40, 80)], score: 82, confidence: 90, lighting: 88, activity: 80, emergency: "Good", timeCondition: "Consistently lit through the evening", explanation: "Well-lit main road with steady traffic and a police post nearby.", observations: ["Streetlights working end to end", "Busy until late evening"] ,
    riskFactors: [],
    positiveFactors: ["Good lighting", "Active pedestrian presence"],
    recentReportCount: 0},
  { id: "b", name: "MG Road", path: "M40 80 L40 45", coords: [xy(40, 80), xy(40, 45)], score: 71, confidence: 82, lighting: 68, activity: 74, emergency: "Good", timeCondition: "Dims noticeably after 9 PM", explanation: "Generally active, with two dim stretches near the flyover.", observations: ["Dim near flyover underpass", "Auto stand keeps it lively"] ,
    riskFactors: ["Poor lighting detected near flyover"],
    positiveFactors: ["Active pedestrian presence"],
    recentReportCount: 1},
  { id: "c", name: "Market Lane", path: "M40 45 L70 45", coords: [xy(40, 45), xy(70, 45)], score: 44, confidence: 76, lighting: 35, activity: 30, emergency: "Limited", timeCondition: "Quiet and poorly lit after 9 PM", explanation: "Quiet after 9 pm, patchy lighting and a construction detour.", observations: ["Two lights out since Monday", "Construction blocks the pavement"] ,
    riskFactors: ["High-severity incidents reported", "Poor lighting", "Low pedestrian activity"],
    positiveFactors: [],
    recentReportCount: 3},
  { id: "d", name: "Station Link", path: "M70 45 L80 45", coords: [xy(70, 45), xy(80, 45)], score: 58, confidence: 70, lighting: 55, activity: 60, emergency: "Fair", timeCondition: "Crowded during evening train hours", explanation: "Short link that gets crowded around train times.", observations: ["Crowded at peak hours"] ,
    riskFactors: ["Crowded at peak hours — may be safer than it scores"],
    positiveFactors: [],
    recentReportCount: 2},
  { id: "e", name: "Canal Road", path: "M40 80 L80 80", coords: [xy(40, 80), xy(80, 80)], score: 86, confidence: 88, lighting: 90, activity: 78, emergency: "Good", timeCondition: "Patrolled through the night", explanation: "Wide, lit road with regular patrols and open shops.", observations: ["Patrol seen most evenings", "Pharmacy open late"] ,
    riskFactors: [],
    positiveFactors: ["Good lighting", "Active pedestrian presence", "Good emergency access"],
    recentReportCount: 0},
  { id: "f", name: "Temple Street", path: "M80 80 L80 45", coords: [xy(80, 80), xy(80, 45)], score: 79, confidence: 84, lighting: 80, activity: 82, emergency: "Good", timeCondition: "Lively until around 10 PM", explanation: "Busy with pedestrians and small shops until late.", observations: ["Lively until 10 pm"] ,
    riskFactors: [],
    positiveFactors: ["Active pedestrian presence", "Good lighting"],
    recentReportCount: 1},
  { id: "g", name: "Civil Lines", path: "M80 45 L85 20", coords: [xy(80, 45), xy(85, 20)], score: 81, confidence: 86, lighting: 84, activity: 70, emergency: "Good", timeCondition: "Steady lighting overnight", explanation: "Residential road, well lit and close to a hospital.", observations: ["Guarded gates and cameras"] ,
    riskFactors: [],
    positiveFactors: ["Good lighting", "Good emergency access"],
    recentReportCount: 0},
  { id: "h", name: "Garden Path", path: "M10 80 L10 20 L85 20", coords: [xy(10, 80), xy(10, 20), xy(85, 20)], score: 91, confidence: 92, lighting: 94, activity: 85, emergency: "Good", timeCondition: "Busy with walkers into the night", explanation: "Longest option but consistently lit and busy with walkers.", observations: ["Joggers and families till late", "Help point every 300 m"] ,
    riskFactors: [],
    positiveFactors: ["Good lighting", "Active pedestrian presence", "Good emergency access"],
    recentReportCount: 0},
];

export const routes: RouteOption[] = [
  { id: "fastest", name: "Fastest", etaMin: 14, distanceKm: 3.1, score: 58, confidence: 76, reason: "Shortest path, but passes a quiet, poorly lit lane.", segmentIds: ["a", "b", "c", "d", "g"] },
  { id: "balanced", name: "Balanced", etaMin: 17, distanceKm: 3.6, score: 81, confidence: 88, reason: "Only 3 min slower, keeps to lit, active roads.", segmentIds: ["a", "e", "f", "g"], recommended: true },
  { id: "safest", name: "Safest", etaMin: 24, distanceKm: 4.8, score: 91, confidence: 92, reason: "Best lit and busiest, with help points en route.", segmentIds: ["a", "h"] },
];

export const markers: MapMarker[] = [
  { id: "you", x: 10, y: 80, ...xyLL(10, 80), kind: "you", label: "You" },
  { id: "dest", x: 85, y: 20, ...xyLL(85, 20), kind: "dest", label: "Cyber Hub" },
  { id: "r1", x: 40, y: 62, ...xyLL(40, 62), kind: "report", label: "Poor lighting" },
  { id: "r2", x: 55, y: 45, ...xyLL(55, 45), kind: "report", label: "Construction" },
  { id: "r3", x: 80, y: 62, ...xyLL(80, 62), kind: "report", label: "Police presence" },
];

export const stories: Story[] = [
  { id: "s1", author: "Ananya R.", place: "Market Lane", body: "Two streetlights have been out all week. I switched to Canal Road and felt much better.", tags: ["Poor lighting", "Isolated"], minutesAgo: 25, helpful: 18 },
  { id: "s2", author: "Kabir S.", place: "Canal Road", body: "Patrol van passed twice while I walked home at 10. Shops were still open.", tags: ["Police presence"], minutesAgo: 95, helpful: 31 },
  { id: "s3", author: "Meera T.", place: "Station Link", body: "Very crowded at 6 pm. Safe, but keep your bag in front.", tags: ["Crowded"], minutesAgo: 240, helpful: 9 },
  { id: "s4", author: "Rohan D.", place: "MG Road", body: "Construction has narrowed the pavement near the flyover.", tags: ["Construction"], minutesAgo: 1500, helpful: 6 },
];

export const reports: SafetyReport[] = [
  { id: "p1", place: "Market Lane", tag: "Poor lighting", minutesAgo: 25, note: "Two lights out" },
  { id: "p2", place: "Canal Road", tag: "Police presence", minutesAgo: 95, note: "Evening patrol active" },
  { id: "p3", place: "MG Road", tag: "Construction", minutesAgo: 300, note: "Pavement narrowed" },
];

export const helpPoints: HelpPoint[] = [
  { id: "h1", name: "Sector 14 Police Station", kind: "police", distanceKm: 0.6, open24h: true, x: 30, y: 70, ...xyLL(30, 70) },
  { id: "h2", name: "Medanta Hospital", kind: "hospital", distanceKm: 1.9, open24h: true, x: 82, y: 35, ...xyLL(82, 35) },
  { id: "h3", name: "Canal Road Help Point", kind: "help", distanceKm: 0.9, open24h: true, x: 60, y: 80, ...xyLL(60, 80) },
  { id: "h4", name: "Civil Hospital Emergency", kind: "hospital", distanceKm: 2.4, open24h: true, x: 55, y: 30, ...xyLL(55, 30) },
  { id: "h5", name: "Police Booth, Temple St", kind: "police", distanceKm: 1.3, open24h: false, x: 80, y: 55, ...xyLL(80, 55) },
];

export const user: UserProfile = { name: "Riya Menon", email: "riya@example.com", initials: "RM", reports: 4, stories: 2 };

export const getRoute = (id?: string | null) => routes.find((r) => r.id === id) ?? routes[1];
export const getSegment = (id?: string | null) => segments.find((s) => s.id === id);

// helper co-located below `xy` conceptually — declared as a function (not const)
// so it's hoisted and usable in the marker/help-point literals above.
function xyLL(x: number, y: number) { return { lng: +(77.02 + x * 0.0009).toFixed(4), lat: +(28.5 - y * 0.0009).toFixed(4) }; }
