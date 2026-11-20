"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

/**
 * Counts from 0 up to `value` the first time the component shows (ease-out, ~0.9 s), and from the old
 * figure to the new one whenever it changes (e.g. a what-if). Reduced motion shows the value at once.
 */
export function useCountUp(value: number, durationMs = 900): number {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  /** Where the next count starts: the figure last counted to */
  const from = useRef(0);

  useEffect(() => {
    if (reduce) {
      from.current = value;
      return;
    }
    const start = performance.now();
    const origin = from.current;
    const duration = origin === 0 ? durationMs : durationMs * 0.6;
    let frame = 0;
    const tick = (now: number) => {
      // The first frame's timestamp can be a hair before `start`; clamp so the number never overshoots back.
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = origin + (value - origin) * eased;
      from.current = current;
      setShown(current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduce]);

  return reduce ? value : shown;
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
