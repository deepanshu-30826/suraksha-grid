/**
 * Historical Crime Evidence MapLibre Layer
 *
 * Adds a subtle polygon overlay for crime-area geometry when the dataset
 * is available. When the dataset is empty, this module exports a no-op.
 *
 * Usage:
 *   import { addCrimeOverlay, removeCrimeOverlay } from "./crime-overlay";
 *   addCrimeOverlay(map, crimeGeoJSON);    // call after map "load"
 *   removeCrimeOverlay(map);               // call on unmount or toggle
 *
 * Visual design:
 *   - Semi-transparent fill (does not obscure road colours)
 *   - Subtle outline only
 *   - No fake crime markers
 *   - No data rendered when dataset is absent (empty FeatureCollection)
 */

const LAYER_FILL   = "crime-areas-fill";
const LAYER_BORDER = "crime-areas-border";
const SOURCE_ID    = "crime-areas";

export interface CrimeGeoJSON {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      district:       string;
      state:          string;
      crime_category: string;
      incident_count: number;
      year:           number;
      severity_weight: number;
    };
    geometry: { type: string; coordinates: unknown };
  }>;
}

/** Empty FeatureCollection — safe default when dataset is absent. */
export const EMPTY_CRIME_FC: CrimeGeoJSON = { type: "FeatureCollection", features: [] };

type MapInstance = { addSource: Function; addLayer: Function; getSource: Function; getLayer: Function; removeLayer: Function; removeSource: Function };

export function addCrimeOverlay(map: MapInstance, fc: CrimeGeoJSON): void {
  if (!fc.features.length) return; // no data — do not add layers

  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, { type: "geojson", data: fc });
  }

  if (!map.getLayer(LAYER_FILL)) {
    map.addLayer({
      id:     LAYER_FILL,
      type:   "fill",
      source: SOURCE_ID,
      paint:  {
        // Colour by severity: low=yellow, high=red; keep very transparent
        "fill-color": [
          "interpolate", ["linear"], ["get", "severity_weight"],
          0.2, "#FEF08A",  // low severity → pale yellow
          0.6, "#FCA5A5",  // medium → pale red
          1.0, "#EF4444",  // high → red
        ],
        "fill-opacity": 0.15,
      },
    });
  }

  if (!map.getLayer(LAYER_BORDER)) {
    map.addLayer({
      id:     LAYER_BORDER,
      type:   "line",
      source: SOURCE_ID,
      paint:  {
        "line-color":   "#EA580C",
        "line-width":   0.8,
        "line-opacity": 0.4,
      },
    });
  }
}

export function removeCrimeOverlay(map: MapInstance): void {
  if (map.getLayer(LAYER_BORDER)) map.removeLayer(LAYER_BORDER);
  if (map.getLayer(LAYER_FILL))   map.removeLayer(LAYER_FILL);
  if (map.getSource(SOURCE_ID))   map.removeSource(SOURCE_ID);
}

export function updateCrimeOverlay(map: MapInstance, fc: CrimeGeoJSON): void {
  removeCrimeOverlay(map);
  addCrimeOverlay(map, fc);
}