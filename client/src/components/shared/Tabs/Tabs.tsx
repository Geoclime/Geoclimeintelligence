import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import "./Tabs.css";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
  dataCy?: string;
}

interface TabsProps {
  tabs: TabItem[];
  /** The id of the tab that is showing. The caller owns this, so it can live in the URL. */
  activeId: string;
  onChange: (id: string) => void;
  /** Names the tab bar for screen readers, e.g. "Configuration sections". */
  ariaLabel: string;
  /**
   * Mount a panel the first time its tab is opened, instead of all of them at once. Use it when the
   * panels load their own data, so a tab nobody opens costs no requests. A panel that has been opened
   * stays mounted.
   */
  lazy?: boolean;
}

/**
 * A horizontal tab bar with one panel per tab. A panel stays mounted once it is, and the inactive ones
 * are hidden, so a form half-filled in one tab is still there when the person comes back to it.
 * Arrow keys, Home and End move between tabs.
 */
export function Tabs({ tabs, activeId, onChange, ariaLabel, lazy = false }: TabsProps) {
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  // The tabs opened so far. Adjusting state while rendering is React's way to derive it from `activeId`.
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set([activeId]));
  if (!opened.has(activeId)) setOpened(new Set(opened).add(activeId));

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    const target = next < 0 ? undefined : tabs[next];
    if (!target) return;
    event.preventDefault();
    onChange(target.id);
    buttons.current[next]?.focus();
  };

  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={ariaLabel}>
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              className="tabs__tab"
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              data-cy={tab.dataCy}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          className="tabs__panel"
          hidden={tab.id !== activeId}
        >
          {!lazy || opened.has(tab.id) ? tab.content : null}
        </div>
      ))}
    </div>
  );
}
