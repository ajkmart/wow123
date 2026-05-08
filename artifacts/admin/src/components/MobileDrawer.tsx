import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  dialogClassName?: string;
}

export function MobileDrawer({ open, onClose, title, children, dialogClassName }: MobileDrawerProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={o => { if (!o) onClose(); }} shouldScaleBackground={false}>
        <DrawerContent className="max-h-[90dvh] overflow-y-auto pb-safe">
          {title && (
            <DrawerHeader className="px-4 pt-2 pb-0">
              <DrawerTitle asChild>
                <div className="flex items-center gap-2 text-base font-bold text-foreground">
                  {title}
                </div>
              </DrawerTitle>
            </DrawerHeader>
          )}
          <div className="px-4 pb-6 overflow-y-auto">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className={dialogClassName ?? "w-[95vw] max-w-lg rounded-3xl max-h-[90vh] overflow-y-auto"}>
        {title && (
          <DialogHeader>
            <DialogTitle asChild>
              <div className="flex items-center gap-2 text-foreground">
                {title}
              </div>
            </DialogTitle>
          </DialogHeader>
        )}
        {children}
      </DialogContent>
    </Dialog>
  );
}
