import { useState, useEffect } from "react";
import { adminFetch } from "@/lib/adminFetcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { CloudSun, Plus, X, Loader2, Save, MapPin, Wifi, CheckCircle2, XCircle } from "lucide-react";

function useWeatherConfig() {
  return useQuery({
    queryKey: ["admin-weather-config"],
    queryFn: () => adminFetch("/weather-config"),
  });
}

export function WeatherSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useWeatherConfig();

  const [enabled, setEnabled] = useState(true);
  const [cities, setCities] = useState<string[]>([]);
  const [newCity, setNewCity] = useState("");

  useEffect(() => {
    if (data?.config) {
      setEnabled(data.config.widgetEnabled);
      setCities(data.config.cities ? data.config.cities.split(",").map((c: string) => c.trim()).filter(Boolean) : []);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: (body: { widgetEnabled: boolean; cities: string }) =>
      adminFetch("/weather-config", { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-weather-config"] });
      toast({ title: "Weather config saved" });
    },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const addCity = () => {
    const city = newCity.trim();
    if (!city) return;
    if (cities.includes(city)) { toast({ title: "City already exists", variant: "destructive" }); return; }
    setCities(prev => [...prev, city]);
    setNewCity("");
  };

  const removeCity = (city: string) => {
    setCities(prev => prev.filter(c => c !== city));
  };

  const handleSave = () => {
    saveMutation.mutate({ widgetEnabled: enabled, cities: cities.join(",") });
  };

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const city = cities[0];
      const result: any = await adminFetch("/weather-config/test", {
        method: "POST",
        body: JSON.stringify({ city }),
      });
      const ok = result?.ok === true || result?.data?.ok === true;
      const message = result?.message || result?.data?.message || (ok ? "Open-Meteo reachable" : "Test failed");
      setTestResult({ ok, message });
      toast({ title: ok ? "Weather Test ✅" : "Weather Test Failed", description: message, variant: ok ? "default" : "destructive" });
    } catch (e: any) {
      const msg = e?.message || "Failed to reach Open-Meteo";
      setTestResult({ ok: false, message: msg });
      toast({ title: "Weather Test Failed", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CloudSun className="w-5 h-5 text-sky-500" />
          <div>
            <p className="text-sm font-bold">Weather Widget</p>
            <p className="text-xs text-muted-foreground">Toggle the weather widget and manage displayed cities</p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <p className="text-sm font-semibold">Cities ({cities.length})</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {cities.map(city => (
            <Badge key={city} variant="secondary" className="text-sm py-1.5 px-3 gap-1.5">
              {city}
              <button onClick={() => removeCity(city)} className="hover:text-red-600 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          {cities.length === 0 && <p className="text-sm text-muted-foreground">No cities configured</p>}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Add a city..."
            value={newCity}
            onChange={e => setNewCity(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addCity()}
            className="flex-1 rounded-xl"
          />
          <Button variant="outline" size="sm" className="rounded-xl" onClick={addCity} disabled={!newCity.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {testResult && (
        <div className={`rounded-xl px-3 py-2 text-sm flex items-start gap-2 border ${
          testResult.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"
        }`}>
          {testResult.ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || cities.length === 0}
          className="rounded-xl gap-2"
          title={cities.length === 0 ? "Add at least one city first" : "Test Open-Meteo for the first city"}
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
          {testing ? "Testing..." : "Test Connection"}
        </Button>
        <Button onClick={handleSave} disabled={saveMutation.isPending} className="rounded-xl gap-2">
          {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saveMutation.isPending ? "Saving..." : "Save Weather Config"}
        </Button>
      </div>
    </div>
  );
}
