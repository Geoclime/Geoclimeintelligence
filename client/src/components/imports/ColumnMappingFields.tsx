import { useFormContext, useWatch } from "react-hook-form";
import type { AdminUnitSummary } from "../../types/admin-unit.types";
import type { ImportFileType, TemplateColumn } from "../../types/import.types";
import { SelectField } from "../shared/SelectField";
import { carriesRowShapes, type ImportFormValues } from "./import-form.schema";

interface ColumnMappingFieldsProps {
  headings: string[];
  fileType: ImportFileType;
  level: number;
  levelName: string;
  parentLevelName: string | null;
  /** The live areas one level up, for "one parent for every row". */
  parents: AdminUnitSummary[];
  /** The file's first data row, to show what a chosen column holds. */
  sampleRow: Record<string, string | null> | undefined;
}

const DESCRIPTIONS: Record<TemplateColumn, string> = {
  unit_name: "Name",
  unit_code: "Code (optional)",
  parent_code: "Parent",
  geometry_wkt: "Shape (WKT)",
};

/**
 * "Match its columns": one dropdown per template column, preset to the server's suggestion. This
 * is what lets a real file whose headings differ from the template (like the lga_boundaries sheet)
 * import without being converted by hand first.
 */
export function ColumnMappingFields({ headings, fileType, level, levelName, parentLevelName, parents, sampleRow }: ColumnMappingFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ImportFormValues>();
  const [parentMode, mapping] = useWatch({ control, name: ["parentMode", "columnMapping"] });

  /** "First row: "Rivers"" for a chosen column, so the admin can see they picked the right one. */
  const example = (heading: string, fallback: string) => {
    const value = heading ? sampleRow?.[heading] : null;
    return value ? `First row: "${value.length > 60 ? `${value.slice(0, 60)}…` : value}"` : fallback;
  };

  const options = (
    <>
      <option value="">Not in this file</option>
      {headings.map((heading) => (
        <option key={heading} value={heading}>
          {heading}
        </option>
      ))}
    </>
  );

  return (
    <div className="form-grid" data-cy="column-mapping">
      <div className="form-grid form-grid--2">
        <SelectField
          label={`${DESCRIPTIONS.unit_name} of each ${levelName}`}
          hint={example(mapping.unit_name, `The column with each ${levelName}'s name.`)}
          error={errors.columnMapping?.unit_name?.message}
          data-cy="map-unit_name"
          {...register("columnMapping.unit_name")}
        >
          {options}
        </SelectField>
        <SelectField
          label={DESCRIPTIONS.unit_code}
          hint={example(mapping.unit_code, "The source's own code, e.g. a pcode or ward code. Leave as \"Not in this file\" if there isn't one.")}
          error={errors.columnMapping?.unit_code?.message}
          data-cy="map-unit_code"
          {...register("columnMapping.unit_code")}
        >
          {options}
        </SelectField>
        {!carriesRowShapes(fileType) ? (
          <SelectField
            label={DESCRIPTIONS.geometry_wkt}
            hint="WKT text (POLYGON / MULTIPOLYGON) in EPSG:4326."
            error={errors.columnMapping?.geometry_wkt?.message}
            data-cy="map-geometry_wkt"
            {...register("columnMapping.geometry_wkt")}
          >
            {options}
          </SelectField>
        ) : (
          <p className="mapping-note">
            {fileType === "shapefile" ? "The shape is taken from each shape in the shapefile." : "The shape is taken from each GeoJSON feature's geometry."}
          </p>
        )}
      </div>

      {level > 1 && parentLevelName && (
        <fieldset className="mapping-parent">
          <legend className="field__label">Which {parentLevelName} is each {levelName} in?</legend>
          <p className="field__help">
            Every {levelName} must belong to a {parentLevelName} that is already live. If the file has a column naming it
            (e.g. one called "{parentLevelName.toLowerCase()}"), pick that column. If the whole file is inside one{" "}
            {parentLevelName}, choose it for every row instead.
          </p>
          <div className="mapping-parent__modes">
            <label>
              <input type="radio" value="column" {...register("parentMode")} data-cy="parent-mode-column" /> A column in the file names it
            </label>
            <label>
              <input type="radio" value="fixed" {...register("parentMode")} data-cy="parent-mode-fixed" /> The same {parentLevelName} for every row
            </label>
          </div>
          {/* Both stay mounted and only the unused one is hidden: a guessed column set while its
              <select> was unmounted was lost when it came back. */}
          <div hidden={parentMode !== "column"}>
            <SelectField
              label={`${parentLevelName} column`}
              hint={example(
                mapping.parent_code,
                `Holds each row's ${parentLevelName} code or name. Spelling variants are matched to the standard names.`,
              )}
              error={errors.columnMapping?.parent_code?.message}
              data-cy="map-parent_code"
              {...register("columnMapping.parent_code")}
            >
              {options}
            </SelectField>
          </div>
          <div hidden={parentMode !== "fixed"}>
            <SelectField label={parentLevelName} error={errors.parentId?.message} data-cy="fixed-parent" {...register("parentId")}>
              <option value="">Choose…</option>
              {parents.map((parent) => (
                <option key={parent.id} value={parent.id}>
                  {parent.unitName}
                </option>
              ))}
            </SelectField>
          </div>
        </fieldset>
      )}
      {errors.columnMapping?.message && <p className="field__error">{errors.columnMapping.message}</p>}
    </div>
  );
}
