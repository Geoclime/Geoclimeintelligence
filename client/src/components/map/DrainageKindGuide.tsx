import type { DrainageKind } from "../../types/field-survey.types";
import { DRAINAGE_KIND_INFO, NOT_RECORDED_NOTE } from "../../utils/drainage-kinds";
import { DRAINAGE_KIND_LABEL, isLineKind } from "../../utils/field-survey";

/** The one-paragraph meaning of a kind, shown under the "What is it?" choice as it changes. */
export function KindDefinition({ kind }: { kind: DrainageKind }) {
  const info = DRAINAGE_KIND_INFO[kind];
  return (
    <p className="kind-guide__current" data-cy="drain-kind-definition">
      <strong>{DRAINAGE_KIND_LABEL[kind]}:</strong> {info.definition} <span className="kind-guide__example">{info.example}</span>
    </p>
  );
}

interface DrainageKindGuideProps {
  /** Only these kinds are listed (a walked line, or a single spot); all of them when left out. */
  kinds?: readonly DrainageKind[];
  /** Whether the list starts open. */
  open?: boolean;
}

/**
 * "What do these mean?": every kind of drainage with its definition, an example and how it is recorded,
 * so nobody records a culvert as a drain, or a gutter as something else. It folds away.
 */
export function DrainageKindGuide({ kinds, open = false }: DrainageKindGuideProps) {
  const listed = kinds ?? (Object.keys(DRAINAGE_KIND_INFO) as DrainageKind[]);
  return (
    <details className="kind-guide" open={open} data-cy="drain-kind-guide">
      <summary>What do these mean?</summary>
      <dl className="kind-guide__list">
        {listed.map((kind) => (
          <div key={kind}>
            <dt>
              {DRAINAGE_KIND_LABEL[kind]} <span className="kind-guide__shape">{isLineKind(kind) ? "a line" : "one spot"}</span>
            </dt>
            <dd>
              {DRAINAGE_KIND_INFO[kind].definition} <span className="kind-guide__example">{DRAINAGE_KIND_INFO[kind].example}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="kind-guide__note">{NOT_RECORDED_NOTE}</p>
    </details>
  );
}
