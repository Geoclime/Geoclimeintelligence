import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import type { Country } from "../../types/country.types";
import { applySubmitError } from "../../utils/form-errors";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Icon } from "../shared/Icon";
import { TextField } from "../shared/TextField";
import {
  countryFormSchema,
  countryToForm,
  EMPTY_COUNTRY_FORM,
  type CountryFormInput,
  type CountryFormValues,
} from "./country-form.schema";
import "./countries.css";

interface CountryFormProps {
  /** null = adding a country; otherwise editing this one. */
  country: Country | null;
  onSubmit: (values: CountryFormValues) => Promise<void>;
  onCancel: () => void;
}

const MAX_LEVELS = 6;
const BBOX_FIELDS = [
  ["minLon", "West (min longitude)"],
  ["minLat", "South (min latitude)"],
  ["maxLon", "East (max longitude)"],
  ["maxLat", "North (max latitude)"],
] as const;

/**
 * Add or edit a country: its ISO code, name, the names of its levels (add, rename, reorder) and
 * an optional rough bounding box that the import checks use. A level that already holds areas
 * can be renamed but not removed; the server enforces the same rule.
 */
export function CountryForm({ country, onSubmit, onCancel }: CountryFormProps) {
  const editing = country !== null;
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<CountryFormInput, unknown, CountryFormValues>({
    resolver: zodResolver(countryFormSchema),
    defaultValues: country ? countryToForm(country) : EMPTY_COUNTRY_FORM,
  });
  const levels = useFieldArray({ control, name: "levelNames" });
  const unitCount = (index: number) => country?.levels[index]?.unitCount ?? 0;
  // Levels at or above the deepest one holding areas must stay (they can still be renamed).
  const deepestUsed = Math.max(0, ...(country?.levels.filter((l) => l.unitCount > 0).map((l) => l.level) ?? []));

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (error) {
      applySubmitError(error, setError, ["countryCode", "countryName", "levelNames", "bbox"]);
    }
  });

  const levelsError = errors.levelNames?.message ?? errors.levelNames?.root?.message;
  const bboxError = errors.bbox?.message ?? errors.bbox?.root?.message;

  return (
    <form className="card card__body country-form" onSubmit={submit} noValidate data-cy="country-form">
      {errors.root?.server && (
        <Callout tone="danger" dataCy="form-error">
          {errors.root.server.message}
        </Callout>
      )}

      <section className="form-section">
        <h2 className="form-section__title">Country</h2>
        <div className="form-grid form-grid--2">
          <TextField
            label="ISO code"
            placeholder="NGA"
            maxLength={3}
            autoComplete="off"
            spellCheck={false}
            className="mono-input"
            disabled={editing}
            hint={editing ? "The code can't change once areas may point at it." : "ISO 3166-1 alpha-3, e.g. NGA for Nigeria."}
            error={errors.countryCode?.message}
            data-cy="country-code"
            {...register("countryCode")}
          />
          <TextField
            label="Name"
            placeholder="Nigeria"
            error={errors.countryName?.message}
            data-cy="country-name"
            {...register("countryName")}
          />
        </div>
      </section>

      <section className="form-section" aria-labelledby="levels-title">
        <h2 id="levels-title" className="form-section__title">
          Levels
        </h2>
        <p className="form-section__lead">
          The country's own names for its administrative levels, from the top down. For Nigeria: State, LGA, Ward.
        </p>
        <ol className="level-list" data-cy="level-list">
          {levels.fields.map((field, index) => {
            const count = unitCount(index);
            const locked = editing && index + 1 <= deepestUsed;
            return (
              <li key={field.id} className="level-list__item">
                <span className="level-list__number" aria-hidden="true">
                  {index + 1}
                </span>
                <TextField
                  label={`Level ${index + 1} name`}
                  className="level-list__field"
                  error={errors.levelNames?.[index]?.name?.message}
                  hint={count > 0 ? `${count.toLocaleString()} areas: can be renamed, not removed` : undefined}
                  data-cy={`level-name-${index}`}
                  {...register(`levelNames.${index}.name`)}
                />
                <div className="level-list__actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="arrowUp" size={16} />}
                    aria-label={`Move level ${index + 1} up`}
                    disabled={index === 0 || locked}
                    onClick={() => levels.move(index, index - 1)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="arrowDown" size={16} />}
                    aria-label={`Move level ${index + 1} down`}
                    disabled={index === levels.fields.length - 1 || index + 2 <= deepestUsed}
                    onClick={() => levels.move(index, index + 1)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="trash" size={16} />}
                    aria-label={`Remove level ${index + 1}`}
                    disabled={levels.fields.length === 1 || locked}
                    onClick={() => levels.remove(index)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {levelsError && <p className="field__error">{levelsError}</p>}
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="plus" size={16} />}
          disabled={levels.fields.length >= MAX_LEVELS}
          onClick={() => levels.append({ name: "" })}
          data-cy="add-level"
        >
          Add a level
        </Button>
      </section>

      <section className="form-section" aria-labelledby="bbox-title">
        <h2 id="bbox-title" className="form-section__title">
          Rough bounding box (optional)
        </h2>
        <p className="form-section__lead">
          Imported shapes outside this box fail their checks, which catches latitude and longitude swapped or the wrong
          country. Decimal degrees, WGS84. A generous box for Nigeria is West 2.5, South 4.0, East 14.8, North 14.0.
        </p>
        <div className="form-grid form-grid--4">
          {BBOX_FIELDS.map(([key, label]) => (
            <TextField key={key} label={label} inputMode="decimal" data-cy={`bbox-${key}`} {...register(`bbox.${key}`)} error={errors.bbox?.[key]?.message} />
          ))}
        </div>
        {bboxError && <p className="field__error">{bboxError}</p>}
      </section>

      <div className="form-actions">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting} loadingLabel="Saving…" disabled={editing && !isDirty} data-cy="save-country">
          {editing ? "Save changes" : "Create country"}
        </Button>
      </div>
    </form>
  );
}
