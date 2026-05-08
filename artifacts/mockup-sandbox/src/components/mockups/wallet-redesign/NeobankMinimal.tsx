import {
  TrendingUp,
  Gift,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  CreditCard,
  RefreshCw,
  CheckCircle,
  Clock,
  XCircle,
  Eye,
  EyeOff,
  Banknote,
  Building2,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  ArrowRight,
  BarChart3,
  PiggyBank,
  Receipt,
} from "lucide-react";
import { useState } from "react";

const fc = (n: number) => `Rs. ${Math.round(n).toLocaleString()}`;

const MOCK_TXS = [
  {
    id: "1",
    type: "credit",
    amount: 850,
    description: "Food delivery completed",
    time: "2h ago",
  },
  {
    id: "2",
    type: "credit",
    amount: 420,
    description: "Mart pickup delivery",
    time: "4h ago",
  },
  {
    id: "3",
    type: "bonus",
    amount: 200,
    description: "Peak hour bonus",
    time: "5h ago",
  },
  {
    id: "4",
    type: "platform_fee",
    amount: 127,
    description: "Platform service fee",
    time: "Yesterday",
  },
  {
    id: "5",
    type: "debit",
    amount: 5000,
    description: "Withdrawal to JazzCash",
    time: "Yesterday",
    status: "paid",
  },
  {
    id: "6",
    type: "credit",
    amount: 1200,
    description: "Ride completed",
    time: "2 days ago",
  },
];

const CHART_DATA = [
  { label: "M", amount: 1200 },
  { label: "T", amount: 1850 },
  { label: "W", amount: 950 },
  { label: "T", amount: 2100 },
  { label: "F", amount: 1600 },
  { label: "S", amount: 2800 },
  { label: "S", amount: 1470 },
];

function TxIconEl({ type }: { type: string }) {
  const base =
    "w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0";
  if (type === "credit")
    return (
      <div className={`${base} bg-green-50`}>
        <TrendingUp size={18} className="text-green-600" />
      </div>
    );
  if (type === "bonus")
    return (
      <div className={`${base} bg-blue-50`}>
        <Gift size={18} className="text-blue-600" />
      </div>
    );
  if (type === "platform_fee")
    return (
      <div className={`${base} bg-orange-50`}>
        <Building2 size={18} className="text-orange-500" />
      </div>
    );
  if (type === "debit")
    return (
      <div className={`${base} bg-red-50`}>
        <ArrowUpFromLine size={18} className="text-red-500" />
      </div>
    );
  return (
    <div className={`${base} bg-gray-50`}>
      <Receipt size={18} className="text-gray-500" />
    </div>
  );
}

export function NeobankMinimal() {
  const [hidden, setHidden] = useState(false);
  const balance = 12470;
  const maxChart = Math.max(...CHART_DATA.map((d) => d.amount));
  const weekTotal = CHART_DATA.reduce((s, d) => s + d.amount, 0);

  return (
    <div className="min-h-screen bg-[#FAFBFC] font-['Inter']">
      <div className="bg-white px-5 pt-14 pb-6 border-b border-gray-100">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
              Wallet
            </p>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight mt-0.5">
              My Balance
            </h1>
          </div>
          <button className="w-10 h-10 bg-gray-50 rounded-2xl flex items-center justify-center border border-gray-100">
            <RefreshCw size={16} className="text-gray-400" />
          </button>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
          <div className="absolute bottom-0 left-0 w-28 h-28 bg-white/3 rounded-full translate-y-1/3 -translate-x-1/4" />

          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <p className="text-xs text-gray-400 font-semibold">
                  Available Balance
                </p>
                <button
                  onClick={() => setHidden((v) => !v)}
                  className="text-gray-500"
                >
                  {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
              <div className="flex items-center gap-1 bg-green-500/15 px-2.5 py-1 rounded-full">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-green-400 font-bold">
                  Active
                </span>
              </div>
            </div>

            <p className="text-4xl font-black text-white tracking-tight">
              {hidden ? "Rs. ••••••" : fc(balance)}
            </p>

            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 bg-white/5 rounded-xl px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">
                  Pending
                </p>
                <p className="text-sm font-bold text-amber-400">{fc(5000)}</p>
              </div>
              <div className="flex-1 bg-white/5 rounded-xl px-3 py-2">
                <p className="text-[9px] text-gray-500 uppercase tracking-wider font-bold">
                  Your Share
                </p>
                <p className="text-sm font-bold text-white">85%</p>
              </div>
            </div>

            <div className="flex gap-2.5 mt-5">
              <button className="flex-1 bg-white text-gray-900 font-black rounded-2xl py-3.5 text-sm flex items-center justify-center gap-2 active:bg-gray-100 transition-colors">
                <ArrowUpFromLine size={15} /> Withdraw
              </button>
              <button className="flex-1 bg-white/10 text-white font-bold rounded-2xl py-3.5 text-sm flex items-center justify-center gap-2 border border-white/10 active:bg-white/15 transition-colors">
                <ArrowDownToLine size={15} /> Deposit
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5 space-y-5">
        <div className="flex gap-3">
          {[
            {
              label: "Today",
              value: fc(1470),
              color: "text-green-600",
              bg: "bg-green-50",
            },
            {
              label: "Week",
              value: fc(weekTotal),
              color: "text-blue-600",
              bg: "bg-blue-50",
            },
            {
              label: "Total",
              value: fc(45280),
              color: "text-purple-600",
              bg: "bg-purple-50",
            },
          ].map((s) => (
            <div
              key={s.label}
              className="flex-1 bg-white rounded-2xl p-3.5 border border-gray-100 shadow-sm"
            >
              <p className={`text-base font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-gray-400 mt-1 font-semibold">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 size={15} className="text-gray-400" />
              <p className="font-bold text-gray-800 text-sm">Weekly Earnings</p>
            </div>
            <p className="text-base font-black text-green-600">
              {fc(weekTotal)}
            </p>
          </div>
          <div className="flex items-end gap-3 h-20">
            {CHART_DATA.map((d, i) => (
              <div
                key={i}
                className="flex-1 flex flex-col items-center gap-1.5"
              >
                <div
                  className="w-full flex items-end justify-center"
                  style={{ height: 56 }}
                >
                  <div
                    className={`w-full max-w-[20px] rounded-md transition-all ${
                      i === 5 ? "bg-green-500" : "bg-gray-100"
                    }`}
                    style={{
                      height: Math.max(
                        (d.amount / maxChart) * 56,
                        d.amount > 0 ? 4 : 2,
                      ),
                    }}
                  />
                </div>
                <p
                  className={`text-[9px] font-semibold ${i === 5 ? "text-green-600" : "text-gray-300"}`}
                >
                  {d.label}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between mb-3">
              <p className="font-bold text-gray-800 text-sm">Recent Activity</p>
              <button className="text-xs text-green-600 font-bold flex items-center gap-0.5">
                See all <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex gap-2 overflow-x-auto no-scrollbar">
              {["All", "Earnings", "Withdrawals", "Fees"].map((tab, i) => (
                <button
                  key={tab}
                  className={`px-4 py-2 rounded-full text-xs font-bold flex-shrink-0 transition-all ${
                    i === 0
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-400 border border-gray-100"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="divide-y divide-gray-50">
            {MOCK_TXS.map((t) => {
              const isDebit = t.type === "debit" || t.type === "platform_fee";
              return (
                <div key={t.id} className="px-5 py-3.5 flex items-center gap-3">
                  <TxIconEl type={t.type} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">
                      {t.description}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-gray-400">{t.time}</p>
                      {(t as any).status === "paid" && (
                        <span className="text-[9px] font-bold bg-green-50 text-green-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                          <CheckCircle size={8} /> Paid
                        </span>
                      )}
                    </div>
                  </div>
                  <p
                    className={`text-sm font-black flex-shrink-0 ${isDebit ? "text-red-500" : "text-green-600"}`}
                  >
                    {isDebit ? "−" : "+"}
                    {fc(t.amount)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-green-50 rounded-3xl border border-green-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={15} className="text-green-600" />
            <p className="text-sm font-bold text-green-800">Payout Policy</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "Your Share", value: "85%" },
              { label: "Min Withdraw", value: "Rs. 500" },
              { label: "Processing", value: "48-72h" },
              { label: "Methods", value: "3 Available" },
            ].map((p) => (
              <div
                key={p.label}
                className="bg-white rounded-xl px-3 py-2.5 border border-green-100"
              >
                <p className="text-[10px] text-green-600/60 font-bold uppercase tracking-wider">
                  {p.label}
                </p>
                <p className="text-sm font-black text-green-800 mt-0.5">
                  {p.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-[10px] text-gray-300 pb-4 flex items-center justify-center gap-1.5">
          <ShieldCheck size={10} /> Secured by AJKMart
        </p>
      </div>
    </div>
  );
}
