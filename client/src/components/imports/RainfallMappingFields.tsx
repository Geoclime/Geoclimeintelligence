import { useFormContext, useWatch } from "react-hook-form";
import type { RainfallColumn } from "../../types/import.types";
import { SelectField } from "../shared/SelectField";
import type { ImportFormValues } from "./import-form.schema";

interface RainfallMappingFieldsProps {
  headings: string[];
  /** "LGA": the level the rainfall is for. */
  levelName: string;
  /** The file's first data row, to show what a chosen column holds. */
  sampleRow: Record<string, string | null> | undefined;
}

const FIELDS: { column: RainfallColumn; label: (levelName: string) => string; hint: (levelName: string) => string }[] = [
  {
    column: "area_code",
    label: (l) => `${l} code`,
    hint: (l) => `Each ${l}'s pcode (ADM2_PCODE in a CHIRPS export). Matched first; the name is used when there's no code.`,
  },
  {
    column: "area_name",
    label: (l) => `${l} name`,
    hint: (l) => `Each ${l}'s name (ADM2_EN). Spelling variants such as "Obia/Akpor" are matched to the standard names.`,
  },
  { column: "year_month", label: () => "Month", hint: () => "The month each value is for: 2016-01, or a date such as 2016-01-01." },
  { column: "rainfall_mm", label: () => "Rainfall (mm)", hint: () => "The month's mean rainfall in millimetres (mean in a CHIRPS export). Empty for an incomplete month." },
];

/**
 * "Match the columns" for a rainfall file: which column holds the area (code and/or name), the
 * month and the rainfall. Preset to the server's guess, which already knows the CHIRPS export.
 */
export function RainfallMappingFields({ headings, levelName, sampleRow }: RainfallMappingFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ImportFormValues>();
  const mapping = useWatch({ control, name: "columnMapping" });

  const example = (heading: string | undefined, fallback: string) => {
    const value = heading ? sampleRow?.[heading] : null;
    return value ? `First row: "${value.length > 60 ? `${value.slice(0, 60)}…` : value}"` : fallback;
  };

  return (
    <div className="form-grid" data-cy="rainfall-mapping">
      <div className="form-grid form-grid--2">
        {FIELDS.map(({ column, label, hint }) => (
          <SelectField
            key={column}
            label={label(levelName)}
            hint={example(mapping[column], hint(levelName))}
            error={errors.columnMapping?.[column]?.message}
            data-cy={`map-${column}`}
            {...register(`columnMapping.${column}`)}
          >
            <option value="">Not in this file</option>
            {headings.map((heading) => (
              <option key={heading} value={heading}>
                {heading}
              </option>
            ))}
          </SelectField>
        ))}
      </div>
      {errors.columnMapping?.message && <p className="field__error">{errors.columnMapping.message}</p>}
    </div>
  );
}
