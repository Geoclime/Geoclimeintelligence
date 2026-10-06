import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { DataSource, NewDataSourceInput } from "../../types/data-source.types";
import { applySubmitError } from "../../utils/form-errors";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { TextField } from "../shared/TextField";

/** Field names match the backend's createDataSourceSchema, so its 400s land on the right inputs. */
const dataSourceSchema = z.object({
  provider: z.string().trim().min(1, "Who publishes this data?").max(200),
  datasetName: z.string().trim().min(1, "Name the dataset").max(300),
  url: z.url({ protocol: /^https?$/, error: "Enter the web address, starting with http:// or https://" }),
  license: z.string().trim().min(1, "Copy the licence from the dataset's README, e.g. CC BY 4.0").max(200),
  downloadedOn: z.iso.date("Pick the date the file was downloaded"),
  notes: z.string().trim().max(2000),
});
type DataSourceForm = z.infer<typeof dataSourceSchema>;
const FIELDS = ["provider", "datasetName", "url", "license", "downloadedOn", "notes"] as const;

interface DataSourceDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (input: NewDataSourceInput) => Promise<DataSource>;
  onSaved: (source: DataSource) => void;
}

/**
 * "Add a source" on the import screen (Phase 2 decision 1): geoBoundaries and GRID3 are entered
 * here through the UI, never seeded. Copy the details from README_rivers_state_boundaries.md and
 * README_rivers_state_wards_settlements.md. Render with a fresh `key` each time it opens.
 */
export function DataSourceDialog({ open, onClose, onSave, onSaved }: DataSourceDialogProps) {
  const formId = useId();
  const today = new Date().toISOString().slice(0, 10);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DataSourceForm>({
    resolver: zodResolver(dataSourceSchema),
    defaultValues: { provider: "", datasetName: "", url: "", license: "", downloadedOn: "", notes: "" },
  });

  const submit = handleSubmit(async (values) => {
    try {
      onSaved(await onSave({ ...values, notes: values.notes || null }));
    } catch (error) {
      applySubmitError(error, setError, FIELDS);
    }
  });

  return (
    <Modal
      open={open}
      title="Add a data source"
      description="Where these boundaries come from. Every area on the platform points at its source."
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy="data-source-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting} loadingLabel="Adding…" data-cy="save-source">
            Add source
          </Button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <TextField label="Provider" placeholder="geoBoundaries (William & Mary geoLab)" error={errors.provider?.message} data-cy="source-provider" {...register("provider")} />
        <TextField label="Dataset" placeholder="gbOpen NGA ADM1 and ADM2, Rivers State subset" error={errors.datasetName?.message} data-cy="source-dataset" {...register("datasetName")} />
        <TextField label="Website" type="url" placeholder="https://www.geoboundaries.org" error={errors.url?.message} data-cy="source-url" {...register("url")} />
        <div className="form-grid form-grid--2">
          <TextField label="Licence" placeholder="CC BY 4.0" error={errors.license?.message} data-cy="source-license" {...register("license")} />
          <TextField label="Downloaded on" type="date" max={today} error={errors.downloadedOn?.message} data-cy="source-date" {...register("downloadedOn")} />
        </div>
        <TextField label="Notes (optional)" placeholder="e.g. Operational Placeholder ward boundaries" error={errors.notes?.message} {...register("notes")} />
      </form>
    </Modal>
  );
}
