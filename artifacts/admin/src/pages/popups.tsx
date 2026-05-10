import { useState } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { PageHeader } from "@/components/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Plus, Pencil, Trash2, Eye, Copy, Pause, Play,
  Sparkles, BarChart3, LayoutTemplate, ChevronRight, X,
  ToggleLeft, ToggleRight, Calendar, Target, Zap, Bell,
  Loader2, Check, ArrowLeft, ArrowRight, Monitor,
} from "lucide-react";
import { useAdminAuth } from "@/lib/adminAuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/AdminShared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useLanguage } from "@/lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";

type PopupType = "modal" | "bottom_sheet" | "top_banner" | "floating_card";
type DisplayFrequency = "once" | "daily" | "every_session";
type CampaignStatus = "draft" | "scheduled" | "live" | "paused" | "expired";

interface Campaign {
  id: string;
  title: string;
  body: string | null;
  mediaUrl: string | null;
  ctaText: string | null;
  ctaLink: string | null;
  popupType: PopupType;
  displayFrequency: DisplayFrequency;
  maxImpressionsPerUser: number;
  maxTotalImpressions: number | null;
  priority: number;
  startDate: string | null;
  endDate: string | null;
  targeting: Record<string, unknown>;
  status: CampaignStatus;
  computedStatus: string;
  stylePreset: string | null;
  colorFrom: string;
  colorTo: string;
  textColor: string;
  animation: string | null;
  templateId: string | null;
  createdAt: string;
  analytics?: { views: number; clicks: number; ctr: number };
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  popupType: PopupType;
  defaultTitle: string | null;
  defaultBody: string | null;
  defaultCtaText: string | null;
  colorFrom: string;
  colorTo: string;
  textColor: string;
  animation: string | null;
  stylePreset: string | null;
  isBuiltIn: boolean;
}

const POPUP_TYPES: { value: PopupType; label: string; desc: string }[] = [
  { value: "modal", label: "Fullscreen Modal", desc: "Covers entire screen with image/gradient" },
  { value: "bottom_sheet", label: "Bottom Sheet", desc: "Slides up from bottom" },
  { value: "top_banner", label: "Top Banner", desc: "Slim notification bar at top" },
  { value: "floating_card", label: "Floating Card", desc: "Centered card with shadow backdrop" },
];

const FREQUENCY_OPTIONS: { value: DisplayFrequency; label: string }[] = [
  { value: "once", label: "Once (per user, ever)" },
  { value: "daily", label: "Once per day" },
  { value: "every_session", label: "Every session (app open)" },
];

const STATUS_COLORS: Record<string, string> = {
  live: "bg-green-100 text-green-700",
  draft: "bg-gray-100 text-gray-600",
  scheduled: "bg-blue-100 text-blue-700",
  paused: "bg-yellow-100 text-yellow-700",
  expired: "bg-red-100 text-red-600",
};

const ANIMATION_OPTIONS = ["fade", "scale", "slide_up", "slide_down", "bounce"];

const EMPTY_FORM = {
  title: "",
  body: "",
  mediaUrl: "",
  ctaText: "",
  ctaLink: "",
  popupType: "modal" as PopupType,
  displayFrequency: "once" as DisplayFrequency,
  maxImpressionsPerUser: 1,
  maxTotalImpressions: "",
  priority: 0,
  startDate: "",
  endDate: "",
  status: "draft",
  colorFrom: "#7C3AED",
  colorTo: "#4F46E5",
  textColor: "#FFFFFF",
  animation: "fade",
  stylePreset: "default",
  templateId: "",
  targeting: {
    roles: [] as string[],
    cities: [] as string[],
    newUsers: false,
    minOrderCount: "",
    maxOrderCount: "",
    minOrderValue: "",
    maxOrderValue: "",
  },
};

type Tab = "campaigns" | "templates" | "analytics";

function PopupPreview({ campaign }: { campaign: Partial<typeof EMPTY_FORM & { title: string }> }) {
  const gradient = `linear-gradient(135deg, ${campaign.colorFrom || "#7C3AED"}, ${campaign.colorTo || "#4F46E5"})`;
  const textColor = campaign.textColor || "#FFFFFF";

  if (campaign.popupType === "top_banner") {
    return (
      <div className="rounded-xl p-3 flex items-center gap-3" style={{ background: gradient }}>
        <Bell className="w-4 h-4 flex-shrink-0" style={{ color: textColor }} />
        <p className="text-sm font-semibold flex-1" style={{ color: textColor }}>{campaign.title || "Banner Title"}</p>
        <X className="w-4 h-4 flex-shrink-0" style={{ color: textColor }} />
      </div>
    );
  }

  if (campaign.popupType === "bottom_sheet") {
    return (
      <div className="rounded-xl overflow-hidden border border-border/30">
        <div className="h-1 w-10 bg-gray-300 rounded-full mx-auto mt-2 mb-1" />
        <div className="p-4" style={{ background: gradient }}>
          <p className="text-lg font-bold" style={{ color: textColor }}>{campaign.title || "Announcement Title"}</p>
          {campaign.body && <p className="text-sm mt-1 opacity-85" style={{ color: textColor }}>{campaign.body}</p>}
          {campaign.ctaText && (
            <div className="mt-3 bg-white/20 rounded-xl px-4 py-2 inline-block">
              <span className="text-sm font-semibold" style={{ color: textColor }}>{campaign.ctaText}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (campaign.popupType === "floating_card") {
    return (
      <div className="rounded-2xl overflow-hidden shadow-xl border border-white/10">
        <div className="p-5" style={{ background: gradient }}>
          <p className="text-lg font-bold" style={{ color: textColor }}>{campaign.title || "Flash Alert"}</p>
          {campaign.body && <p className="text-sm mt-1 opacity-85" style={{ color: textColor }}>{campaign.body}</p>}
          <div className="flex gap-2 mt-3">
            {campaign.ctaText && (
              <div className="bg-white/20 rounded-xl px-4 py-2">
                <span className="text-sm font-semibold" style={{ color: textColor }}>{campaign.ctaText}</span>
              </div>
            )}
            <div className="bg-white/10 rounded-xl px-3 py-2">
              <X className="w-4 h-4" style={{ color: textColor }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: gradient }}>
      <div className="p-6">
        <div className="flex justify-end mb-2">
          <X className="w-5 h-5" style={{ color: textColor }} />
        </div>
        <p className="text-xl font-bold" style={{ color: textColor }}>{campaign.title || "Popup Title"}</p>
        {campaign.body && <p className="text-sm mt-2 opacity-85" style={{ color: textColor }}>{campaign.body}</p>}
        {campaign.ctaText && (
          <div className="mt-4 bg-white/20 rounded-xl px-5 py-3 inline-block">
            <span className="font-semibold" style={{ color: textColor }}>{campaign.ctaText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PopupsPage() {
  const { language } = useLanguage();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { state: authState } = useAdminAuth();
  const adminRole = authState.user?.role || "support";
  const canWrite = adminRole === "super" || adminRole === "manager";
  const [activeTab, setActiveTab] = useState<Tab>("campaigns");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderStep, setBuilderStep] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [analyticsId, setAnalyticsId] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiGoal, setAiGoal] = useState("");
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const [editingTplId, setEditingTplId] = useState<string | null>(null);
  const [deletePopupId, setDeletePopupId] = useState<string | null>(null);
  const [tplForm, setTplForm] = useState({
    name: "",
    description: "",
    category: "",
    popupType: "modal" as PopupType,
    defaultTitle: "",
    defaultBody: "",
    defaultCtaText: "",
    colorFrom: "#6366f1",
    colorTo: "#a855f7",
    textColor: "#FFFFFF",
    animation: "",
    stylePreset: "default",
  });

  const { data: campaignsData, isLoading } = useQuery({
    queryKey: ["admin-popups"],
    queryFn: () => adminFetch("/popups"),
    refetchInterval: 30000,
  });
  const campaigns: Campaign[] = campaignsData?.campaigns || [];

  const { data: templatesData } = useQuery({
    queryKey: ["admin-popup-templates"],
    queryFn: () => adminFetch("/popups/templates"),
  });
  const templates: Template[] = templatesData?.templates || [];

  const { data: analyticsData } = useQuery({
    queryKey: ["admin-popup-analytics", analyticsId],
    queryFn: () => adminFetch(`/popups/${analyticsId}/analytics`),
    enabled: !!analyticsId,
  });

  const f = (k: string, v: string | number | boolean | null) => setForm(p => ({ ...p, [k]: v }));
  const ft = (k: string, v: string | number | boolean | string[] | null) => setForm(p => ({ ...p, targeting: { ...p.targeting, [k]: v } }));

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (editingId) return adminFetch(`/popups/${editingId}`, { method: "PATCH", body: JSON.stringify(body) });
      return adminFetch("/popups", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-popups"] });
      setBuilderOpen(false);
      resetForm();
      toast({ title: editingId ? "Campaign updated" : "Campaign created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/popups/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-popups"] }); toast({ title: "Campaign deleted" }); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/popups/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-popups"] }),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/popups/clone/${id}`, { method: "POST", body: "{}" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-popups"] }); toast({ title: "Campaign cloned" }); },
  });

  const saveTplMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (editingTplId) return adminFetch(`/popups/templates/${editingTplId}`, { method: "PATCH", body: JSON.stringify(body) });
      return adminFetch("/popups/templates", { method: "POST", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-popup-templates"] });
      setTplEditorOpen(false);
      setEditingTplId(null);
      toast({ title: editingTplId ? "Template updated" : "Template created" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteTplMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/popups/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-popup-templates"] }); toast({ title: "Template deleted" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openNewTemplate = () => {
    setEditingTplId(null);
    setTplForm({ name: "", description: "", category: "", popupType: "modal", defaultTitle: "", defaultBody: "", defaultCtaText: "", colorFrom: "#6366f1", colorTo: "#a855f7", textColor: "#FFFFFF", animation: "", stylePreset: "default" });
    setTplEditorOpen(true);
  };

  const openEditTemplate = (tpl: Template) => {
    setEditingTplId(tpl.id);
    setTplForm({
      name: tpl.name,
      description: tpl.description || "",
      category: tpl.category || "",
      popupType: tpl.popupType,
      defaultTitle: tpl.defaultTitle || "",
      defaultBody: tpl.defaultBody || "",
      defaultCtaText: tpl.defaultCtaText || "",
      colorFrom: tpl.colorFrom || "#6366f1",
      colorTo: tpl.colorTo || "#a855f7",
      textColor: tpl.textColor || "#FFFFFF",
      animation: tpl.animation || "",
      stylePreset: tpl.stylePreset || "default",
    });
    setTplEditorOpen(true);
  };

  const handleSaveTemplate = () => {
    if (!tplForm.name.trim()) { toast({ title: "Template name is required", variant: "destructive" }); return; }
    const payload: Record<string, unknown> = {
      name: tplForm.name.trim(),
      description: tplForm.description.trim() || null,
      category: tplForm.category.trim() || null,
      popupType: tplForm.popupType,
      defaultTitle: tplForm.defaultTitle.trim() || null,
      defaultBody: tplForm.defaultBody.trim() || null,
      defaultCtaText: tplForm.defaultCtaText.trim() || null,
      colorFrom: tplForm.colorFrom,
      colorTo: tplForm.colorTo,
      textColor: tplForm.textColor,
      animation: tplForm.animation || null,
      stylePreset: tplForm.stylePreset || "default",
    };
    saveTplMutation.mutate(payload);
  };

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setEditingId(null);
    setBuilderStep(0);
  };

  const openNew = () => {
    resetForm();
    setBuilderOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      title: c.title,
      body: c.body || "",
      mediaUrl: c.mediaUrl || "",
      ctaText: c.ctaText || "",
      ctaLink: c.ctaLink || "",
      popupType: c.popupType,
      displayFrequency: c.displayFrequency,
      maxImpressionsPerUser: c.maxImpressionsPerUser,
      maxTotalImpressions: c.maxTotalImpressions ? String(c.maxTotalImpressions) : "",
      priority: c.priority,
      startDate: c.startDate ? c.startDate.slice(0, 16) : "",
      endDate: c.endDate ? c.endDate.slice(0, 16) : "",
      status: c.status,
      colorFrom: c.colorFrom,
      colorTo: c.colorTo,
      textColor: c.textColor,
      animation: c.animation || "fade",
      stylePreset: c.stylePreset || "default",
      templateId: c.templateId || "",
      targeting: {
        roles: (c.targeting?.roles as string[]) || [],
        cities: (c.targeting?.cities as string[]) || [],
        newUsers: Boolean(c.targeting?.newUsers),
        minOrderCount: c.targeting?.minOrderCount ? String(c.targeting.minOrderCount) : "",
        maxOrderCount: c.targeting?.maxOrderCount ? String(c.targeting.maxOrderCount) : "",
        minOrderValue: c.targeting?.minOrderValue ? String(c.targeting.minOrderValue) : "",
        maxOrderValue: c.targeting?.maxOrderValue ? String(c.targeting.maxOrderValue) : "",
      },
    });
    setBuilderOpen(true);
    setBuilderStep(1);
  };

  const applyTemplate = (tpl: Template) => {
    setForm(p => ({
      ...p,
      popupType: tpl.popupType,
      title: tpl.defaultTitle || p.title,
      body: tpl.defaultBody || p.body,
      ctaText: tpl.defaultCtaText || p.ctaText,
      colorFrom: tpl.colorFrom,
      colorTo: tpl.colorTo,
      textColor: tpl.textColor,
      animation: tpl.animation || "fade",
      stylePreset: tpl.stylePreset || "default",
      templateId: tpl.id,
    }));
    setBuilderStep(1);
  };

  const handleAiGenerate = async () => {
    if (!aiGoal.trim()) return;
    setAiLoading(true);
    try {
      const result = await adminFetch("/popups/ai-generate", { method: "POST", body: JSON.stringify({ goal: aiGoal }) });
      setForm(p => ({
        ...p,
        title: result.title || p.title,
        body: result.body || p.body,
        ctaText: result.ctaText || p.ctaText,
        popupType: result.suggestedType || p.popupType,
        colorFrom: result.suggestedColors?.colorFrom || p.colorFrom,
        colorTo: result.suggestedColors?.colorTo || p.colorTo,
        animation: result.animation || p.animation,
      }));
      setAiModalOpen(false);
      toast({ title: "AI content generated!" });
    } catch {
      toast({ title: "AI generation failed", variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const buildPayload = () => {
    const targeting: Record<string, unknown> = {};
    if (form.targeting.roles.length > 0) targeting.roles = form.targeting.roles;
    if (form.targeting.cities.length > 0) targeting.cities = form.targeting.cities;
    if (form.targeting.newUsers) targeting.newUsers = true;
    if (form.targeting.minOrderCount) targeting.minOrderCount = Number(form.targeting.minOrderCount);
    if (form.targeting.maxOrderCount) targeting.maxOrderCount = Number(form.targeting.maxOrderCount);
    if (form.targeting.minOrderValue) targeting.minOrderValue = Number(form.targeting.minOrderValue);
    if (form.targeting.maxOrderValue) targeting.maxOrderValue = Number(form.targeting.maxOrderValue);

    return {
      title: form.title.trim(),
      body: form.body.trim() || null,
      mediaUrl: form.mediaUrl.trim() || null,
      ctaText: form.ctaText.trim() || null,
      ctaLink: form.ctaLink.trim() || null,
      popupType: form.popupType,
      displayFrequency: form.displayFrequency,
      maxImpressionsPerUser: Number(form.maxImpressionsPerUser) || 1,
      maxTotalImpressions: form.maxTotalImpressions ? Number(form.maxTotalImpressions) : null,
      priority: Number(form.priority) || 0,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      status: form.status,
      colorFrom: form.colorFrom,
      colorTo: form.colorTo,
      textColor: form.textColor,
      animation: form.animation,
      stylePreset: form.stylePreset,
      templateId: form.templateId || null,
      targeting,
    };
  };

  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    saveMutation.mutate(buildPayload());
  };

  const liveCampaigns = campaigns.filter(c => c.computedStatus === "live").length;
  const scheduledCampaigns = campaigns.filter(c => c.computedStatus === "scheduled").length;

  const STEPS = ["Template", "Content", "Style", "Targeting", "Schedule", "Preview"];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Megaphone}
        title="Popups & Announcements"
        subtitle={`${liveCampaigns} live${scheduledCampaigns > 0 ? ` · ${scheduledCampaigns} scheduled` : ""} · ${campaigns.length} total`}
        iconBgClass="bg-purple-100"
        iconColorClass="text-purple-600"
        actions={canWrite ? (
          <Button onClick={openNew} className="h-10 rounded-xl gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            New Campaign
          </Button>
        ) : undefined}
      />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border/50">
        {(["campaigns", "templates", "analytics"] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold capitalize transition-colors border-b-2 ${
              activeTab === tab
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "campaigns" && <BarChart3 className="w-4 h-4 inline mr-1.5" />}
            {tab === "templates" && <LayoutTemplate className="w-4 h-4 inline mr-1.5" />}
            {tab === "analytics" && <Target className="w-4 h-4 inline mr-1.5" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Campaigns Tab */}
      {activeTab === "campaigns" && (
        <div className="space-y-3">
          {isLoading ? (
            <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted rounded-2xl animate-pulse" />)}</div>
          ) : campaigns.length === 0 ? (
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-16 text-center">
                <Megaphone className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground font-medium">No campaigns yet</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Create your first popup campaign</p>
                <Button onClick={openNew} className="mt-4 rounded-xl gap-2">
                  <Plus className="w-4 h-4" />
                  Create Campaign
                </Button>
              </CardContent>
            </Card>
          ) : (
            campaigns.map(c => (
              <Card key={c.id} className="rounded-2xl border-border/50 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="w-16 h-14 rounded-xl flex-shrink-0 flex items-center justify-center"
                      style={{ background: `linear-gradient(135deg, ${c.colorFrom}, ${c.colorTo})` }}
                    >
                      <Megaphone className="w-6 h-6 text-white/80" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold text-foreground truncate">{c.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[c.computedStatus] || STATUS_COLORS.draft}`}>
                          {c.computedStatus}
                        </span>
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                          {POPUP_TYPES.find(t => t.value === c.popupType)?.label || c.popupType}
                        </span>
                      </div>
                      {c.body && <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.body}</p>}
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                        {c.analytics && (
                          <>
                            <span>{c.analytics.views} views</span>
                            <span>{c.analytics.ctr}% CTR</span>
                          </>
                        )}
                        <span>Priority: {c.priority}</span>
                        {c.startDate && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(c.startDate).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}
                            {c.endDate && ` → ${new Date(c.endDate).toLocaleDateString("en-PK", { month: "short", day: "numeric" })}`}
                          </span>
                        )}
                        {Object.keys(c.targeting || {}).length > 0 && (
                          <span className="flex items-center gap-1 text-purple-600">
                            <Target className="w-3 h-3" />
                            Targeted
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setPreviewId(previewId === c.id ? null : c.id)}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title="Preview"
                      >
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => { setAnalyticsId(c.id); setActiveTab("analytics"); }}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        title="Analytics"
                      >
                        <BarChart3 className="w-4 h-4 text-blue-500" />
                      </button>
                      {canWrite && (
                        <>
                          <button
                            onClick={() => {
                              const newStatus = c.status === "live" ? "paused" : "live";
                              toggleMutation.mutate({ id: c.id, status: newStatus });
                            }}
                            disabled={toggleMutation.isPending}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                            title={c.status === "live" ? "Pause" : "Activate"}
                          >
                            {c.status === "live"
                              ? <ToggleRight className="w-5 h-5 text-green-600" />
                              : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                          </button>
                          <button onClick={() => cloneMutation.mutate(c.id)} className="p-2 hover:bg-muted rounded-lg transition-colors" title="Clone">
                            <Copy className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <button onClick={() => openEdit(c)} className="p-2 hover:bg-muted rounded-lg transition-colors">
                            <Pencil className="w-4 h-4 text-blue-600" />
                          </button>
                          <button
                            onClick={() => setDeletePopupId(c.id)}
                            disabled={deleteMutation.isPending}
                            className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {previewId === c.id && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Preview</p>
                      <div className="max-w-xs">
                        <PopupPreview campaign={{
                          ...c,
                          body: c.body ?? undefined,
                          mediaUrl: c.mediaUrl ?? undefined,
                          ctaText: c.ctaText ?? undefined,
                          ctaLink: c.ctaLink ?? undefined,
                          stylePreset: c.stylePreset ?? undefined,
                          startDate: c.startDate ?? undefined,
                          endDate: c.endDate ?? undefined,
                          animation: c.animation ?? undefined,
                          templateId: c.templateId ?? undefined,
                          maxTotalImpressions: c.maxTotalImpressions != null ? String(c.maxTotalImpressions) : undefined,
                          targeting: {
                            roles: (c.targeting?.roles as string[]) || [],
                            cities: (c.targeting?.cities as string[]) || [],
                            newUsers: Boolean(c.targeting?.newUsers),
                            minOrderCount: c.targeting?.minOrderCount != null ? String(c.targeting.minOrderCount) : "",
                            maxOrderCount: c.targeting?.maxOrderCount != null ? String(c.targeting.maxOrderCount) : "",
                            minOrderValue: c.targeting?.minOrderValue != null ? String(c.targeting.minOrderValue) : "",
                            maxOrderValue: c.targeting?.maxOrderValue != null ? String(c.targeting.maxOrderValue) : "",
                          },
                        }} />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Templates Tab */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{templates.length} template{templates.length !== 1 ? "s" : ""}</p>
            {canWrite && (
              <Button onClick={openNewTemplate} className="rounded-xl gap-1.5">
                <Plus className="w-4 h-4" /> New Template
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(tpl => (
              <Card key={tpl.id} className="rounded-2xl border-border/50 hover:shadow-md transition-shadow group">
                <CardContent className="p-4">
                  <div
                    className="h-28 rounded-xl flex items-center justify-center mb-3 transition-opacity group-hover:opacity-90"
                    style={{ background: `linear-gradient(135deg, ${tpl.colorFrom}, ${tpl.colorTo})` }}
                  >
                    <div className="text-center px-3">
                      <p className="text-white font-bold text-sm">{tpl.defaultTitle?.slice(0, 40) || tpl.name}</p>
                      {tpl.defaultBody && <p className="text-white/75 text-xs mt-1 line-clamp-2">{tpl.defaultBody.slice(0, 60)}</p>}
                    </div>
                  </div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-sm text-foreground">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{tpl.category}</span>
                        <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">{POPUP_TYPES.find(t => t.value === tpl.popupType)?.label}</span>
                        {tpl.isBuiltIn && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Built-in</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => { applyTemplate(tpl); setBuilderOpen(true); }}
                    >
                      Use Template
                    </Button>
                    {canWrite && (
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openEditTemplate(tpl)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canWrite && !tpl.isBuiltIn && (
                      <Button size="sm" variant="outline" className="rounded-xl text-red-500 hover:text-red-600" onClick={() => deleteTplMutation.mutate(tpl.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={tplEditorOpen} onOpenChange={setTplEditorOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editingTplId ? "Edit Template" : "Create Template"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Name</label>
              <Input value={tplForm.name} onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Flash Sale" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Description</label>
              <Input value={tplForm.description} onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description" className="h-10 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Category</label>
                <Input value={tplForm.category} onChange={e => setTplForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. promo" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Popup Type</label>
                <select className="w-full h-10 rounded-xl border border-border px-3 text-sm" value={tplForm.popupType} onChange={e => setTplForm(p => ({ ...p, popupType: e.target.value as PopupType }))}>
                  {POPUP_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Default Title</label>
              <Input value={tplForm.defaultTitle} onChange={e => setTplForm(p => ({ ...p, defaultTitle: e.target.value }))} placeholder="Default popup title" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Default Body</label>
              <Input value={tplForm.defaultBody} onChange={e => setTplForm(p => ({ ...p, defaultBody: e.target.value }))} placeholder="Default body text" className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Default CTA Text</label>
              <Input value={tplForm.defaultCtaText} onChange={e => setTplForm(p => ({ ...p, defaultCtaText: e.target.value }))} placeholder="e.g. Shop Now" className="h-10 rounded-xl" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Color From</label>
                <input type="color" value={tplForm.colorFrom} onChange={e => setTplForm(p => ({ ...p, colorFrom: e.target.value }))} className="w-full h-10 rounded-xl border border-border cursor-pointer" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Color To</label>
                <input type="color" value={tplForm.colorTo} onChange={e => setTplForm(p => ({ ...p, colorTo: e.target.value }))} className="w-full h-10 rounded-xl border border-border cursor-pointer" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold">Text Color</label>
                <input type="color" value={tplForm.textColor} onChange={e => setTplForm(p => ({ ...p, textColor: e.target.value }))} className="w-full h-10 rounded-xl border border-border cursor-pointer" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Animation</label>
              <select className="w-full h-10 rounded-xl border border-border px-3 text-sm" value={tplForm.animation} onChange={e => setTplForm(p => ({ ...p, animation: e.target.value }))}>
                <option value="">None</option>
                {ANIMATION_OPTIONS.map(a => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="h-28 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${tplForm.colorFrom}, ${tplForm.colorTo})` }}>
              <div className="text-center px-3">
                <p className="font-bold text-sm" style={{ color: tplForm.textColor }}>{tplForm.defaultTitle || tplForm.name || "Preview"}</p>
                {tplForm.defaultBody && <p className="text-xs mt-1 opacity-85" style={{ color: tplForm.textColor }}>{tplForm.defaultBody}</p>}
              </div>
            </div>
            <Button className="w-full rounded-xl" onClick={handleSaveTemplate} disabled={saveTplMutation.isPending}>
              {saveTplMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingTplId ? "Update Template" : "Create Template"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Analytics Tab */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          {!analyticsId ? (
            <Card className="rounded-2xl border-border/50">
              <CardContent className="p-8 text-center">
                <BarChart3 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">Select a campaign to view analytics</p>
                <div className="mt-4 space-y-2">
                  {campaigns.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setAnalyticsId(c.id)}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-border/50 hover:bg-muted transition-colors text-left"
                    >
                      <div>
                        <p className="font-semibold text-sm">{c.title}</p>
                        <p className="text-xs text-muted-foreground capitalize">{c.computedStatus}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold">{c.analytics?.views ?? 0} views</p>
                        <p className="text-xs text-muted-foreground">{c.analytics?.ctr ?? 0}% CTR</p>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : analyticsData ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <button onClick={() => setAnalyticsId(null)} className="p-2 hover:bg-muted rounded-xl transition-colors">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <h2 className="font-bold text-lg">{analyticsData.title}</h2>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Views", value: analyticsData.views, color: "blue" },
                  { label: "Unique Viewers", value: analyticsData.uniqueViewers, color: "purple" },
                  { label: "Clicks (CTR)", value: `${analyticsData.clicks} (${analyticsData.ctr}%)`, color: "green" },
                  { label: "Dismiss Rate", value: `${analyticsData.dismissRate}%`, color: "orange" },
                ].map(stat => (
                  <Card key={stat.label} className="rounded-2xl border-border/50">
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                      <p className="text-2xl font-bold mt-1 text-foreground">{stat.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {analyticsData.recentActivity?.length > 0 && (
                <Card className="rounded-2xl border-border/50">
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-sm mb-3">Recent Activity</h3>
                    <div className="space-y-2">
                      {analyticsData.recentActivity.map((a: { id: string; action: string; userId: string; seenAt: string }) => (
                        <div key={a.id} className="flex justify-between items-center text-xs py-1.5 border-b border-border/30 last:border-0">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-semibold ${
                              a.action === "click" ? "bg-green-100 text-green-700"
                              : a.action === "dismiss" ? "bg-red-100 text-red-600"
                              : "bg-blue-100 text-blue-700"
                            }`}>{a.action}</span>
                            <span className="text-muted-foreground">{a.userId.slice(0, 8)}…</span>
                          </div>
                          <span className="text-muted-foreground">{new Date(a.seenAt).toLocaleString("en-PK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Campaign Builder Dialog */}
      <Dialog open={builderOpen} onOpenChange={v => { setBuilderOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90dvh] overflow-y-auto rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-5 h-5 text-purple-500" />
              {editingId ? "Edit Campaign" : "Campaign Builder"}
            </DialogTitle>
          </DialogHeader>

          {/* Step progress */}
          {!editingId && (
            <div className="flex items-center gap-1 mb-4">
              {STEPS.map((step, idx) => (
                <div key={step} className="flex items-center gap-1">
                  <button
                    onClick={() => setBuilderStep(idx)}
                    className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${
                      idx === builderStep ? "bg-purple-600 text-white" : idx < builderStep ? "bg-purple-100 text-purple-700" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {idx < builderStep ? <Check className="w-3.5 h-3.5 mx-auto" /> : idx + 1}
                  </button>
                  {idx < STEPS.length - 1 && (
                    <div className={`h-0.5 w-4 ${idx < builderStep ? "bg-purple-300" : "bg-muted"}`} />
                  )}
                </div>
              ))}
              <span className="ml-2 text-sm text-muted-foreground">{STEPS[builderStep]}</span>
            </div>
          )}

          <div className="space-y-4 mt-2">
            {/* Step 0: Template */}
            {(builderStep === 0 || editingId) && (!editingId) && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setBuilderStep(1)}
                    className="p-4 border-2 border-dashed border-border rounded-xl text-center hover:border-purple-400 hover:bg-purple-50/50 transition-all"
                  >
                    <Plus className="w-6 h-6 text-muted-foreground mx-auto mb-1" />
                    <p className="text-sm font-semibold">Start Blank</p>
                  </button>
                  <button
                    onClick={() => setAiModalOpen(true)}
                    className="p-4 border-2 border-dashed border-purple-300 rounded-xl text-center hover:border-purple-500 hover:bg-purple-50/70 transition-all bg-purple-50/30"
                  >
                    <Sparkles className="w-6 h-6 text-purple-600 mx-auto mb-1" />
                    <p className="text-sm font-semibold text-purple-700">AI Generate</p>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground font-semibold">Or choose a template:</p>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                  {templates.map(tpl => (
                    <button
                      key={tpl.id}
                      onClick={() => applyTemplate(tpl)}
                      className="p-3 rounded-xl border border-border/60 hover:border-purple-400 transition-all text-left group"
                    >
                      <div className="h-10 rounded-lg mb-2" style={{ background: `linear-gradient(135deg, ${tpl.colorFrom}, ${tpl.colorTo})` }} />
                      <p className="text-xs font-bold">{tpl.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{tpl.popupType.replace("_", " ")}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Content */}
            {(builderStep === 1 || editingId) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold">Content</p>
                  <button
                    onClick={() => setAiModalOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI Assist
                  </button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Title <span className="text-red-500">*</span></label>
                  <Input value={form.title} onChange={e => f("title", e.target.value)} placeholder="Attention-grabbing title with emoji 🎉" className="h-11 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Body <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <textarea
                    value={form.body}
                    onChange={e => f("body", e.target.value)}
                    placeholder="Describe your offer or announcement..."
                    rows={3}
                    className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">CTA Button Text</label>
                    <Input value={form.ctaText} onChange={e => f("ctaText", e.target.value)} placeholder="Shop Now" className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">CTA Deep Link</label>
                    <Input value={form.ctaLink} onChange={e => f("ctaLink", e.target.value)} placeholder="/mart or https://..." className="h-10 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Media URL <span className="text-muted-foreground font-normal">(image)</span></label>
                  <Input value={form.mediaUrl} onChange={e => f("mediaUrl", e.target.value)} placeholder="https://example.com/image.jpg" className="h-10 rounded-xl" />
                </div>
              </div>
            )}

            {/* Step 2: Style */}
            {(builderStep === 2 || editingId) && (
              <div className="space-y-3">
                <p className="text-sm font-bold">Style & Appearance</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Popup Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {POPUP_TYPES.map(pt => (
                      <button
                        key={pt.value}
                        onClick={() => f("popupType", pt.value)}
                        className={`p-3 rounded-xl border-2 text-left transition-all ${
                          form.popupType === pt.value ? "border-purple-500 bg-purple-50" : "border-border hover:border-purple-300"
                        }`}
                      >
                        <p className="text-xs font-bold">{pt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{pt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Color From</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.colorFrom} onChange={e => f("colorFrom", e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                      <Input value={form.colorFrom} onChange={e => f("colorFrom", e.target.value)} className="h-10 rounded-xl flex-1 text-xs font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Color To</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.colorTo} onChange={e => f("colorTo", e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                      <Input value={form.colorTo} onChange={e => f("colorTo", e.target.value)} className="h-10 rounded-xl flex-1 text-xs font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Text Color</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={form.textColor} onChange={e => f("textColor", e.target.value)} className="w-10 h-10 rounded-lg border border-border cursor-pointer" />
                      <Input value={form.textColor} onChange={e => f("textColor", e.target.value)} className="h-10 rounded-xl flex-1 text-xs font-mono" />
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Animation</label>
                  <div className="flex flex-wrap gap-2">
                    {ANIMATION_OPTIONS.map(a => (
                      <button
                        key={a}
                        onClick={() => f("animation", a)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          form.animation === a ? "border-purple-500 bg-purple-100 text-purple-700" : "border-border hover:border-purple-300"
                        }`}
                      >
                        {a.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Targeting */}
            {(builderStep === 3 || editingId) && (
              <div className="space-y-3">
                <p className="text-sm font-bold">Targeting Rules</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Target Roles</label>
                  <div className="flex flex-wrap gap-2">
                    {["customer", "vendor", "rider", "all"].map(role => (
                      <button
                        key={role}
                        onClick={() => {
                          const roles = form.targeting.roles.includes(role)
                            ? form.targeting.roles.filter(r => r !== role)
                            : [...form.targeting.roles, role];
                          ft("roles", roles);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${
                          form.targeting.roles.includes(role) ? "border-purple-500 bg-purple-100 text-purple-700" : "border-border hover:border-purple-300"
                        }`}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Leave empty to target all users</p>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border/50">
                  <input
                    type="checkbox"
                    id="newUsers"
                    checked={form.targeting.newUsers}
                    onChange={e => ft("newUsers", e.target.checked)}
                    className="w-4 h-4"
                  />
                  <label htmlFor="newUsers" className="text-sm font-semibold cursor-pointer">New users only (no previous orders)</label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Min Order Count</label>
                    <Input type="number" min="0" value={form.targeting.minOrderCount} onChange={e => ft("minOrderCount", e.target.value)} placeholder="e.g. 1" className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Max Order Count</label>
                    <Input type="number" min="0" value={form.targeting.maxOrderCount} onChange={e => ft("maxOrderCount", e.target.value)} placeholder="e.g. 5" className="h-10 rounded-xl" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Min Avg Order Value (Rs.)</label>
                    <Input type="number" min="0" value={form.targeting.minOrderValue} onChange={e => ft("minOrderValue", e.target.value)} placeholder="e.g. 500" className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Max Avg Order Value (Rs.)</label>
                    <Input type="number" min="0" value={form.targeting.maxOrderValue} onChange={e => ft("maxOrderValue", e.target.value)} placeholder="e.g. 5000" className="h-10 rounded-xl" />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Schedule */}
            {(builderStep === 4 || editingId) && (
              <div className="space-y-3">
                <p className="text-sm font-bold">Schedule & Frequency</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Start Date</label>
                    <Input type="datetime-local" value={form.startDate} onChange={e => f("startDate", e.target.value)} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">End Date</label>
                    <Input type="datetime-local" value={form.endDate} onChange={e => f("endDate", e.target.value)} className="h-10 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Display Frequency</label>
                  <select value={form.displayFrequency} onChange={e => f("displayFrequency", e.target.value)} className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
                    {FREQUENCY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Max Per User</label>
                    <Input type="number" min="1" value={form.maxImpressionsPerUser} onChange={e => f("maxImpressionsPerUser", e.target.value)} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Total Cap</label>
                    <Input type="number" min="0" value={form.maxTotalImpressions} onChange={e => f("maxTotalImpressions", e.target.value)} placeholder="No limit" className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold">Priority</label>
                    <Input type="number" value={form.priority} onChange={e => f("priority", e.target.value)} placeholder="0" className="h-10 rounded-xl" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold">Status</label>
                  <select value={form.status} onChange={e => f("status", e.target.value)} className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm">
                    <option value="draft">Draft</option>
                    <option value="live">Live (publish now)</option>
                    <option value="paused">Paused</option>
                  </select>
                </div>
              </div>
            )}

            {/* Step 5: Preview */}
            {builderStep === 5 && !editingId && (
              <div className="space-y-3">
                <p className="text-sm font-bold">Live Preview</p>
                <div className="flex items-center gap-2 p-2 bg-muted rounded-xl text-xs text-muted-foreground">
                  <Monitor className="w-4 h-4" />
                  Preview shown as it will appear in the mobile app
                </div>
                <PopupPreview campaign={form} />
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="p-2 bg-muted rounded-lg">
                    <span className="font-semibold block">Type:</span>
                    {POPUP_TYPES.find(t => t.value === form.popupType)?.label}
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <span className="font-semibold block">Frequency:</span>
                    {FREQUENCY_OPTIONS.find(f => f.value === form.displayFrequency)?.label}
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <span className="font-semibold block">Targeting:</span>
                    {form.targeting.roles.length > 0 ? form.targeting.roles.join(", ") : "All users"}
                  </div>
                  <div className="p-2 bg-muted rounded-lg">
                    <span className="font-semibold block">Status:</span>
                    {form.status}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
            <div className="flex gap-2">
              {!editingId && builderStep > 0 && (
                <Button variant="outline" onClick={() => setBuilderStep(s => s - 1)} className="rounded-xl gap-1">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              {!editingId && builderStep < STEPS.length - 1 && (
                <Button
                  onClick={() => setBuilderStep(s => s + 1)}
                  disabled={builderStep === 1 && !form.title.trim()}
                  className="rounded-xl gap-1"
                >
                  Next
                  <ArrowRight className="w-4 h-4" />
                </Button>
              )}
              {(builderStep === STEPS.length - 1 || editingId) && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => { const payload = buildPayload(); payload.status = "draft"; saveMutation.mutate(payload); }}
                    disabled={saveMutation.isPending}
                    className="rounded-xl"
                  >
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => { const payload = buildPayload(); if (!editingId) payload.status = "live"; saveMutation.mutate(payload); }}
                    disabled={saveMutation.isPending || !form.title.trim()}
                    className="rounded-xl gap-1"
                  >
                    {saveMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                    {editingId ? "Save Changes" : "Publish"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Modal */}
      <Dialog open={aiModalOpen} onOpenChange={setAiModalOpen}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-500" />
              AI Content Generator
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Describe your goal</label>
              <textarea
                value={aiGoal}
                onChange={e => setAiGoal(e.target.value)}
                placeholder="e.g. Promote Eid sale with 30% off on all food items this weekend..."
                rows={3}
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button onClick={handleAiGenerate} disabled={aiLoading || !aiGoal.trim()} className="w-full rounded-xl gap-2">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Content
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deletePopupId}
        onClose={() => setDeletePopupId(null)}
        onConfirm={() => {
          if (!deletePopupId) return;
          deleteMutation.mutate(deletePopupId, { onSettled: () => setDeletePopupId(null) });
        }}
        title={tDual("deletePopupTitle", language)}
        description={tDual("actionCannotBeUndone", language)}
        confirmLabel="Delete"
        variant="destructive"
        busy={deleteMutation.isPending}
      />
    </div>
  );
}
