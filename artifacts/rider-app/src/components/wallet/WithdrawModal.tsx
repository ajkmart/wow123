import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatCurrency as _sharedFcW2 } from "@workspace/api-zod";
import { useAuth } from "../../lib/auth";
import { api, apiFetch } from "../../lib/api";
import { riderIsDev } from "../../lib/envValidation";
import { checkSufficientBalance, checkDailyLimits } from "../../lib/wallet/validation";
import { usePlatformConfig } from "../../lib/useConfig";
import { useLanguage } from "../../lib/useLanguage";
import { tDual, type TranslationKey } from "@workspace/i18n";
import {
  X, ArrowLeft, Landmark, Smartphone, ChevronRight,
  CheckCircle, AlertTriangle, Loader2,
} from "lucide-react";

const TRADITIONAL_BANKS = [
  "HBL","MCB","UBL","Meezan Bank","Bank Alfalah","NBP",
  "Allied Bank","Bank Al Habib","Faysal Bank","Askari Bank","Other",
];

export type PayMethod = {
  id: string; label: string; logo: string;
  description?: string; type?: string;
  manualNumber?: string; manualName?: string; manualInstructions?: string;
  iban?: string; accountTitle?: string; accountNumber?: string;
  bankName?: string; instructions?: string;
};

const INPUT  = "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 focus:bg-white transition-colors";
const SELECT = "w-full h-12 px-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 appearance-none";

function MethodLogo({ id }: { id: string }) {
  if (id === "jazzcash")  return <Smartphone size={28} className="text-red-500"/>;
  if (id === "easypaisa") return <Smartphone size={28} className="text-green-500"/>;
  return <Landmark size={28} className="text-blue-500"/>;
}

export default function WithdrawModal({
  balance, minPayout, maxPayout, onClose, onSuccess,
}: {
  balance: number; minPayout: number; maxPayout: number;
  onClose: () => void; onSuccess: () => void;
}) {
  const { config } = usePlatformConfig();
  const { language } = useLanguage();
  const T = (key: TranslationKey) => tDual(key, language);
  const currency = config.platform.currencySymbol ?? "Rs.";
  const fc = (n: string | number | null | undefined) => _sharedFcW2(n != null ? String(n) : (n as null | undefined), currency);

  const [todayWithdrawn, setTodayWithdrawn]         = useState(0);
  const [todayWithdrawCount, setTodayWithdrawCount] = useState(0);

  /* Fetch today's withdrawal totals on mount so checkDailyLimits has real data */
  useEffect(() => {
    api.getWalletPage({ limit: 200 }).then(({ items }) => {
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayWithdrawals = items.filter(
        it => it.type === "withdrawal" && (it.createdAt ?? "").startsWith(todayStr),
      );
      setTodayWithdrawn(todayWithdrawals.reduce((s, it) => s + Number(it.amount), 0));
      setTodayWithdrawCount(todayWithdrawals.length);
    }).catch(() => {});
  }, []);

  const [amount, setAmount]         = useState("");
  const [selectedMethod, setMethod] = useState<PayMethod | null>(null);
  const [acNo, setAcNo]             = useState("");
  const [acName, setAcName]         = useState("");
  const [bankName, setBankName]     = useState("");
  const [note, setNote]             = useState("");
  const [step, setStep]             = useState<"amount"|"method"|"details"|"confirm"|"done">("amount");
  const [err, setErr]               = useState("");
  const [methods, setMethods]       = useState<PayMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const { user } = useAuth();

  const [methodsError, setMethodsError] = useState(false);

  useEffect(() => {
    type ApiMethod = { id: string; label?: string; logo?: string; description?: string; manualNumber?: string; iban?: string; accountTitle?: string; bankName?: string; instructions?: string };
    const FALLBACK: Record<string, Pick<PayMethod, "label" | "description">> = {
      jazzcash:  { label: "JazzCash",      description: "JazzCash mobile wallet transfer" },
      easypaisa: { label: "EasyPaisa",     description: "EasyPaisa account transfer" },
      bank:      { label: "Bank Transfer", description: "IBFT / RAAST bank transfer" },
    };
    apiFetch("/payments/methods").then((data: { methods?: ApiMethod[] }) => {
      const ms: ApiMethod[] = (data.methods || []).filter(m => ["jazzcash","easypaisa","bank"].includes(m.id));
      const enabled: PayMethod[] = ms.map(m => ({
        id: m.id, logo: m.logo ?? m.id,
        label:       m.label       ?? FALLBACK[m.id]?.label       ?? m.id,
        description: m.description ?? FALLBACK[m.id]?.description ?? "",
        manualNumber: m.manualNumber, iban: m.iban,
        accountTitle: m.accountTitle, bankName: m.bankName, instructions: m.instructions,
      }));
      if (enabled.length === 0) {
        setMethodsError(true);
      } else {
        setMethods(enabled);
      }
    }).catch((err: Error) => {
      if (riderIsDev) console.warn("[WithdrawModal] Failed to load payment methods:", err.message);
      setMethodsError(true);
    }).finally(() => setLoadingMethods(false));
  }, []);

  const mut = useMutation({
    mutationFn: async () => {
      const m = selectedMethod!;
      /* W1: Re-fetch wallet + min-balance immediately before the request leaves
         the device. Another tab (or a manual server-side adjustment) may have
         changed the balance between modal open and submit; relying on the
         captured `balance`/`minPayout` props lets the rider submit a request
         the server will reject. We bail with a translated error rather than
         showing the raw 4xx, and recompute the cap consistently with the
         modal's existing `amt > balance` guard. */
      const amt = Number(amount);
      try {
        const [wallet, minBal] = await Promise.all([api.getWallet(), api.getMinBalance()]);
        const w = wallet as { balance?: number | string } | null | undefined;
        const liveBalance = Number(w?.balance ?? balance);
        const liveMin = Number(minBal ?? minPayout);
        if (amt < liveMin) {
          throw new Error(`${T("minWithdrawalLabel")}: ${fc(liveMin)}`);
        }
        if (amt > liveBalance - liveMin) {
          /* Reject if the request would drop us below the platform min-balance. */
          throw new Error(T("enterValidAmount"));
        }
        if (amt > liveBalance) {
          throw new Error(T("enterValidAmount"));
        }
      } catch (preflightErr) {
        /* If the preflight fetch itself fails (offline, 5xx) we let the
           withdraw submit go through — the server is the source of truth and
           refusing here would block legitimate withdrawals on flaky networks.
           But if the preflight surfaced a real validation error (Error thrown
           above), bubble it up to onError. */
        if (preflightErr instanceof Error && /label|valid/i.test(preflightErr.message)) {
          throw preflightErr;
        }
        /* Otherwise swallow the preflight failure and proceed. */
      }
      return api.withdrawWallet({
        amount: amt,
        bankName: m.id === "bank" ? bankName : m.id,
        accountNumber: acNo, accountTitle: acName,
        paymentMethod: m.id, note,
      });
    },
    onSuccess: () => setStep("done"),
    onError: (e: Error) => setErr(e.message),
  });

  const goToMethod = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) { setErr(T("enterValidAmount")); return; }
    if (amt < minPayout) { setErr(`${T("minWithdrawalLabel")}: ${fc(minPayout)}`); return; }
    if (amt > maxPayout) { setErr(`${T("maxWithdrawalLabel")}: ${fc(maxPayout)}`); return; }
    const balanceCheck = checkSufficientBalance(balance, amt);
    if (!balanceCheck.valid) { setErr(T("enterValidAmount")); return; }
    const walletCfg = config?.wallet ?? {};
    const maxDailyWithdrawal = typeof walletCfg.maxDailyWithdrawal === "number" ? walletCfg.maxDailyWithdrawal : Infinity;
    const maxDailyTransactionCount = typeof walletCfg.maxDailyTransactionCount === "number" ? walletCfg.maxDailyTransactionCount : Infinity;
    if (isFinite(maxDailyWithdrawal) || isFinite(maxDailyTransactionCount)) {
      const limitsCheck = checkDailyLimits(todayWithdrawn, todayWithdrawCount, amt, { maxDailyWithdrawal, maxDailyTransactionCount });
      if (!limitsCheck.valid) { setErr(limitsCheck.reason); return; }
    }
    setErr(""); setStep("method");
  };

  const goToDetails  = (m: PayMethod) => { setMethod(m); setAcNo(""); setAcName(""); setBankName(""); setErr(""); setStep("details"); };
  const goToConfirm  = () => {
    if (!acNo.trim())   { setErr(T("bankAccountRequired")); return; }
    if (!acName.trim()) { setErr(T("bankAccountTitleRequired")); return; }
    if (acName.trim().length < 3) { setErr(T("bankAccountTitleRequired")); return; }
    if (selectedMethod?.id === "bank") {
      if (!bankName) { setErr(T("bankNameRequired")); return; }
      const cleaned = acNo.replace(/[\s-]/g, "");
      const isIban = /^PK\d{2}[A-Z]{4}\d{16}$/i.test(cleaned);
      const isAccountNo = /^\d{8,20}$/.test(cleaned);
      if (!isIban && !isAccountNo) { setErr(T("bankAccountRequired")); return; }
    }
    if (selectedMethod?.id === "jazzcash" || selectedMethod?.id === "easypaisa") {
      const cleanPhone = acNo.replace(/[\s-]/g, "");
      if (!/^0[3]\d{9}$/.test(cleanPhone)) { setErr(T("enterValidPhone")); return; }
    }
    setErr(""); setStep("confirm");
  };

  const STEP_LABELS = ["amount","method","details","confirm"];
  const stepIdx = STEP_LABELS.indexOf(step);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-t-3xl shadow-2xl overflow-hidden max-h-[93vh] flex flex-col" onClick={e => e.stopPropagation()}>

        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-gray-200 rounded-full"/>
        </div>

        {step !== "done" && stepIdx >= 0 && (
          <div className="px-6 pb-3 flex-shrink-0">
            <div className="flex gap-1.5 mt-1">
              {STEP_LABELS.map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= stepIdx ? "bg-green-500" : "bg-gray-100"}`}/>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-right">Step {stepIdx + 1} / {STEP_LABELS.length}</p>
          </div>
        )}

        <div className="overflow-y-auto flex-1">

          {/* DONE */}
          {step === "done" && (
            <div className="p-8 text-center">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={52} className="text-green-500"/>
              </div>
              <h3 className="text-2xl font-extrabold text-gray-800">{T("requestSubmitted")}</h3>
              <p className="text-gray-500 mt-2">
                <span className="font-extrabold text-green-600">{fc(Number(amount))}</span> {T("withdrawalSubmitted")}
              </p>
              <p className="text-sm text-gray-400 mt-1">{T("adminProcess24h")}</p>
              <div className="mt-5 bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-5 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{T("paymentMethod")}</span>
                  <span className="font-bold flex items-center gap-1.5"><MethodLogo id={selectedMethod?.id ?? ""}/> {selectedMethod?.label}</span>
                </div>
                {selectedMethod?.id === "bank" && (
                  <div className="flex justify-between text-sm"><span className="text-gray-500">{T("bankName")}</span><span className="font-bold">{bankName}</span></div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{selectedMethod?.id === "bank" ? T("accountNumber") : T("phone")}</span>
                  <span className="font-bold">{acNo}</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">{T("accountHolderName")}</span><span className="font-bold">{acName}</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-green-100">
                  <span className="text-gray-600 font-semibold">{T("amountLabel")}</span>
                  <span className="text-2xl font-extrabold text-green-600">{fc(Number(amount))}</span>
                </div>
              </div>
              <div className="mt-4 bg-amber-50 border border-amber-100 rounded-xl p-3">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <AlertTriangle size={13} className="flex-shrink-0"/> {T("trackRequestStatus")}
                </p>
              </div>
              <button onClick={() => { onSuccess(); onClose(); }} className="mt-5 w-full h-14 bg-green-600 text-white font-extrabold rounded-2xl text-lg flex items-center justify-center gap-2">
                <CheckCircle size={20}/> {T("done")}
              </button>
            </div>
          )}

          {/* CONFIRM */}
          {step === "confirm" && (
            <div className="p-6">
              <h3 className="text-xl font-extrabold text-gray-800 mb-1">{T("confirmWithdrawal")}</h3>
              <p className="text-sm text-gray-500 mb-5">{T("reviewConfirm")}</p>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100 rounded-2xl p-5 space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">{T("amountLabel")}</span>
                  <span className="font-extrabold text-green-600 text-3xl">{fc(Number(amount))}</span>
                </div>
                <div className="h-px bg-green-100"/>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{T("paymentMethod")}</span>
                  <span className="font-bold flex items-center gap-1.5"><MethodLogo id={selectedMethod?.id ?? ""}/> {selectedMethod?.label}</span>
                </div>
                {selectedMethod?.id === "bank" && <div className="flex justify-between text-sm"><span className="text-gray-500">{T("bankName")}</span><span className="font-bold">{bankName}</span></div>}
                <div className="flex justify-between text-sm"><span className="text-gray-500">{selectedMethod?.id === "bank" ? T("accountNumber") : T("phone")}</span><span className="font-bold font-mono">{acNo}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">{T("accountHolderName")}</span><span className="font-bold">{acName}</span></div>
                {note && <div className="flex justify-between text-sm"><span className="text-gray-500">{T("note")}</span><span className="font-bold">{note}</span></div>}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 flex gap-2">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700 font-medium">{T("wrongAccountWarning")}</p>
              </div>
              {err && <div className="bg-red-50 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400"/><p className="text-red-500 text-sm font-semibold">{err}</p></div>}
              <div className="flex gap-3">
                <button onClick={() => { setStep("details"); setErr(""); }} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-1.5"><ArrowLeft size={14}/> {T("edit")}</button>
                <button onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-[2] bg-green-600 text-white font-extrabold rounded-2xl py-3 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  {mut.isPending ? <><Loader2 size={16} className="animate-spin"/> {T("processing")}</> : <><CheckCircle size={16}/> {T("submitWithdrawal")}</>}
                </button>
              </div>
            </div>
          )}

          {/* DETAILS */}
          {step === "details" && selectedMethod && (
            <div className="p-6">
              <button onClick={() => setStep("method")} className="mb-4 flex items-center gap-1 text-sm text-gray-500 font-semibold"><ArrowLeft size={14}/> {T("back")}</button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <MethodLogo id={selectedMethod.id}/>
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-gray-800">{selectedMethod.label}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">{selectedMethod.description}</p>
                </div>
              </div>

              {user?.bankName && (
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-bold text-blue-700">{T("savedAccount")}</p>
                    <p className="text-xs text-blue-600 mt-0.5">{user.bankName} · {user.bankAccount}</p>
                  </div>
                  <button onClick={() => {
                    setBankName(user.bankName || "");
                    setAcNo(user.bankAccount || "");
                    setAcName(user.bankAccountTitle || "");
                    setErr("");
                  }} className="text-xs font-extrabold text-blue-600 bg-blue-100 px-3 py-1.5 rounded-lg">Use</button>
                </div>
              )}

              <div className="space-y-3">
                {selectedMethod.id === "bank" && (
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{T("bankNameLabel")} *</p>
                    <select value={bankName} onChange={e => { setBankName(e.target.value); setErr(""); }} className={SELECT}>
                      <option value="">{T("selectBank")}</option>
                      {TRADITIONAL_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                    {selectedMethod.id === "bank" ? T("accountNoRequired") : T("phoneRequired")}
                  </p>
                  <input value={acNo} onChange={e => { setAcNo(e.target.value); setErr(""); }}
                    inputMode={selectedMethod.id === "bank" ? "text" : "numeric"}
                    placeholder={selectedMethod.id === "bank" ? "PK36SCBL0000001234567801" : "03XX-XXXXXXX"}
                    className={INPUT}/>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{T("accountTitleRequired")}</p>
                  <input value={acName} onChange={e => { setAcName(e.target.value); setErr(""); }}
                    placeholder={T("accountTitle")} className={INPUT}/>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">{T("noteOptional")}</p>
                  <input value={note} onChange={e => setNote(e.target.value)}
                    placeholder={T("noteOptional")} className={INPUT}/>
                </div>
                {err && <div className="bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400"/><p className="text-red-500 text-sm font-semibold">{err}</p></div>}
                <button onClick={goToConfirm} className="w-full h-14 bg-green-600 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2">
                  {T("reviewAndConfirm")} <ChevronRight size={18}/>
                </button>
              </div>
            </div>
          )}

          {/* METHOD SELECTION */}
          {step === "method" && (
            <div className="p-6">
              <button onClick={() => setStep("amount")} className="mb-4 flex items-center gap-1 text-sm text-gray-500 font-semibold"><ArrowLeft size={14}/> {T("back")}</button>
              <h3 className="text-xl font-extrabold text-gray-800 mb-1">{T("selectMethod")}</h3>
              <p className="text-sm text-gray-500 mb-4">{T("selectPaymentMethod")}</p>
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl px-5 py-4 mb-5 flex items-center justify-between">
                <span className="text-sm font-semibold text-green-200">{T("withdrawalAmount")}</span>
                <span className="text-2xl font-extrabold text-white">{fc(Number(amount))}</span>
              </div>
              {loadingMethods ? (
                <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
              ) : methodsError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                  <AlertTriangle size={28} className="text-red-400 mx-auto mb-2"/>
                  <p className="text-sm font-bold text-red-700">{T("paymentMethodsUnavailable")}</p>
                  <p className="text-xs text-red-500 mt-1">{T("contactSupportForMethods")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {methods.map(m => (
                    <button key={m.id} onClick={() => goToDetails(m)}
                      className="w-full text-left bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 flex items-center gap-4 hover:border-green-400 hover:bg-green-50 active:scale-[0.98] transition-all">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0"><MethodLogo id={m.id}/></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-gray-800">{m.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                      </div>
                      <ChevronRight size={20} className="text-gray-400"/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* AMOUNT */}
          {step === "amount" && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-extrabold text-gray-800">{T("withdrawFunds")}</h3>
                <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500"><X size={18}/></button>
              </div>
              <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl p-5 text-white mb-5">
                <p className="text-sm text-green-200">{T("availableBalance")}</p>
                <p className="text-4xl font-extrabold mt-0.5">{fc(balance)}</p>
                <div className="flex gap-3 mt-3 text-xs text-green-300">
                  <span>Min: {fc(minPayout)}</span>
                  <span>·</span>
                  <span>Max: {fc(maxPayout)}</span>
                </div>
              </div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{T("quickSelect")}</p>
              <div className="flex gap-2 mb-5 flex-wrap">
                {(() => {
                  const cap = Math.min(maxPayout, balance);
                  if (cap < minPayout) return [];
                  const range = cap - minPayout;
                  const step = range > 20000 ? 1000 : 500;
                  const seen = new Set<number>();
                  const amounts: number[] = [];
                  // Sample 4 evenly-spaced points across the range
                  for (let i = 1; i <= 4; i++) {
                    const raw = minPayout + (range * i) / 4;
                    const rounded = Math.round(raw / step) * step;
                    if (rounded >= minPayout && rounded <= cap && !seen.has(rounded)) {
                      seen.add(rounded);
                      amounts.push(rounded);
                    }
                  }
                  // Ensure at least 2 useful options in very narrow ranges
                  if (amounts.length < 2) {
                    const anchor = Math.ceil(minPayout / step) * step;
                    if (anchor >= minPayout && anchor <= cap && !seen.has(anchor)) {
                      amounts.unshift(anchor);
                      seen.add(anchor);
                    }
                  }
                  return amounts;
                })().map(v => (
                  <button key={v} onClick={() => { setAmount(String(v)); setErr(""); }}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${amount === String(v) ? "bg-green-600 text-white border-green-600" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                    {fc(v)}
                  </button>
                ))}
                {balance >= minPayout && (
                  <button onClick={() => { setAmount(String(Math.floor(balance))); setErr(""); }}
                    className={`px-3 py-1.5 rounded-xl text-sm font-bold border transition-all ${amount === String(Math.floor(balance)) ? "bg-green-600 text-white border-green-600" : "bg-green-50 text-green-600 border-green-200"}`}>
                    All ({fc(Math.floor(balance))})
                  </button>
                )}
              </div>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Amount ({currency}) *</p>
                  <input type="number" inputMode="numeric" value={amount}
                    onChange={e => { setAmount(e.target.value); setErr(""); }}
                    placeholder={T("enterAmount")} className={INPUT}/>
                </div>
                {err && <div className="bg-red-50 rounded-xl px-4 py-2.5 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400"/><p className="text-red-500 text-sm font-semibold">{err}</p></div>}
                <button onClick={goToMethod} className="w-full h-14 bg-green-600 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2">
                  {T("selectMethod")} <ChevronRight size={18}/>
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
