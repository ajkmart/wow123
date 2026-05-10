import * as React from "react";
import { X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

interface AdminFormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  busy?: boolean;
  width?: string;
}

export function AdminFormSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  busy = false,
  width = "sm:max-w-lg",
}: AdminFormSheetProps) {
  const handleClose = () => {
    if (!busy) onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) handleClose(); }}>
      <SheetContent
        side="right"
        className={`flex flex-col p-0 gap-0 ${width}`}
      >
        <SheetHeader className="flex-shrink-0 flex flex-row items-start justify-between gap-3 border-b border-border px-6 py-5">
          <div className="flex-1 min-w-0 space-y-1">
            <SheetTitle className="text-base font-bold leading-tight tracking-tight text-foreground">
              {title}
            </SheetTitle>
            {description && (
              <SheetDescription className="text-sm text-muted-foreground leading-snug">
                {description}
              </SheetDescription>
            )}
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label="Close panel"
            className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>

        {footer && (
          <SheetFooter className="flex-shrink-0 border-t border-border px-6 py-4 flex flex-row items-center justify-end gap-2 sm:justify-end sm:space-x-0">
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default AdminFormSheet;
