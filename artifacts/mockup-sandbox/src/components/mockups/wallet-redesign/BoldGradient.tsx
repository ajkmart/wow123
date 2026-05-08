import {
  TrendingUp, Gift, ArrowDownToLine,
  ArrowUpFromLine, Wallet, CreditCard,
  RefreshCw, CheckCircle, Clock,
  Eye, EyeOff, Building2,
  ShieldCheck, Zap, Star,
  Banknote, Trophy, Flame, Target,
  ArrowRight, Sparkles,
} from "lucide-react";
import { useState } from "react";

const fc = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

const MOCK_TXS = [
  { id: "1", type: "credit", amount: 850, desc: "Food delivery — #A7F2", time: "2h ago" },
  { id: "2", type: "credit", amount: 420, desc: "Mart pickup — #B3D9", time: "4h ago" },
  { id: "3", type: "bonus", amount: 200, desc: "Peak hour bonus", time: "5h ago" },
  { id: "4", type: "platform_fee", amount: 127, desc: "Platform fee", time: "Yesterday" },
  { id: "5", type: "debit", amount: 5000, desc: "Withdraw → JazzCash", time: "Yesterday" },
  { id: "6", type: "credit", amount: 1200, desc: "Ride completed", time: "2 days ago" },
];

const CHART = [
  { label: "Mon", val: 1200 },
  { label: "Tue", val: 1850 },
  { label: "Wed", val: 950 },
  { label: "Thu", val: 2100 },
  { label: "Fri", val: 1600 },
  { label: "Sat", val: 2800 },
  { label: "Today", val: 1470 },
];

function TxIcon({ type }: { type: string }) {
  if (type === "credit") return <TrendingUp size={16} className="text-white" />;
  if (type === "bonus") return <Gift size={16} className="text-white" />;
  if (type === "platform_fee") return <Building2 size={16} className="text-white" />;
  return <ArrowUpFromLine size={16} className="text-white" />;
}

function txGrad(type: string) {
  if (type === "credit") return "from-green-400 to-emerald-600";
  if (type === "bonus") return "from-violet-400 to-purple-600";
  if (type === "platform_fee") return "from-orange-400 to-red-500";
  return "from-pink-500 to-rose-600";
}

export function BoldGradient() {
  const [hidden, setHidden] = useState(false);
  const balance = 12470;
  const maxC = Math.max(...CHART.map(d => d.val));
  const weekTotal = CHART.reduce((s, d) => s + d.val, 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white font-['Inter']">
      <div className="relative">
        <div className="bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 px-5 pt-14 pb-36 relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-36 h-36 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
            <div className="absolute top-1/2 left-1/2 w-24 h-24 bg-white/5 rounded-full -translate-x-1/2 -translate-y-1/2" />
          </div>

          <div className="relative flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20 shadow-lg">
                <Wallet size={22} className="text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white">Wallet</h1>
                <p className="text-green-200 text-[11px] font-medium">Earnings & Payouts</p>
              </div>
            </div>
            <button className="w-10 h-10 bg-white/15 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/20">
              <RefreshCw size={16} className="text-white" />
            </button>
          </div>

          <div className="relative">
            <div className="flex items-center gap-2 mb-1.5">
              <p className="text-[11px] text-green-200/80 font-bold uppercase tracking-widest">Balance</p>
              <button onClick={() => setHidden(v => !v)} className="text-green-200/60">
                {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            <p className="text-5xl font-black text-white tracking-tight leading-none">
              {hidden ? "Rs. ••••••" : fc(balance)}
            </p>
            <div className="flex gap-2 mt-3">
              <span className="bg-white/15 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/10 flex items-center gap-1">
                <Zap size={10} /> 85% share
              </span>
              <span className="bg-amber-500/20 text-amber-200 text-[10px] font-bold px-3 py-1.5 rounded-full border border-amber-400/20 flex items-center gap-1">
                <Clock size={10} /> Rs. 5,000 pending
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 -mt-24 space-y-4 relative z-10">
          <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 p-5">
            <div className="grid grid-cols-2 gap-3">
              <button className="bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black rounded-2xl py-4 flex items-center justify-center gap-2 text-sm shadow-lg shadow-green-200 active:scale-[0.97] transition-transform">
                <ArrowUpFromLine size={16} /> Withdraw
              </button>
              <button className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-black rounded-2xl py-4 flex items-center justify-center gap-2 text-sm shadow-lg shadow-teal-200 active:scale-[0.97] transition-transform">
                <ArrowDownToLine size={16} /> Deposit
              </button>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-4">
              {[
                { label: "Today", value: fc(1470), icon: <Flame size={14} />, color: "text-orange-600", bg: "bg-gradient-to-br from-orange-50 to-amber-50", border: "border-orange-100" },
                { label: "Week", value: fc(weekTotal), icon: <TrendingUp size={14} />, color: "text-blue-600", bg: "bg-gradient-to-br from-blue-50 to-indigo-50", border: "border-blue-100" },
                { label: "Total", value: "45.3k", icon: <Trophy size={14} />, color: "text-green-600", bg: "bg-gradient-to-br from-green-50 to-emerald-50", border: "border-green-100" },
                { label: "Paid", value: "32k", icon: <CheckCircle size={14} />, color: "text-purple-600", bg: "bg-gradient-to-br from-purple-50 to-violet-50", border: "border-purple-100" },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-2xl p-2.5 text-center border ${s.border}`}>
                  <div className={`${s.color} flex justify-center mb-1`}>{s.icon}</div>
                  <p className={`text-xs font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[8px] text-gray-400 font-bold mt-0.5 uppercase">{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-lg shadow-gray-200/50 border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                  <Sparkles size={14} className="text-green-500" /> 7-Day Earnings
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">Performance overview</p>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-xl px-3 py-1.5">
                <p className="text-sm font-black text-green-600">{fc(weekTotal)}</p>
              </div>
            </div>
            <div className="flex items-end gap-2 h-24">
              {CHART.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  {d.val > 0 && (
                    <p className="text-[7px] text-gray-400 font-bold">{(d.val / 1000).toFixed(1)}k</p>
                  )}
                  <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                    <div
                      className={`w-full max-w-[24px] rounded-lg transition-all ${
                        i === 6
                          ? "bg-gradient-to-t from-green-600 to-emerald-400 shadow-lg shadow-green-200"
                          : i === 5
                          ? "bg-gradient-to-t from-green-300 to-green-200"
                          : "bg-gradient-to-t from-gray-100 to-gray-50"
                      }`}
                      style={{ height: Math.max((d.val / maxC) * 64, d.val > 0 ? 6 : 2) }}
                    />
                  </div>
                  <p className={`text-[9px] font-semibold ${
                    i === 6 ? "text-green-600 font-bold" : "text-gray-300"
                  }`}>{d.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
            <div className="px-5 pt-5 pb-3">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold text-gray-900 text-sm">Transactions</p>
                <span className="text-[10px] text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full font-medium">{MOCK_TXS.length}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                {["All", "Earnings", "Withdrawals", "Bonuses", "Fees"].map((tab, i) => (
                  <button key={tab} className={`px-3.5 py-2 rounded-2xl text-xs font-bold flex-shrink-0 transition-all border-2 ${
                    i === 0
                      ? "bg-gradient-to-r from-green-600 to-emerald-600 text-white border-green-600 shadow-lg shadow-green-200"
                      : "bg-white text-gray-400 border-gray-100"
                  }`}>{tab}</button>
                ))}
              </div>
            </div>

            <div className="divide-y divide-gray-50">
              {MOCK_TXS.map(t => {
                const isDebit = t.type === "debit" || t.type === "platform_fee";
                return (
                  <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${txGrad(t.type)} flex items-center justify-center shadow-md flex-shrink-0`}>
                      <TxIcon type={t.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 line-clamp-1">{t.desc}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">{t.time}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-sm font-black ${isDebit ? "text-red-500" : "text-green-600"}`}>
                        {isDebit ? "−" : "+"}{fc(t.amount)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 rounded-3xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/3 translate-x-1/3" />
            <div className="absolute bottom-0 left-0 w-16 h-16 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/4" />
            <div className="relative">
              <p className="text-sm font-black text-white mb-3 flex items-center gap-2">
                <ShieldCheck size={15} /> Payout Policy
              </p>
              <div className="space-y-2">
                {[
                  { icon: <Zap size={12} />, text: "85% your share — 15% platform" },
                  { icon: <CreditCard size={12} />, text: "Min: Rs. 500 · Max: Rs. 50,000" },
                  { icon: <Clock size={12} />, text: "48–72h via JazzCash, EasyPaisa, Bank" },
                  { icon: <ShieldCheck size={12} />, text: "Rejected → auto-refunded" },
                ].map((p, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-white/10 rounded-xl px-3 py-2 border border-white/10">
                    <span className="text-green-200 flex-shrink-0">{p.icon}</span>
                    <p className="text-[11px] text-white/80 font-medium">{p.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="text-center text-[10px] text-gray-300 pb-6 flex items-center justify-center gap-1.5">
            <ShieldCheck size={10} /> All transactions secured by AJKMart
          </p>
        </div>
      </div>
    </div>
  );
}
