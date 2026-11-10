import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

/** Must match --assistant-fab-size and --assistant-gap in assistant.css. */
export const FAB_SIZE = 56;
export const FAB_GAP = 16;
/** How far a press must move before it counts as a drag rather than a click. */
const DRAG_THRESHOLD = 6;
const SETTLE_MS = 180;
const KEY_STEP = 48;
const STORAGE_KEY = "geoclime.assistant.position";

/** Where the button rests: against the left or right edge, this far from the bottom of the screen. */
export interface DockPosition {
  side: "left" | "right";
  /** Distance from the bottom of the viewport to the button's bottom edge, in px. */
  offset: number;
}

const DEFAULT_POSITION: DockPosition = { side: "right", offset: FAB_GAP };

function loadPosition(): DockPosition {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (
      parsed &&
      typeof parsed === "object" &&
      ((parsed as DockPosition).side === "left" || (parsed as DockPosition).side === "right") &&
      Number.isFinite((parsed as DockPosition).offset)
    ) {
      return parsed as DockPosition;
    }
  } catch {
    // Unreadable or blocked storage: start in the corner.
  }
  return DEFAULT_POSITION;
}

function savePosition(position: DockPosition) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    // The position just won't be remembered.
  }
}

function headerHeight(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height"));
  return Number.isFinite(value) ? value : 56;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

interface Point {
  x: number;
  y: number;
}

/**
 * Makes the assistant's button draggable. While dragged it follows the pointer (mouse, pen or finger);
 * on release it glides to the nearer side edge at the height it was dropped, never over the top bar, and
 * the spot is remembered on this device. A press that barely moves is still a click. Keyboard users move it
 * with Alt + arrow keys. Returns what the button needs, and the docked position for placing the chat.
 */
export function useDockPosition() {
  const [position, setPosition] = useState<DockPosition>(loadPosition);
  const [viewport, setViewport] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  /** Following the pointer. */
  const [live, setLive] = useState<Point | null>(null);
  /** Gliding to the edge after a drop. */
  const [settling, setSettling] = useState<Point | null>(null);
  const drag = useRef<{ pointerId: number; start: Point; origin: Point; moved: boolean; last: Point } | null>(null);
  const suppressClick = useRef(false);
  /** The top bar's height: the button never goes over it. */
  const [header] = useState(headerHeight);

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** The offset actually used: a remembered spot that no longer fits a smaller window is pulled back in. */
  const maxOffset = viewport.height - FAB_SIZE - FAB_GAP - header;
  const offset = clamp(position.offset, FAB_GAP, maxOffset);
  const docked: DockPosition = { side: position.side, offset };

  const dock = useCallback(
    (next: DockPosition, from: Point | null) => {
      const resolved = { side: next.side, offset: clamp(next.offset, FAB_GAP, window.innerHeight - FAB_SIZE - FAB_GAP - header) };
      if (from) {
        setSettling({
          x: resolved.side === "left" ? FAB_GAP : window.innerWidth - FAB_SIZE - FAB_GAP,
          y: window.innerHeight - resolved.offset - FAB_SIZE,
        });
        window.setTimeout(() => setSettling(null), SETTLE_MS);
      }
      setPosition(resolved);
      savePosition(resolved);
    },
    [header],
  );

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = { x: rect.left, y: rect.top };
    drag.current = { pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin, moved: false, last: origin };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    current.moved = true;
    current.last = {
      x: clamp(current.origin.x + dx, 0, window.innerWidth - FAB_SIZE),
      y: clamp(current.origin.y + dy, header, window.innerHeight - FAB_SIZE),
    };
    setLive(current.last);
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>, dropped: boolean) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.moved) return;
    // The browser still fires a click after a drag ends on the button; it mustn't open the chat.
    suppressClick.current = true;
    setLive(null);
    if (!dropped) return;
    const centre = current.last.x + FAB_SIZE / 2;
    dock({ side: centre < window.innerWidth / 2 ? "left" : "right", offset: window.innerHeight - current.last.y - FAB_SIZE }, current.last);
  };

  /** Call first in the button's onClick: true when that click was the end of a drag. */
  const wasDrag = () => {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return;
    const moves: Record<string, DockPosition | undefined> = {
      ArrowUp: { side: docked.side, offset: docked.offset + KEY_STEP },
      ArrowDown: { side: docked.side, offset: docked.offset - KEY_STEP },
      ArrowLeft: { side: "left", offset: docked.offset },
      ArrowRight: { side: "right", offset: docked.offset },
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    dock(next, null);
  };

  const shownAt = live ?? settling;
  const style: CSSProperties = shownAt
    ? { left: shownAt.x, top: shownAt.y, right: "auto", bottom: "auto" }
    : ({ "--fab-offset": `${offset}px` } as CSSProperties);

  return {
    docked,
    viewport,
    dragging: live !== null,
    settling: settling !== null,
    wasDrag,
    buttonProps: {
      style,
      onPointerDown,
      onPointerMove,
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => endDrag(event, true),
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => endDrag(event, false),
      onKeyDown,
    },
  };
}

/** The chat card's usual size, and its widest when expanded. */
const PANEL_HEIGHT = 620;
const PANEL_WIDTH = 400;
const EXPANDED_WIDTH = 760;

/**
 * Where the chat card goes for a docked button (computers only; on phones it fills the screen): on the
 * button's side, opening upwards from a button in the lower half of the screen and downwards otherwise.
 * Expanded, it takes all the height on that side of the button and is much wider, never covering the button.
 */
export function panelPlacement(docked: DockPosition, viewport: { width: number; height: number }, expanded: boolean): CSSProperties {
  const header = headerHeight();
  const spacing = 12;
  const buttonBottomY = viewport.height - docked.offset;
  const lowerHalf = buttonBottomY - FAB_SIZE / 2 > viewport.height / 2;
  const room = lowerHalf
    ? viewport.height - docked.offset - FAB_SIZE - spacing - header - FAB_GAP
    : viewport.height - buttonBottomY - spacing - FAB_GAP;
  const height = expanded ? room : Math.min(PANEL_HEIGHT, room);
  const width = Math.min(expanded ? EXPANDED_WIDTH : PANEL_WIDTH, viewport.width - 2 * FAB_GAP);
  const vertical = lowerHalf
    ? { "--ap-bottom": `${docked.offset + FAB_SIZE + spacing}px`, "--ap-top": "auto", "--ap-height": `${height}px` }
    : { "--ap-top": `${buttonBottomY + spacing}px`, "--ap-bottom": "auto", "--ap-height": `${height}px` };
  const horizontal =
    docked.side === "left"
      ? { "--ap-left": `${FAB_GAP}px`, "--ap-right": "auto" }
      : { "--ap-right": `${FAB_GAP}px`, "--ap-left": "auto" };
  return {
    ...vertical,
    ...horizontal,
    "--ap-width": `${width}px`,
    "--ap-origin": `${lowerHalf ? "bottom" : "top"} ${docked.side}`,
  } as CSSProperties;
}
