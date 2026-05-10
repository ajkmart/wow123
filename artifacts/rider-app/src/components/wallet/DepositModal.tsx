import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { formatCurrency as _sharedFcD } from "@workspace/api-zod";
import { api, apiFetch } from "../../lib/api";
import { riderIsDev } from "../../lib/envValidation";
import { checkSufficientBalance } from "../../lib/wallet/validation";
import {
  X, ArrowLeft, Landmark, Smartphone, ChevronRight,
  CheckCircle, AlertTriangle, Loader2,
} from "lucide-react";
import type { PayMethod } from "./WithdrawModal";
import { useCurrency } from "../../lib/useConfig";
const INPUT = "w-full h-12 px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-teal-400 focus:bg-white transition-colors";

function MethodLogo({ id }: { id: string }) {
  if (id === "jazzcash")  return <Smartphone size={28} className="text-red-500"/>;
  if (id === "easypaisa") return <Smartphone size={28} className="text-green-500"/>;
  return <Landmark size={28} className="text-blue-500"/>;
}

export default function DepositModal({
  minBalance, balance, onClose, onSuccess,
}: {
  minBalance: number; balance: number; onClose: () => void; onSuccess: () => void;
}) {
  const { symbol: currencySymbol } = useCurrency();
  const fc = (n: string | number | null | undefined) => _sharedFcD(n != null ? String(n) : (n as null | undefined), currencySymbol);
  const [amount, setAmount]         = useState("");
  const [selectedMethod, setMethod] = useState<PayMethod | null>(null);
  const [txId, setTxId]             = useState("");
  const [senderAcNo, setSenderAcNo] = useState("");
  const [note, setNote]             = useState("");
  const [step, setStep]             = useState<"amount"|"method"|"details"|"confirm"|"done">("amount");
  const [err, setErr]               = useState("");
  const [methods, setMethods]       = useState<PayMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(true);
  const [methodsError, setMethodsError] = useState(false);

  useEffect(() => {
    type ApiMethod = { id: string; label?: string; logo?: string; description?: string; manualNumber?: string; iban?: string };
    apiFetch("/payments/methods").then((data: { methods?: ApiMethod[] }) => {
      const depositable: PayMethod[] = (data.methods || [])
        .filter(m => ["jazzcash","easypaisa","bank"].includes(m.id))
        .map(m => ({ ...m, label: m.label ?? m.id, logo: m.logo ?? m.id }));
      if (depositable.length === 0) {
        setMethodsError(true);
      } else {
        setMethods(depositable);
      }
    }).catch((err: Error) => {
      if (riderIsDev) console.warn("[DepositModal] Failed to load payment methods:", err.message);
      setMethodsError(true);
    }).finally(() => setLoadingMethods(false));
  }, []);

  const suggestAmt = minBalance > balance ? Math.ceil(minBalance - balance + 50) : 500;

  const mut = useMutation({
    mutationFn: () => api.submitDeposit({
      amount: Number(amount),
      paymentMethod: selectedMethod?.id ?? "",
      accountNumber: senderAcNo.trim() || undefined,
      transactionId: txId,
      note,
    }),
    onSuccess: () => setStep("done"),
    onError: (e: Error) => setErr(e.message),
  });

  const goToMethod = () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt < 100) { setErr(`Minimum deposit ${currencySymbol} 100 hai`); return; }
    /* If the rider's balance is below the minimum operating threshold, ensure
       this deposit is large enough to cover the shortfall — using the same
       library guard that WithdrawModal uses to prevent overdrafts. */
    const shortfall = Math.max(0, minBalance - balance);
    if (shortfall > 0) {
      const gapCheck = checkSufficientBalance(amt, shortfall);
      if (!gapCheck.valid) {
        setErr(`Please deposit at least ${fc(shortfall)} to cover your minimum balance requirement`);
        return;
      }
    }
    setErr(""); setStep("method");
  };

  const goToDetails = (m: PayMethod) => { setMethod(m); setTxId(""); setNote(""); setErr(""); setStep("details"); };

  const goToConfirm = () => {
    if (!txId.trim()) { setErr("Transaction ID daalna zaroori hai — without ID verify nahi ho sakta"); return; }
    if (!senderAcNo.trim()) { setErr("Sender account / mobile number zaroori hai — admin verify karne ke liye chahiye"); return; }
    if (selectedMethod?.id === "jazzcash" || selectedMethod?.id === "easypaisa") {
      const cleanPhone = senderAcNo.replace(/[\s-]/g, "");
      if (!/^0[3]\d{9}$/.test(cleanPhone)) { setErr("Valid Pakistani mobile number daalen (e.g. 03XX-XXXXXXX, 11 digits)"); return; }
    }
    if (selectedMethod?.id === "bank") {
      const cleaned = senderAcNo.replace(/[\s-]/g, "");
      const isIban = /^PK\d{2}[A-Z]{4}\d{16}$/i.test(cleaned);
      const isAccountNo = /^\d{8,20}$/.test(cleaned);
      if (!isIban && !isAccountNo) { setErr("Valid IBAN (e.g. PK36SCBL0000001234567801) ya 8-20 digit account number daalen"); return; }
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
              {STEP_LABELS.map((_,i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= stepIdx ? "bg-teal-500" : "bg-gray-100"}`}/>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-1 text-right">Step {stepIdx+1}/{STEP_LABELS.length}</p>
          </div>
        )}
        <div className="overflow-y-auto flex-1">

          {/* DONE */}
          {step === "done" && (
            <div className="p-8 text-center">
              <div className="w-24 h-24 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle size={52} className="text-teal-500"/>
              </div>
              <h3 className="text-2xl font-extrabold text-gray-800">Deposit Submitted!</h3>
              <p className="text-gray-500 mt-2 text-sm">Admin 24 hours mein verify karke wallet credit karega.</p>
              <div className="mt-5 bg-teal-50 rounded-2xl p-5 text-left space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Method</span>
                  <span className="font-bold flex items-center gap-1.5"><MethodLogo id={selectedMethod?.id ?? ""}/> {selectedMethod?.label}</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Tx ID</span><span className="font-bold font-mono">{txId}</span></div>
                <div className="flex justify-between items-center pt-2 border-t border-teal-100">
                  <span className="text-gray-600 font-semibold">Amount</span>
                  <span className="text-2xl font-extrabold text-teal-600">{fc(Number(amount))}</span>
                </div>
              </div>
              <button onClick={() => { onSuccess(); onClose(); }} className="mt-5 w-full h-14 bg-teal-600 text-white font-extrabold rounded-2xl flex items-center justify-center gap-2">
                <CheckCircle size={20}/> Done
              </button>
            </div>
          )}

          {/* AMOUNT STEP */}
          {step === "amount" && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-extrabold text-gray-800">Wallet Deposit</h3>
                <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500"><X size={18}/></button>
              </div>
              {minBalance > balance && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={14} className="text-amber-500"/>
                    <p className="text-xs font-bold text-amber-700">Balance Kam Hai</p>
                  </div>
                  <p className="text-xs text-amber-600">Cash orders ke liye minimum <strong>{fc(minBalance)}</strong> chahiye. Abhi <strong>{fc(balance)}</strong> hai.</p>
                  <p className="text-xs text-amber-600 mt-0.5">Suggested deposit: <strong>{fc(suggestAmt)}</strong></p>
                </div>
              )}
              <p className="text-sm text-gray-600 mb-4">Kitna deposit karna chahte hain?</p>
              <div className="relative mb-2">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">{currencySymbol}</span>
                <input
                  value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric" placeholder="0"
                  className={`${INPUT} pl-12 text-2xl font-extrabold`}
                />
              </div>
              <div className="flex gap-2 mb-4">
                {[suggestAmt, 1000, 2000, 5000].filter((v,i,arr) => arr.indexOf(v) === i).map(v => (
                  <button key={v} onClick={() => setAmount(String(v))} className="flex-1 bg-gray-100 rounded-xl py-2 text-xs font-bold text-gray-700 active:bg-teal-100 active:text-teal-700">{fc(v)}</button>
                ))}
              </div>
              {err && <div className="bg-red-50 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400"/><p className="text-red-500 text-sm font-semibold">{err}</p></div>}
              <button onClick={goToMethod} className="w-full h-14 bg-teal-600 text-white font-extrabold rounded-2xl mt-1 flex items-center justify-center gap-2">
                Next: Payment Method <ChevronRight size={18}/>
              </button>
            </div>
          )}

          {/* METHOD STEP */}
          {step === "method" && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-extrabold text-gray-800">Payment Method</h3>
                <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500"><X size={18}/></button>
              </div>
              <div className="bg-teal-50 rounded-2xl px-4 py-3 mb-5">
                <p className="text-xs text-teal-600 font-medium">Deposit Amount</p>
                <p className="text-3xl font-extrabold text-teal-700">{fc(Number(amount))}</p>
              </div>
              <p className="text-sm text-gray-600 mb-3">Kahan se deposit karein?</p>
              {loadingMethods ? (
                <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse"/>)}</div>
              ) : methodsError ? (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-center">
                  <AlertTriangle size={28} className="text-red-400 mx-auto mb-2"/>
                  <p className="text-sm font-bold text-red-700">Payment methods unavailable</p>
                  <p className="text-xs text-red-500 mt-1">Admin ne koi payment method enable nahi ki hai. Contact support.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {methods.map(m => (
                    <button key={m.id} onClick={() => goToDetails(m)}
                      className="w-full text-left bg-gray-50 border-2 border-gray-200 rounded-2xl p-4 flex items-center gap-4 hover:border-teal-400 hover:bg-teal-50 active:scale-[0.98] transition-all">
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm flex-shrink-0"><MethodLogo id={m.id}/></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-extrabold text-gray-800">{m.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{m.description || m.label + " se deposit karein"}</p>
                        {(m.manualNumber || m.iban) && (
                          <p className="text-xs text-teal-600 font-semibold mt-1">{m.manualNumber || m.iban}</p>
                        )}
                      </div>
                      <ChevronRight size={20} className="text-gray-400"/>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setStep("amount")} className="mt-4 w-full text-center text-sm text-gray-500 font-medium py-2 flex items-center justify-center gap-1"><ArrowLeft size={14}/> Back</button>
            </div>
          )}

          {/* DETAILS STEP */}
          {step === "details" && selectedMethod && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-extrabold text-gray-800 flex items-center gap-2">
                  <MethodLogo id={selectedMethod.id}/> {selectedMethod.label}
                </h3>
                <button onClick={onClose} className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500"><X size={18}/></button>
              </div>
              <div className="bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-4">
                <p className="text-xs text-teal-600 font-bold mb-2">Company Account Details:</p>
                {selectedMethod.manualNumber && (
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-teal-700">Account Number</span>
                    <span className="text-sm font-extrabold text-teal-800 font-mono">{selectedMethod.manualNumber}</span>
                  </div>
                )}
                {selectedMethod.manualName && (
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-teal-700">Account Title</span>
                    <span className="text-sm font-bold text-teal-800">{selectedMethod.manualName}</span>
                  </div>
                )}
                {selectedMethod.iban && (
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-teal-700">IBAN</span>
                    <span className="text-xs font-extrabold text-teal-800 font-mono break-all">{selectedMethod.iban}</span>
                  </div>
                )}
                {selectedMethod.accountTitle && (
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-teal-700">Account Title</span>
                    <span className="text-sm font-bold text-teal-800">{selectedMethod.accountTitle}</span>
                  </div>
                )}
                {selectedMethod.accountNumber && (
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-teal-700">Account #</span>
                    <span className="text-sm font-extrabold text-teal-800 font-mono">{selectedMethod.accountNumber}</span>
                  </div>
                )}
                {selectedMethod.bankName && (
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-teal-700">Bank</span>
                    <span className="text-sm font-bold text-teal-800">{selectedMethod.bankName}</span>
                  </div>
                )}
                <div className="border-t border-teal-200 pt-2 mt-2">
                  <p className="text-xs text-teal-700">
                    {selectedMethod.manualInstructions || selectedMethod.instructions ||
                      `${fc(amount)} transfer karein aur Transaction ID yahan daalen.`}
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">
                    {selectedMethod.id === "bank" ? "Your Account / IBAN (Sender)" : "Your Phone No. (Sender)"}
                  </label>
                  <input value={senderAcNo} onChange={e => setSenderAcNo(e.target.value)}
                    placeholder={selectedMethod.id === "bank" ? "Your IBAN / Account No." : "03XX-XXXXXXX"}
                    className={INPUT}/>
                  <p className="text-[10px] text-gray-400 mt-1">Admin verification ke liye (optional but recommended)</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Transaction ID / TxID *</label>
                  <input value={txId} onChange={e => setTxId(e.target.value)} placeholder="e.g. T12345678 ya TxID number" className={INPUT}/>
                  <p className="text-[10px] text-gray-400 mt-1">Without valid TxID deposit verify nahi hogi</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Note (Optional)</label>
                  <input value={note} onChange={e => setNote(e.target.value)} placeholder="Koi aur info..." className={INPUT}/>
                </div>
              </div>
              {err && <div className="bg-red-50 rounded-xl px-4 py-2.5 mt-3 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400"/><p className="text-red-500 text-sm font-semibold">{err}</p></div>}
              <div className="flex gap-3 mt-5">
                <button onClick={() => setStep("method")} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-1.5"><ArrowLeft size={14}/> Back</button>
                <button onClick={goToConfirm} className="flex-[2] bg-teal-600 text-white font-extrabold rounded-2xl py-3 text-sm flex items-center justify-center gap-2">
                  Review <ChevronRight size={16}/>
                </button>
              </div>
            </div>
          )}

          {/* CONFIRM STEP */}
          {step === "confirm" && selectedMethod && (
            <div className="p-6">
              <h3 className="text-xl font-extrabold text-gray-800 mb-1">Confirm Deposit</h3>
              <p className="text-sm text-gray-500 mb-5">Submit se pehle details check karein</p>
              <div className="bg-teal-50 border border-teal-100 rounded-2xl p-5 space-y-3 mb-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500 text-sm">Amount</span>
                  <span className="font-extrabold text-teal-600 text-3xl">{fc(Number(amount))}</span>
                </div>
                <div className="h-px bg-teal-100"/>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Method</span>
                  <span className="font-bold flex items-center gap-1.5"><MethodLogo id={selectedMethod.id}/> {selectedMethod.label}</span>
                </div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">Tx ID</span><span className="font-bold font-mono">{txId}</span></div>
                {note && <div className="flex justify-between text-sm"><span className="text-gray-500">Note</span><span className="font-bold">{note}</span></div>}
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 flex gap-2">
                <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5"/>
                <p className="text-xs text-amber-700 font-medium">Galat TxID se deposit reject ho sakti hai. Real transaction ID daalen.</p>
              </div>
              {err && <div className="bg-red-50 rounded-xl px-4 py-2.5 mb-3 flex items-center gap-2"><AlertTriangle size={14} className="text-red-400"/><p className="text-red-500 text-sm font-semibold">{err}</p></div>}
              <div className="flex gap-3">
                <button onClick={() => { setStep("details"); setErr(""); }} className="flex-1 border-2 border-gray-200 text-gray-600 font-bold rounded-2xl py-3 text-sm flex items-center justify-center gap-1.5"><ArrowLeft size={14}/> Edit</button>
                <button onClick={() => mut.mutate()} disabled={mut.isPending} className="flex-[2] bg-teal-600 text-white font-extrabold rounded-2xl py-3 disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                  {mut.isPending ? <><Loader2 size={16} className="animate-spin"/> Submitting...</> : <><CheckCircle size={16}/> Submit Deposit</>}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
