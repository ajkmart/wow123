import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface BulkUploadProps {
  onUpload: (rows: Record<string, string>[]) => Promise<void>;
  columns: string[];
  sampleCsvUrl?: string;
  className?: string;
}

interface RowError {
  row: number;
  message: string;
}

const MAX_PREVIEW_ROWS = 5;

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

/**
 * CSV drag-and-drop bulk upload component.
 * Parses the file client-side, validates expected headers, shows a scrollable
 * row preview, uploads via `onUpload`, and displays per-row errors returned.
 *
 * Usage:
 *   <BulkUpload
 *     columns={["name", "price", "category"]}
 *     onUpload={async (rows) => { await adminPost("/products/bulk", { rows }); }}
 *     sampleCsvUrl="/sample-products.csv"
 *   />
 */
export function BulkUpload({ onUpload, columns, sampleCsvUrl, className }: BulkUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<RowError[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setRows([]);
    setHeaders([]);
    setFileName("");
    setHeaderErrors([]);
    setRowErrors([]);
    setIsSuccess(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function processFile(file: File) {
    if (!file.name.endsWith(".csv")) {
      setHeaderErrors(["Only CSV files are supported."]);
      return;
    }
    setFileName(file.name);
    setHeaderErrors([]);
    setRowErrors([]);
    setIsSuccess(false);

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);

      if (parsed.length === 0) {
        setHeaderErrors(["The CSV file is empty or has no data rows."]);
        return;
      }

      const parsedHeaders = Object.keys(parsed[0]);
      setHeaders(parsedHeaders);
      setRows(parsed);

      const missing = columns.filter((c) => !parsedHeaders.includes(c));
      if (missing.length > 0) {
        setHeaderErrors([`Missing required columns: ${missing.join(", ")}`]);
      }
    };
    reader.readAsText(file);
  }

  function onDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function onDragLeave() {
    setIsDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handleUpload() {
    if (rows.length === 0 || headerErrors.length > 0) return;
    setIsPending(true);
    setRowErrors([]);
    try {
      await onUpload(rows);
      setIsSuccess(true);
    } catch (err: unknown) {
      const errors: RowError[] = [];
      if (err && typeof err === "object" && "details" in err) {
        const details = (err as { details?: unknown }).details;
        if (Array.isArray(details)) {
          details.forEach((d: unknown, i: number) => {
            if (d && typeof d === "object" && "message" in d) {
              errors.push({ row: i + 2, message: String((d as { message: unknown }).message) });
            }
          });
        }
      }
      if (errors.length === 0) {
        errors.push({ row: 0, message: err instanceof Error ? err.message : "Upload failed." });
      }
      setRowErrors(errors);
    } finally {
      setIsPending(false);
    }
  }

  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hasErrors = headerErrors.length > 0;

  return (
    <div className={cn("space-y-4", className)}>
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors cursor-pointer",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30",
          rows.length > 0 ? "py-4" : "py-10"
        )}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".csv"
          className="sr-only"
          onChange={onFileChange}
        />
        {rows.length > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <FileText className="h-5 w-5 text-primary shrink-0" />
            <span className="font-medium truncate max-w-xs">{fileName}</span>
            <span className="text-muted-foreground">({rows.length} rows)</span>
            <button
              type="button"
              className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); reset(); }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium text-sm">Drag & drop a CSV file here</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Required columns: {columns.join(", ")}
            </p>
            {sampleCsvUrl && (
              <a
                href={sampleCsvUrl}
                download
                className="text-xs text-primary underline underline-offset-4 hover:no-underline"
                onClick={(e) => e.stopPropagation()}
              >
                Download sample CSV
              </a>
            )}
          </>
        )}
      </div>

      {hasErrors && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-1">
          {headerErrors.map((e, i) => (
            <p key={i} className="text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {e}
            </p>
          ))}
        </div>
      )}

      {rowErrors.length > 0 && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-1">
          <p className="text-sm font-medium text-destructive">Upload errors:</p>
          {rowErrors.map((e, i) => (
            <p key={i} className="text-xs text-destructive">
              {e.row > 0 ? `Row ${e.row}: ` : ""}{e.message}
            </p>
          ))}
        </div>
      )}

      {isSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <p className="text-sm text-green-700">Upload completed successfully.</p>
        </div>
      )}

      {previewRows.length > 0 && !hasErrors && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Preview ({Math.min(rows.length, MAX_PREVIEW_ROWS)} of {rows.length} rows)
          </p>
          <ScrollArea className="h-40 rounded-lg border border-border bg-muted/20">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/40">
                    {headers.map((h) => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      {headers.map((h) => (
                        <td key={h} className="px-3 py-1.5 whitespace-nowrap truncate max-w-[160px]">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </div>
      )}

      {rows.length > 0 && !hasErrors && !isSuccess && (
        <Button
          onClick={handleUpload}
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading {rows.length} rows…
            </span>
          ) : (
            `Upload ${rows.length} rows`
          )}
        </Button>
      )}
    </div>
  );
}
