import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useReportMediaOptions } from "../../hooks/useFloodReports";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLocatePoint } from "../../hooks/useLocatePoint";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { WATER_DEPTHS, type FloodReport, type NewFloodReport } from "../../types/flood-report.types";
import { applySubmitError } from "../../utils/form-errors";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { LocationPicker } from "./LocationPicker";
import { PhotoPicker } from "./PhotoPicker";
import { MAX_RECORDING_SECONDS, reportFormSchema, type ReportFormValues } from "./report-form.schema";
import { DocumentPicker } from "./DocumentPicker";
import { VideoPicker } from "./VideoPicker";
import { VoiceRecorder } from "./VoiceRecorder";
import "./reports.css";

interface ReportFloodFormProps {
  /** Rejects with an ApiError so the form can show a 400's field errors. */
  onSubmit: (report: NewFloodReport) => Promise<FloodReport>;
  onSent: (report: FloodReport) => void;
}

const around = ([lon, lat]: LonLat): BBox => [lon - 0.004, lat - 0.004, lon + 0.004, lat + 0.004];

/**
 * "Report flooding": where (GPS, adjustable on the map), a place name (filled in from the LGA and
 * ward, editable), how deep the water is, what you see, and optionally photos and a voice note.
 * A coordinator reviews every report before it is published.
 */
export function ReportFloodForm({ onSubmit, onSent }: ReportFloodFormProps) {
  const geolocation = useGeolocation();
  const located = useLocatePoint();
  const [point, setPoint] = useState<LonLat | null>(null);
  const [focus, setFocus] = useState<BBox | null>(null);
  const [photos, setPhotos] = useState<Blob[]>([]);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // Videos and documents are offered only when the server can store them (Cloudinary).
  const limits = useReportMediaOptions().options?.limits;
  const [pointError, setPointError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    mode: "onTouched",
    defaultValues: { locationName: "", description: "" },
  });

  /** Moves the pin, and names the place after its ward and LGA unless the reporter has typed a name. */
  const pick = async (next: LonLat, fromGps = false) => {
    setPoint(next);
    setPointError(null);
    if (fromGps) setFocus(around(next));
    const result = await located.locate(next);
    if (getFieldState("locationName").isDirty) return;
    const names = (result?.units ?? []).filter((u) => u.level >= 2).reverse().map((u) => `${u.unitName}${u.level === 2 ? ` ${u.levelName}` : ""}`);
    setValue("locationName", names.length ? names.join(", ") : `${next[1].toFixed(5)}, ${next[0].toFixed(5)}`, { shouldValidate: true });
  };

  const locateMe = async () => {
    const position = await geolocation.request();
    if (position) await pick(position, true);
  };

  // Ask for the position once when the form opens: the reporter is usually standing at the flooding.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void locateMe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on first open
  }, []);

  const submit = handleSubmit(async (values) => {
    if (!point) {
      setPointError("Set where the flooding is: use your location or tap the map.");
      return;
    }
    try {
      onSent(await onSubmit({ ...values, point, photos, audio, video, files }));
    } catch (error) {
      applySubmitError(error, setError, ["locationName", "waterDepth", "description"]);
    }
  });

  return (
    <form className="report-form" onSubmit={submit} noValidate data-cy="report-form">
      {errors.root?.server && (
        <Callout tone="danger" dataCy="form-error">
          {errors.root.server.message}
        </Callout>
      )}
      <section className="report-form__section" aria-labelledby="report-where">
        <h2 id="report-where" className="report-form__heading">
          Where is the flooding?
        </h2>
        <LocationPicker
          point={point}
          focus={focus}
          onPick={(next) => void pick(next)}
          onLocate={() => void locateMe()}
          locating={geolocation.locating}
          error={pointError ?? geolocation.error}
        />
        <TextField label="Place name" hint="A street, landmark or community people would recognise." error={errors.locationName?.message} data-cy="report-location-name" {...register("locationName")} />
      </section>

      <section className="report-form__section" aria-labelledby="report-what">
        <h2 id="report-what" className="report-form__heading">
          What do you see?
        </h2>
        <SelectField label="Water depth" defaultValue="" error={errors.waterDepth?.message} data-cy="report-depth" {...register("waterDepth")}>
          <option value="" disabled>
            Choose the depth…
          </option>
          {WATER_DEPTHS.map((depth) => (
            <option key={depth} value={depth}>
              {WATER_DEPTH_INFO[depth].label}: {WATER_DEPTH_INFO[depth].description.toLowerCase()} ({WATER_DEPTH_INFO[depth].metres})
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Describe what you see"
          rows={4}
          maxLength={2000}
          placeholder="Are roads blocked? Are homes affected? Is anyone stranded or hurt?"
          error={errors.description?.message}
          data-cy="report-description"
          {...register("description")}
        />
      </section>

      <section className="report-form__section" aria-labelledby="report-media">
        <h2 id="report-media" className="report-form__heading">
          {limits?.video.enabled ? "Photos, video and voice note" : "Photos and voice note"} <span className="report-form__optional">(optional)</span>
        </h2>
        <PhotoPicker photos={photos} onChange={setPhotos} />
        <div className="media-actions">
          <VoiceRecorder recording={audio} onChange={setAudio} />
          {limits?.video.enabled && (
            <VideoPicker video={video} onChange={setVideo} maxBytes={limits.video.maxBytes} maxSeconds={limits.video.maxSeconds ?? MAX_RECORDING_SECONDS} />
          )}
          {limits?.file.enabled && <DocumentPicker files={files} onChange={setFiles} maxCount={limits.file.maxCount} maxBytes={limits.file.maxBytes} />}
        </div>
        <p className="media-picker__note">
          Voice notes{limits?.video.enabled ? " and videos" : ""} can be up to {MAX_RECORDING_SECONDS} seconds.
        </p>
      </section>

      <Button type="submit" variant="danger" size="lg" fullWidth loading={isSubmitting} loadingLabel="Sending report…" data-cy="report-submit">
        Send flood report
      </Button>
      <p className="report-form__note">A coordinator reviews every report before it is published. Your name is never shown publicly.</p>
    </form>
  );
}
