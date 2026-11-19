"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 up to `value` once, the first time the component shows (ease-out, ~0.9 s).
 * Shows the final value straight away when the person has asked for reduced motion.
 */
export function useCountUp(value: number, durationMs = 900): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const done = useRef(false);

  useEffect(() => {
    if (reduce || done.current) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      // The first frame's timestamp can be a hair before `start`; clamp so the number never dips below 0.
      const progress = Math.min(1, Math.max(0, (now - start) / durationMs));
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        done.current = true;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduce]);

  return shown;
}

/** True when the viewport is at least `minWidth` px wide (false during the first render). */
export function useMinWidth(minWidth: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${minWidth}px)`);
    const update = () => setMatches(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [minWidth]);
  return matches;
}
