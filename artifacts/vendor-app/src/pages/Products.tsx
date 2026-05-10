import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import Papa from "papaparse";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { api, apiFetch } from "../lib/api";
import { usePlatformConfig, useCurrency } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { useAuth } from "../lib/auth";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { ImageUploader } from "../components/ImageUploader";
import { SafeImage } from "../components/ui/SafeImage";
import { fc, fd, CARD, INPUT, SELECT, TEXTAREA, BTN_PRIMARY, BTN_SECONDARY, LABEL, errMsg } from "../lib/ui";
import { useOfflineQueue } from "../hooks/useOfflineQueue";

const EMPTY = { name:"", description:"", price:"", originalPrice:"", category:"", unit:"", stock:"", image:"", type:"mart", videoUrl:"", tags:"", isHidden: false };
const EMPTY_ROW = { name:"", price:"", description:"", image:"", category:"", unit:"", stock:"", type:"mart" };
const CATS_FALLBACK = ["food","grocery","bakery","pharmacy","electronics","clothing","mart","general"];
const TYPES = ["mart","food","pharmacy","parcel"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className={LABEL}>{label}</label>{children}</div>;
}

function StockHistoryPanel({ productId }: { productId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["vendor-stock-history", productId],
    queryFn: () => api.getProductStockHistory(productId),
    staleTime: 30_000,
  });

  const rows: Array<{
    id: string;
    delta: number;
    reason: string | null;
    stockAfter: number | null;
    orderId: string | null;
    createdAt: string;
  }> = Array.isArray(data?.history) ? data.history : [];

  return (
    <div className="border-t border-purple-100 bg-purple-50/40 px-4 py-3">
      <p className="text-[11px] font-bold text-purple-700 mb-2 uppercase tracking-wide">Stock History</p>
      {isLoading && <p className="text-xs text-gray-400">Loading…</p>}
      {isError  && <p className="text-xs text-red-500">Failed to load history.</p>}
      {!isLoading && !isError && rows.length === 0 && (
        <p className="text-xs text-gray-400">No stock changes recorded yet.</p>
      )}
      {rows.length > 0 && (
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {rows.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className={`font-extrabold tabular-nums w-8 text-center rounded px-1 ${r.delta < 0 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                  {r.delta > 0 ? `+${r.delta}` : r.delta}
                </span>
                <span className="text-gray-600 capitalize">{r.reason ?? "update"}</span>
                {r.stockAfter != null && (
                  <span className="text-gray-400">→ {r.stockAfter} left</span>
                )}
              </div>
              <span className="text-gray-400 flex-shrink-0">{fd(r.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Products() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isOnline, pendingProductCount, productQueueErrors, enqueueProductAction, retryProductQueueItem, dismissProductQueueError } = useOfflineQueue();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol, code: currencyCode } = useCurrency();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const maxItems = config.vendor?.maxItems ?? 100;
  const lowStockThreshold = config.vendor?.lowStockThreshold ?? 10;
  /* ── Real-time stock sync via Socket.IO ── */
  const socketRef = useRef<Socket | null>(null);
  const [lastStockSync, setLastStockSync] = useState<Date | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const token = api.getToken();
    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      query: { rooms: `vendor:${user.id}` },
      auth: { token },
      extraHeaders: { Authorization: `Bearer ${token}` },
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      /* Re-join the vendor room explicitly on every connect (including reconnects).
         The room is also joined at handshake time via query.rooms, but emitting
         join again on reconnect is harmless and ensures the room is held. */
      socket.emit("join", `vendor:${user.id}`);
      /* Always invalidate on connect — including the first connect — to flush
         any stock updates that were broadcast during the socket setup window
         (between component mount and the socket completing its handshake). */
      qc.invalidateQueries({ queryKey: ["vendor-products"] });
      qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
    });
    socket.on("product:stock_updated", (payload: { productId: string; vendorId: string; stock: number | null; inStock: boolean }) => {
      /* Check if the product is present in the unfiltered cache before patching.
         If it's not there (e.g. initial load not yet complete, or race on first connect),
         fall back to a full invalidation so the UI self-heals immediately. */
      const allCached = qc.getQueryData<{ products: any[] }>(["vendor-products-all"]);
      const inCache = allCached?.products?.some((p: any) => p.id === payload.productId) ?? false;

      if (inCache) {
        const patchProducts = (old: { products: any[] } | undefined) => {
          if (!old?.products) return old;
          const updated = old.products.map(p =>
            p.id === payload.productId
              ? { ...p, stock: payload.stock, inStock: payload.inStock }
              : p,
          );
          return { ...old, products: updated };
        };
        /* Patch the filtered list (current view) and the unfiltered "all" list */
        qc.setQueriesData<{ products: any[] }>({ queryKey: ["vendor-products"] }, patchProducts);
        qc.setQueriesData<{ products: any[] }>({ queryKey: ["vendor-products-all"] }, patchProducts);
      } else {
        /* Product not in cache (e.g. arrived before initial fetch completed) — re-fetch */
        qc.invalidateQueries({ queryKey: ["vendor-products"] });
        qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
      }
      setLastStockSync(new Date());
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, qc]);
  const [view, setView]           = useState<"list"|"bulk">("list");
  const [search, setSearch]       = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [showAdd, setShowAdd]     = useState(false);
  const [editProd, setEditProd]   = useState<any|null>(null);
  const [form, setForm]           = useState({ ...EMPTY });
  const [bulkRows, setBulkRows]   = useState([{ ...EMPTY_ROW }, { ...EMPTY_ROW }, { ...EMPTY_ROW }]);
  const [toast, setToast]         = useState("");
  const [formErrors, setFormErrors] = useState<{ name?: string; price?: string; category?: string }>({});
  const [videoUploading, setVideoUploading] = useState(false);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3000); };
  const f = (k: string, v: any) => {
    setForm(p => ({ ...p, [k]: v }));
    if (k === "name" || k === "price" || k === "category") {
      setFormErrors(prev => ({ ...prev, [k]: undefined }));
    }
  };

  const validateForm = (): boolean => {
    const errors: { name?: string; price?: string; category?: string } = {};
    if (!form.name.trim()) errors.name = "Product name is required";
    if (!form.price || Number(form.price) <= 0) errors.price = "A valid price is required";
    if (!form.category) errors.category = "Please select a category";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const maxVideoMb = config.uploads?.maxVideoMb ?? 50;
  const maxVideoDurationSec = config.uploads?.maxVideoDurationSec ?? 60;
  const allowedVideoFormats = (config.uploads?.allowedVideoFormats ?? []).length > 0
    ? config.uploads!.allowedVideoFormats!.map(f => `video/${f}`)
    : ["video/mp4", "video/quicktime", "video/webm"];

  const handleVideoUpload = async (file: File) => {
    if (file.size > maxVideoMb * 1024 * 1024) { showToast(`❌ Video must be under ${maxVideoMb}MB`); return; }
    if (!allowedVideoFormats.includes(file.type)) { showToast(`❌ Only ${(config.uploads?.allowedVideoFormats ?? ["mp4", "mov", "webm"]).join(", ").toUpperCase()} videos allowed`); return; }
    try {
      const duration = await getVideoDuration(file);
      if (duration > maxVideoDurationSec) { showToast(`❌ Video must be ${maxVideoDurationSec} seconds or less (yours is ${Math.ceil(duration)}s)`); return; }
    } catch {
      showToast("❌ Could not read video file — it may be corrupted or unsupported. Please try a different file.");
      return;
    }
    setVideoUploading(true);
    try {
      const result = await api.uploadVideo(file);
      f("videoUrl", result.url);
      showToast("✅ Video uploaded!");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Video upload failed";
      showToast("❌ " + msg);
    }
    setVideoUploading(false);
  };

  function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };
      video.onerror = () => reject(new Error("Cannot read video"));
      video.src = URL.createObjectURL(file);
    });
  }

  const { data: catsData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch("/categories"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  const catList: string[] = useMemo(() => {
    const raw = catsData;
    if (Array.isArray(raw) && raw.length > 0) {
      return raw.map((c: any) => (typeof c === "string" ? c : c.slug ?? c.name ?? String(c)));
    }
    if (raw && Array.isArray(raw.categories) && raw.categories.length > 0) {
      return raw.categories.map((c: any) => (typeof c === "string" ? c : c.slug ?? c.name ?? String(c)));
    }
    return CATS_FALLBACK;
  }, [catsData]);

  const { data, isLoading } = useQuery({
    queryKey: ["vendor-products", search, filterCat],
    queryFn: () => api.getProducts(search || undefined, filterCat !== "all" ? filterCat : undefined),
    refetchInterval: 60000,
  });
  const products: any[] = Array.isArray(data?.products) ? data.products : [];

  const { data: allData, isLoading: allDataLoading, isSuccess: allDataSuccess } = useQuery({
    queryKey: ["vendor-products-all"],
    queryFn: () => api.getProducts(),
  });
  const totalProductCount = allDataSuccess && Array.isArray(allData?.products) ? allData.products.length : null;

  const categories = useMemo(() => {
    const s = new Set<string>();
    products.forEach(p => p.category && s.add(p.category));
    return ["all", ...Array.from(s)];
  }, [products]);

  /* ── Per-product low-stock thresholds (localStorage — fallback for products
     not yet updated via API; server value takes precedence when available) ── */
  const [productThresholds, setProductThresholds] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem("vendor_product_thresholds");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });
  const saveThreshold = (productId: string, value: number | null) => {
    setProductThresholds(prev => {
      const next = { ...prev };
      if (value === null) {
        delete next[productId];
      } else {
        next[productId] = value;
      }
      try { localStorage.setItem("vendor_product_thresholds", JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [editThreshold, setEditThreshold] = useState("");

  const lowStock = products.filter(p => {
    if (p.stock === null || p.stock === undefined || p.stock < 0) return false;
    const thresh = p.lowStockThreshold ?? productThresholds[p.id] ?? lowStockThreshold;
    return p.stock <= thresh;
  });

  const hideMut = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) => api.updateProduct(id, { isHidden }),
    onSuccess: (_, { isHidden }) => { qc.invalidateQueries({ queryKey: ["vendor-products"] }); showToast(isHidden ? "👁️ Hidden from customers" : "✅ Visible to customers"); },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const tagsFromForm = (t: string): string[] => t.split(",").map(s => s.trim()).filter(Boolean);

  const createMut = useMutation({
    mutationFn: () => {
      if (!isOnline) {
        const payload = { ...form, price: Number(form.price), originalPrice: form.originalPrice ? Number(form.originalPrice) : undefined, stock: form.stock !== "" ? Number(form.stock) : undefined, videoUrl: form.videoUrl || undefined, tags: tagsFromForm(form.tags), isHidden: form.isHidden };
        const storageMsg = enqueueProductAction("create", payload as Record<string, unknown>);
        if (storageMsg && !storageMsg.startsWith("warn:")) { showToast("❌ " + storageMsg); return Promise.resolve(null); }
        setShowAdd(false);
        setForm({ ...EMPTY });
        showToast(storageMsg ? storageMsg.slice(5) : "📥 Saved offline — will sync when connected");
        return Promise.resolve(null);
      }
      if (totalProductCount === null) throw new Error("Cannot verify product count — please wait and try again.");
      if (totalProductCount >= maxItems) throw new Error(`Product limit of ${maxItems} reached. Delete existing products to add new ones.`);
      return api.createProduct({ ...form, price: Number(form.price), originalPrice: form.originalPrice ? Number(form.originalPrice) : undefined, stock: form.stock !== "" ? Number(form.stock) : undefined, videoUrl: form.videoUrl || undefined, tags: tagsFromForm(form.tags), isHidden: form.isHidden });
    },
    onSuccess: (result) => {
      if (result === null) return;
      qc.invalidateQueries({ queryKey: ["vendor-products"] }); qc.invalidateQueries({ queryKey: ["vendor-products-all"] }); setShowAdd(false); setForm({ ...EMPTY }); showToast("✅ Product added!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const updateMut = useMutation({
    mutationFn: () => {
      if (!isOnline) {
        const payload = { ...form, price: Number(form.price), originalPrice: form.originalPrice ? Number(form.originalPrice) : null, stock: form.stock !== "" ? Number(form.stock) : null, videoUrl: form.videoUrl || null, tags: tagsFromForm(form.tags), isHidden: form.isHidden };
        const storageMsg = enqueueProductAction("update", payload as Record<string, unknown>, editProd.id);
        if (storageMsg && !storageMsg.startsWith("warn:")) { showToast("❌ " + storageMsg); return Promise.resolve(null); }
        setEditProd(null);
        setShowAdd(false);
        showToast(storageMsg ? storageMsg.slice(5) : "📥 Saved offline — will sync when connected");
        return Promise.resolve(null);
      }
      const lowStockThresholdVal = editThreshold !== "" ? Number(editThreshold) : null;
      return api.updateProduct(editProd.id, { ...form, price: Number(form.price), originalPrice: form.originalPrice ? Number(form.originalPrice) : null, stock: form.stock !== "" ? Number(form.stock) : null, videoUrl: form.videoUrl || null, tags: tagsFromForm(form.tags), isHidden: form.isHidden, lowStockThreshold: lowStockThresholdVal });
    },
    onSuccess: (result) => {
      if (result === null) return;
      if (editProd) {
        if (editThreshold !== "") {
          const t = Number(editThreshold);
          if (!isNaN(t) && t >= 0) saveThreshold(editProd.id, t);
        } else {
          /* Threshold was cleared — remove any stale localStorage override */
          saveThreshold(editProd.id, null);
        }
      }
      qc.invalidateQueries({ queryKey: ["vendor-products"] }); qc.invalidateQueries({ queryKey: ["vendor-products-all"] }); setEditProd(null); setShowAdd(false); setEditThreshold(""); showToast("✅ Updated!");
    },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteProduct(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-products"] }); qc.invalidateQueries({ queryKey: ["vendor-products-all"] }); showToast("🗑️ Deleted"); },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, inStock }: { id: string; inStock: boolean }) => api.updateProduct(id, { inStock }),
    onSuccess: (_, { inStock }) => { qc.invalidateQueries({ queryKey: ["vendor-products"] }); showToast(inStock ? "✅ Marked In Stock" : "📦 Marked Out of Stock"); },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  const [pasteText, setPasteText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [bulkCat, setBulkCat]   = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [stockHistoryOpen, setStockHistoryOpen] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string[]>([]);
  const csvListInputRef = useRef<HTMLInputElement>(null);



  /* ── Bulk Edit Mode ── */
  const [bulkEditMode, setBulkEditMode] = useState(false);
  const [bulkEditSelected, setBulkEditSelected] = useState<Set<string>>(new Set());
  const [bulkEditPrice, setBulkEditPrice] = useState("");
  const [bulkEditStock, setBulkEditStock] = useState("");
  const [bulkEditError, setBulkEditError] = useState("");
  const csvInputRef = useRef<HTMLInputElement>(null);

  /* Exit bulk edit mode when switching to add/bulk views */
  useEffect(() => {
    if (showAdd || view === "bulk") {
      setBulkEditMode(false);
      setBulkEditSelected(new Set());
    }
  }, [showAdd, view]);

  const toggleBulkSelect = (id: string) => {
    setBulkEditSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkEditMut = useMutation({
    mutationFn: () => {
      const ids = Array.from(bulkEditSelected);
      if (ids.length === 0) throw new Error("No products selected");
      const patch: { price?: number; stock?: number | null } = {};
      if (bulkEditPrice) {
        if (Number(bulkEditPrice) <= 0) throw new Error("Price must be greater than 0");
        patch.price = Number(bulkEditPrice);
      }
      if (bulkEditStock !== "") {
        if (Number(bulkEditStock) < 0) throw new Error("Stock cannot be negative");
        patch.stock = Number(bulkEditStock);
      }
      if (!patch.price && patch.stock === undefined) throw new Error("Enter a price or stock value to update");
      return api.bulkEditProducts(ids.map(id => ({ id, ...patch })));
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["vendor-products"] });
      setBulkEditMode(false);
      setBulkEditSelected(new Set());
      setBulkEditPrice("");
      setBulkEditStock("");
      setBulkEditError("");
      showToast(`✅ Updated ${res.updated} product${res.updated !== 1 ? "s" : ""}!`);
    },
    onError: (e: Error) => setBulkEditError(errMsg(e)),
  });

  /* ── Download sample CSV template ── */
  const downloadSampleCsv = () => {
    const headers = ["name", "price", "stock", "category", "description", "unit", "type", "image"];
    const rows = [
      ["Chicken Biryani", "350", "50", "food", "Delicious rice dish with chicken", "pcs", "food", ""],
      ["Vegetable Pulao", "280", "30", "food", "Fresh vegetables with aromatic rice", "pcs", "food", ""],
      ["Mango Juice 1L", "120", "100", "grocery", "Fresh mango juice 1 litre", "ltr", "mart", ""],
    ];
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ajkmart_products_sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /* ── CSV file import (worker:true, 500-row limit, header validation) ── */
  const handleCsvImport = (file: File, switchToBulk = false) => {
    /* Preflight: read first line to validate headers before spawning the worker */
    const reader = new FileReader();
    reader.onload = (e) => {
      const firstLine = (e.target?.result as string || "").split(/\r?\n/)[0] || "";
      const headers = firstLine.split(",").map(h => h.replace(/^"|"$/g, "").toLowerCase().trim());
      if (!headers.includes("name") || !headers.includes("price")) {
        showToast("❌ CSV must have 'name' and 'price' column headers");
        return;
      }
      /* Full parse on the original File object via worker, with step-based
         early abort so files over 500 data rows never finish parsing */
      let rowCount = 0;
      const rowErrors: string[] = [];
      const parsed: typeof bulkRows = [];
      Papa.parse<Record<string, string>>(file, {
        worker: true,
        header: true,
        skipEmptyLines: true,
        step: (result: Papa.ParseStepResult<Record<string, string>>, parser: Papa.Parser) => {
          rowCount++;
          if (rowCount > 500) {
            parser.abort();
            return;
          }
          const row = result.data;
          const name  = (row["name"] || row["Name"] || "").trim();
          const price = (row["price"] || row["Price"] || "").trim();
          const stockRaw = (row["stock"] || row["Stock"] || "").trim();
          if (!name) { rowErrors.push(`Row ${rowCount}: name is empty — skipped`); return; }
          if (!price || isNaN(Number(price)) || Number(price) <= 0) { rowErrors.push(`Row ${rowCount}: price "${price}" must be a positive number — skipped`); return; }
          if (stockRaw && (!isNaN(Number(stockRaw)) && Number(stockRaw) < 0)) { rowErrors.push(`Row ${rowCount}: stock cannot be negative ("${stockRaw}") — skipped`); return; }
          parsed.push({
            name,
            price,
            description: (row["description"] || row["Description"] || "").trim(),
            image:       (row["image"] || row["image_url"] || row["Image"] || "").trim(),
            category:    (row["category"] || row["Category"] || bulkCat || "").trim(),
            unit:        (row["unit"] || row["Unit"] || "").trim(),
            stock:       stockRaw,
            type:        ((row["type"] || row["Type"] || "mart").trim()) || "mart",
          });
        },
        complete: (results: Papa.ParseResult<Record<string, string>>) => {
          if (results.meta.aborted) {
            showToast("❌ CSV has more than 500 rows — split into files of ≤500 rows.");
            return;
          }
          setParseErrors(rowErrors);
          if (parsed.length === 0) {
            showToast("❌ No valid rows found — check that 'name' and 'price' columns have values");
            return;
          }
          /* Idempotency: check for name collisions against existing products */
          const existingNames = new Set(products.map((p: any) => p.name.toLowerCase().trim()));
          const dupes = parsed.map(r => r.name).filter(n => existingNames.has(n.toLowerCase().trim()));
          if (dupes.length > 0) setDuplicateWarning(dupes);
          else setDuplicateWarning([]);
          setBulkRows(r => {
            const empty = r.filter(x => !x.name.trim() && !x.price.trim());
            return [...(empty.length === r.length ? [] : r), ...parsed];
          });
          if (switchToBulk) setView("bulk");
          showToast(`✅ Imported ${parsed.length} rows${rowErrors.length ? ` (${rowErrors.length} skipped)` : ""}`);
        },
        error: (err: Error) => { showToast("❌ Failed to parse CSV: " + err.message); },
      });
    };
    /* Read only the first line for the preflight check */
    reader.readAsText(file.slice(0, 2048), "utf-8");
  };

  const parsePaste = () => {
    const isTabSeparated = pasteText.includes("\t") && !pasteText.startsWith('"');
    const delimiter = isTabSeparated ? "\t" : ",";
    const result = Papa.parse<string[]>(pasteText.trim(), {
      delimiter,
      skipEmptyLines: true,
      quoteChar: '"',
    });

    const rowErrors: string[] = [];
    const parsed: typeof bulkRows = [];

    result.data.forEach((parts, idx) => {
      if (result.errors.some(e => e.row === idx)) {
        rowErrors.push(`Row ${idx + 1}: parse error — ${result.errors.find(e => e.row === idx)?.message}`);
        return;
      }
      const name  = (parts[0] || "").trim();
      const price = (parts[1] || "").trim();
      if (!name) { rowErrors.push(`Row ${idx + 1}: name is empty — skipped`); return; }
      if (!price || Number.isNaN(Number(price))) { rowErrors.push(`Row ${idx + 1}: invalid price "${price}" — skipped`); return; }
      parsed.push({
        name,
        price,
        description: (parts[2] || "").trim(),
        image:       (parts[3] || "").trim(),
        category:    (parts[4] || bulkCat || "").trim(),
        unit:        (parts[5] || "").trim(),
        stock:       (parts[6] || "").trim(),
        type:        (parts[7] || "mart").trim() || "mart",
      });
    });

    setParseErrors(rowErrors);
    if (parsed.length > 0) { setBulkRows(r => [...r, ...parsed]); setShowPaste(false); setPasteText(""); showToast(`✅ Parsed ${parsed.length} rows${rowErrors.length ? ` (${rowErrors.length} skipped)` : ""}`); }
    else showToast("❌ No valid rows found — check format");
  };

  const [bulkImportResults, setBulkImportResults] = useState<Array<{ name: string; status: "pending" | "success" | "error"; message?: string }> | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportProgress, setBulkImportProgress] = useState<{ done: number; total: number } | null>(null);

  const runBulkImport = useCallback(async () => {
    const valid = bulkRows.filter(r => r.name.trim() && r.price && !Number.isNaN(Number(r.price)) && Number(r.price) > 0);
    if (totalProductCount === null) { showToast("Cannot verify product count — please wait and try again."); return; }
    if (totalProductCount + valid.length > maxItems) { showToast(`Product limit reached. You can add at most ${maxItems - totalProductCount} more product(s).`); return; }
    if (valid.length === 0) return;
    const initial: Array<{ name: string; status: "pending" | "success" | "error"; message?: string }> = valid.map(r => ({ name: r.name.trim(), status: "pending" }));
    setBulkImportResults(initial);
    setBulkImporting(true);
    setBulkImportProgress({ done: 0, total: valid.length });
    let successCount = 0;
    let doneCount = 0;
    const results: Array<{ name: string; status: "pending" | "success" | "error"; message?: string }> = [...initial];

    /* Send in batches of 50 to match server limit */
    const BATCH = 50;
    for (let batchStart = 0; batchStart < valid.length; batchStart += BATCH) {
      const batch = valid.slice(batchStart, batchStart + BATCH);
      for (let j = 0; j < batch.length; j++) {
        const i = batchStart + j;
        const r = batch[j]!;
        try {
          await api.createProduct({
            name:        r.name.trim(),
            price:       Number(r.price),
            description: r.description.trim() || null,
            image:       r.image.trim() || null,
            category:    r.category.trim() || bulkCat || "general",
            unit:        r.unit.trim() || null,
            stock:       r.stock ? Number(r.stock) : null,
            type:        r.type || "mart",
          });
          results[i] = { ...results[i]!, status: "success" };
          successCount++;
        } catch (e) {
          results[i] = { ...results[i]!, status: "error", message: e instanceof Error ? e.message : "Failed" };
        }
        doneCount++;
        setBulkImportProgress({ done: doneCount, total: valid.length });
        setBulkImportResults([...results]);
      }
    }
    setBulkImporting(false);
    qc.invalidateQueries({ queryKey: ["vendor-products"] });
    qc.invalidateQueries({ queryKey: ["vendor-products-all"] });
    showToast(`✅ ${successCount} of ${valid.length} products added!`);
  }, [bulkRows, totalProductCount, maxItems, bulkCat, qc]);

  const bulkMut = useMutation({
    mutationFn: () => {
      const valid = bulkRows.filter(r => r.name.trim() && r.price && !Number.isNaN(Number(r.price)));
      if (totalProductCount === null) throw new Error("Cannot verify product count — please wait and try again.");
      if (totalProductCount + valid.length > maxItems) {
        throw new Error(`Product limit reached. You can add at most ${maxItems - totalProductCount} more product(s).`);
      }
      return api.bulkAddProducts(valid.map(r => ({
        name:        r.name.trim(),
        price:       Number(r.price),
        description: r.description.trim() || null,
        image:       r.image.trim() || null,
        category:    r.category.trim() || bulkCat || "general",
        unit:        r.unit.trim() || null,
        stock:       r.stock ? Number(r.stock) : null,
        type:        r.type || "mart",
      })));
    },
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["vendor-products"] }); qc.invalidateQueries({ queryKey: ["vendor-products-all"] }); setView("list"); setBulkRows([{...EMPTY_ROW},{...EMPTY_ROW},{...EMPTY_ROW}]); setBulkCat(""); showToast(`✅ ${res.inserted} products added!`); },
    onError: (e: Error) => showToast("❌ " + errMsg(e)),
  });

  interface Product { id: string; name: string; description?: string | null; price: number; originalPrice?: number | null; category?: string | null; unit?: string | null; stock?: number | null; image?: string | null; videoUrl?: string | null; type?: string | null; inStock?: boolean; tags?: string[] | null; isHidden?: boolean; lowStockThreshold?: number | null }
  const openEdit = (p: Product) => {
    setEditProd(p);
    setForm({ name: p.name, description: p.description||"", price: String(p.price), originalPrice: p.originalPrice ? String(p.originalPrice) : "", category: p.category||"", unit: p.unit||"", stock: p.stock != null ? String(p.stock) : "", image: p.image||"", type: p.type||"mart", videoUrl: p.videoUrl||"", tags: Array.isArray(p.tags) ? p.tags.join(", ") : "", isHidden: !!p.isHidden });
    setEditThreshold(p.lowStockThreshold != null ? String(p.lowStockThreshold) : productThresholds[p.id] != null ? String(productThresholds[p.id]) : "");
    setShowAdd(true);
  };
  const closeForm = () => { setShowAdd(false); setEditProd(null); setForm({ ...EMPTY }); setFormErrors({}); setEditThreshold(""); };

  const handlePullRefresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ["vendor-products"] });
  }, [qc]);

  const Toast = toast ? (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center toast-in"
      style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)", paddingLeft: "16px", paddingRight: "16px" }}>
      <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl max-w-sm w-full text-center">{toast}</div>
    </div>
  ) : null;

  /* ── Add/Edit Form ── */
  if (showAdd) return (
    <div className="bg-gray-50 md:bg-transparent">
      <PageHeader
        title={editProd ? T("editProduct") : T("addProduct")}
        subtitle={T("fillProductDetails")}
        actions={
          <button onClick={closeForm} className="h-10 px-4 bg-white/20 md:bg-gray-100 md:text-gray-700 text-white font-bold rounded-xl text-sm android-press min-h-0">
            ✕ {T("cancel")}
          </button>
        }
      />
      <div className="px-4 py-4 md:px-0 md:py-4">
        <div className="md:grid md:grid-cols-2 md:gap-6 space-y-4 md:space-y-0">
          <div className={`${CARD} p-4 space-y-3`}>
            <Field label={T("productNameRequired")}>
              <input value={form.name} onChange={e => f("name",e.target.value)} placeholder="e.g. Chicken Biryani" className={`${INPUT}${formErrors.name ? " !border-red-400 focus:!border-red-500" : ""}`}/>
              {formErrors.name && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.name}</p>}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={T("priceRequired")}>
                <input type="number" inputMode="numeric" value={form.price} onChange={e => f("price",e.target.value)} placeholder="0" className={`${INPUT}${formErrors.price ? " !border-red-400 focus:!border-red-500" : ""}`}/>
                {formErrors.price && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.price}</p>}
              </Field>
              <Field label="Sale Price (crossed-out)">
                <input type="number" inputMode="numeric" value={form.originalPrice} onChange={e => f("originalPrice",e.target.value)} placeholder="Original price" className={INPUT}/>
              </Field>
              <Field label={T("categoryLabel")}>
                <select value={form.category} onChange={e => f("category",e.target.value)} className={`${SELECT}${formErrors.category ? " !border-red-400 focus:!border-red-500" : ""}`}>
                  <option value="">Select...</option>
                  {catList.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
                </select>
                {formErrors.category && <p className="text-xs text-red-500 mt-1 font-medium">{formErrors.category}</p>}
              </Field>
              <Field label={T("typeLabel")}>
                <select value={form.type} onChange={e => f("type",e.target.value)} className={SELECT}>
                  {TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                </select>
              </Field>
              <Field label={T("unitLabel")}>
                <input value={form.unit} onChange={e => f("unit",e.target.value)} placeholder="kg / pcs / ltr" className={INPUT}/>
              </Field>
              <Field label={T("stockQtyLabel")}>
                <input type="number" inputMode="numeric" min="0" value={form.stock} onChange={e => {
                  const v = e.target.value;
                  /* Block negative stock at UI level */
                  if (v !== "" && Number(v) < 0) return;
                  f("stock", v);
                }} placeholder="Blank = unlimited" className={INPUT}/>
              </Field>
              {editProd && (
                <Field label="Low-Stock Alert Threshold">
                  <input type="number" inputMode="numeric" min="0" value={editThreshold}
                    onChange={e => setEditThreshold(e.target.value)}
                    placeholder={`Default: ${lowStockThreshold}`}
                    className={INPUT}/>
                  <p className="text-[10px] text-gray-400 mt-1">Show warning badge when stock ≤ this number</p>
                </Field>
              )}
            </div>
            <Field label={T("descriptionLabel")}>
              <textarea value={form.description} onChange={e => f("description",e.target.value)} placeholder="Short description..." rows={2} className={TEXTAREA}/>
            </Field>
            <Field label="Tags (comma-separated)">
              <input value={form.tags} onChange={e => f("tags", e.target.value)} placeholder="e.g. spicy, bestseller, new" className={INPUT}/>
              <p className="text-[10px] text-gray-400 mt-1">Tags help customers discover your product</p>
            </Field>
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-bold text-gray-700">Hide from customers</p>
                <p className="text-[11px] text-gray-400">Product won't appear in listings</p>
              </div>
              <button type="button" onClick={() => f("isHidden", !form.isHidden)}
                className={`w-12 h-6 rounded-full relative transition-colors ${form.isHidden ? "bg-gray-400" : "bg-green-400"}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-1 shadow transition-all ${form.isHidden ? "left-1" : "left-7"}`}/>
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div className={`${CARD} p-4`}>
              <ImageUploader
                value={form.image}
                onChange={url => f("image", url)}
                label={T("imageUrlLabel")}
                placeholder="https://..."
              />
            </div>
            <div className={`${CARD} p-4 space-y-3`}>
              <label className={LABEL}>Upload Video (optional, ≤{maxVideoDurationSec}s)</label>
              {form.videoUrl ? (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                    <video
                      src={form.videoUrl}
                      className="w-full h-full object-contain"
                      controls
                      muted
                      playsInline
                    />
                  </div>
                  <div className="flex gap-2">
                    <label className="flex-1 h-9 bg-orange-50 text-orange-600 font-bold rounded-xl text-sm flex items-center justify-center gap-1.5 cursor-pointer android-press">
                      <span>🔄 Replace</span>
                      <input
                        type="file"
                        accept={allowedVideoFormats.join(",")}
                        className="hidden"
                        onChange={e => { const file = e.target.files?.[0]; if (file) handleVideoUpload(file); e.target.value = ""; }}
                      />
                    </label>
                    <button
                      onClick={() => f("videoUrl", "")}
                      className="flex-1 h-9 bg-red-50 text-red-500 font-bold rounded-xl text-sm android-press"
                    >
                      🗑️ Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${videoUploading ? "border-orange-300 bg-orange-50" : "border-gray-200 hover:border-orange-300 hover:bg-orange-50/50"}`}>
                  {videoUploading ? (
                    <>
                      <div className="w-8 h-8 border-3 border-orange-400 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm font-semibold text-orange-600">Uploading video...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl">🎬</span>
                      <span className="text-sm font-semibold text-gray-600">Tap to upload a product video</span>
                      <span className="text-xs text-gray-400">{(config.uploads?.allowedVideoFormats ?? ["mp4", "mov", "webm"]).map(f => f.toUpperCase()).join(", ")} · Max {maxVideoMb}MB · ≤{maxVideoDurationSec}s</span>
                    </>
                  )}
                  <input
                    type="file"
                    accept={allowedVideoFormats.join(",")}
                    className="hidden"
                    disabled={videoUploading}
                    onChange={e => { const file = e.target.files?.[0]; if (file) handleVideoUpload(file); e.target.value = ""; }}
                  />
                </label>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={closeForm} className={BTN_SECONDARY}>Cancel</button>
              <button onClick={() => { if (!validateForm()) return; editProd ? updateMut.mutate() : createMut.mutate(); }} disabled={createMut.isPending || updateMut.isPending} className={BTN_PRIMARY}>
                {createMut.isPending || updateMut.isPending ? "Saving..." : editProd ? "✓ Update Product" : "+ Add Product"}
              </button>
            </div>
          </div>
        </div>
      </div>
      {Toast}
    </div>
  );

  /* ── Bulk Add ── */
  const B_INPUT = "w-full h-9 px-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 text-xs";
  const validRows = bulkRows.filter(r => r.name.trim() && r.price);

  if (view === "bulk") return (
    <div className="bg-gray-50 md:bg-transparent">
      <PageHeader title={T("bulkAdd")} subtitle={`${validRows.length} ${T("readyToAdd")}`}
        actions={
          <div className="flex gap-2">
            <button onClick={downloadSampleCsv} className="h-10 px-3 bg-white/20 md:bg-blue-50 md:text-blue-600 text-white font-bold rounded-xl text-xs android-press min-h-0">⬇ Sample CSV</button>
            <button onClick={() => setView("list")} className="h-10 px-4 bg-white/20 md:bg-gray-100 md:text-gray-700 text-white font-bold rounded-xl text-sm android-press min-h-0">← Back</button>
          </div>
        }
      />
      <div className="px-4 py-4 space-y-4 md:px-0 md:py-4">

        {/* ── Controls Bar ── */}
        <div className={`${CARD} p-4`}>
          <div className="md:grid md:grid-cols-3 md:gap-4 space-y-3 md:space-y-0">
            <div>
              <label className={LABEL}>Default Category (for all rows)</label>
              <select value={bulkCat} onChange={e => setBulkCat(e.target.value)} className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-orange-400">
                <option value="">— applies per row if set —</option>
                {catList.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
              </select>
            </div>
            <div className="flex gap-2 items-end">
              <button onClick={() => setBulkRows(r => [...r, {...EMPTY_ROW}])}
                className="flex-1 h-10 border-2 border-dashed border-orange-300 text-orange-500 font-bold rounded-xl text-sm android-press">+ Add Row</button>
              <button onClick={() => setBulkRows(r => [...r, {...EMPTY_ROW},{...EMPTY_ROW},{...EMPTY_ROW},{...EMPTY_ROW},{...EMPTY_ROW}])}
                className="flex-1 h-10 border-2 border-dashed border-gray-200 text-gray-500 font-bold rounded-xl text-sm android-press">+5 Rows</button>
            </div>
            <div className="flex gap-2 items-end">
              <button onClick={() => setShowPaste(!showPaste)}
                className="flex-1 h-10 bg-blue-50 text-blue-600 font-bold rounded-xl text-sm android-press">📋 Paste Data</button>
              <label className="flex-1 h-10 bg-green-50 text-green-700 font-bold rounded-xl text-sm android-press flex items-center justify-center cursor-pointer">
                📂 Import CSV
                <input
                  ref={csvInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvImport(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={() => setBulkRows([{...EMPTY_ROW},{...EMPTY_ROW},{...EMPTY_ROW}])}
                className="h-10 px-3 bg-red-50 text-red-500 font-bold rounded-xl text-sm android-press">Clear</button>
            </div>
          </div>

          {/* Paste Panel */}
          {showPaste && (
            <div className="mt-4 p-4 bg-blue-50 rounded-2xl space-y-3">
              <div>
                <p className="text-sm font-bold text-blue-800 mb-1">📋 Paste from Spreadsheet</p>
                <p className="text-xs text-blue-600 mb-2">Format: <span className="font-mono bg-white px-1 rounded">Name | Price | Description | Image URL | Category | Unit | Stock</span> (tab or comma separated)</p>
                <textarea value={pasteText} onChange={e => setPasteText(e.target.value)} rows={4}
                  placeholder={"Chicken Biryani\t350\tDelicious rice dish\t\tfood\tpcs\t50\nVegetable Pulao\t280\t\t\tfood"}
                  className="w-full px-3 py-2.5 bg-white border border-blue-200 rounded-xl text-xs font-mono focus:outline-none focus:border-blue-400 resize-none"/>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowPaste(false)} className="flex-1 h-9 border border-blue-200 text-blue-500 font-bold rounded-xl text-sm android-press min-h-0">Cancel</button>
                <button onClick={parsePaste} disabled={!pasteText.trim()} className="flex-1 h-9 bg-blue-500 text-white font-bold rounded-xl text-sm android-press min-h-0">Parse & Import</button>
              </div>
            </div>
          )}
          {/* Batch limit info */}
          <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-2xl flex items-start gap-2">
            <span className="text-base flex-shrink-0">ℹ️</span>
            <p className="text-xs text-blue-700">
              <span className="font-bold">CSV limit: 500 rows per file.</span> Uploads are automatically sent to the server in batches — no manual splitting needed. Sample CSV columns: <span className="font-mono bg-white px-1 rounded">name, price, stock, category, description, unit, type, image</span>.
            </p>
          </div>

          {/* Duplicate name warning */}
          {duplicateWarning.length > 0 && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-2xl">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-amber-800">⚠️ {duplicateWarning.length} product name{duplicateWarning.length !== 1 ? "s" : ""} already exist in your catalogue</p>
                <button onClick={() => setDuplicateWarning([])} className="text-xs text-amber-500 hover:underline font-medium">Dismiss</button>
              </div>
              <ul className="space-y-0.5 mb-2 max-h-24 overflow-y-auto">
                {duplicateWarning.map((n, i) => <li key={i} className="text-xs text-amber-700 font-mono">• {n}</li>)}
              </ul>
              <p className="text-xs text-amber-600">Importing will create additional listings with these names. Remove matching rows to skip them, or proceed to import anyway.</p>
            </div>
          )}

          {/* Parse errors */}
          {parseErrors.length > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-2xl">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-bold text-red-700">⚠️ {parseErrors.length} row{parseErrors.length !== 1 ? "s" : ""} skipped — fix and re-upload to include them</p>
                <button onClick={() => setParseErrors([])} className="text-xs text-red-400 hover:underline">Dismiss</button>
              </div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {parseErrors.map((e, i) => <li key={i} className="text-xs text-red-600 font-mono">{e}</li>)}
              </ul>
            </div>
          )}
        </div>

        {/* ── Desktop Table View ── */}
        <div className={`${CARD} hidden md:block`}>
          <div className="text-[10px] text-gray-400 font-medium px-3 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center gap-1">
            <span>↔</span><span>Scroll horizontally if columns are too narrow</span>
          </div>
          <div className="overflow-x-auto">
            <div style={{ minWidth: "900px" }}>
              <div className="grid gap-1 px-3 py-2.5 bg-gray-50 border-b border-gray-100"
                style={{ gridTemplateColumns: "minmax(140px,2fr) minmax(80px,1fr) minmax(140px,2fr) minmax(120px,1.5fr) minmax(90px,1fr) minmax(60px,0.7fr) minmax(60px,0.7fr) minmax(60px,0.7fr) 32px" }}>
                {["Name *","Price *","Short Description","Image URL","Category","Unit","Stock","Type",""].map((h,i) => (
                  <p key={i} className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest">{h}</p>
                ))}
              </div>
              {bulkRows.map((row, i) => {
                const hasErr = !!(bulkRows[i]?.name && !bulkRows[i]?.price) || false;
                return (
                  <div key={i} className={`grid gap-1 px-2 py-1.5 border-b border-gray-50 last:border-0 ${hasErr ? "bg-red-50/30" : ""}`}
                    style={{ gridTemplateColumns: "minmax(140px,2fr) minmax(80px,1fr) minmax(140px,2fr) minmax(120px,1.5fr) minmax(90px,1fr) minmax(60px,0.7fr) minmax(60px,0.7fr) minmax(60px,0.7fr) 32px" }}>
                    <input className={`${B_INPUT} ${!row.name && row.price ? "border-red-300 bg-red-50" : ""}`}
                      value={row.name} onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,name:e.target.value} : x))} placeholder="Product name *"/>
                    <input className={`${B_INPUT} ${row.name && !row.price ? "border-red-300 bg-red-50" : ""}`}
                      type="number" inputMode="numeric" value={row.price} onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,price:e.target.value} : x))} placeholder={`${currencySymbol} *`}/>
                    <input className={B_INPUT} value={row.description}
                      onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,description:e.target.value} : x))} placeholder="Short description"/>
                    <input className={B_INPUT} type="url" value={row.image}
                      onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,image:e.target.value} : x))} placeholder="https://img.url"/>
                    <select className={`${B_INPUT} appearance-none`} value={row.category}
                      onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,category:e.target.value} : x))}>
                      <option value="">{bulkCat || "category"}</option>
                      {catList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input className={B_INPUT} value={row.unit}
                      onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,unit:e.target.value} : x))} placeholder="kg/pcs"/>
                    <input className={B_INPUT} type="number" inputMode="numeric" value={row.stock}
                      onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,stock:e.target.value} : x))} placeholder="qty"/>
                    <select className={`${B_INPUT} appearance-none`} value={row.type || "mart"}
                      onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,type:e.target.value} : x))}>
                      {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={() => setBulkRows(r => r.filter((_,j) => j!==i))}
                      className="w-8 h-9 text-red-400 hover:text-red-600 font-bold flex items-center justify-center text-base min-h-0">✕</button>
                  </div>
                );
              })}
              {bulkRows.length === 0 && (
                <div className="px-4 py-8 text-center text-gray-400 text-sm">No rows yet — add rows or paste data above</div>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile Card View ── */}
        <div className="md:hidden space-y-3">
          {bulkRows.map((row, i) => (
            <div key={i} className={`${CARD} p-4 space-y-2.5 border-2 ${row.name && row.price ? "border-orange-100" : "border-gray-100"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-extrabold text-gray-400 uppercase tracking-wider">Row {i+1} {row.name && row.price ? "✓" : ""}</p>
                <button onClick={() => setBulkRows(r => r.filter((_,j) => j!==i))} className="w-7 h-7 bg-red-50 text-red-500 rounded-lg font-bold text-sm min-h-0">✕</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-gray-400 mb-1">NAME *</p>
                  <input className={`${B_INPUT} h-10`} value={row.name}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,name:e.target.value} : x))} placeholder="Product name"/>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">PRICE ({currencySymbol}) *</p>
                  <input className={`${B_INPUT} h-10`} type="number" inputMode="numeric" value={row.price}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,price:e.target.value} : x))} placeholder="0"/>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">CATEGORY</p>
                  <select className={`${B_INPUT} h-10 appearance-none`} value={row.category}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,category:e.target.value} : x))}>
                    <option value="">{bulkCat || "select"}</option>
                    {catList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-gray-400 mb-1">SHORT DESCRIPTION</p>
                  <input className={`${B_INPUT} h-10`} value={row.description}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,description:e.target.value} : x))} placeholder="Brief product description"/>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">UNIT</p>
                  <input className={`${B_INPUT} h-10`} value={row.unit}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,unit:e.target.value} : x))} placeholder="kg/pcs/ltr"/>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">STOCK</p>
                  <input className={`${B_INPUT} h-10`} type="number" inputMode="numeric" value={row.stock}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,stock:e.target.value} : x))} placeholder="qty"/>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-gray-400 mb-1">IMAGE URL</p>
                  <input className={`${B_INPUT} h-10`} type="url" value={row.image}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,image:e.target.value} : x))} placeholder="https://..."/>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 mb-1">TYPE</p>
                  <select className={`${B_INPUT} h-10 appearance-none`} value={row.type || "mart"}
                    onChange={e => setBulkRows(r => r.map((x,j) => j===i ? {...x,type:e.target.value} : x))}>
                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setBulkRows(r => [...r, {...EMPTY_ROW}])}
            className="w-full h-12 border-2 border-dashed border-orange-300 text-orange-500 font-bold rounded-2xl text-sm android-press">+ Add Row</button>
        </div>

        {/* ── Summary + Submit ── */}
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1 bg-gray-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-gray-800">{bulkRows.length}</p>
              <p className="text-xs text-gray-500">Total rows</p>
            </div>
            <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-green-600">{validRows.length}</p>
              <p className="text-xs text-gray-500">Ready to add</p>
            </div>
            <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
              <p className="text-2xl font-extrabold text-red-500">{bulkRows.length - validRows.length}</p>
              <p className="text-xs text-gray-500">Incomplete</p>
            </div>
          </div>
          {bulkRows.length - validRows.length > 0 && (
            <div className="bg-amber-50 rounded-xl px-3 py-2.5 mb-4">
              <p className="text-xs text-amber-700 font-medium">⚠️ Rows missing Name or Price will be skipped. Only {validRows.length} complete rows will be added.</p>
            </div>
          )}
          {bulkImportResults && (
            <div className="mt-4 space-y-1.5">
              {/* Progress counter */}
              {bulkImportProgress && (
                <div className="mb-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                      {bulkImporting ? "Uploading…" : "Import complete"}
                    </p>
                    <p className="text-sm font-extrabold text-orange-600 tabular-nums">
                      {bulkImportProgress.done} / {bulkImportProgress.total}
                    </p>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-orange-400 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkImportProgress.done / bulkImportProgress.total) * 100}%` }}
                    />
                  </div>
                  {!bulkImporting && (() => {
                    const added = bulkImportResults.filter(r => r.status === "success").length;
                    const failed = bulkImportResults.filter(r => r.status === "error").length;
                    return (
                      <div className="flex gap-3 mt-2">
                        <span className="text-xs font-bold text-green-600">✅ {added} added</span>
                        {failed > 0 && <span className="text-xs font-bold text-red-500">❌ {failed} failed</span>}
                      </div>
                    );
                  })()}
                </div>
              )}
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Row details</p>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {bulkImportResults.map((r, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${r.status === "success" ? "bg-green-50" : r.status === "error" ? "bg-red-50" : "bg-gray-50"}`}>
                    <span className="text-base flex-shrink-0">
                      {r.status === "success" ? "✅" : r.status === "error" ? "❌" : <span className="w-4 h-4 border-2 border-orange-400 border-t-transparent rounded-full animate-spin inline-block"/>}
                    </span>
                    <span className="flex-1 font-medium text-gray-800 truncate">{r.name}</span>
                    {r.status === "error" && r.message && <span className="text-xs text-red-500 truncate max-w-[140px]" title={r.message}>{r.message}</span>}
                    {r.status === "success" && <span className="text-xs text-green-600 font-bold">Added</span>}
                    {r.status === "pending" && <span className="text-xs text-gray-400">Waiting…</span>}
                  </div>
                ))}
              </div>
              {!bulkImporting && (
                <button onClick={() => { setBulkImportResults(null); setBulkImportProgress(null); setDuplicateWarning([]); setParseErrors([]); setView("list"); setBulkRows([{...EMPTY_ROW},{...EMPTY_ROW},{...EMPTY_ROW}]); setBulkCat(""); }} className={`mt-3 ${BTN_PRIMARY}`}>
                  ✓ Done — View Products
                </button>
              )}
            </div>
          )}
          {!bulkImportResults && (
            <div className="flex gap-3">
              <button onClick={() => { setView("list"); setDuplicateWarning([]); setParseErrors([]); }} className={BTN_SECONDARY}>Cancel</button>
              <button onClick={() => setView("list")} className={BTN_SECONDARY}>Cancel</button>
              <button onClick={runBulkImport} disabled={bulkImporting || validRows.length === 0 || allDataLoading} className={BTN_PRIMARY}>
                {allDataLoading ? "Checking limit..." : bulkImporting ? "Adding..." : `➕ Add ${validRows.length} Products`}
              </button>
            </div>
          )}
        </div>
      </div>
      {Toast}
    </div>
  );

  /* ── Product List ── */
  return (
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-gray-50 md:bg-transparent">
      <PageHeader
        title={T("products")}
        subtitle={totalProductCount !== null ? `${totalProductCount}/${maxItems} items used` : `—/${maxItems} items`}
        actions={
          <div className="flex gap-2 flex-wrap justify-end">
          <div className="flex gap-2">
            <button
              onClick={() => { setBulkEditMode(m => { const next = !m; if (!next) { setBulkEditSelected(new Set()); setBulkEditError(""); } return next; }); }}
              className={`h-9 px-3.5 text-xs font-bold rounded-xl android-press min-h-0 ${bulkEditMode ? "bg-orange-500 text-white" : "bg-white/20 md:bg-gray-100 md:text-gray-700 text-white"}`}>
              {bulkEditMode ? "✕ Cancel" : "✏️ Bulk Edit"}
            </button>
            <label className={`h-9 px-3.5 text-xs font-bold rounded-xl android-press min-h-0 flex items-center justify-center cursor-pointer ${(allDataLoading || totalProductCount === null || totalProductCount >= maxItems) ? "bg-gray-300 text-gray-500 cursor-not-allowed pointer-events-none" : "bg-white/20 md:bg-green-50 md:text-green-700 text-white"}`}>
              📥 Import CSV
              <input
                ref={csvListInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={allDataLoading || totalProductCount === null || totalProductCount >= maxItems}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) { setBulkRows([{ ...EMPTY_ROW }]); handleCsvImport(file, true); }
                  e.target.value = "";
                }}
              />
            </label>
            <button onClick={() => setView("bulk")} disabled={allDataLoading || totalProductCount === null || totalProductCount >= maxItems} className={`h-9 px-3.5 text-xs font-bold rounded-xl android-press min-h-0 ${(allDataLoading || totalProductCount === null || totalProductCount >= maxItems) ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-white/20 md:bg-gray-100 md:text-gray-700 text-white"}`}>Bulk Add</button>
            <button onClick={() => setShowAdd(true)} disabled={allDataLoading || totalProductCount === null || totalProductCount >= maxItems} className={`h-9 px-3.5 text-sm font-bold rounded-xl android-press min-h-0 ${(allDataLoading || totalProductCount === null || totalProductCount >= maxItems) ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-white text-orange-500 md:bg-orange-500 md:text-white"}`}>+ Add</button>
          </div>
          </div>
        }
        mobileContent={
          <input type="search" placeholder="🔍  Search products..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full h-11 px-4 bg-white/20 text-white placeholder-orange-200 rounded-2xl focus:outline-none focus:bg-white focus:text-gray-800 focus:placeholder-gray-400 transition-all text-base"/>
        }
      />

      {/* Desktop search */}
      <div className="hidden md:block px-0 py-3">
        <input type="search" placeholder="🔍 Search products..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full h-11 px-4 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm"/>
      </div>

      {/* Live sync indicator */}
      {lastStockSync && (
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-green-600 font-medium px-0 pb-1">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block"/>
          Last synced: {lastStockSync.toLocaleTimeString()}
        </div>
      )}

      {/* Category Chips */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10 md:static md:border-0 md:bg-transparent md:mt-2">
        <div className="flex gap-2 px-4 py-2.5 md:px-0 overflow-x-auto">
          {categories.map(c => (
            <button key={c} onClick={() => setFilterCat(c)}
              className={`h-8 px-3.5 rounded-full text-xs font-bold whitespace-nowrap capitalize android-press min-h-0 flex-shrink-0 transition-all
                ${filterCat === c ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-orange-50"}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-3 md:px-0 md:py-4">
        {pendingProductCount > 0 && (
          <div className="rounded-2xl px-4 py-3 border bg-amber-50 border-amber-200">
            <div className="flex items-center gap-3">
              <span className="text-xl flex-shrink-0">⏳</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-amber-800">
                  {pendingProductCount} product change{pendingProductCount > 1 ? "s" : ""} pending sync
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Will sync automatically when you reconnect</p>
              </div>
            </div>
          </div>
        )}

        {productQueueErrors.length > 0 && (
          <div className="rounded-2xl border bg-red-50 border-red-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-red-100">
              <span className="text-xl flex-shrink-0">❌</span>
              <p className="text-sm font-bold text-red-800">
                {productQueueErrors.length} product change{productQueueErrors.length > 1 ? "s" : ""} failed to sync
              </p>
            </div>
            <div className="divide-y divide-red-100">
              {productQueueErrors.map(err => (
                <div key={err.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-red-700 capitalize">
                      {err.action} {err.productId ? `(#${err.productId.slice(-6)})` : ""}
                    </p>
                    <p className="text-xs text-red-500 mt-0.5 break-words">{err.message}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0 mt-0.5">
                    <button
                      onClick={() => retryProductQueueItem(err.id)}
                      className="h-7 px-2.5 text-xs font-bold rounded-lg bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => dismissProductQueueError(err.id)}
                      className="h-7 px-2.5 text-xs font-bold rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 active:scale-95 transition-all"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {lowStock.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="text-sm font-bold text-red-700">{lowStock.length} product{lowStock.length>1?"s":""} low on stock</p>
              <p className="text-xs text-red-500 mt-0.5">Edit products to update stock levels</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 space-y-3 md:space-y-0">
            {[1,2,3,4].map(i => <div key={i} className="h-24 skeleton rounded-2xl"/>)}
          </div>
        ) : products.length === 0 ? (
          <div className={`${CARD} px-4 py-16 text-center`}>
            <p className="text-5xl mb-4">{search || filterCat !== "all" ? "🔍" : "🍽️"}</p>
            {search ? (
              <>
                <p className="font-bold text-gray-700 text-base">No products found for "{search}"</p>
                <p className="text-sm text-gray-400 mt-1">Try a different search term or clear the filter</p>
                <button onClick={() => setSearch("")} className="mt-4 h-10 px-6 bg-gray-100 text-gray-600 font-bold rounded-xl android-press text-sm">Clear Search</button>
              </>
            ) : filterCat !== "all" ? (
              <>
                <p className="font-bold text-gray-700 text-base">No products in "{filterCat}"</p>
                <p className="text-sm text-gray-400 mt-1">Try a different category or add products to this one</p>
                <button onClick={() => setFilterCat("all")} className="mt-4 h-10 px-6 bg-gray-100 text-gray-600 font-bold rounded-xl android-press text-sm">Show All</button>
              </>
            ) : (
              <>
                <p className="font-bold text-gray-700 text-base">No products yet</p>
                <p className="text-sm text-gray-400 mt-1">Add your first product to get started</p>
                <button onClick={() => setShowAdd(true)} className="mt-5 h-12 px-8 bg-orange-500 text-white font-bold rounded-2xl android-press">+ Add First Product</button>
              </>
            )}
          </div>
        ) : (
          <div className="md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 space-y-3 md:space-y-0">
            {products.map(p => {
              const pThresh = p.lowStockThreshold ?? productThresholds[p.id] ?? lowStockThreshold;
              const isLowStock = p.stock != null && p.stock >= 0 && p.stock <= pThresh;
              const isSelected = bulkEditSelected.has(p.id);
              return (
              <div key={p.id} className={`${CARD}${!p.inStock ? " opacity-60" : ""}${p.isHidden ? " border-2 border-dashed border-gray-300" : ""}${isSelected ? " ring-2 ring-orange-400" : ""}`}>
                {bulkEditMode && (
                  <div className="px-4 pt-3 pb-0 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleBulkSelect(p.id)}
                      className="w-4 h-4 rounded accent-orange-500 cursor-pointer"
                    />
                    <span className="text-xs text-gray-500 font-medium">{isSelected ? "Selected" : "Select for bulk edit"}</span>
                  </div>
                )}
                <div className="p-4 flex items-start gap-3">
                  {p.image
                    ? <SafeImage src={p.image} alt={p.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0 bg-gray-100" />
                    : <div className="w-16 h-16 rounded-xl bg-orange-50 flex items-center justify-center text-2xl flex-shrink-0">🍽️</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-gray-800 text-sm leading-snug">{p.name}</p>
                          {p.isHidden && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">Hidden</span>}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {p.category && <span className="text-[10px] bg-orange-50 text-orange-600 font-bold px-2 py-0.5 rounded-full capitalize">{p.category}</span>}
                          {p.unit && <span className="text-[10px] text-gray-400">/{p.unit}</span>}
                          {p.stock != null && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isLowStock ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700"}`}>
                              {isLowStock ? `⚠️ ${p.stock} left` : `${p.stock} in stock`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-extrabold text-orange-600 text-base">{fc(p.price, currencySymbol)}</p>
                        {p.originalPrice && p.originalPrice > p.price && <p className="text-[10px] text-gray-400 line-through">{fc(p.originalPrice, currencySymbol)}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                      <button onClick={() => toggleMut.mutate({ id: p.id, inStock: !p.inStock })}
                        className={`h-8 px-3 text-xs font-bold rounded-xl android-press min-h-0 ${p.inStock ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                        {p.inStock ? "✓ In Stock" : "✗ Out"}
                      </button>
                      <button onClick={() => hideMut.mutate({ id: p.id, isHidden: !p.isHidden })} disabled={hideMut.isPending}
                        className={`h-8 px-3 text-xs font-bold rounded-xl android-press min-h-0 ${p.isHidden ? "bg-gray-100 text-gray-500" : "bg-indigo-50 text-indigo-600"}`}>
                        {p.isHidden ? "👁️ Show" : "🙈 Hide"}
                      </button>
                      <button onClick={() => openEdit(p)} className="h-8 px-3 bg-blue-50 text-blue-600 text-xs font-bold rounded-xl android-press min-h-0">✏️ Edit</button>
                      <button onClick={() => {
                        if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
                        deleteMut.mutate(p.id);
                      }} className="h-8 px-3 bg-red-50 text-red-600 text-xs font-bold rounded-xl android-press min-h-0">🗑️</button>
                      {p.stock != null && (
                        <button
                          onClick={() => setStockHistoryOpen(stockHistoryOpen === p.id ? null : p.id)}
                          className="h-8 px-3 bg-purple-50 text-purple-600 text-xs font-bold rounded-xl android-press min-h-0">
                          {stockHistoryOpen === p.id ? "▲ History" : "📊 History"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {/* ── Stock History Collapsible Panel ── */}
                {stockHistoryOpen === p.id && (
                  <StockHistoryPanel productId={p.id} />
                )}
              </div>
            );
            })}
          </div>
        )}
      </div>

      {/* ── Bulk Edit Floating Action Bar ── */}
      {bulkEditMode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 pointer-events-none">
          <div className="max-w-2xl mx-auto px-4 pb-4 pointer-events-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-orange-200 overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-orange-100 flex items-center justify-between">
                <p className="text-sm font-bold text-orange-700">
                  ✏️ Bulk Edit Mode — {bulkEditSelected.size} product{bulkEditSelected.size !== 1 ? "s" : ""} selected
                </p>
                <button
                  onClick={() => { const all = new Set(products.map((p: any) => p.id)); setBulkEditSelected(prev => prev.size === all.size ? new Set() : all); }}
                  className="text-xs font-bold text-orange-500 underline">
                  {bulkEditSelected.size === products.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">New Price ({currencySymbol})</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={bulkEditPrice}
                      onChange={e => { setBulkEditPrice(e.target.value); setBulkEditError(""); }}
                      placeholder="Leave blank to keep"
                      className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">New Stock (qty)</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={bulkEditStock}
                      onChange={e => { setBulkEditStock(e.target.value); setBulkEditError(""); }}
                      placeholder="Leave blank to keep"
                      className="w-full h-10 px-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm"
                    />
                  </div>
                </div>
                {bulkEditError && <p className="text-xs text-red-500 font-semibold">⚠️ {bulkEditError}</p>}
                <button
                  onClick={() => bulkEditMut.mutate()}
                  disabled={bulkEditMut.isPending || bulkEditSelected.size === 0}
                  className="w-full h-11 bg-orange-500 text-white font-bold rounded-xl text-sm disabled:opacity-50 android-press">
                  {bulkEditMut.isPending ? "Updating..." : `Apply to ${bulkEditSelected.size} Product${bulkEditSelected.size !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {Toast}
    </PullToRefresh>
  );
}
