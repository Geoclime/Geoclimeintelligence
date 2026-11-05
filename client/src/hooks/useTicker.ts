import { useEffect, useState, type RefObject } from "react";

/** How fast a ticker moves, in pixels a second: slow enough to read, quick enough to finish a long line. */
const SPEED_PX_PER_S = 45;
const MIN_SECONDS = 12;

/**
 * Whether a line of text is too long for the room it has, and how long one pass of it should take if
 * it scrolls. Only a line that doesn't fit moves: a short one stays still and readable. The text and
 * its room are both watched, so a window resize or a new sentence is re-measured. The measured text is
 * the same width whether or not it is scrolling, so the answer can't flip back and forth. The caller owns
 * the two elements (the room, and the text inside it) and passes their refs in.
 */
export function useTicker(text: string, viewportRef: RefObject<HTMLElement | null>, textRef: RefObject<HTMLElement | null>) {
  const [state, setState] = useState({ scrolling: false, seconds: MIN_SECONDS });

  useEffect(() => {
    const viewport = viewportRef.current;
    const copy = textRef.current;
    if (!viewport || !copy || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const scrolling = copy.offsetWidth > viewport.clientWidth;
      const seconds = Math.max(MIN_SECONDS, Math.round(copy.offsetWidth / SPEED_PX_PER_S));
      setState((current) => (current.scrolling === scrolling && current.seconds === seconds ? current : { scrolling, seconds }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    observer.observe(copy);
    return () => observer.disconnect();
  }, [text, viewportRef, textRef]);

  return state;
}
