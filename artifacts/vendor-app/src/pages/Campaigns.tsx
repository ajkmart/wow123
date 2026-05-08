import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { CARD, BTN_PRIMARY, BTN_SECONDARY, errMsg, fc } from "../lib/ui";
import { useCurrency, usePlatformConfig, formatDateTz } from "../lib/useConfig";

type Participation = {
  id: string;
  campaignId: string;
  vendorId: string;
  status: string;
  notes?: string | null;
};

type Campaign = {
  id: string;
  name: string;
  description?: string;
  theme: string;
  colorFrom: string;
  colorTo: string;
  status: string;
  startDate: string;
  endDate: string;
  budgetCap?: number;
  maxParticipatingVendors?: number;
  participation?: Participation | null;
};

const STATUS_COLORS: Record<string, string> = {
  live:     "bg-green-100 text-green-700",
  draft:    "bg-gray-100 text-gray-600",
  ended:    "bg-red-100 text-red-600",
  paused:   "bg-yellow-100 text-yellow-700",
  pending:  "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

const THEME_EMOJIS: Record<string, string> = {
  flash: "⚡", festival: "🎉", seasonal: "🌿", clearance: "🏷️",
  loyalty: "💎", weekend: "📅", newuser: "⭐", cashback: "💰",
};

function CampaignCard({ campaign, onJoin, onWithdraw, joining, withdrawing, currencySymbol, tz }: {
  campaign: Campaign;
  onJoin: (id: string) => void;
  onWithdraw: (participationId: string) => void;
  joining: boolean;
  withdrawing: boolean;
  currencySymbol: string;
  tz: string;
}) {
  const endDate = new Date(campaign.endDate);
  const now = new Date();
  const daysLeft = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / 86400000));
  const participation = campaign.participation;
  const emoji = THEME_EMOJIS[campaign.theme] ?? "🎯";

  return (
    <div className={`${CARD} space-y-3`}>
      <div className="flex items-start gap-3">
        <div
          className="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-xl shadow-sm"
          style={{ background: `linear-gradient(135deg, ${campaign.colorFrom || "#7C3AED"}, ${campaign.colorTo || "#4F46E5"})` }}
        >
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold text-gray-900 text-sm">{campaign.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[campaign.status] ?? "bg-gray-100 text-gray-600"}`}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </span>
          </div>
          {campaign.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{campaign.description}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-xs text-gray-500">Ends In</p>
          <p className="font-bold text-sm text-gray-800">{daysLeft}d</p>
        </div>
        {campaign.budgetCap && (
          <div className="flex-1 bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Budget</p>
            <p className="font-bold text-sm text-gray-800">{currencySymbol}{campaign.budgetCap.toLocaleString()}</p>
          </div>
        )}
        {campaign.maxParticipatingVendors && (
          <div className="flex-1 bg-gray-50 rounded-lg p-2 text-center">
            <p className="text-xs text-gray-500">Max Vendors</p>
            <p className="font-bold text-sm text-gray-800">{campaign.maxParticipatingVendors}</p>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">
        {formatDateTz(campaign.startDate, { day: "numeric", month: "short", year: "numeric" }, tz)} — {formatDateTz(campaign.endDate, { day: "numeric", month: "short", year: "numeric" }, tz)}
      </p>

      {participation ? (
        <div className="flex items-center gap-2">
          <div className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold flex-1 text-center ${STATUS_COLORS[participation.status] ?? "bg-gray-100 text-gray-600"}`}>
            {participation.status === "pending"  ? "⏳ Pending Admin Approval" :
             participation.status === "approved" ? "✅ Participating" :
             participation.status === "rejected" ? "❌ Not Approved" :
             participation.status}
          </div>
          {participation.status === "pending" && (
            <button
              onClick={() => onWithdraw(participation.id)}
              disabled={withdrawing}
              className={BTN_SECONDARY + " text-xs py-1.5 px-3 flex-shrink-0"}
            >
              {withdrawing ? "..." : "Withdraw"}
            </button>
          )}
        </div>
      ) : campaign.status === "live" ? (
        <button
          onClick={() => onJoin(campaign.id)}
          disabled={joining}
          className={BTN_PRIMARY + " text-sm w-full"}
        >
          {joining ? "Submitting request..." : "🎯 Join Campaign"}
        </button>
      ) : (
        <p className="text-xs text-center text-gray-400 py-1">Not accepting vendors right now</p>
      )}
    </div>
  );
}

function PerformancePanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["campaign-performance", campaignId],
    queryFn: () => apiFetch(`/promotions/vendor/campaigns/${campaignId}/performance`),
    retry: 1,
    staleTime: 60_000,
  });
  const { symbol: currencySymbol } = useCurrency();

  if (isLoading) return <div className="h-20 animate-pulse bg-gray-50 rounded-xl"/>;
  if (isError || !data) return (
    <div className="text-xs text-center text-gray-400 py-3">
      Could not load performance.{" "}
      <button onClick={() => refetch()} className="text-orange-500 font-bold underline">Retry</button>
    </div>
  );

  const metrics = [
    { label: "Impressions", value: (data.impressions ?? 0).toLocaleString(), icon: "👁️" },
    { label: "Clicks",      value: (data.clicks ?? 0).toLocaleString(),      icon: "🖱️" },
    { label: "Orders",      value: (data.orders ?? 0).toLocaleString(),       icon: "📦" },
    { label: "Revenue",     value: fc(data.revenue ?? 0, currencySymbol),      icon: "💰" },
  ];

  return (
    <div className="bg-indigo-50 rounded-xl p-3 mt-2">
      <p className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest mb-2">Campaign Performance</p>
      <div className="grid grid-cols-4 gap-2">
        {metrics.map(m => (
          <div key={m.label} className="text-center">
            <p className="text-base">{m.icon}</p>
            <p className="text-sm font-extrabold text-indigo-800 mt-0.5">{m.value}</p>
            <p className="text-[9px] text-indigo-500 font-medium">{m.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Campaigns() {
  const qc = useQueryClient();
  const { symbol: currencySymbol } = useCurrency();
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";
  const [toast, setToast] = useState("");
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [perfOpen, setPerfOpen] = useState<string | null>(null);

  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(""), 3500);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["vendor-campaigns"],
    queryFn: () => apiFetch("/promotions/vendor/campaigns"),
    retry: 1,
  });

  const campaigns: Campaign[] = data?.campaigns ?? [];
  const participating = campaigns.filter(c => c.participation);
  const available = campaigns.filter(c => !c.participation);

  const joinMut = useMutation({
    mutationFn: (campaignId: string) => apiFetch(`/promotions/vendor/campaigns/${campaignId}/participate`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
    onMutate: (id) => setJoiningId(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-campaigns"] });
      setJoiningId(null);
      showToast("✅ Participation request submitted! Awaiting admin approval.");
    },
    onError: (e: Error) => {
      setJoiningId(null);
      showToast("❌ " + errMsg(e));
    },
  });

  const withdrawMut = useMutation({
    mutationFn: (participationId: string) =>
      apiFetch(`/promotions/vendor/participations/${participationId}`, { method: "DELETE" }),
    onMutate: (id) => setWithdrawingId(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor-campaigns"] });
      setWithdrawingId(null);
      showToast("Participation request withdrawn.");
    },
    onError: (e: Error) => {
      setWithdrawingId(null);
      showToast("❌ " + errMsg(e));
    },
  });

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="px-4 pt-4 pb-6 space-y-4">
        {toast && (
          <div className="fixed top-4 left-4 right-4 z-50 bg-gray-900 text-white text-sm rounded-2xl px-4 py-3 text-center shadow-xl animate-fade-in">
            {toast}
          </div>
        )}

        <PageHeader
          title="Platform Campaigns"
          subtitle="Join campaigns to reach more customers"
        />

        {/* Info banner */}
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 flex gap-2">
          <span className="text-lg">💡</span>
          <p className="text-xs text-indigo-700 leading-relaxed">
            Join platform-wide campaigns to appear in promotions and reach more customers. Your participation is subject to admin approval.
          </p>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className={`${CARD} animate-pulse`}>
                <div className="h-5 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
                <div className="h-10 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-5xl mb-3">🎯</div>
            <p className="font-bold text-gray-700 text-lg">No Active Campaigns</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">
              The platform team will create campaigns here. Check back soon!
            </p>
          </div>
        ) : (
          <>
            {participating.length > 0 && (
              <div>
                <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1.5">
                  <span>My Participations</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-normal">{participating.length}</span>
                </h2>
                <div className="space-y-3">
                  {participating.map(campaign => (
                    <div key={campaign.id}>
                      <CampaignCard
                        campaign={campaign}
                        onJoin={() => {}}
                        onWithdraw={(pid) => withdrawMut.mutate(pid)}
                        joining={false}
                        withdrawing={withdrawingId === campaign.participation?.id}
                        currencySymbol={currencySymbol}
                        tz={tz}
                      />
                      {campaign.participation?.status === "approved" && (
                        <div className="mt-1.5">
                          <button
                            onClick={() => setPerfOpen(perfOpen === campaign.id ? null : campaign.id)}
                            className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 py-2 rounded-xl transition-colors"
                          >
                            {perfOpen === campaign.id ? "▲ Hide Performance" : "📊 View Performance"}
                          </button>
                          {perfOpen === campaign.id && <PerformancePanel campaignId={campaign.id} />}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {available.length > 0 && (
              <div>
                <h2 className="font-bold text-gray-800 text-sm mb-3 flex items-center gap-1.5">
                  <span>Available Campaigns</span>
                  <span className="text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded-full font-normal">{available.length}</span>
                </h2>
                <div className="space-y-3">
                  {available.map(campaign => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      onJoin={(id) => joinMut.mutate(id)}
                      onWithdraw={() => {}}
                      joining={joiningId === campaign.id}
                      withdrawing={false}
                      currencySymbol={currencySymbol}
                      tz={tz}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  );
}
