import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { MAX_RECORDING_SECONDS } from "./report-form.schema";
import "./reports.css";

interface VoiceRecorderProps {
  recording: Blob | null;
  onChange: (recording: Blob | null) => void;
}

/** Formats the server accepts, in order of preference. Safari records MP4; others WebM or Ogg. */
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/webm"];

function supportedMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
}

/**
 * A short voice note, for people who would rather say what they see than type it. Recording
 * stops itself at 60 seconds. The microphone is only opened when "Record" is pressed, and is
 * released as soon as recording stops.
 */
export function VoiceRecorder({ recording, onChange }: VoiceRecorderProps) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const supported = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && supportedMime() !== undefined;

  // The recording's playback URL, released when it is replaced or the form goes away.
  const url = useMemo(() => (recording ? URL.createObjectURL(recording) : null), [recording]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);

  // Tick the timer while recording, and stop at the limit.
  useEffect(() => {
    if (seconds === null) return;
    if (seconds >= MAX_RECORDING_SECONDS) {
      recorder.current?.stop();
      return;
    }
    const timer = window.setTimeout(() => setSeconds((s) => (s === null ? null : s + 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  // Never leave the microphone open if the form goes away mid-recording.
  useEffect(() => () => recorder.current?.stream.getTracks().forEach((track) => track.stop()), []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = supportedMime();
      const media = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      media.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        setSeconds(null);
        onChange(new Blob(chunks, { type: (media.mimeType || mimeType || "audio/webm").split(";")[0] }));
      };
      recorder.current = media;
      media.start();
      setSeconds(0);
    } catch {
      setError("The microphone isn't available. Allow it in your browser's site settings, or type what you see instead.");
    }
  };

  if (!supported) return <p className="media-picker__note">Voice notes aren't supported in this browser. Describe what you see in the box above.</p>;

  return (
    <div className="voice-recorder" data-cy="voice-recorder">
      {seconds !== null ? (
        <>
          <span className="voice-recorder__live" aria-live="polite">
            <span className="voice-recorder__dot" aria-hidden="true" />
            Recording {seconds}s / {MAX_RECORDING_SECONDS}s
          </span>
          <Button variant="danger" size="sm" onClick={() => recorder.current?.stop()} data-cy="voice-stop">
            Stop
          </Button>
        </>
      ) : url ? (
        <>
          <audio controls src={url} className="voice-recorder__player">
            Your browser can't play this recording.
          </audio>
          <Button variant="ghost" size="sm" icon={<Icon name="trash" size={14} />} onClick={() => onChange(null)} data-cy="voice-remove">
            Remove
          </Button>
        </>
      ) : (
        <Button variant="secondary" size="sm" onClick={start} data-cy="voice-record">
          Record a voice note (up to {MAX_RECORDING_SECONDS}s)
        </Button>
      )}
      {error && <p className="media-picker__note">{error}</p>}
    </div>
  );
}
