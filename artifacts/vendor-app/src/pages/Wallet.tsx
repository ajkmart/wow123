import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { usePlatformConfig, useCurrency } from "../lib/useConfig";
import { useLanguage } from "../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import { PageHeader } from "../components/PageHeader";
import { PullToRefresh } from "../components/PullToRefresh";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { fc, fd, CARD, CARD_HEADER, INPUT, SELECT, BTN_PRIMARY, BTN_SECONDARY, LABEL, ROW, BADGE_GREEN, BADGE_RED, BADGE_BLUE, BADGE_GRAY, DEFAULT_COMMISSION_PCT, errMsg } from "../lib/ui";

const ALL_BANKS = ["EasyPaisa","JazzCash","MCB","HBL","UBL","Meezan Bank","Bank Alfalah","Habib Bank","NBP","Faysal Bank","Allied Bank","Other"];

function safeBalance(v: any): number { return v ? Number(v) : 0; }

function WithdrawModal({ balance, minPayout, maxPayout, onClose, onSuccess, defaultBank, defaultAcNo, defaultAcName }: { balance: number; minPayout: number; maxPayout: number | null; onClose: () => void; onSuccess: () => void; defaultBank?: string; defaultAcNo?: string; defaultAcName?: string }) {
  const { symbol: currencySymbol } = useCurrency();
  const { config } = usePlatformConfig();
  const fcLocal = (n: number) => fc(n, currencySymbol);
  const processingDays = config.wallet?.withdrawalProcessingDays;
  const processingText = processingDays
    ? `${processingDays} business day${processingDays === 1 ? "" : "s"}`
    : "24–48 hours";
  const BANKS = ALL_BANKS.filter(b => {
    if (b === "JazzCash") return config.integrations ? config.integrations.jazzcash?.enabled === true : true;
    if (b === "EasyPaisa") return config.integrations ? config.integrations.easypaisa?.enabled === true : true;
    return true;
  });
  const [amount, setAmount]   = useState("");
  const [bank, setBank]       = useState(defaultBank || "");
  const [acNo, setAcNo]       = useState(defaultAcNo || "");
  const [acName, setAcName]   = useState(defaultAcName || "");
  const [note, setNote]       = useState("");
  const [step, setStep]       = useState<"form"|"confirm"|"done">("form");
  const [err, setErr]         = useState("");
  const [txId, setTxId]       = useState("");

  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.withdrawWallet({ amount: Number(amount), bankName: bank, accountNumber: acNo, accountTitle: acName, note }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["vendor-wallet"] });
      setTxId(data?.transactionId || "");
      setStep("done");
    },
    onError: (e: Error) => setErr(errMsg(e)),
  });

  const validate = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0)  { setErr("Raqam darj karein / Valid amount required"); return; }
    if (amt < minPayout)                     { setErr(`Kam az kam ${fcLocal(minPayout)} hona chahiye / Minimum withdrawal is ${fcLocal(minPayout)}`); return; }
    if (maxPayout != null && amt > maxPayout) { setErr(`Zyada se zyada ${fcLocal(maxPayout)} / Maximum single withdrawal is ${fcLocal(maxPayout)}`); return; }
    if (amt > balance)                       { setErr(`Dastiyab balance: ${fcLocal(balance)} / Max available: ${fcLocal(balance)}`); return; }
    if (!bank)                               { setErr("Bank / wallet chunein / Select your bank or wallet"); return; }
    if (!acNo.trim())                        { setErr("Account / phone number darj karein / Account number required"); return; }
    if (!acName.trim())                      { setErr("Account holder ka naam darj karein / Account holder name required"); return; }
    setErr(""); setStep("confirm");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {step === "done" ? (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
            <h3 className="text-xl font-extrabold text-gray-800">Request Submitted!</h3>
            <p className="text-gray-500 mt-2 text-sm">Your withdrawal of <span className="font-bold text-orange-500">{fcLocal(Number(amount))}</span> has been queued. Admin will process within {processingText}.</p>
            <div className="mt-4 bg-amber-50 rounded-2xl p-4 text-left space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Bank / Wallet</span><span className="font-bold">{bank}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Account #</span><span className="font-bold">{acNo}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Account Name</span><span className="font-bold">{acName}</span></div>
              {txId && (
                <div className="flex justify-between text-sm border-t border-amber-200 pt-1.5 mt-1">
                  <span className="text-gray-500">Transaction Ref</span>
                  <span className="font-mono font-bold text-orange-600 text-xs">#TX-{txId}</span>
                </div>
              )}
            </div>
            <button onClick={() => { onSuccess(); onClose(); }} className={`mt-6 ${BTN_PRIMARY}`}>Done</button>
          </div>
        ) : step === "confirm" ? (
          <div className="p-6">
            <h3 className="text-lg font-extrabold text-gray-800 mb-4">Confirm Withdrawal</h3>
            <div className="bg-orange-50 rounded-2xl p-4 space-y-2 mb-5">
              <div className="flex justify-between"><span className="text-gray-500 text-sm">Amount</span><span className="font-extrabold text-orange-600 text-lg">{fcLocal(Number(amount))}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">To</span><span className="font-bold">{bank}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Account</span><span className="font-bold">{acNo}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Name</span><span className="font-bold">{acName}</span></div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700 font-medium">🔒 This is a one-way action. Please verify details before confirming. Withdrawals are processed within {processingText} by admin.</p>
            </div>
            {err && <p className="text-red-500 text-sm font-semibold mb-3">⚠️ {err}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setStep("form"); setErr(""); }} className={BTN_SECONDARY}>← Edit</button>
              <button onClick={() => mut.mutate()} disabled={mut.isPending} className={BTN_PRIMARY}>{mut.isPending ? "Processing..." : "✓ Confirm Withdrawal"}</button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-gray-800">💸 Withdraw Funds</h3>
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-xl font-bold text-gray-500">✕</button>
            </div>
            <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 text-white mb-5">
              <p className="text-sm text-orange-100">Available Balance</p>
              <p className="text-3xl font-extrabold mt-0.5">{fcLocal(balance)}</p>
              <p className="text-xs text-orange-200 mt-1.5">Minimum withdrawal: {fcLocal(minPayout)}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Amount ({currencySymbol}) *</label>
                <div className="relative">
                  <input type="number" inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value); setErr(""); }}
                    placeholder="0" className={INPUT}/>
                  <button onClick={() => setAmount(String(Math.floor(balance)))}
                    className="absolute right-3 top-3 text-xs font-bold text-orange-500 bg-orange-50 px-2 py-1 rounded-lg">MAX</button>
                </div>
              </div>
              <div>
                <label className={LABEL}>Bank / Mobile Wallet *</label>
                <select value={bank} onChange={e => { setBank(e.target.value); setErr(""); }} className={SELECT}>
                  <option value="">Select bank or wallet</option>
                  {BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Account / Phone Number *</label>
                <input value={acNo} onChange={e => { setAcNo(e.target.value); setErr(""); }} placeholder="03XX-XXXXXXX or IBAN" className={INPUT}/>
              </div>
              <div>
                <label className={LABEL}>Account Holder Name *</label>
                <input value={acName} onChange={e => { setAcName(e.target.value); setErr(""); }} placeholder="Full name as on account" className={INPUT}/>
              </div>
              <div>
                <label className={LABEL}>Note (Optional)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional info for admin" className={INPUT}/>
              </div>
              {err && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-2.5">⚠️ {err}</p>}
              <button onClick={validate} className={BTN_PRIMARY}>Review Withdrawal →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const DEPOSIT_METHODS = ["JazzCash","EasyPaisa","Bank Transfer","Other"];

function DepositModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { symbol: currencySymbol } = useCurrency();
  const fcLocal = (n: number) => fc(n, currencySymbol);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [step, setStep] = useState<"form"|"confirm"|"done">("form");
  const [err, setErr] = useState("");
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => api.depositWallet({ amount: Number(amount), paymentMethod: method, paymentReference: ref, note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vendor-wallet"] }); setStep("done"); },
    onError: (e: Error) => setErr(e.message),
  });
  const validate = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setErr("Valid amount required"); return; }
    if (amt > 100000) { setErr("Maximum single deposit is Rs. 100,000"); return; }
    if (!method) { setErr("Select a payment method"); return; }
    if (!ref.trim()) { setErr("Payment reference / transaction ID required"); return; }
    setErr(""); setStep("confirm");
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-3xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {step === "done" ? (
          <div className="p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl">✅</div>
            <h3 className="text-xl font-extrabold text-gray-800">Deposit Request Submitted!</h3>
            <p className="text-gray-500 mt-2 text-sm">Your deposit request of <span className="font-bold text-orange-500">{fcLocal(Number(amount))}</span> via {method} has been sent to admin for verification.</p>
            <div className="mt-4 bg-blue-50 rounded-2xl p-4 text-left space-y-1.5">
              <div className="flex justify-between text-sm"><span className="text-gray-500">Method</span><span className="font-bold">{method}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Reference</span><span className="font-bold">{ref}</span></div>
            </div>
            <button onClick={() => { onSuccess(); onClose(); }} className={`mt-6 ${BTN_PRIMARY}`}>Done</button>
          </div>
        ) : step === "confirm" ? (
          <div className="p-6">
            <h3 className="text-lg font-extrabold text-gray-800 mb-4">Confirm Deposit</h3>
            <div className="bg-green-50 rounded-2xl p-4 space-y-2 mb-5">
              <div className="flex justify-between"><span className="text-gray-500 text-sm">Amount</span><span className="font-extrabold text-green-600 text-lg">{fcLocal(Number(amount))}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Via</span><span className="font-bold">{method}</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-500">Ref. ID</span><span className="font-bold">{ref}</span></div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-blue-700 font-medium">💡 Admin will verify your payment and credit your wallet within 24–48 hours.</p>
            </div>
            {err && <p className="text-red-500 text-sm font-semibold mb-3">⚠️ {err}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setStep("form"); setErr(""); }} className={BTN_SECONDARY}>← Edit</button>
              <button onClick={() => mut.mutate()} disabled={mut.isPending} className={BTN_PRIMARY}>{mut.isPending ? "Submitting..." : "✓ Confirm Deposit"}</button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-gray-800">💳 Deposit / Top-Up</h3>
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-xl font-bold text-gray-500">✕</button>
            </div>
            <div className="bg-blue-50 rounded-2xl p-4 mb-5">
              <p className="text-xs text-blue-700 font-medium leading-relaxed">Send payment via JazzCash, EasyPaisa, or Bank Transfer, then enter the transaction details below. Admin will verify and credit your wallet.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className={LABEL}>Amount ({currencySymbol}) *</label>
                <input type="number" inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value); setErr(""); }} placeholder="0" className={INPUT}/>
              </div>
              <div>
                <label className={LABEL}>Payment Method *</label>
                <select value={method} onChange={e => { setMethod(e.target.value); setErr(""); }} className={SELECT}>
                  <option value="">Select method</option>
                  {DEPOSIT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL}>Transaction ID / Payment Reference *</label>
                <input value={ref} onChange={e => { setRef(e.target.value); setErr(""); }} placeholder="e.g. TXN123456789" className={INPUT}/>
              </div>
              <div>
                <label className={LABEL}>Note (Optional)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Any additional info for admin" className={INPUT}/>
              </div>
              {err && <p className="text-red-500 text-sm font-semibold bg-red-50 rounded-xl px-4 py-2.5">⚠️ {err}</p>}
              <button onClick={validate} className={BTN_PRIMARY}>Review Deposit →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function txBadge(type: string) {
  if (type === "credit")   return <span className={BADGE_GREEN}>+ Credit</span>;
  if (type === "debit")    return <span className={BADGE_RED}>- Debit</span>;
  if (type === "bonus")    return <span className={BADGE_BLUE}>🎁 Bonus</span>;
  return <span className={BADGE_GRAY}>{type}</span>;
}

export default function Wallet() {
  const { user, refreshUser } = useAuth();
  const { config } = usePlatformConfig();
  const { symbol: currencySymbol } = useCurrency();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const fin = config.finance;
  const vc = config.vendor;
  const processingDays = config.wallet?.withdrawalProcessingDays;
  const processingText = processingDays
    ? `${processingDays} business day${processingDays === 1 ? "" : "s"}`
    : "24–48 hours";
  const vendorKeepPct  = Math.round(100 - (fin.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT));
  const commissionPct  = fin.vendorCommissionPct ?? DEFAULT_COMMISSION_PCT;
  const minPayout      = vc?.minPayout ?? fin.minVendorPayout;
  const maxPayout      = vc?.maxPayout ?? null;
  const settleDays     = vc?.settleDays ?? fin.vendorSettleDays;
  const withdrawalEnabled = vc?.withdrawalEnabled !== false;
  const qc = useQueryClient();
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showDeposit, setShowDeposit]   = useState(false);
  const [toast, setToast] = useState("");
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["vendor-wallet"],
    queryFn: () => api.getWallet(),
    refetchInterval: 30000,
    enabled: config.features.wallet,
    retry: 2,
  });

  const transactions: any[] = data?.transactions || [];
  const balance = data?.balance ?? safeBalance(user?.walletBalance);

  const credits = transactions.filter(t => t.type === "credit" || t.type === "bonus").reduce((s, t) => s + Number(t.amount), 0);
  const debits  = transactions.filter(t => t.type === "debit").reduce((s, t) => s + Number(t.amount), 0);

  const today = new Date(new Date().setHours(0,0,0,0));
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const todayEarned = transactions.filter(t => t.type === "credit" && new Date(t.createdAt) >= today).reduce((s, t) => s + Number(t.amount), 0);
  const weekEarned  = transactions.filter(t => t.type === "credit" && new Date(t.createdAt) >= weekAgo).reduce((s, t) => s + Number(t.amount), 0);

  if (!config.features.wallet) {
    return (
      <div className="bg-gray-50 md:bg-transparent">
        <PageHeader title={T("wallet")} subtitle={T("earningsPayoutsShort")} />
        <div className="px-4 py-8 text-center">
          <div className="bg-white rounded-3xl p-10 shadow-sm max-w-sm mx-auto">
            <div className="text-5xl mb-4">🔒</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Wallet Disabled</h3>
            <p className="text-sm text-gray-500">Admin ne wallet feature abhi band ki hui hai. Jald hi wapas aayega!</p>
          </div>
        </div>
      </div>
    );
  }

  const handlePullRefresh = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["vendor-wallet"] }),
      qc.invalidateQueries({ queryKey: ["vendor-stats"] }),
    ]);
  }, [qc]);

  return (
    <ErrorBoundary fallback={(reset) => (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-gray-50">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Wallet section failed to load</h2>
        <p className="text-gray-500 text-sm mb-5">An unexpected error occurred. Tap retry to reload this section.</p>
        <button onClick={reset} className="px-5 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700">Retry</button>
      </div>
    )}>
    <PullToRefresh onRefresh={handlePullRefresh} className="min-h-screen bg-gray-50 md:bg-transparent">
      <PageHeader
        title={T("wallet")}
        subtitle={T("earningsPayoutsShort")}
        actions={
          <button onClick={() => refetch()}
            className="h-9 px-4 bg-white/20 md:bg-gray-100 md:text-gray-700 text-white text-sm font-bold rounded-xl android-press min-h-0">
            ↻ Refresh
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4 md:px-0 md:py-4">
        {/* ── Balance Hero Card ── */}
        <div className="bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
          <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full"/>
          <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-white/10 rounded-full"/>
          <div className="relative">
            <p className="text-sm text-orange-100 font-semibold">{T("availableBalance")}</p>
            <p className={`text-5xl font-extrabold mt-1 tracking-tight ${balance < 0 ? "text-red-200" : ""}`}>{fc(balance, currencySymbol)}</p>
            <p className="text-xs text-orange-200 mt-2">{vendorKeepPct}% → {T("wallet")} · {commissionPct}% {T("platformFeeLabel")}</p>
            <div className="flex gap-3 mt-4">
              {withdrawalEnabled ? (
                balance >= minPayout ? (
                  <button onClick={() => setShowWithdraw(true)}
                    className="flex-1 h-12 bg-white text-orange-500 font-extrabold rounded-2xl android-press text-sm flex items-center justify-center gap-2 shadow-md">
                    💸 {T("withdraw")}
                  </button>
                ) : (
                  <div className="flex-1 h-12 bg-white/30 rounded-2xl flex flex-col items-center justify-center text-sm font-bold text-white/80 cursor-not-allowed" title={`Minimum payout: ${fc(minPayout, currencySymbol)}`}>
                    <span>💸 {T("minWithdrawalLabel")}: {fc(minPayout, currencySymbol)}</span>
                  </div>
                )
              ) : (
                <div className="flex-1 h-12 bg-white/30 rounded-2xl flex items-center justify-center text-sm font-bold text-white/80 cursor-not-allowed">
                  🔒 {T("withdrawalsPaused")}
                </div>
              )}
              <button onClick={() => setShowDeposit(true)}
                className="flex-1 h-12 bg-white/20 text-white font-extrabold rounded-2xl android-press text-sm flex items-center justify-center gap-2 border border-white/30 hover:bg-white/30">
                💳 Deposit
              </button>
            </div>
          </div>
        </div>

        {/* ── Earnings Stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: T("earnedToday"),    value: fc(todayEarned, currencySymbol), icon: "☀️", color: "bg-amber-50" },
            { label: T("earnedThisWeek"), value: fc(weekEarned, currencySymbol),  icon: "📅", color: "bg-blue-50"  },
            { label: T("totalCredits"),   value: fc(credits, currencySymbol),     icon: "💰", color: "bg-green-50" },
          ].map(s => (
            <div key={s.label} className={`${s.color} rounded-2xl p-3 text-center`}>
              <p className="text-xl">{s.icon}</p>
              <p className="text-base font-extrabold text-gray-800 mt-1 leading-tight">{s.value}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 font-medium leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Withdrawal Disabled Banner ── */}
        {!withdrawalEnabled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
            <span className="text-2xl flex-shrink-0">🚫</span>
            <div>
              <p className="text-sm font-bold text-red-800">{T("withdrawalsPaused")}</p>
              <p className="text-xs text-red-600 mt-0.5 leading-relaxed">{T("withdrawalsDisabled")}</p>
            </div>
          </div>
        )}

        {/* ── Daily Settlement Summary ── */}
        {data?.dailySettlement && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
            <p className="text-sm font-bold text-green-800 mb-3">📊 Today's Settlement — {data.dailySettlement.date}</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Gross Credits", value: fc(data.dailySettlement.grossCredits, currencySymbol), color: "text-green-700" },
                { label: `Commission (${data.commissionPct ?? commissionPct}%)`, value: `−${fc(data.dailySettlement.commissionDeducted, currencySymbol)}`, color: "text-red-500" },
                { label: "Net Payout", value: fc(data.dailySettlement.netPayout, currencySymbol), color: "text-green-800 font-extrabold" },
                { label: "Transactions", value: String(data.dailySettlement.transactionCount), color: "text-gray-700" },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl p-2.5">
                  <p className="text-[10px] text-gray-400 font-medium">{s.label}</p>
                  <p className={`text-sm font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Settlement Info ── */}
        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex gap-3">
          <span className="text-2xl flex-shrink-0">📅</span>
          <div>
            <p className="text-sm font-bold text-amber-800">{T("settlementCycle")}</p>
            <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">Earnings are settled every <strong>{settleDays} days</strong> after order completion. Min. withdrawal is <strong>{fc(minPayout, currencySymbol)}</strong>{maxPayout != null ? <> · Max. <strong>{fc(maxPayout, currencySymbol)}</strong> per request</> : " · No maximum limit set by admin"}.</p>
          </div>
        </div>
        {/* ── Last Updated ── */}
        {dataUpdatedAt > 0 && (
          <div className="flex items-center justify-between px-1">
            <p className="text-xs text-gray-400">
              Last updated: <span className="font-semibold text-gray-500">{new Date(dataUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </p>
            <button onClick={() => refetch()} className="text-xs font-bold text-orange-500 hover:text-orange-600">↻ Refresh</button>
          </div>
        )}

        {/* ── Payout Schedule ── */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">📅</span>
            <p className="text-sm font-bold text-green-800">Payout Schedule</p>
          </div>
          <div className="space-y-1.5 text-xs text-green-700">
            <div className="flex justify-between">
              <span>Settlement cycle</span>
              <span className="font-bold">Every {settleDays} day{settleDays !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex justify-between">
              <span>Min. withdrawal</span>
              <span className="font-bold">{fc(minPayout, currencySymbol)}</span>
            </div>
            {maxPayout != null && (
              <div className="flex justify-between">
                <span>Max. per request</span>
                <span className="font-bold">{fc(maxPayout, currencySymbol)}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span>Processing time</span>
              <span className="font-bold">{processingText}</span>
            </div>
          </div>
          {(data?.commissionPct ?? commissionPct) > 0 && (
            <div className="mt-3 pt-2.5 border-t border-green-200">
              <p className="text-[11px] text-green-600 leading-relaxed">
                💡 <strong>Tax note:</strong> Platform fees ({data?.commissionPct ?? commissionPct}%) are deducted from each order at settlement. Vendors are responsible for filing their own income tax returns as required by local law.
              </p>
            </div>
          )}
        </div>

        {/* ── Withdrawal Info ── */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
          <span className="text-2xl flex-shrink-0">🔒</span>
          <div>
            <p className="text-sm font-bold text-blue-800">{T("secureWithdrawals")}</p>
            <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">All withdrawal requests are reviewed by admin. Funds transferred within {processingText}. Min: {fc(minPayout, currencySymbol)}{maxPayout != null ? ` – Max: ${fc(maxPayout, currencySymbol)} per request` : " · No maximum limit configured"}.</p>
          </div>
        </div>

        {/* ── Transaction History ── */}
        <div className={CARD}>
          <div className={CARD_HEADER}>
            <div>
              <p className="font-bold text-gray-800 text-sm">{T("transactionHistory")}</p>
              <p className="text-xs text-gray-400 mt-0.5">{transactions.length} records · Total debits: {fc(debits, currencySymbol)}</p>
            </div>
            <span className="text-xs text-gray-400 font-medium">50</span>
          </div>

          {isError ? (
            <div className="px-4 py-10 text-center">
              <p className="text-3xl mb-2">⚠️</p>
              <p className="font-bold text-gray-700 text-sm">Could not load transactions</p>
              <p className="text-xs text-gray-400 mt-1 mb-3">Check your connection and try again</p>
              <button onClick={() => refetch()} className="h-9 px-6 bg-orange-500 text-white font-bold rounded-xl text-sm">Retry</button>
            </div>
          ) : isLoading ? (
            <div className="p-4 space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-16 skeleton rounded-xl"/>)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <p className="text-4xl mb-3">💳</p>
              <p className="font-bold text-gray-600">{T("noTransactionsFilter")}</p>
              <p className="text-sm text-gray-400 mt-1">{T("noTransactionsYet")}</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {transactions.map((t: any) => (
                <div key={t.id} className="px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg ${t.type === "credit" || t.type === "bonus" ? "bg-green-50" : "bg-red-50"}`}>
                      {t.type === "credit" ? "💰" : t.type === "bonus" ? "🎁" : "💸"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">{t.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fd(t.createdAt)}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className={`text-base font-extrabold ${t.type === "credit" || t.type === "bonus" ? "text-green-600" : "text-red-500"}`}>
                        {t.type === "debit" ? "-" : "+"}{fc(Number(t.amount), currencySymbol)}
                      </p>
                      <div className="mt-0.5">{txBadge(t.type)}</div>
                    </div>
                  </div>
                  {/* Fee breakdown for order credit transactions */}
                  {t.commissionDeducted > 0 && (
                    <div className="ml-13 mt-1.5 pl-12 space-y-0.5">
                      <div className="flex justify-between text-[10px] text-gray-400">
                        <span>Gross order value</span>
                        <span>{fc(t.grossAmount ?? (t.amount + t.commissionDeducted), currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-red-400">
                        <span>Platform fee ({data?.commissionPct ?? commissionPct}%)</span>
                        <span>−{fc(t.commissionDeducted, currencySymbol)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-green-600 font-semibold">
                        <span>Your share</span>
                        <span>{fc(t.netPayout, currencySymbol)}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Security Notice ── */}
        <div className="bg-gray-100 rounded-2xl p-4">
          <p className="text-xs text-gray-500 font-medium text-center leading-relaxed">
            🔐 All wallet transactions are encrypted and audited. If you see any unauthorized activity, contact <span className="font-bold text-orange-500">{config.platform.appName} Admin</span> immediately.
          </p>
        </div>
      </div>

      {showWithdraw && withdrawalEnabled && (
        <WithdrawModal
          balance={balance}
          minPayout={minPayout}
          maxPayout={maxPayout}
          defaultBank={user?.bankName}
          defaultAcNo={user?.bankAccount}
          defaultAcName={user?.bankAccountTitle}
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["vendor-wallet"] });
            refreshUser();
            showToast(`✅ ${T("withdrawalSubmitted")}`);
          }}
        />
      )}
      {showDeposit && (
        <DepositModal
          onClose={() => setShowDeposit(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["vendor-wallet"] });
            showToast("✅ Deposit request submitted! Admin will verify within 24–48 hours.");
          }}
        />
      )}

      {toast && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center toast-in"
          style={{ paddingTop: "calc(env(safe-area-inset-top,0px) + 8px)", paddingLeft: "16px", paddingRight: "16px" }}>
          <div className="bg-gray-900 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-2xl max-w-sm w-full text-center">{toast}</div>
        </div>
      )}
    </PullToRefresh>
    </ErrorBoundary>
  );
}
