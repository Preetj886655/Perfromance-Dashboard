import { useCallback, useEffect, useState } from "react";
import { ApiRequestError } from "../api/client";
import {
  commitDprOeeImport,
  createColumnMappingTemplate,
  createDataSource,
  createLine,
  createMachine,
  createMachineStatus,
  createMachineType,
  createPlant,
  listColumnMappingTemplates,
  listDataSources,
  listLines,
  listMachines,
  listMachineStatuses,
  listMachineTypes,
  listPlants,
  previewImportFile,
  type ColumnMappingTemplateOption,
  type DataSourceOption,
  type DprOeeImportResult,
  type LineOption,
  type MachineOption,
  type MachineStatusOption,
  type MachineTypeOption,
  type PlantOption,
} from "../api/masters";

function errMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Request failed";
}

// ============================================================================
// PLANT FORM
// ============================================================================

type PlantFormProps = {
  onCreated: () => void;
};

function PlantForm({ onCreated }: PlantFormProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await createPlant({
        code: code.trim(),
        name: name.trim(),
        timezone: "UTC",
      });
      setCode("");
      setName("");
      onCreated();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-section">
      <h3>Add Plant</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Plant Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., PLANT-01"
            required
            disabled={isLoading}
          />
        </label>
        <label className="field">
          <span className="field__label">Plant Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Manufacturing Plant A"
            required
            disabled={isLoading}
          />
        </label>
      </div>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={isLoading}>
        {isLoading ? "Creating..." : "Add Plant"}
      </button>
    </form>
  );
}

// ============================================================================
// LINE FORM
// ============================================================================

type LineFormProps = {
  plants: PlantOption[];
  onCreated: () => void;
};

function LineForm({ plants, onCreated }: LineFormProps) {
  const [plantId, setPlantId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!plantId) {
      setError("Please select a plant");
      return;
    }

    setIsLoading(true);

    try {
      await createLine({
        plant_id: plantId,
        code: code.trim(),
        name: name.trim(),
      });
      setCode("");
      setName("");
      onCreated();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-section">
      <h3>Add Line</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Plant *</span>
          <select
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            required
            disabled={isLoading}
          >
            <option value="">Select a plant</option>
            {plants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.code} — {plant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Line Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., LINE-01"
            required
            disabled={isLoading}
          />
        </label>
        <label className="field">
          <span className="field__label">Line Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Assembly Line"
            required
            disabled={isLoading}
          />
        </label>
      </div>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={isLoading}>
        {isLoading ? "Creating..." : "Add Line"}
      </button>
    </form>
  );
}

// ============================================================================
// MACHINE TYPE / STATUS FORM
// ============================================================================

type LookupFormProps = {
  title: string;
  onCreated: () => void;
  onCreate: (code: string, name: string) => Promise<void>;
};

function LookupForm({ title, onCreated, onCreate }: LookupFormProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await onCreate(code.trim(), name.trim());
      setCode("");
      setName("");
      onCreated();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-section">
      <h3>Add {title}</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., TYPE-01"
            required
            disabled={isLoading}
          />
        </label>
        <label className="field">
          <span className="field__label">Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`e.g., ${title} Name`}
            required
            disabled={isLoading}
          />
        </label>
      </div>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={isLoading}>
        {isLoading ? "Creating..." : `Add ${title}`}
      </button>
    </form>
  );
}

// ============================================================================
// MACHINE FORM
// ============================================================================

type MachineFormProps = {
  plants: PlantOption[];
  lines: LineOption[];
  machineTypes: MachineTypeOption[];
  machineStatuses: MachineStatusOption[];
  onCreated: () => void;
};

function MachineForm({
  plants,
  lines,
  machineTypes,
  machineStatuses,
  onCreated,
}: MachineFormProps) {
  const [plantId, setPlantId] = useState("");
  const [lineId, setLineId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [machineTypeId, setMachineTypeId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredLines = lines.filter((line) => line.plant_id === plantId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!plantId) {
      setError("Please select a plant");
      return;
    }
    if (!machineTypeId) {
      setError("Please select a machine type");
      return;
    }
    if (!statusId) {
      setError("Please select a machine status");
      return;
    }

    setIsLoading(true);

    try {
      await createMachine({
        plant_id: plantId,
        line_id: lineId || null,
        code: code.trim(),
        name: name.trim(),
        machine_type_id: machineTypeId,
        status_id: statusId,
      });
      setCode("");
      setName("");
      setLineId("");
      setMachineTypeId("");
      setStatusId("");
      onCreated();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-section">
      <h3>Add Machine</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Plant *</span>
          <select
            value={plantId}
            onChange={(e) => {
              setPlantId(e.target.value);
              setLineId("");
            }}
            required
            disabled={isLoading}
          >
            <option value="">Select a plant</option>
            {plants.map((plant) => (
              <option key={plant.id} value={plant.id}>
                {plant.code} — {plant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Line (optional)</span>
          <select
            value={lineId}
            onChange={(e) => setLineId(e.target.value)}
            disabled={!plantId || isLoading}
          >
            <option value="">Select a line (or leave empty)</option>
            {filteredLines.map((line) => (
              <option key={line.id} value={line.id}>
                {line.code} — {line.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Machine Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g., MACH-001"
            required
            disabled={isLoading}
          />
        </label>
        <label className="field">
          <span className="field__label">Machine Name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Injection Mold Machine"
            required
            disabled={isLoading}
          />
        </label>
        <label className="field">
          <span className="field__label">Machine Type *</span>
          <select
            value={machineTypeId}
            onChange={(e) => setMachineTypeId(e.target.value)}
            required
            disabled={isLoading}
          >
            <option value="">Select a type</option>
            {machineTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.code} — {type.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Machine Status *</span>
          <select
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
            required
            disabled={isLoading}
          >
            <option value="">Select a status</option>
            {machineStatuses.map((status) => (
              <option key={status.id} value={status.id}>
                {status.code} — {status.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={isLoading}>
        {isLoading ? "Creating..." : "Add Machine"}
      </button>
    </form>
  );
}

// ============================================================================
// MASTER DATA PAGE
// ============================================================================

function IngestionConfigPanel({
  onSaved,
}: {
  onSaved: () => void;
}) {
  const [code, setCode] = useState("google-form-pril");
  const [name, setName] = useState("PRIL Google Form");
  const [formUrl, setFormUrl] = useState("https://forms.gle/xS36oXENxxzvj6927");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetName, setSheetName] = useState("Form Responses 1");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await createDataSource({
        code: code.trim(),
        name: name.trim(),
        source_type: "form",
        config: {
          form_url: formUrl.trim(),
          sheet_name: sheetName.trim() || "Form Responses 1",
          sheet_url: sheetUrl.trim(),
        },
        freshness_sla_minutes: 15,
        is_active: true,
      });
      onSaved();
      setSheetUrl("");
      setSheetName("Form Responses 1");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-section">
      <h3>Google Form / Sheet Source</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Source Code</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} required disabled={isLoading} />
        </label>
        <label className="field">
          <span className="field__label">Source Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required disabled={isLoading} />
        </label>
        <label className="field field--wide">
          <span className="field__label">Form URL</span>
          <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} required disabled={isLoading} />
        </label>
        <label className="field">
          <span className="field__label">Sheet Name</span>
          <input value={sheetName} onChange={(e) => setSheetName(e.target.value)} disabled={isLoading} />
        </label>
        <label className="field">
          <span className="field__label">Sheet URL</span>
          <input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="Optional Google Sheet URL" disabled={isLoading} />
        </label>
      </div>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Source"}
      </button>
    </form>
  );
}

function MappingTemplatePanel({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("pril-production-form-v1");
  const [sourceType, setSourceType] = useState("form");
  const [mapping, setMapping] = useState<Record<string, string>>({
    plant_code: "Plant",
    line_code: "Line",
    machine_code: "Machine",
    part_code: "Part",
    production_date: "Date",
    shift_code: "Shift",
    start_at: "Start Time",
    stop_at: "End Time",
    produced_qty: "Produced Qty",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      await createColumnMappingTemplate({
        name: name.trim(),
        source_type: sourceType as "form",
        mapping,
        version: 1,
        is_active: true,
      });
      onSaved();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="panel form-section">
      <h3>Mapping Template</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Template Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required disabled={isLoading} />
        </label>
        <label className="field">
          <span className="field__label">Source Type</span>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} disabled={isLoading}>
            <option value="form">form</option>
            <option value="sheets">sheets</option>
            <option value="csv">csv</option>
            <option value="excel">excel</option>
          </select>
        </label>
      </div>
      <div className="panel panel--muted" style={{ marginTop: "1rem" }}>
        {Object.entries(mapping).map(([key, value]) => (
          <label key={key} className="field" style={{ marginBottom: "0.65rem" }}>
            <span className="field__label">{key}</span>
            <input
              value={value}
              onChange={(e) => setMapping((prev) => ({ ...prev, [key]: e.target.value }))}
              disabled={isLoading}
            />
          </label>
        ))}
      </div>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      <button type="submit" className="btn btn--primary" disabled={isLoading}>
        {isLoading ? "Saving..." : "Save Mapping"}
      </button>
    </form>
  );
}

type PreviewPanelProps = {
  plants: PlantOption[];
};

function PreviewPanel({ plants }: PreviewPanelProps) {
  const [sourceType, setSourceType] = useState("csv");
  const [file, setFile] = useState<File | null>(null);
  const [plantId, setPlantId] = useState("");
  const [preview, setPreview] = useState<{ headers: string[]; rows: Record<string, unknown>[]; row_count: number } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitResult, setCommitResult] = useState<DprOeeImportResult | null>(null);

  const canCommit = sourceType === "excel" || sourceType === "csv";

  const handlePreview = async () => {
    if (!file) {
      setError("Choose a CSV or Excel file first.");
      return;
    }
    setError(null);
    setCommitResult(null);
    setCommitError(null);
    setIsLoading(true);
    try {
      const result = await previewImportFile(file, sourceType);
      setPreview({ headers: result.headers, rows: result.rows, row_count: result.row_count });
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!file) {
      setCommitError("Choose a CSV or Excel file first.");
      return;
    }
    if (!plantId) {
      setCommitError("Select a plant first.");
      return;
    }
    setCommitError(null);
    setIsCommitting(true);
    try {
      const result = await commitDprOeeImport(file, plantId, sourceType as "excel" | "csv");
      setCommitResult(result);
    } catch (err) {
      setCommitError(errMessage(err));
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="panel form-section">
      <h3>CSV / Excel Preview</h3>
      <div className="form-grid">
        <label className="field">
          <span className="field__label">Source Type</span>
          <select value={sourceType} onChange={(e) => { setSourceType(e.target.value); setCommitResult(null); setCommitError(null); }}>
            <option value="csv">csv</option>
            <option value="excel">excel</option>
            <option value="form">form</option>
            <option value="sheets">sheets</option>
          </select>
        </label>
        <label className="field">
          <span className="field__label">File</span>
          <input type="file" accept=".csv,.xlsx,.xlsm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setCommitResult(null); setCommitError(null); }} />
        </label>
      </div>
      <button type="button" className="btn btn--primary" onClick={handlePreview} disabled={isLoading || !file}>
        {isLoading ? "Previewing..." : "Preview File"}
      </button>
      {error && <p className="field__hint field__hint--error">{error}</p>}
      {preview && (
        <div style={{ marginTop: "1rem" }}>
          <p className="field__hint">{preview.row_count} rows detected</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {preview.headers.map((header) => (
                    <th key={header}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, index) => (
                  <tr key={`${index}-${Object.values(row).join("-")}`}>
                    {preview.headers.map((header) => (
                      <td key={`${index}-${header}`}>{String((row as Record<string, unknown>)[header] ?? "")}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canCommit ? (
        <div className="panel panel--muted" style={{ marginTop: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>Commit to Master Data</h3>
          <p className="field__hint">
            Expects the DPR_OEE template layout (headers row 3, data from row 5) — the same file
            {sourceType === "csv" ? " saved as CSV." : "."}
          </p>
          <div className="form-grid">
            <label className="field">
              <span className="field__label">Plant</span>
              <select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
                <option value="">Select a plant…</option>
                {plants.map((plant) => (
                  <option key={plant.id} value={plant.id}>
                    {plant.name} ({plant.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleCommit}
            disabled={isCommitting || !file || !plantId}
          >
            {isCommitting ? "Committing..." : `Commit ${sourceType.toUpperCase()}`}
          </button>
          {commitError && <p className="field__hint field__hint--error">{commitError}</p>}
          {commitResult && (
            <div
              className={`panel ${commitResult.status === "committed" ? "panel--success" : "panel--error"}`}
              style={{ marginTop: "0.75rem" }}
            >
              <p style={{ margin: 0 }}>
                <strong>{commitResult.status}</strong> — {commitResult.success_count}/{commitResult.total_rows} rows
                committed, {commitResult.error_count} error(s)
              </p>
              {commitResult.message && <p className="field__hint" style={{ margin: "0.35rem 0 0" }}>{commitResult.message}</p>}
            </div>
          )}
        </div>
      ) : (
        <p className="field__hint">
          Commit is only available for excel/csv source types (this project's real Master Data
          commit path — form/sheets sync is a later phase).
        </p>
      )}
    </div>
  );
}

export function MasterDataPage() {
  const [plants, setPlants] = useState<PlantOption[]>([]);
  const [lines, setLines] = useState<LineOption[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [machineTypes, setMachineTypes] = useState<MachineTypeOption[]>([]);
  const [machineStatuses, setMachineStatuses] = useState<MachineStatusOption[]>([]);
  const [dataSources, setDataSources] = useState<DataSourceOption[]>([]);
  const [mappingTemplates, setMappingTemplates] = useState<ColumnMappingTemplateOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshPlants = useCallback(async () => {
    try {
      const res = await listPlants();
      setPlants(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  const refreshLines = useCallback(async () => {
    try {
      const res = await listLines();
      setLines(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  const refreshMachines = useCallback(async () => {
    try {
      const res = await listMachines({ plant_id: undefined });
      setMachines(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  const refreshMachineTypes = useCallback(async () => {
    try {
      const res = await listMachineTypes();
      setMachineTypes(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  const refreshMachineStatuses = useCallback(async () => {
    try {
      const res = await listMachineStatuses();
      setMachineStatuses(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  const refreshDataSources = useCallback(async () => {
    try {
      const res = await listDataSources();
      setDataSources(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  const refreshMappings = useCallback(async () => {
    try {
      const res = await listColumnMappingTemplates();
      setMappingTemplates(res.items ?? []);
    } catch (err) {
      setError(errMessage(err));
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([
          refreshPlants(),
          refreshLines(),
          refreshMachines(),
          refreshMachineTypes(),
          refreshMachineStatuses(),
          refreshDataSources(),
          refreshMappings(),
        ]);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [refreshPlants, refreshLines, refreshMachines, refreshMachineTypes, refreshMachineStatuses, refreshDataSources, refreshMappings]);

  if (loading) {
    return (
      <div className="shell shell--narrow">
        <div className="panel panel--muted">
          <h2>Loading</h2>
          <p>Loading master data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shell shell--wide">
      <div className="page-header">
        <h1>Master Data</h1>
        <p>Manage plants, lines, machines, types, and statuses.</p>
      </div>

      {error && (
        <div className="panel panel--error">
          <p>{error}</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setError(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="master-data-grid">
        <section className="master-data-section">
          <h2>Production Ingestion</h2>
          <IngestionConfigPanel onSaved={async () => { await refreshDataSources(); }} />
          <MappingTemplatePanel onSaved={async () => { await refreshMappings(); }} />
          <PreviewPanel plants={plants} />
          {dataSources.length > 0 ? (
            <div className="panel table-section">
              <h3>Stored Sources ({dataSources.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {dataSources.map((source) => (
                    <tr key={source.id}>
                      <td>{source.code}</td>
                      <td>{source.name}</td>
                      <td>{source.source_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No configured data sources yet.</p>
            </div>
          )}
          {mappingTemplates.length > 0 ? (
            <div className="panel table-section">
              <h3>Saved Mappings ({mappingTemplates.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Version</th>
                  </tr>
                </thead>
                <tbody>
                  {mappingTemplates.map((template) => (
                    <tr key={template.id}>
                      <td>{template.name}</td>
                      <td>{template.source_type}</td>
                      <td>{template.version}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No mapping templates saved yet.</p>
            </div>
          )}
        </section>

        {/* ========== PLANTS ========== */}
        <section className="master-data-section">
          <h2>Plants</h2>
          <PlantForm onCreated={refreshPlants} />
          {plants.length > 0 ? (
            <div className="panel table-section">
              <h3>Existing Plants ({plants.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {plants.map((plant) => (
                    <tr key={plant.id}>
                      <td>{plant.code}</td>
                      <td>{plant.name}</td>
                      <td>{plant.is_active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No plants yet. Create one above.</p>
            </div>
          )}
        </section>

        {/* ========== LINES ========== */}
        <section className="master-data-section">
          <h2>Lines</h2>
          <LineForm plants={plants} onCreated={refreshLines} />
          {lines.length > 0 ? (
            <div className="panel table-section">
              <h3>Existing Lines ({lines.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Plant</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const plant = plants.find((p) => p.id === line.plant_id);
                    return (
                      <tr key={line.id}>
                        <td>{line.code}</td>
                        <td>{line.name}</td>
                        <td>{plant?.code || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No lines yet. Create one above.</p>
            </div>
          )}
        </section>

        {/* ========== MACHINE TYPES ========== */}
        <section className="master-data-section">
          <h2>Machine Types</h2>
          <LookupForm
            title="Machine Type"
            onCreated={refreshMachineTypes}
            onCreate={async (code, name) => {
              await createMachineType({ code, name });
            }}
          />
          {machineTypes.length > 0 ? (
            <div className="panel table-section">
              <h3>Existing Machine Types ({machineTypes.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {machineTypes.map((type) => (
                    <tr key={type.id}>
                      <td>{type.code}</td>
                      <td>{type.name}</td>
                      <td>{type.is_active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No machine types yet. Create one above.</p>
            </div>
          )}
        </section>

        {/* ========== MACHINE STATUSES ========== */}
        <section className="master-data-section">
          <h2>Machine Statuses</h2>
          <LookupForm
            title="Machine Status"
            onCreated={refreshMachineStatuses}
            onCreate={async (code, name) => {
              await createMachineStatus({ code, name });
            }}
          />
          {machineStatuses.length > 0 ? (
            <div className="panel table-section">
              <h3>Existing Machine Statuses ({machineStatuses.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {machineStatuses.map((status) => (
                    <tr key={status.id}>
                      <td>{status.code}</td>
                      <td>{status.name}</td>
                      <td>{status.is_active ? "Active" : "Inactive"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No machine statuses yet. Create one above.</p>
            </div>
          )}
        </section>

        {/* ========== MACHINES ========== */}
        <section className="master-data-section">
          <h2>Machines</h2>
          <MachineForm
            plants={plants}
            lines={lines}
            machineTypes={machineTypes}
            machineStatuses={machineStatuses}
            onCreated={refreshMachines}
          />
          {machines.length > 0 ? (
            <div className="panel table-section">
              <h3>Existing Machines ({machines.length})</h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Plant</th>
                    <th>Line</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((machine) => {
                    const plant = plants.find((p) => p.id === machine.plant_id);
                    const line = lines.find((l) => l.id === machine.line_id);
                    return (
                      <tr key={machine.id}>
                        <td>{machine.code}</td>
                        <td>{machine.name}</td>
                        <td>{plant?.code || "—"}</td>
                        <td>{line?.code || "—"}</td>
                        <td>{machine.status_code || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel panel--muted">
              <p>No machines yet. Create one above.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
