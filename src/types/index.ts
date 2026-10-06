export type Level = "safer" | "moderate" | "elevated" | "concern";
export type RouteId = "fastest" | "balanced" | "safest";
export type LngLat = [number, number]; // [lng, lat] — matches GeoJSON/MapLibre order

export interface RouteOption {
  id: RouteId;
  name: string;
  etaMin: number;
  distanceKm: number;
  score: number;
  confidence: number;
  reason: string;
  segmentIds: string[];
  recommended?: boolean;
  // Phase 4 additions — optional so Phase 2 rendering still compiles
  riskFactors?: string[];
  positiveFactors?: string[];
  explanation?: string;
  timePeriod?: string;
}

export interface Segment {
  id: string;
  name: string;
  path: string;             // legacy SVG path — mock-map fallback only
  coords: LngLat[];         // real-world line geometry for MapLibre
  score: number;
  confidence: number;
  lighting: number;
  activity: number;
  emergency: "Good" | "Fair" | "Limited";
  timeCondition: string;
  explanation: string;
  observations: string[];
  // Phase 4 additions
  riskFactors?: string[];
  positiveFactors?: string[];
  recentReportCount?: number;
  /** Populated when historical crime dataset is available */
  historicalEvidence?: {
    level: "NONE" | "LOW" | "MODERATE" | "HIGH" | "UNAVAILABLE";
    explanation: string;
    source?: string;
    yearRange?: string;
    confidence?: number;
  };
}

export type MarkerKind = "you" | "dest" | "report" | "help";
export interface MapMarker { id: string; x: number; y: number; lng: number; lat: number; kind: MarkerKind; label: string }
export interface Story { id: string; author: string; place: string; body: string; tags: string[]; minutesAgo: number; helpful: number }
export interface SafetyReport {
  id: string;
  place: string;
  tag: string;
  minutesAgo: number;
  note: string;
  latitude?: number;
  longitude?: number;
  segmentId?: string;
}
export type HelpKind = "police" | "hospital" | "help";
export interface HelpPoint { id: string; name: string; kind: HelpKind; distanceKm: number; open24h: boolean; x: number; y: number; lng: number; lat: number }
export interface UserProfile { name: string; email: string; initials: string; reports: number; stories: number }

// Safety engine output types (mirroring backend Python dataclasses)
export interface ScoreFactors {
  lighting: number;
  pedestrian_activity: number;
  report_penalty: number;
  severity_penalty: number;
  emergency_access: number;
  time_of_day: number;
}

export interface SafetyScoreResult {
  safety_score: number;
  confidence_score: number;
  factors: ScoreFactors;
  risk_factors: string[];
  positive_factors: string[];
  explanation: string;
  time_period: string;
  calculated_at: string;
}

export interface AnomalyResult {
  is_anomaly: boolean;
  severity: "none" | "low" | "medium" | "high";
  reason: string;
}