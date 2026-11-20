"use client";

import { motion, useReducedMotion } from "motion/react";
import { formatMoney } from "@/lib/format";
import type { GroupTotal } from "@/types/api";

/** Where each rate-card zone sits on the drawing, relative to Dubai (an illustration, not a real map). */
const PLACES: Record<string, { x: number; y: number; label: string; anchor: "start" | "end" | "middle" }> = {
  Z2: { x: 430, y: 196, label: "GCC", anchor: "end" },
  Z3: { x: 580, y: 190, label: "Mid East & S. Asia", anchor: "middle" },
  Z4: { x: 380, y: 92, label: "Europe", anchor: "middle" },
  Z5: { x: 150, y: 124, label: "North America", anchor: "middle" },
  Z6: { x: 664, y: 300, label: "Asia Pacific", anchor: "middle" },
};
const DUBAI = { x: 470, y: 228 };

/** Faint dots that suggest land masses behind the routes. */
const DOTS: [number, number][] = [
  [340, 96], [356, 108], [372, 96], [388, 112], [404, 100], [420, 114], [332, 120],
  [470, 190], [496, 180], [522, 196], [548, 170], [578, 186], [604, 200],
  [112, 126], [132, 140], [152, 120], [172, 136], [192, 148], [646, 296], [668, 308], [690, 296],
];

/**
 * The saving per region drawn as routes from Dubai: thicker routes save more, a dashed one costs more.
 * Every figure is also in the list beside it, so the drawing adds no information a screen reader misses.
 */
export function RouteMap({ zones, currency }: { zones: GroupTotal[]; currency: string }) {
  const reduce = useReducedMotion();
  const routes = zones.filter((zone) => PLACES[zone.key]);
  const domestic = zones.find((zone) => zone.key === "Z1");
  const largest = Math.max(1, ...routes.map((zone) => Math.abs(zone.saving)));
  const summary = zones.map((zone) => `${zone.label} ${zone.saving >= 0 ? "saves" : "costs"} ${formatMoney(Math.abs(zone.saving), currency)}`).join(", ");

  return (
    <svg role="img" aria-label={`Savings by region from Dubai: ${summary}`} viewBox="0 0 760 380" className="h-auto max-h-[380px] w-full rounded-[20px] bg-hero">
      <g className="fill-hero-line">
        {DOTS.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={2.5} />
        ))}
      </g>
      {routes.map((zone, index) => {
        const place = PLACES[zone.key]!;
        const width = 2 + (Math.abs(zone.saving) / largest) * 4;
        const lift = Math.max(40, Math.abs(place.x - DUBAI.x) * 0.45);
        const path = `M${DUBAI.x} ${DUBAI.y} Q ${(DUBAI.x + place.x) / 2} ${Math.min(DUBAI.y, place.y) - lift} ${place.x} ${place.y}`;
        const saves = zone.saving >= 0;
        return (
          <motion.path
            key={zone.key}
            d={path}
            fill="none"
            strokeLinecap="round"
            strokeWidth={width}
            strokeDasharray={saves ? undefined : "6 6"}
            className={saves ? "stroke-hero-save" : "stroke-bad"}
            initial={reduce ? false : { pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ type: "spring", bounce: 0, duration: 0.9, delay: 0.15 + index * 0.08 }}
          />
        );
      })}
      <circle cx={DUBAI.x} cy={DUBAI.y} r={24} fill="none" className="stroke-gold" strokeOpacity={0.35} strokeWidth={2} />
      <circle cx={DUBAI.x} cy={DUBAI.y} r={10} className="fill-gold stroke-hero" strokeWidth={4} />
      <text x={DUBAI.x + 14} y={DUBAI.y + 30} fontSize={15} fontWeight={600} className="fill-hero-ink">
        Dubai{domestic ? ` · UAE ${domestic.saving >= 0 ? "+" : "−"}${formatMoney(Math.abs(domestic.saving), "").trim()}` : ""}
      </text>
      {routes.map((zone) => {
        const place = PLACES[zone.key]!;
        const text = `${place.label} ${zone.saving >= 0 ? "+" : "−"}${formatMoney(Math.abs(zone.saving), "").trim()}`;
        const width = text.length * 7.4 + 24;
        const wanted = place.anchor === "end" ? place.x - width : place.anchor === "middle" ? place.x - width / 2 : place.x;
        // Keep every label inside the drawing.
        const x = Math.min(Math.max(8, wanted), 760 - width - 8);
        const y = place.y - 44;
        return (
          <g key={`label-${zone.key}`}>
            <rect x={x} y={y} width={width} height={30} rx={15} className="fill-hero-ink" />
            <text x={x + 12} y={y + 20} fontSize={13} fontWeight={600} className="fill-hero">
              {text}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
