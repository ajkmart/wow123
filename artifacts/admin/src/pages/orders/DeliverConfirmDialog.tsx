import { CheckCircle2 } from "lucide-react";
import { MobileDrawer } from "@/components/MobileDrawer";

interface DeliverConfirmDialogProps {
  orderId: string;
  isPending: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeliverConfirmDialog({ orderId, isPending, onConfirm, onClose }: DeliverConfirmDialogProps) {
  return (
    <MobileDrawer
      open={true}
      onClose={onClose}
      title={<><CheckCircle2 className="w-5 h-5 text-green-600" aria-hidden="true" /> Confirm Delivery</>}
      dialogClassName="w-[95vw] max-w-sm rounded-3xl"
    >
      <div className="space-y-4 mt-2" role="alertdialog" aria-label="Confirm delivery">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-2">
          <p className="text-sm font-semibold text-green-800">Mark order as Delivered?</p>
          <p className="text-xs text-green-600">This will finalize the order. The customer will be notified that delivery is complete.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-10 bg-white border border-border text-foreground text-sm font-bold rounded-xl hover:bg-muted/50 transition-colors min-h-[36px]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 h-10 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-700 disabled:opacity-60 transition-colors min-h-[36px]"
          >
            {isPending ? "Updating..." : "Confirm Delivered"}
          </button>
        </div>
      </div>
    </MobileDrawer>
  );
}
