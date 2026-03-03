import { useMemo, useState } from "react";
import type { EntityCreationFormOutput } from "../../../services/api/agent";

interface EntityCreationFormArtifactProps {
  data: EntityCreationFormOutput;
  onSubmitMessage?: (message: string) => void;
}

function stringifyEntityLabel(entityType: string): string {
  return String(entityType || "entity").replace(/_/g, " ");
}

export function EntityCreationFormArtifact({
  data,
  onSubmitMessage,
}: EntityCreationFormArtifactProps) {
  const [open, setOpen] = useState(true);
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const field of data.missingRequired || []) {
      const existing = data.prefilled?.[field];
      initial[field] =
        existing === null || existing === undefined ? "" : String(existing);
    }
    return initial;
  });
  const fields = useMemo(
    () => (Array.isArray(data.missingRequired) ? data.missingRequired : []),
    [data.missingRequired],
  );
  const parentOptions = Array.isArray((data as { parentSelection?: { options?: unknown[] } })?.parentSelection?.options)
    ? ((data as { parentSelection?: { options?: Array<{ entityType: string; id: number; label: string }> } }).parentSelection?.options || [])
    : [];
  const [selectedParent, setSelectedParent] = useState<string>("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const completedPayload: Record<string, unknown> = {
      ...(data.prefilled || {}),
      ...Object.fromEntries(
        Object.entries(values).map(([key, value]) => [key, String(value || "").trim()]),
      ),
    };
    if (selectedParent) {
      const chosen = parentOptions.find(
        (option) => `${option.entityType}:${option.id}` === selectedParent,
      );
      if (chosen) {
        if (chosen.entityType === "lawsuit") {
          completedPayload.lawsuit_id = chosen.id;
        } else if (chosen.entityType === "dossier") {
          completedPayload.dossier_id = chosen.id;
        }
      }
    }
    const message = `Create ${data.entityType} with payload ${JSON.stringify(completedPayload)}`;
    onSubmitMessage?.(message);
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-600/60 dark:bg-amber-950/30 dark:text-amber-200">
        Missing required fields for {stringifyEntityLabel(data.entityType)}.
      </div>

      {open ? (
        <div className="agent-modal-overlay" role="dialog" aria-modal="true">
          <div className="agent-modal-container">
            <div className="agent-modal-header">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Complete {stringifyEntityLabel(data.entityType)}
              </h3>
              <button
                type="button"
                className="agent-modal-close"
                onClick={() => setOpen(false)}
                aria-label="Close modal"
              >
                x
              </button>
            </div>
            <form className="agent-modal-body space-y-3" onSubmit={handleSubmit}>
              {fields.map((field) => (
                field === "linked_record" && parentOptions.length > 0 ? (
                  <label key={field} className="block space-y-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      Select parent record
                    </span>
                    <select
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={selectedParent}
                      onChange={(event) => setSelectedParent(event.target.value)}
                      required
                    >
                      <option value="">Choose...</option>
                      {parentOptions.map((option) => (
                        <option
                          key={`${option.entityType}:${option.id}`}
                          value={`${option.entityType}:${option.id}`}
                        >
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label key={field} className="block space-y-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {field}
                    </span>
                    <input
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      value={values[field] ?? ""}
                      onChange={(event) =>
                        setValues((prev) => ({ ...prev, [field]: event.target.value }))
                      }
                      required
                    />
                  </label>
                )
              ))}
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
