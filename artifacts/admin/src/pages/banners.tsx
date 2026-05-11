import { useState, useRef } from "react";
import { adminFetch, fetchAdminAbsoluteResponse } from "@/lib/adminFetcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Image, Plus, Pencil, Trash2, Save, GripVertical,
  Calendar, Link as LinkIcon, ToggleLeft, ToggleRight,
  Eye, Layers, Upload, Loader2,
} from "lucide-react";
import { PageHeader } from "@/components/shared";
import { DragDropContext, Droppable, Draggable, type DropResult } from "@hello-pangea/dnd";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { StatusBadge } from "@/components/AdminShared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SafeImage } from "@/components/ui/SafeImage";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  linkType: string;
  linkValue: string | null;
  targetService: string | null;
  placement: string;
  colorFrom: string;
  colorTo: string;
  icon: string | null;
  sortOrder: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "scheduled" | "expired" | "inactive";
}

const EMPTY_BANNER = {
  title: "",
  subtitle: "",
  imageUrl: "",
  linkType: "none",
  linkValue: "",
  targetService: "all",
  placement: "home",
  colorFrom: "#7C3AED",
  colorTo: "#4F46E5",
  icon: "",
  sortOrder: 0,
  isActive: true,
  startDate: "",
  endDate: "",
};

const LINK_TYPES = [
  { value: "none", label: "No Link" },
  { value: "service", label: "Service (Mart/Food/Ride…)" },
  { value: "route", label: "In-App Route" },
  { value: "category", label: "Category" },
  { value: "product", label: "Product" },
  { value: "url", label: "External URL" },
];

const TARGET_SERVICES = [
  { value: "all", label: "All Services" },
  { value: "mart", label: "Mart" },
  { value: "food", label: "Food" },
  { value: "pharmacy", label: "Pharmacy" },
  { value: "rides", label: "Rides" },
  { value: "parcel", label: "Parcel" },
];

const PLACEMENTS = [
  { value: "home", label: "Home Screen" },
  { value: "mart", label: "Mart Page" },
  { value: "food", label: "Food Page" },
  { value: "pharmacy", label: "Pharmacy Page" },
];

export default function BannersPage() {
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const { toast } = useToast();
  const qc = useQueryClient();

  const [form, setForm] = useState({ ...EMPTY_BANNER });
  const [editing, setEditing] = useState<Banner | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewBanner, setPreviewBanner] = useState<Banner | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleteBannerId, setDeleteBannerId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Only JPEG, PNG, and WebP images are allowed", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large. Maximum 5MB", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const uploadRes = await fetchAdminAbsoluteResponse("/api/uploads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: base64, filename: file.name, mimeType: file.type }),
      });
      const uj = await uploadRes.json();
      const res = uj?.success === true && "data" in uj ? uj.data : uj;
      if (!uploadRes.ok) throw new Error(res.error || uj.error || "Upload failed");
      if (res?.url) {
        setForm(f => ({ ...f, imageUrl: res.url }));
        toast({ title: "Image uploaded successfully" });
      }
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-banners"],
    queryFn: () => adminFetch("/banners"),
    refetchInterval: 30000,
  });

  const banners: Banner[] = data?.banners || [];

  const saveBanner = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (editing) return adminFetch(`/banners/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      return adminFetch("/banners", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      setDialogOpen(false);
      setEditing(null);
      setForm({ ...EMPTY_BANNER });
      toast({ title: editing ? "Banner updated" : "Banner created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteBanner = useMutation({
    mutationFn: (id: string) => adminFetch(`/banners/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-banners"] });
      toast({ title: "Banner deleted" });
    },
  });

  const toggleBanner = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      adminFetch(`/banners/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  const reorderBanners = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      adminFetch("/banners/reorder", { method: "PATCH", body: JSON.stringify({ items }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-banners"] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY_BANNER, sortOrder: banners.length });
    setDialogOpen(true);
  };

  const openEdit = (b: Banner) => {
    setEditing(b);
    setForm({
      title: b.title,
      subtitle: b.subtitle || "",
      imageUrl: b.imageUrl || "",
      linkType: b.linkType,
      linkValue: b.linkValue || "",
      targetService: b.targetService || "all",
      placement: b.placement,
      colorFrom: b.colorFrom,
      colorTo: b.colorTo,
      icon: b.icon || "",
      sortOrder: b.sortOrder,
      isActive: b.isActive,
      startDate: b.startDate ? b.startDate.slice(0, 16) : "",
      endDate: b.endDate ? b.endDate.slice(0, 16) : "",
    });
    setDialogOpen(true);
  };

  const submitBanner = () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    saveBanner.mutate({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      linkType: form.linkType,
      linkValue: form.linkValue.trim() || null,
      targetService: form.targetService || null,
      placement: form.placement,
      colorFrom: form.colorFrom,
      colorTo: form.colorTo,
      icon: form.icon.trim() || null,
      sortOrder: form.sortOrder,
      isActive: form.isActive,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
    });
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = Array.from(banners);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved!);
    reorderBanners.mutate(reordered.map((b, i) => ({ id: b.id, sortOrder: i })));
  };

  const activeBanners = banners.filter(b => b.status === "active").length;
  const scheduledBanners = banners.filter(b => b.status === "scheduled").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title={T("navBanners")}
        subtitle={`${activeBanners} active${scheduledBanners > 0 ? ` · ${scheduledBanners} scheduled` : ""} · ${banners.length} total`}
        iconBgClass="bg-purple-100"
        iconColorClass="text-purple-600"
        actions={
          <Button onClick={openNew} className="h-10 rounded-xl gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            New Banner
          </Button>
        }
      />

      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : banners.length === 0 ? (
          <Card className="rounded-2xl border-border/50">
            <CardContent className="p-16 text-center">
              <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">No banners yet</p>
              <p className="text-sm text-muted-foreground/60 mt-1">Create your first promotional banner</p>
              <Button onClick={openNew} className="mt-4 rounded-xl gap-2">
                <Plus className="w-4 h-4" />
                Create Banner
              </Button>
            </CardContent>
          </Card>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="banners-list">
              {(provided) => (
                <div className="grid gap-3" ref={provided.innerRef} {...provided.droppableProps}>
                  {banners.length > 100 && (
                    <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-center">
                      Showing first 100 of {banners.length} banners. Delete old banners to manage more.
                    </p>
                  )}
                  {banners.slice(0, 100).map((banner, idx) => (
                    <Draggable key={banner.id} draggableId={banner.id} index={idx}>
                      {(dragProvided, snapshot) => (
                        <Card
                          ref={dragProvided.innerRef}
                          {...dragProvided.draggableProps}
                          className={`rounded-2xl border-border/50 shadow-sm transition-shadow ${snapshot.isDragging ? "shadow-lg ring-2 ring-purple-300" : "hover:shadow-md"}`}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start gap-4">
                              <div
                                {...dragProvided.dragHandleProps}
                                className="flex flex-col items-center gap-0.5 flex-shrink-0 cursor-grab active:cursor-grabbing pt-1"
                                title="Drag to reorder"
                              >
                                <GripVertical className="w-5 h-5 text-muted-foreground/50" />
                                <span className="text-[10px] font-bold text-muted-foreground">#{idx + 1}</span>
                              </div>

                              <div
                                className="w-20 h-14 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden"
                                style={{
                                  background: banner.imageUrl
                                    ? `url(${banner.imageUrl}) center/cover`
                                    : `linear-gradient(135deg, ${banner.colorFrom}, ${banner.colorTo})`,
                                }}
                              >
                                {!banner.imageUrl && (
                                  <Image className="w-5 h-5 text-white/60" />
                                )}
                              </div>

                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-foreground truncate">{banner.title}</p>
                                  <StatusBadge status={banner.status} />
                                </div>
                                {banner.subtitle && (
                                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{banner.subtitle}</p>
                                )}
                                <div className="flex items-center gap-3 mt-2 flex-wrap text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1">
                                    <Layers className="w-3 h-3" />
                                    {banner.placement}
                                  </span>
                                  {banner.linkType !== "none" && (
                                    <span className="flex items-center gap-1">
                                      <LinkIcon className="w-3 h-3" />
                                      {banner.linkType}: {banner.linkValue}
                                    </span>
                                  )}
                                  {banner.startDate && (
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" />
                                      {new Date(banner.startDate).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}
                                      {banner.endDate && ` → ${new Date(banner.endDate).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}`}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => setPreviewBanner(previewBanner?.id === banner.id ? null : banner)}
                                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                                  title="Preview"
                                >
                                  <Eye className="w-4 h-4 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => toggleBanner.mutate({ id: banner.id, isActive: !banner.isActive })}
                                  disabled={toggleBanner.isPending}
                                  className="p-2 hover:bg-muted rounded-lg transition-colors disabled:opacity-60"
                                  title={banner.isActive ? "Deactivate" : "Activate"}
                                >
                                  {banner.isActive
                                    ? <ToggleRight className="w-5 h-5 text-green-600" />
                                    : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                                </button>
                                <button
                                  onClick={() => openEdit(banner)}
                                  className="p-2 hover:bg-muted rounded-lg transition-colors"
                                >
                                  <Pencil className="w-4 h-4 text-blue-600" />
                                </button>
                                <button
                                  onClick={() => setDeleteBannerId(banner.id)}
                                  disabled={deleteBanner.isPending}
                                  className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-60"
                                >
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </button>
                              </div>
                            </div>

                            {previewBanner?.id === banner.id && (
                              <div className="mt-4 pt-4 border-t border-border/50">
                                <p className="text-xs font-semibold text-muted-foreground mb-2">Preview</p>
                                <div
                                  className="rounded-xl p-5 min-h-[100px] flex items-center gap-4 overflow-hidden relative"
                                  style={{
                                    background: banner.imageUrl
                                      ? `linear-gradient(135deg, ${banner.colorFrom}cc, ${banner.colorTo}cc), url(${banner.imageUrl}) center/cover`
                                      : `linear-gradient(135deg, ${banner.colorFrom}, ${banner.colorTo})`,
                                  }}
                                >
                                  <div className="flex-1 z-10">
                                    <p className="text-white font-bold text-lg">{banner.title}</p>
                                    {banner.subtitle && <p className="text-white/85 text-sm mt-1">{banner.subtitle}</p>}
                                    <div className="mt-3 inline-flex items-center gap-1.5 bg-white/20 px-3 py-1.5 rounded-full">
                                      <span className="text-white text-xs font-semibold">Shop Now</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) { setEditing(null); setForm({ ...EMPTY_BANNER }); } }}>
        <DialogContent className="w-[95vw] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-500" />
              {editing ? "Edit Banner" : "Create Banner"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Title <span className="text-red-500">*</span></label>
              <Input
                placeholder="e.g. Summer Sale - Up to 50% OFF"
                value={form.title}
                /* Title is shown in the customer banner carousel; cap at
                   120 chars to keep it on one line on small screens. */
                maxLength={120}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Subtitle <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g. Shop groceries at unbeatable prices"
                value={form.subtitle}
                maxLength={200}
                onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Banner Image <span className="text-muted-foreground font-normal">(optional)</span></label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://example.com/banner.jpg"
                  value={form.imageUrl}
                  /* URLs hold object-storage paths; 2000 is the SQL Server
                     URL limit and a safe ceiling for browsers too. */
                  maxLength={2000}
                  onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                  className="h-11 rounded-xl flex-1"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleImageUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 px-3 rounded-xl"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                </Button>
              </div>
              {form.imageUrl && (
                <div className="mt-2 rounded-lg overflow-hidden border border-border h-24">
                  <SafeImage src={form.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Link Type</label>
                <select
                  value={form.linkType}
                  onChange={e => setForm(f => ({ ...f, linkType: e.target.value }))}
                  className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {LINK_TYPES.map(lt => (
                    <option key={lt.value} value={lt.value}>{lt.label}</option>
                  ))}
                </select>
              </div>
              {form.linkType !== "none" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Link Value</label>
                  <Input
                    placeholder={
                      form.linkType === "url" ? "https://..." :
                      form.linkType === "category" ? "e.g. fruits" :
                      form.linkType === "service" ? "mart | food | rides | pharmacy | parcel" :
                      form.linkType === "route" ? "/mart  or  /food  or  /ride" :
                      "Product ID"
                    }
                    value={form.linkValue}
                    onChange={e => setForm(f => ({ ...f, linkValue: e.target.value }))}
                    className="h-11 rounded-xl"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Placement</label>
                <select
                  value={form.placement}
                  onChange={e => setForm(f => ({ ...f, placement: e.target.value }))}
                  className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {PLACEMENTS.map(p => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Target Service</label>
                <select
                  value={form.targetService}
                  onChange={e => setForm(f => ({ ...f, targetService: e.target.value }))}
                  className="w-full h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  {TARGET_SERVICES.map(ts => (
                    <option key={ts.value} value={ts.value}>{ts.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Gradient Colors</label>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="color"
                    value={form.colorFrom}
                    onChange={e => setForm(f => ({ ...f, colorFrom: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-input cursor-pointer"
                  />
                  <Input
                    value={form.colorFrom}
                    onChange={e => setForm(f => ({ ...f, colorFrom: e.target.value }))}
                    className="h-10 rounded-xl font-mono text-xs"
                    placeholder="#7C3AED"
                  />
                </div>
                <span className="text-muted-foreground text-sm">→</span>
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="color"
                    value={form.colorTo}
                    onChange={e => setForm(f => ({ ...f, colorTo: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-input cursor-pointer"
                  />
                  <Input
                    value={form.colorTo}
                    onChange={e => setForm(f => ({ ...f, colorTo: e.target.value }))}
                    className="h-10 rounded-xl font-mono text-xs"
                    placeholder="#4F46E5"
                  />
                </div>
              </div>
              <div
                className="h-6 rounded-lg mt-1"
                style={{ background: `linear-gradient(to right, ${form.colorFrom}, ${form.colorTo})` }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Icon <span className="text-muted-foreground font-normal">(Ionicons name, optional)</span></label>
              <Input
                placeholder="e.g. pricetag, cart, gift"
                value={form.icon}
                /* Ionicons names are kebab-case identifiers — restrict to
                   the printable subset to avoid round-tripping unicode
                   that the mobile app cannot render. */
                maxLength={64}
                onChange={e => setForm(f => ({ ...f, icon: e.target.value.replace(/[^a-zA-Z0-9-]/g, "") }))}
                className="h-11 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Start Date <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">End Date <span className="text-muted-foreground font-normal">(optional)</span></label>
                <Input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Sort Order</label>
              <Input
                type="number"
                min={0}
                max={9999}
                value={form.sortOrder}
                onChange={e => {
                  const v = parseInt(e.target.value);
                  const clamped = Number.isFinite(v) ? Math.max(0, Math.min(9999, v)) : 0;
                  setForm(f => ({ ...f, sortOrder: clamped }));
                }}
                className="h-11 rounded-xl"
              />
            </div>

            <div
              onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all ${form.isActive ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}
            >
              <span className="text-sm font-semibold">Active (visible to users)</span>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${form.isActive ? "bg-green-500" : "bg-gray-300"}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 shadow transition-transform ${form.isActive ? "translate-x-5" : "translate-x-0.5"}`} />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={submitBanner} disabled={saveBanner.isPending} className="flex-1 rounded-xl gap-2">
                <Save className="w-4 h-4" />
                {saveBanner.isPending ? "Saving..." : (editing ? "Update Banner" : "Create Banner")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteBannerId}
        onClose={() => setDeleteBannerId(null)}
        onConfirm={() => {
          if (!deleteBannerId) return;
          deleteBanner.mutate(deleteBannerId, { onSettled: () => setDeleteBannerId(null) });
        }}
        title={tDual("deleteBannerTitle", language)}
        description={tDual("actionCannotBeUndone", language)}
        confirmLabel="Delete"
        variant="destructive"
        busy={deleteBanner.isPending}
      />
    </div>
  );
}
