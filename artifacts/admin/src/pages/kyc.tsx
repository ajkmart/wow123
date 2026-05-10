import { useState, useEffect, useMemo } from "react";
import { fetchAdminAbsolute } from "@/lib/adminFetcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck, Clock, XCircle, AlertCircle, CheckCircle,
  User, Phone, CreditCard, MapPin, Calendar, Eye,
  Filter, RefreshCw, X, ChevronDown, Search, Download,
  ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2,
  Car, FileText, ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { PageHeader, StatCard, StatCardSkeleton } from "@/components/shared";
import { StatusBadge } from "@/components/ui/StatusBadge";

import { SafeImage } from "@/components/ui/SafeImage";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LastUpdated } from "@/components/ui/LastUpdated";

const STATUS_CONFIG = {
  pending:  { label: "Pending Review", color: "text-amber-700",  bg: "bg-amber-100",  border: "border-amber-300",  dot: "bg-amber-400",  Icon: Clock },
  approved: { label: "Approved",       color: "text-green-700",  bg: "bg-green-100",  border: "border-green-300",  dot: "bg-green-500",  Icon: BadgeCheck },
  rejected: { label: "Rejected",       color: "text-red-700",    bg: "bg-red-100",    border: "border-red-300",    dot: "bg-red-500",    Icon: XCircle },
  resubmit: { label: "Resubmit",       color: "text-blue-700",   bg: "bg-blue-100",   border: "border-blue-300",   dot: "bg-blue-500",   Icon: AlertCircle },
};

type RiderProfile = {
  vehicleType?: string | null;
  vehiclePlate?: string | null;
  vehicleRegNo?: string | null;
  drivingLicense?: string | null;
  vehiclePhoto?: string | null;
  documents?: string | null;
};

type KycRecord = {
  id: string; userId: string; status: string;
  fullName?: string; cnic?: string; dateOfBirth?: string; gender?: string;
  address?: string; city?: string;
  frontIdPhoto?: string; backIdPhoto?: string; selfiePhoto?: string;
  rejectionReason?: string; reviewedAt?: string; submittedAt: string;
  userName?: string; userPhone?: string; userEmail?: string;
  user?: { name: string; phone: string; email: string; avatar?: string; roles?: string };
  riderProfile?: RiderProfile | null;
};

function exportKycCSV(records: KycRecord[]) {
  const header = "ID,UserID,Name,Phone,CNIC,Status,City,Submitted";
  const lines = records.map(r =>
    [r.id, r.userId, r.userName ?? r.user?.name ?? "", r.userPhone ?? r.user?.phone ?? "", r.cnic ?? "", r.status, r.city ?? "", r.submittedAt?.slice(0, 10) ?? ""].join(",")
  );
  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `kyc-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0);
}

function PhotoModal({ url, label, onClose }: { url: string; label?: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const zoomIn  = () => setZoom(z => Math.min(z + 0.25, 4));
  const zoomOut = () => setZoom(z => Math.max(z - 0.25, 0.5));
  const rotate  = () => setRotation(r => (r + 90) % 360);
  const reset   = () => { setZoom(1); setRotation(0); };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") zoomIn();
      else if (e.key === "-") zoomOut();
      else if (e.key === "r" || e.key === "R") rotate();
      else if (e.key === "f" || e.key === "F") setFullscreen(f => !f);
      else if (e.key === "0") reset();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const containerSize = fullscreen ? "max-w-full w-full h-full" : "max-w-3xl w-full max-h-[90vh]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={onClose}>
      <div className={`relative ${containerSize} flex flex-col`} onClick={e => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1 bg-black/60 rounded-xl p-1.5 backdrop-blur">
            <button onClick={zoomOut} title="Zoom out (-)" className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-lg disabled:opacity-30" disabled={zoom <= 0.5}>
              <ZoomOut size={16} />
            </button>
            <span className="text-white text-xs font-mono w-12 text-center select-none">{Math.round(zoom * 100)}%</span>
            <button onClick={zoomIn} title="Zoom in (+)" className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-lg disabled:opacity-30" disabled={zoom >= 4}>
              <ZoomIn size={16} />
            </button>
            <div className="w-px h-5 bg-white/20 mx-1" />
            <button onClick={rotate} title="Rotate 90° (R)" className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-lg">
              <RotateCw size={16} />
            </button>
            <button onClick={() => setFullscreen(f => !f)} title="Toggle fullscreen (F)" className="w-9 h-9 flex items-center justify-center text-white hover:bg-white/10 rounded-lg">
              {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button onClick={reset} title="Reset (0)" className="px-2 h-9 flex items-center justify-center text-white text-xs hover:bg-white/10 rounded-lg">
              Reset
            </button>
          </div>
          <div className="flex items-center gap-2">
            {label && <span className="text-white text-sm font-medium bg-black/60 px-3 py-1.5 rounded-lg backdrop-blur">{label}</span>}
            <button onClick={onClose} title="Close (Esc)" className="w-9 h-9 flex items-center justify-center text-white bg-black/60 hover:bg-white/10 rounded-lg backdrop-blur">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Image canvas */}
        <div className="flex-1 overflow-auto bg-white/5 rounded-2xl flex items-center justify-center p-4">
          <img
            src={url}
            alt={label ?? "KYC Document"}
            draggable={false}
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              transition: "transform 0.15s ease",
              maxHeight: fullscreen ? "85vh" : "75vh",
            }}
            className="max-w-full object-contain shadow-2xl select-none"
          />
        </div>

        <p className="text-white/40 text-xs text-center mt-2 select-none">
          Shortcuts: + / − zoom · R rotate · F fullscreen · 0 reset · Esc close
        </p>
      </div>
    </div>
  );
}

function ApproveModal({ onConfirm, onClose, loading }: { onConfirm: (reason: string) => void; onClose: () => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const QUICK = [
    "Documents clear and valid — approved",
    "CNIC matches selfie — approved",
    "Vehicle papers verified",
    "Identity confirmed via call-back",
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-gray-900 text-lg mb-1">Approve KYC</h3>
        <p className="text-gray-500 text-sm mb-4">Optionally add a verification note. This is recorded in the audit log.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK.map(q => (
            <button key={q} onClick={() => setReason(q)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${reason === q ? "bg-green-600 text-white border-green-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-green-300"}`}>
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Verification note (optional)…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-400 mb-4" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(reason.trim())} disabled={loading}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm py-2.5 rounded-xl transition flex items-center justify-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Approve KYC"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RejectModal({ onConfirm, onClose, loading }: { onConfirm: (reason: string) => void; onClose: () => void; loading: boolean }) {
  const [reason, setReason] = useState("");
  const QUICK = [
    "CNIC photo is blurry or unclear",
    "CNIC photo is cut off — show all 4 corners",
    "Selfie does not match CNIC photo",
    "CNIC is expired",
    "Information provided does not match CNIC",
    "Document is not a valid CNIC",
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-gray-900 text-lg mb-1">Reject KYC</h3>
        <p className="text-gray-500 text-sm mb-4">Select a reason or write your own. This will be shown to the user.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK.map(q => (
            <button key={q} onClick={() => setReason(q)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${reason === q ? "bg-red-600 text-white border-red-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-red-300"}`}>
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Or write a custom reason..."
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400 mb-4" />
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-gray-200 text-gray-600 font-semibold text-sm py-2.5 rounded-xl hover:bg-gray-50">Cancel</button>
          <button onClick={() => reason.trim() && onConfirm(reason.trim())} disabled={!reason.trim() || loading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold text-sm py-2.5 rounded-xl transition flex items-center justify-center gap-2">
            {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Reject KYC"}
          </button>
        </div>
      </div>
    </div>
  );
}

function KycDetailPanel({ record, onClose, onApprove, onReject }: {
  record: KycRecord; onClose: () => void;
  onApprove: () => void; onReject: (reason: string) => void;
}) {
  const [photo, setPhoto] = useState<{ url: string; label: string } | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [showApprove, setShowApprove] = useState(false);
  const qc = useQueryClient();

  const approveMut = useMutation({
    mutationFn: async (reason: string) => {
      return fetchAdminAbsolute(`/api/kyc/admin/${record.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-kyc"] }); setShowApprove(false); onApprove(); onClose(); },
  });

  const rejectMut = useMutation({
    mutationFn: async (reason: string) => {
      return fetchAdminAbsolute(`/api/kyc/admin/${record.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-kyc"] }); setShowReject(false); onReject(""); onClose(); },
  });

  const { data: fullRecord } = useQuery({
    queryKey: ["admin-kyc-detail", record.id],
    queryFn: async () => {
      const j = await fetchAdminAbsolute(`/api/kyc/admin/${record.id}`);
      return (j?.data ?? j) as KycRecord;
    },
  });

  const details = fullRecord ?? record;
  const stConf = STATUS_CONFIG[details.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;

  const fullApiUrl = (path?: string) => {
    if (!path) return null;
    if (path.startsWith("http")) return path;
    return `${window.location.origin}${path}`;
  };

  return (
    <>
      {photo && <PhotoModal url={photo.url} label={photo.label} onClose={() => setPhoto(null)} />}
      {showApprove && <ApproveModal onConfirm={r => approveMut.mutate(r)} onClose={() => setShowApprove(false)} loading={approveMut.isPending} />}
      {showReject && <RejectModal onConfirm={r => rejectMut.mutate(r)} onClose={() => setShowReject(false)} loading={rejectMut.isPending} />}

      <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/40 p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg h-full max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3 z-10">
            <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${stConf.bg} ${stConf.color} border ${stConf.border}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${stConf.dot}`} />
              {stConf.label}
            </div>
            <span className="text-gray-400 text-xs flex-1">#{record.id.slice(-8)}</span>
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100">
              <X size={18} className="text-gray-500" />
            </button>
          </div>

          <div className="p-5 space-y-5">
            {/* User info */}
            <div className="bg-gray-50 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  {(details.userName ?? details.userPhone ?? "?")[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{details.userName ?? "—"}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1"><Phone size={11} /> {details.userPhone}</span>
                    {details.userEmail && <span className="flex items-center gap-1">✉ {details.userEmail}</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* Personal details */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="bg-blue-600 px-4 py-2.5">
                <p className="text-white font-semibold text-sm">Personal Information</p>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  { icon: User,       label: "Full Name",    val: details.fullName },
                  { icon: CreditCard, label: "CNIC",         val: details.cnic },
                  { icon: Calendar,   label: "Date of Birth",val: details.dateOfBirth },
                  { icon: User,       label: "Gender",       val: details.gender },
                  { icon: MapPin,     label: "City",         val: details.city },
                  { icon: MapPin,     label: "Address",      val: details.address },
                ].map(({ icon: Icon, label, val }) => (
                  <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400">{label}</p>
                      <p className="text-sm text-gray-800 font-medium">{val ?? <span className="text-gray-300 italic text-xs">Not provided</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Document photos */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="bg-blue-600 px-4 py-2.5">
                <p className="text-white font-semibold text-sm">Submitted Documents</p>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                {[
                  { key: "frontIdPhoto" as const, label: "CNIC Front" },
                  { key: "backIdPhoto"  as const, label: "CNIC Back" },
                  { key: "selfiePhoto"  as const, label: "Selfie" },
                ].map(({ key, label }) => {
                  const url = fullApiUrl(details[key]);
                  return (
                    <div key={key} className="text-center">
                      {url ? (
                        <button onClick={() => setPhoto({ url, label })} className="w-full group relative">
                          <SafeImage src={url} alt={label} className="w-full h-24 object-cover rounded-xl border border-gray-100" />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 rounded-xl transition flex items-center justify-center">
                            <Eye size={18} className="text-white" />
                          </div>
                        </button>
                      ) : (
                        <div className="w-full h-24 bg-gray-100 rounded-xl flex items-center justify-center">
                          <XCircle size={20} className="text-gray-300" />
                        </div>
                      )}
                      <p className="text-[10px] text-gray-500 mt-1">{label}</p>
                      <p className="text-[10px]">{url ? <span className="text-green-600">✓ Uploaded</span> : <span className="text-red-400">Missing</span>}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Vehicle papers (riders only) */}
            {details.riderProfile && (
              <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
                <div className="bg-indigo-600 px-4 py-2.5 flex items-center gap-2">
                  <Car size={14} className="text-white" />
                  <p className="text-white font-semibold text-sm">Vehicle Papers</p>
                </div>
                <div className="divide-y divide-gray-50">
                  {[
                    { label: "Vehicle Type",     val: details.riderProfile.vehicleType },
                    { label: "Number Plate",     val: details.riderProfile.vehiclePlate },
                    { label: "Registration No.", val: details.riderProfile.vehicleRegNo },
                    { label: "Driving License",  val: details.riderProfile.drivingLicense && !/^https?:|^\//.test(details.riderProfile.drivingLicense) ? details.riderProfile.drivingLicense : null },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center gap-3 px-4 py-2.5">
                      <FileText size={14} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-[10px] text-gray-400">{label}</p>
                        <p className="text-sm text-gray-800 font-medium">{val ?? <span className="text-gray-300 italic text-xs">Not provided</span>}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="p-4 grid grid-cols-2 gap-3">
                  {[
                    { key: "vehiclePhoto"   as const, label: "Vehicle Photo" },
                    { key: "drivingLicense" as const, label: "Driving License" },
                  ].map(({ key, label }) => {
                    const raw = details.riderProfile?.[key] ?? null;
                    const isImage = !!raw && /^https?:|^\//.test(raw);
                    const url = isImage ? fullApiUrl(raw) : null;
                    return (
                      <div key={key} className="text-center">
                        {url ? (
                          <button onClick={() => setPhoto({ url, label })} className="w-full group relative">
                            <SafeImage src={url} alt={label} className="w-full h-28 object-cover rounded-xl border border-gray-100" />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 rounded-xl transition flex items-center justify-center">
                              <Eye size={18} className="text-white" />
                            </div>
                          </button>
                        ) : (
                          <div className="w-full h-28 bg-gray-100 rounded-xl flex flex-col items-center justify-center text-gray-300">
                            <FileText size={20} />
                            {raw && !isImage && <span className="text-[10px] text-gray-500 mt-1 px-2 truncate max-w-full">{raw}</span>}
                          </div>
                        )}
                        <p className="text-[10px] text-gray-500 mt-1">{label}</p>
                        <p className="text-[10px]">{url ? <span className="text-green-600">✓ Uploaded</span> : raw ? <span className="text-amber-500">Text on file</span> : <span className="text-red-400">Missing</span>}</p>
                      </div>
                    );
                  })}
                </div>
                {details.riderProfile.documents && (
                  <div className="px-4 pb-4">
                    <p className="text-[10px] text-gray-400 mb-1">Additional Documents</p>
                    <p className="text-xs text-gray-700 bg-gray-50 rounded-lg px-3 py-2 break-all">{details.riderProfile.documents}</p>
                  </div>
                )}
              </div>
            )}

            {/* Rejection reason */}
            {details.rejectionReason && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="text-red-700 font-semibold text-sm mb-1">Rejection Reason</p>
                <p className="text-red-600 text-sm">{details.rejectionReason}</p>
              </div>
            )}

            {/* Timestamps */}
            <div className="text-xs text-gray-400 space-y-1">
              <p>Submitted: {new Date(details.submittedAt).toLocaleString("en-PK")}</p>
              {details.reviewedAt && <p>Reviewed: {new Date(details.reviewedAt).toLocaleString("en-PK")}</p>}
            </div>

            {/* Actions */}
            {details.status === "pending" && (
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowReject(true)}
                  className="flex-1 border-2 border-red-300 text-red-600 font-bold text-sm py-3 rounded-xl hover:bg-red-50 transition flex items-center justify-center gap-2">
                  <XCircle size={16} /> Reject
                </button>
                <button onClick={() => setShowApprove(true)} disabled={approveMut.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold text-sm py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-md shadow-green-100">
                  {approveMut.isPending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <><CheckCircle size={16} /> Approve</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function KycPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KycRecord | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  /* Debounce search input */
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-kyc", statusFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ status: statusFilter, limit: "50" });
      if (search) params.set("q", search);
      const j = await fetchAdminAbsolute(`/api/kyc/admin/list?${params.toString()}`);
      return (j?.data ?? j) as { records: KycRecord[] };
    },
    refetchInterval: 30000,
  });

  useEffect(() => { if (data) setLastRefreshed(new Date()); }, [data]);
  useEffect(() => {
    const handler = () => setSelected(null);
    window.addEventListener("admin:close-modal", handler);
    return () => window.removeEventListener("admin:close-modal", handler);
  }, []);

  type KycSortKey = "userName" | "city" | "status" | "submittedAt";
  const [kycSortKey, setKycSortKey] = useState<KycSortKey>("submittedAt");
  const [kycSortDir, setKycSortDir] = useState<"asc" | "desc">("desc");

  const handleKycSort = (key: KycSortKey) => {
    if (kycSortKey === key) setKycSortDir(d => d === "asc" ? "desc" : "asc");
    else { setKycSortKey(key); setKycSortDir("asc"); }
  };

  function KycSortIcon({ col }: { col: KycSortKey }) {
    if (kycSortKey !== col) return <ArrowUpDown className="w-3 h-3 opacity-40 inline ml-0.5" />;
    return kycSortDir === "asc" ? <ArrowUp className="w-3 h-3 text-blue-600 inline ml-0.5" /> : <ArrowDown className="w-3 h-3 text-blue-600 inline ml-0.5" />;
  }

  const statusOrder: Record<string, number> = { pending: 0, resubmit: 1, rejected: 2, approved: 3 };

  const records = data?.records ?? [];

  const sortedRecords = useMemo(() => {
    return [...records].sort((a, b) => {
      const dir = kycSortDir === "asc" ? 1 : -1;
      if (kycSortKey === "userName") return dir * ((a.userName ?? "").localeCompare(b.userName ?? ""));
      if (kycSortKey === "city") return dir * ((a.city ?? "").localeCompare(b.city ?? ""));
      if (kycSortKey === "status") return dir * ((statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
      return dir * (new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    });
  }, [records, kycSortKey, kycSortDir]);

  const counts = {
    all: records.length,
    pending: records.filter(r => r.status === "pending").length,
    approved: records.filter(r => r.status === "approved").length,
    rejected: records.filter(r => r.status === "rejected").length,
    resubmit: records.filter(r => r.status === "resubmit").length,
  };

  const FILTERS = [
    { key: "all",      label: "All",       count: counts.all },
    { key: "pending",  label: "Pending",   count: counts.pending },
    { key: "approved", label: "Approved",  count: counts.approved },
    { key: "rejected", label: "Rejected",  count: counts.rejected },
    { key: "resubmit", label: "Resubmit",  count: counts.resubmit },
  ];

  return (
    <ErrorBoundary fallback={<div className="p-8 text-center text-sm text-red-500">KYC page crashed. Please reload.</div>}>
    <div className="p-6 space-y-6">
      {selected && (
        <KycDetailPanel
          record={selected}
          onClose={() => setSelected(null)}
          onApprove={() => { qc.invalidateQueries({ queryKey: ["admin-kyc"] }); }}
          onReject={() => { qc.invalidateQueries({ queryKey: ["admin-kyc"] }); }}
        />
      )}

      <PageHeader
        icon={BadgeCheck}
        title="KYC Verification"
        subtitle="Review and manage user identity verification requests"
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
        actions={
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search name, phone or CNIC…"
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
              />
              {searchInput && (
                <button onClick={() => setSearchInput("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>
            <button onClick={() => exportKycCSV(records)} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition">
              <Download size={14} /> CSV
            </button>
            <button onClick={() => refetch()} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 px-3 py-2 rounded-xl hover:bg-gray-50 transition">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        }
      />
      <LastUpdated dataUpdatedAt={lastRefreshed?.getTime() ?? 0} className="text-xs text-gray-400 -mt-3 mb-1" />

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? [1,2,3,4].map(i => <StatCardSkeleton key={i} />)
          : <>
              <StatCard icon={Filter} label="Total" value={records.length} iconBgClass="bg-gray-100" iconColorClass="text-gray-700" />
              <StatCard icon={Clock} label="Pending" value={counts.pending} iconBgClass="bg-amber-50" iconColorClass="text-amber-700" onClick={() => setStatusFilter("pending")} />
              <StatCard icon={BadgeCheck} label="Approved" value={counts.approved} iconBgClass="bg-green-50" iconColorClass="text-green-700" onClick={() => setStatusFilter("approved")} />
              <StatCard icon={XCircle} label="Rejected" value={counts.rejected} iconBgClass="bg-red-50" iconColorClass="text-red-700" onClick={() => setStatusFilter("rejected")} />
            </>
        }
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setStatusFilter(f.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold border transition ${statusFilter === f.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
            {f.label}
            {f.count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-xs ${statusFilter === f.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>{f.count}</span>}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Loading KYC submissions…</p>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <BadgeCheck size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="font-semibold text-gray-500">No submissions found</p>
            <p className="text-gray-400 text-sm mt-1">{statusFilter !== "all" ? "Try a different filter" : "No KYC requests yet"}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {/* Header */}
            <div className="grid grid-cols-12 gap-4 px-5 py-3 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              <button onClick={() => handleKycSort("userName")} className="col-span-3 flex items-center gap-0.5 hover:text-blue-600 transition-colors text-left">
                User<KycSortIcon col="userName" />
              </button>
              <div className="col-span-3">CNIC / Name</div>
              <button onClick={() => handleKycSort("city")} className="col-span-2 flex items-center gap-0.5 hover:text-blue-600 transition-colors text-left">
                City<KycSortIcon col="city" />
              </button>
              <button onClick={() => handleKycSort("status")} className="col-span-2 flex items-center gap-0.5 hover:text-blue-600 transition-colors text-left">
                Status<KycSortIcon col="status" />
              </button>
              <button onClick={() => handleKycSort("submittedAt")} className="col-span-2 flex items-center gap-0.5 hover:text-blue-600 transition-colors text-left">
                Submitted<KycSortIcon col="submittedAt" />
              </button>
            </div>
            {sortedRecords.map(rec => {
              const stConf = STATUS_CONFIG[rec.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
              const StIcon = stConf.Icon;
              return (
                <div key={rec.id} onClick={() => setSelected(rec)} className="grid grid-cols-12 gap-4 px-5 py-3.5 hover:bg-gray-50 cursor-pointer transition items-center">
                  <div className="col-span-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                        {(rec.userName ?? rec.userPhone ?? "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{rec.userName ?? "—"}</p>
                        <p className="text-xs text-gray-400 flex items-center gap-1 truncate"><Phone size={10} /> {rec.userPhone}</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-3">
                    <p className="text-sm font-medium text-gray-700 truncate">{rec.fullName ?? "—"}</p>
                    <p className="text-xs text-gray-400 font-mono">{rec.cnic ?? "—"}</p>
                  </div>
                  <div className="col-span-2 text-sm text-gray-600">{rec.city ?? "—"}</div>
                  <div className="col-span-2">
                    <StatusBadge status={rec.status} label={stConf.label} size="sm" />
                  </div>
                  <div className="col-span-2 text-xs text-gray-400">
                    {new Date(rec.submittedAt).toLocaleDateString("en-PK", { day: "2-digit", month: "short" })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </ErrorBoundary>
  );
}
