import type { ImportPreview } from "../../types/import.types";

/** The first rows of the uploaded file as the server read them, so the admin recognises the columns. */
export function FilePreviewTable({ preview }: { preview: ImportPreview }) {
  if (preview.sampleRows.length === 0) {
    return <p className="muted">The file has headings but no data rows below them.</p>;
  }
  return (
    <div className="file-preview" data-cy="file-preview">
      <table className="file-preview__table">
        <caption className="visually-hidden">First rows of {preview.fileName}</caption>
        <thead>
          <tr>
            {preview.headings.map((heading) => (
              <th key={heading} scope="col">
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.sampleRows.map((row, index) => (
            <tr key={index}>
              {preview.headings.map((heading) => (
                <td key={heading}>{row[heading] ?? <span className="muted">(empty)</span>}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
