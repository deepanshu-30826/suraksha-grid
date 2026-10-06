import type { ReactNode } from "react";

/**
 * Full-bleed map layout used by Map, Routes, Navigation, Safety, Help pages.
 *
 * Mobile  : map fills the viewport below the header; panel slides up as a
 *           bottom sheet above the bottom nav (pb-16 keeps content clear).
 * Tablet  : map fills right 60%; panel is a 40% left column.
 * Desktop : fixed 400px left panel + map fills the remaining width, both
 *           flush with the sidebar edge (pl-64 on the shell handles the offset).
 */
export function MapLayout({ map, panel }: { map: ReactNode; panel: ReactNode }) {
  return (
    <div className="relative flex h-[calc(100dvh-3.5rem)] lg:h-dvh">
      {/* map layer — always behind the panel on mobile */}
      <div className="absolute inset-0 lg:relative lg:flex-1">{map}</div>

      {/* panel */}
      <aside
        className={[
          // mobile: bottom sheet anchored above the bottom nav
          "absolute inset-x-0 bottom-16 z-10",
          "max-h-[56%] overflow-y-auto",
          "rounded-t-3xl bg-white p-4 pb-4 shadow-sheet",
          // ≥ lg: left sidebar beside the map
          "lg:relative lg:bottom-auto lg:order-first",
          "lg:max-h-none lg:w-[400px] lg:shrink-0",
          "lg:rounded-none lg:border-r lg:border-line lg:p-6 lg:shadow-none",
          // tablet (md): widen the sheet a little
          "md:max-h-[52%]",
        ].join(" ")}
      >
        {/* drag handle — mobile only */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line lg:hidden" />
        {panel}
      </aside>
    </div>
  );
}
