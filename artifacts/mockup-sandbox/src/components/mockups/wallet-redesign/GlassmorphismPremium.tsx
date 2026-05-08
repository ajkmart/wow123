import {
  TrendingUp, Gift, Star, ArrowDownToLine,
  ArrowUpFromLine, Wallet, CreditCard,
  RefreshCw, CheckCircle, Clock, XCircle,
  Smartphone, ShieldCheck, Eye, EyeOff,
  Sparkles, Banknote, ChevronDown, Building2,
  Zap, Award, Target,
} from "lucide-react";
import { useState } from "react";

const fc = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

const MOCK_TXS = [
  { id: "1", type: "credit", amount: 850, description: "Food delivery — Order #A7F2C1", createdAt: new Date().toISOString(), group: "Today" },
  { id: "2", type: "credit", amount: 420, description: "Mart pickup — Order #B3D9E5", createdAt: new Date().toISOString(), group: "Today" },
  { id: "3", type: "bonus", amount: 200, description: "Peak hour bonus — 5 deliveries", createdAt: new Date().toISOString(), group: "Today" },
  { id: "4", type: "platform_fee", amount: 127, description: "Platform service fee", createdAt: new Date(Date.now() - 86400000).toISOString(), group: "Yesterday" },
  { id: "5", type: "debit", amount: 5000, description: "Withdrawal — JazzCash · 03001234567", createdAt: new Date(Date.now() - 86400000).toISOString(), group: "Yesterday" },
  { id: "6", type: "credit", amount: 1200, description: "Ride completed — #R4K8M2", createdAt: new Date(Date.now() - 172800000).toISOString(), group: "This Week" },
];

const CHART_DATA = [
  { label: "Mon", amount: 1200 },
  { label: "Tue", amount: 1850 },
  { label: "Wed", amount: 950 },
  { label: "Thu", amount: 2100 },
  { label: "Fri", amount: 1600 },
  { label: "Sat", amount: 2800 },
  { label: "Today", amount: 1470 },
];

function TxIcon({ type }: { type: string }) {
  if (type === "credit") return <TrendingUp size={16} className="text-white" />;
  if (type === "bonus") return <Gift size={16} className="text-white" />;
  if (type === "platform_fee") return <Building2 size={16} className="text-white" />;
  return <ArrowUpFromLine size={16} className="text-white" />;
}

function txGradient(type: string) {
  if (type === "credit") return "from-green-500 to-emerald-600";
  if (type === "bonus") return "from-blue-500 to-indigo-600";
  if (type === "platform_fee") return "from-orange-500 to-amber-600";
  return "from-red-500 to-pink-600";
}

export function GlassmorphismPremium() {
  const [hidden, setHidden] = useState(false);
  const balance = 12470;
  const maxChart = Math.max(...CHART_DATA.map(d => d.amount));
  const weekTotal = CHART_DATA.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="min-h-screen bg-gray-950 font-['Inter']">
      <div className="bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 px-5 pt-14 pb-32 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-[-20%] right-[-10%] w-72 h-72 bg-emerald-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-[-30%] left-[-15%] w-64 h-64 bg-teal-400/15 rounded-full blur-3xl" />
          <div className="absolute top-[40%] left-[30%] w-40 h-40 bg-green-400/10 rounded-full blur-2xl" />
        </div>

        <div className="relative flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/20">
              <Wallet size={20} className="text-emerald-300" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight">My Wallet</h1>
              <p className="text-emerald-300/80 text-xs font-medium">Earnings & Payouts</p>
            </div>
          </div>
          <button className="w-10 h-10 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/20">
            <RefreshCw size={16} className="text-white" />
          </button>
        </div>

        <div className="relative">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-bold text-emerald-300/60 uppercase tracking-widest">Available Balance</p>
            <button onClick={() => setHidden(v => !v)} className="text-emerald-300/60">
              {hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </div>
          <p className="text-5xl font-black text-white tracking-tight leading-none">
            {hidden ? "Rs. ••••••" : fc(balance)}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full font-bold border border-emerald-500/20 flex items-center gap-1">
              <Zap size={11} /> 85% your share
            </span>
            <span className="text-xs bg-white/5 text-white/50 px-3 py-1 rounded-full font-medium border border-white/10">
              <Clock size={10} className="inline mr-1" />Credited instantly
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 -mt-24 space-y-4 pb-8">
        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-5 shadow-2xl">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <button className="bg-gradient-to-r from-emerald-500 to-green-600 text-white font-black rounded-2xl py-4 flex items-center justify-center gap-2 text-sm shadow-lg shadow-emerald-500/25 active:scale-[0.97] transition-transform">
              <ArrowUpFromLine size={16} /> Withdraw
            </button>
            <button className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-black rounded-2xl py-4 flex items-center justify-center gap-2 text-sm shadow-lg shadow-teal-500/25 active:scale-[0.97] transition-transform">
              <ArrowDownToLine size={16} /> Deposit
            </button>
          </div>
          <div className="bg-amber-500/10 rounded-2xl px-4 py-3 flex items-center gap-3 border border-amber-500/20">
            <div className="w-8 h-8 bg-amber-500/20 rounded-xl flex items-center justify-center">
              <Clock size={14} className="text-amber-400" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-400">Rs. 5,000 Pending</p>
              <p className="text-[10px] text-amber-400/60">1 withdrawal processing</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Today", value: fc(1470), icon: <Target size={16} />, gradient: "from-amber-500/15 to-orange-500/15", text: "text-amber-400", border: "border-amber-500/20" },
            { label: "This Week", value: fc(weekTotal), icon: <TrendingUp size={16} />, gradient: "from-blue-500/15 to-indigo-500/15", text: "text-blue-400", border: "border-blue-500/20" },
            { label: "Total Earned", value: fc(45280), icon: <Award size={16} />, gradient: "from-emerald-500/15 to-green-500/15", text: "text-emerald-400", border: "border-emerald-500/20" },
            { label: "Withdrawn", value: fc(32000), icon: <ArrowUpFromLine size={16} />, gradient: "from-red-500/15 to-pink-500/15", text: "text-red-400", border: "border-red-500/20" },
          ].map((s, i) => (
            <div key={i} className={`bg-gradient-to-br ${s.gradient} backdrop-blur-xl rounded-2xl p-4 border ${s.border}`}>
              <div className={`${s.text} mb-2`}>{s.icon}</div>
              <p className="text-lg font-black text-white">{s.value}</p>
              <p className="text-[10px] text-white/40 font-bold mt-1 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-bold text-white text-sm">7-Day Earnings</p>
              <p className="text-[10px] text-white/40 mt-0.5">Last 7 days performance</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-black text-emerald-400">{fc(weekTotal)}</p>
              <p className="text-[9px] text-white/40">This Week</p>
            </div>
          </div>
          <div className="flex items-end gap-2 h-24">
            {CHART_DATA.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                {d.amount > 0 && (
                  <p className="text-[7px] text-white/30 font-bold">{(d.amount / 1000).toFixed(1)}k</p>
                )}
                <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                  <div
                    className={`w-full max-w-[24px] rounded-lg transition-all ${
                      i === 6
                        ? "bg-gradient-to-t from-emerald-500 to-green-400 shadow-lg shadow-emerald-500/30"
                        : "bg-gradient-to-t from-white/10 to-white/5"
                    }`}
                    style={{ height: Math.max((d.amount / maxChart) * 64, d.amount > 0 ? 6 : 2) }}
                  />
                </div>
                <p className={`text-[9px] font-medium ${i === 6 ? "text-emerald-400 font-bold" : "text-white/30"}`}>{d.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white/5 backdrop-blur-2xl rounded-3xl border border-white/10 overflow-hidden">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-white text-sm">Transactions</p>
              <span className="text-[10px] text-white/30 font-medium">{MOCK_TXS.length} records</span>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
              {["All", "Earnings", "Withdrawals", "Bonuses"].map((tab, i) => (
                <button key={tab} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex-shrink-0 transition-all ${
                  i === 0
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25"
                    : "bg-white/5 text-white/40 border border-white/10"
                }`}>{tab}</button>
              ))}
            </div>
          </div>

          {["Today", "Yesterday", "This Week"].map(group => {
            const items = MOCK_TXS.filter(t => t.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <div className="px-5 py-2 bg-white/[0.02] flex items-center gap-2">
                  <p className="text-[10px] font-bold text-white/25 uppercase tracking-widest">{group}</p>
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[9px] text-white/20">{items.length}</span>
                </div>
                <div className="divide-y divide-white/5">
                  {items.map(t => {
                    const isDebit = t.type === "debit" || t.type === "platform_fee";
                    return (
                      <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${txGradient(t.type)} flex items-center justify-center shadow-lg flex-shrink-0`}>
                          <TxIcon type={t.type} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white/80 leading-snug line-clamp-1">{t.description}</p>
                          <p className="text-[10px] text-white/25 mt-0.5">2 hours ago</p>
                        </div>
                        <p className={`text-sm font-black flex-shrink-0 ${isDebit ? "text-red-400" : "text-emerald-400"}`}>
                          {isDebit ? "−" : "+"}{fc(t.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/10 backdrop-blur-xl rounded-3xl border border-emerald-500/20 p-5">
          <p className="text-sm font-bold text-emerald-300 mb-3 flex items-center gap-2">
            <ShieldCheck size={15} /> Payout Policy
          </p>
          <div className="space-y-2">
            {[
              "85% your share — 15% platform fee",
              "Min withdrawal: Rs. 500 · Max: Rs. 50,000",
              "48–72h processing via JazzCash, EasyPaisa, Bank",
              "Rejected requests auto-refunded",
            ].map((p, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full flex-shrink-0" />
                <p className="text-[11px] text-white/50 font-medium">{p}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-white/20 pb-4 flex items-center justify-center gap-1.5">
          <ShieldCheck size={10} /> All transactions secured by AJKMart
        </p>
      </div>
    </div>
  );
}
