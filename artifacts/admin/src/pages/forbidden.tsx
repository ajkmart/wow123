import { Link } from "wouter";
import { Lock, Home, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Forbidden() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-red-50/30 px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-500/30 mb-5">
          <Lock className="w-8 h-8 text-white" />
        </div>

        <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-red-500 mb-3">
          403 Forbidden
        </p>

        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 mb-3">
          Access Denied
        </h1>

        <p className="text-sm md:text-[15px] text-slate-500 leading-relaxed mb-8">
          You don't have permission to view this page. Contact a super admin to request access.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/dashboard">
            <Button className="h-11 rounded-xl gap-2 px-6 w-full sm:w-auto">
              <Home className="w-4 h-4" />
              Go to Dashboard
            </Button>
          </Link>
          <Button
            variant="outline"
            className="h-11 rounded-xl gap-2 px-6 w-full sm:w-auto"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}
