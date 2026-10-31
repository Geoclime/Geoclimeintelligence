import type { BBox, LonLat } from "../../types/admin-unit.types";
import { boundsAround, describeOffset } from "../../utils/geo-distance";
import { Button, buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";
import "./location-trace.css";

interface LocationTraceProps {
  /** The pinned place, e.g. where a flood report was sent from. */
  pin: LonLat;
  label: string;
  /** Where the viewer is, once they have pressed "Where am I?". */
  me: LonLat | null;
  onShow: (bounds: BBox) => void;
  onClear: () => void;
}

/** Google Maps' own route planner, from the viewer's position when it is known (otherwise Google asks for it). */
function directionsUrl(pin: LonLat, me: LonLat | null): string {
  const origin = me ? `&origin=${me[1]},${me[0]}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${pin[1]},${pin[0]}${origin}&travelmode=driving`;
}

/**
 * The pinned place on the map, and how to get there: how far it is and in which direction from
 * where you stand, a button to bring both into view, and directions. Without a position yet it says
 * how to get one, so a link to a flood report is a few taps from "I am here, it is there".
 */
export function LocationTrace({ pin, label, me, onShow, onClear }: LocationTraceProps) {
  return (
    <section className="map-panel location-trace" aria-label={`${label}: how to get there`} data-cy="location-trace">
      <div className="location-trace__head">
        <span className="location-trace__badge" aria-hidden="true">
          <Icon name="pin" size={14} />
        </span>
        <div className="location-trace__titles">
          <p className="location-trace__label">Pinned place</p>
          <p className="location-trace__name" data-cy="trace-label">
            {label}
          </p>
        </div>
        <button type="button" className="location-trace__clear" onClick={onClear} aria-label="Remove the pin" data-cy="trace-clear">
          <Icon name="close" size={16} />
        </button>
      </div>

      <p className="location-trace__offset" data-cy="trace-offset">
        {me ? describeOffset(me, pin) : "Press Where am I? to see how far you are from it."}
      </p>

      <div className="location-trace__actions">
        <Button variant="secondary" size="sm" icon={<Icon name="crosshair" size={14} />} onClick={() => onShow(boundsAround(me ? [me, pin] : [pin]))} data-cy="trace-show">
          {me ? "Show both" : "Show on map"}
        </Button>
        <a href={directionsUrl(pin, me)} target="_blank" rel="noreferrer" className={buttonClassName({ variant: "ghost", size: "sm" })} data-cy="trace-directions">
          <Icon name="externalLink" size={14} />
          <span>Directions</span>
        </a>
      </div>
    </section>
  );
}
