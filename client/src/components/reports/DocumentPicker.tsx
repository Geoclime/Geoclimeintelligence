import { useId, useState } from "react";
import { Icon } from "../shared/Icon";
import "./reports.css";

interface DocumentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  maxCount: number;
  maxBytes: number;
}

const sizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

/** Documents (PDF), e.g. an official notice or an assessment, attached to a report. */
export function DocumentPicker({ files, onChange, maxCount, maxBytes }: DocumentPickerProps) {
  const inputId = useId();
  const [error, setError] = useState<string | null>(null);

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    setError(null);
    const picked = [...list].slice(0, maxCount - files.length);
    const tooBig = picked.find((file) => file.size > maxBytes);
    if (tooBig) return setError(`${tooBig.name} is over ${Math.round(maxBytes / (1024 * 1024))} MB.`);
    onChange([...files, ...picked]);
  };

  return (
    <div className="media-row" data-cy="document-picker">
      {files.length > 0 && (
        <ul className="document-list">
          {files.map((file, index) => (
            <li key={`${file.name}-${index}`}>
              <Icon name="file" size={16} />
              <span className="document-list__name">{file.name}</span>
              <span className="document-list__size">{sizeText(file.size)}</span>
              <button type="button" onClick={() => onChange(files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`}>
                <Icon name="close" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length < maxCount && (
        <label htmlFor={inputId} className="button button--secondary button--sm media-row__pick">
          <Icon name="file" size={14} />
          <span>Attach a PDF</span>
          <input
            id={inputId}
            type="file"
            accept="application/pdf"
            multiple
            className="visually-hidden"
            onChange={(event) => {
              add(event.target.files);
              event.target.value = "";
            }}
            data-cy="document-input"
          />
        </label>
      )}
      {error && <p className="media-picker__note media-picker__note--error">{error}</p>}
    </div>
  );
}
