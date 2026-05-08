import { UserCheck, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";

interface RiderAssignPanelProps {
  order: any;
  ridersData: any;
  riderSearch: string;
  setRiderSearch: (v: string) => void;
  showAssignRider: boolean;
  setShowAssignRider: (v: boolean) => void;
  onAssignRider: (rider: any) => void;
  assignPending: boolean;
}

export function RiderAssignPanel({ order, ridersData, riderSearch, setRiderSearch, showAssignRider, setShowAssignRider, onAssignRider, assignPending }: RiderAssignPanelProps) {
  return (
    <section className="bg-green-50 border border-green-100 rounded-xl p-3 space-y-1" aria-label="Rider assignment">
      <h3 className="text-[10px] font-bold text-green-700 uppercase tracking-wide flex items-center gap-1"><UserCheck className="w-3 h-3" aria-hidden="true" /> Rider Assignment</h3>
      {order.riderName ? (
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-800">{order.riderName}</p>
            {order.riderPhone && (
              <a href={`tel:${order.riderPhone}`} className="flex items-center gap-1 text-xs text-green-600 font-medium hover:underline min-h-[36px]" aria-label={`Call rider ${order.riderPhone}`}>
                <Phone className="w-3 h-3" aria-hidden="true" /> {order.riderPhone}
              </a>
            )}
          </div>
          <button onClick={() => { setShowAssignRider(true); setRiderSearch(""); }}
            className="text-xs text-green-700 border border-green-300 bg-white rounded-lg px-2 py-1 hover:bg-green-50 min-h-[36px]"
            aria-label="Change assigned rider">
            Change
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">No rider assigned</span>
          <button onClick={() => { setShowAssignRider(true); setRiderSearch(""); }}
            className="text-xs text-white bg-green-600 hover:bg-green-700 rounded-lg px-3 py-1.5 font-bold min-h-[36px]"
            aria-label="Assign a rider to this order">
            Assign Rider
          </button>
        </div>
      )}

      {showAssignRider && (
        <div className="mt-2 space-y-2">
          <Input placeholder="Search riders..." value={riderSearch} onChange={e => setRiderSearch(e.target.value)}
            className="h-9 rounded-lg text-xs" autoFocus aria-label="Search riders" />
          <div className="max-h-36 overflow-y-auto space-y-1" role="listbox" aria-label="Available riders">
            {(ridersData?.users || [])
              .filter((r: any) => r.isActive && !r.isBanned)
              .filter((r: any) => riderSearch ? ((r.name || r.phone || "").toLowerCase().includes(riderSearch.toLowerCase())) : true)
              .slice(0, 8)
              .map((r: any) => (
                <button key={r.id} onClick={() => onAssignRider(r)} disabled={assignPending}
                  role="option"
                  className="w-full flex items-center gap-2 text-left px-2 py-2 bg-white border border-border/50 rounded-lg hover:bg-green-50 text-xs min-h-[36px]">
                  <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 font-bold text-[10px] flex items-center justify-center shrink-0" aria-hidden="true">
                    {(r.name || r.phone || "R")[0].toUpperCase()}
                  </div>
                  <span className="font-semibold truncate">{r.name || r.phone}</span>
                  <span className="text-muted-foreground ml-auto font-mono shrink-0">{r.vehiclePlate || ""}</span>
                </button>
              ))}
          </div>
          <button onClick={() => setShowAssignRider(false)} className="text-xs text-muted-foreground hover:underline min-h-[36px]">Cancel</button>
        </div>
      )}
    </section>
  );
}
