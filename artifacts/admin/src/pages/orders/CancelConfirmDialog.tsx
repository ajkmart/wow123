import { AlertTriangle } from "lucide-react";
import { formatCurrency } from "@/lib/format";

interface CancelConfirmDialogProps {
  order: any;
  cancelling: boolean;
  onCancel: () => void;
  onBack: () => void;
}

export function CancelConfirmDialog({ order, cancelling, onCancel, onBack }: CancelConfirmDialogProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3" role="alertdialog" aria-label="Cancel order confirmation">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" aria-hidden="true" />
        <p className="text-sm font-bold text-red-700">Cancel Order #{order.id.slice(-6).toUpperCase()}?</p>
      </div>
      <p className="text-xs text-red-600">
        {order.paymentMethod === "wallet"
          ? `${formatCurrency(Math.round(order.total))} will be refunded to the customer's wallet.`
          : "Cash order — no wallet refund needed."}
      </p>
      <div className="flex gap-2">
        <button onClick={onBack}
          className="flex-1 h-9 bg-white border border-red-200 text-red-600 text-sm font-bold rounded-xl min-h-[36px]">
          Back
        </button>
        <button onClick={onCancel} disabled={cancelling}
          className="flex-1 h-9 bg-red-600 text-white text-sm font-bold rounded-xl disabled:opacity-60 min-h-[36px]">
          {cancelling ? "Cancelling..." : "Confirm Cancel"}
        </button>
      </div>
    </div>
  );
}
