import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import "./reports.css";

interface VideoPickerProps {
  video: File | null;
  onChange: (video: File | null) => void;
  maxBytes: number;
  maxSeconds: number;
}

/** A video's length in seconds, read from the file itself before it is uploaded. */
function durationOf(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(probe.duration);
    };
    // A format the browser can't read is left to the server's own check.
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    probe.src = url;
  });
}

/**
 * One short video (the camera on a phone). Length and size are checked here first, so nobody
 * waits for a long upload only to have it refused; the server checks again.
 */
export function VideoPicker({ video, onChange, maxBytes, maxSeconds }: VideoPickerProps) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);
  const url = useMemo(() => (video ? URL.createObjectURL(video) : null), [video]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > maxBytes) return setError(`That video is over ${Math.round(maxBytes / (1024 * 1024))} MB. Record a shorter one.`);
    if ((await durationOf(file)) > maxSeconds + 1) return setError(`Videos can be up to ${maxSeconds} seconds. Record a shorter one.`);
    onChange(file);
  };

  return (
    <div className="media-row" data-cy="video-picker">
      {url ? (
        <>
          <video className="media-row__video" src={url} controls playsInline preload="metadata" />
          <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={() => onChange(null)} data-cy="video-remove">
            Remove video
          </Button>
        </>
      ) : (
        <label htmlFor={inputId} className="button button--secondary button--sm media-row__pick">
          <Icon name="plus" size={14} />
          <span>Add a video (up to {maxSeconds}s)</span>
          <input
            id={inputId}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            capture="environment"
            className="visually-hidden"
            onChange={(event) => {
              void pick(event.target.files?.[0]);
              event.target.value = "";
            }}
            data-cy="video-input"
          />
        </label>
      )}
      {error && <p className="media-picker__note media-picker__note--error">{error}</p>}
    </div>
  );
}
