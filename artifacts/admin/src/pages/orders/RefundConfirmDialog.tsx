import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";

interface RefundConfirmDialogProps {
  order: any;
  refundAmount: string;
  setRefundAmount: (v: string) => void;
  refundReason: string;
  setRefundReason: (v: string) => void;
  isPending: boolean;
  onRefund: () => void;
  onBack: () => void;
}

export function RefundConfirmDialog({ order, refundAmount, setRefundAmount, refundReason, setRefundReason, isPending, onRefund, onBack }: RefundConfirmDialogProps) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3" role="alertdialog" aria-label="Refund order confirmation">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-blue-600 shrink-0" aria-hidden="true" />
        <p className="text-sm font-bold text-blue-700">Issue Wallet Refund</p>
      </div>
      <p className="text-xs text-blue-600">
        Max refundable: {formatCurrency(Math.round(order.total))}.
      </p>
      <div className="flex gap-1.5 mb-1" role="group" aria-label="Quick refund amounts">
        {[25, 50, 75, 100].map(pct => (
          <button key={pct} type="button"
            onClick={() => setRefundAmount(Math.round(order.total * pct / 100).toString())}
            className="flex-1 h-8 text-xs font-bold bg-white border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-100 min-h-[36px]">
            {pct === 100 ? "Full" : `${pct}%`}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        <Input
          type="number"
          min="1"
          max={order.total}
          placeholder={`Amount (required, max ${Math.round(order.total)})`}
          value={refundAmount}
          onChange={e => setRefundAmount(e.target.value)}
          className="h-9 rounded-xl text-sm"
          aria-label="Refund amount"
          required
        />
        <Input
          placeholder="Reason (optional)"
          value={refundReason}
          onChange={e => setRefundReason(e.target.value)}
          className="h-9 rounded-xl text-sm"
          aria-label="Refund reason"
        />
      </div>
      <div className="flex gap-2">
        <button onClick={onBack}
          className="flex-1 h-9 bg-white border border-blue-200 text-blue-600 text-sm font-bold rounded-xl min-h-[36px]">
          Back
        </button>
        <button onClick={onRefund}
          disabled={isPending || !refundAmount || parseFloat(refundAmount) <= 0 || parseFloat(refundAmount) > order.total}
          className="flex-1 h-9 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-60 min-h-[36px]">
          {parseFloat(refundAmount) > order.total ? "Exceeds max" : isPending ? "Processing..." : "Issue Refund"}
        </button>
      </div>
    </div>
  );
}
