import { Link } from "wouter";
import { Shield, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SecuritySection(_props: {
  localValues?: Record<string,string>;
  dirtyKeys?: Set<string>;
  handleChange?: (k: string, v: string) => void;
  handleToggle?: (k: string, v: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-5">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mb-1">
        <Shield className="w-7 h-7 text-red-500" />
      </div>
      <div className="space-y-2 max-w-md">
        <h3 className="text-lg font-bold text-foreground">Security &amp; Access</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Security settings — including login lockouts, blocked IPs, rate limits, GPS controls,
          MFA, fraud detection, and the admin audit log — have been consolidated into the dedicated
          Security Dashboard.
        </p>
      </div>
      <Link href="/security">
        <Button className="gap-2 rounded-xl mt-2" size="lg">
          <ExternalLink className="w-4 h-4" />
          Open Security Dashboard
        </Button>
      </Link>
      <p className="text-xs text-muted-foreground">
        All security configuration is available there with full live data.
      </p>
    </div>
  );
}
