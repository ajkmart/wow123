import { useQuery } from "@tanstack/react-query";
import { adminFetch } from "@/lib/adminFetcher";
import { PageHeader } from "@/components/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PullToRefresh } from "@/components/PullToRefresh";
import { Heart, TrendingUp, Package, Loader2 } from "lucide-react";
import { SafeImage } from "@/components/ui/SafeImage";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid,
} from "recharts";

type WishlistProduct = {
  productId: string;
  wishlistCount: number;
  productName: string;
  productImage: string | null;
  productCategory: string;
  productPrice: string;
  productInStock: boolean;
  vendorName: string | null;
};

const CHART_COLORS = [
  "#f43f5e", "#fb7185", "#f9a8d4", "#fda4af", "#fecdd3",
  "#ec4899", "#db2777", "#be185d", "#9d174d", "#831843",
];

function useWishlistAnalytics() {
  return useQuery({
    queryKey: ["admin-wishlist-analytics"],
    queryFn: () => adminFetch("/wishlist-analytics"),
    refetchInterval: 60_000,
  });
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2 text-xs max-w-[180px]">
      <p className="font-bold text-gray-800 mb-0.5 leading-snug">{d?.payload?.fullName}</p>
      <p className="text-pink-600 font-semibold">{d?.value} saves</p>
    </div>
  );
};

export default function WishlistInsights() {
  const { data, isLoading, refetch } = useWishlistAnalytics();
  const products: WishlistProduct[] = data?.products || [];

  const topCount = products.length > 0 ? products[0].wishlistCount : 0;

  const totalWishlists = products.reduce((s, p) => s + p.wishlistCount, 0);
  const outOfStock = products.filter(p => !p.productInStock).length;

  // Top 10 products for bar chart
  const chartData = products.slice(0, 10).map(p => ({
    name: p.productName.length > 16 ? p.productName.slice(0, 14) + "…" : p.productName,
    fullName: p.productName,
    count: p.wishlistCount,
  }));

  return (
    <PullToRefresh onRefresh={async () => { await refetch(); }}>
      <div className="space-y-6">
        <PageHeader
          icon={Heart}
          title="Wishlist Insights"
          subtitle="Products ranked by customer demand — see what users want most"
          iconBgClass="bg-pink-100"
          iconColorClass="text-pink-600"
        />

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-50 flex items-center justify-center">
                <Heart className="w-5 h-5 text-pink-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Unique Products</p>
                <p className="text-xl font-bold">{products.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Wishlist Saves</p>
                <p className="text-xl font-bold">{totalWishlists.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Out of Stock</p>
                <p className="text-xl font-bold">{outOfStock}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Bar chart — most wishlisted */}
        <Card className="rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-pink-50 to-rose-50">
            <Heart className="w-4 h-4 text-pink-500" />
            <span className="font-semibold text-sm text-gray-800">Most Wishlisted Products — Top 10</span>
          </div>
          <CardContent className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-56 animate-pulse">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No wishlist data yet</p>
              </div>
            ) : (
              <>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#fce7f3" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#9ca3af" }}
                        axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={110}
                        tick={{ fontSize: 10, fill: "#374151" }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} cursor={{ fill: "#fff1f2" }} />
                      <Bar dataKey="count" name="Wishlist saves" radius={[0, 6, 6, 0]} barSize={16}
                        label={{ position: "right", fontSize: 10, fill: "#9ca3af" }}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-gray-400 text-right mt-1">
                  Showing top {chartData.length} of {products.length} wishlisted products
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Full ranked table */}
        <Card className="overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-gradient-to-r from-pink-50 to-rose-50">
            <TrendingUp className="w-4 h-4 text-pink-500" />
            <span className="font-semibold text-sm text-gray-800">Full Wishlist Ranking</span>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No wishlist data yet</p>
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <section className="md:hidden divide-y divide-border" aria-label="Wishlist ranking">
                {products.map((p, i) => {
                  const pct = topCount > 0 ? Math.round((p.wishlistCount / topCount) * 100) : 0;
                  return (
                    <div key={p.productId} className="flex items-center gap-3 p-3">
                      <span className="font-bold text-muted-foreground text-sm w-6 text-center shrink-0">{i + 1}</span>
                      {p.productImage ? (
                        <SafeImage src={p.productImage} alt="" className="w-10 h-10 rounded-lg object-cover border shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <Package className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{p.productName}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-[10px]">{p.productCategory}</Badge>
                          <span>{p.vendorName || "—"}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-pink-500 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-pink-600">{p.wishlistCount}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono font-semibold">Rs {Number(p.productPrice).toLocaleString()}</p>
                        <Badge variant="outline" className={`text-[10px] mt-0.5 ${p.productInStock ? "text-green-600 border-green-200 bg-green-50" : "text-red-600 border-red-200 bg-red-50"}`}>
                          {p.productInStock ? "In Stock" : "Out"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </section>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-center">Stock</TableHead>
                      <TableHead className="text-center">Wishlist Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p, i) => {
                      const pct = topCount > 0 ? Math.round((p.wishlistCount / topCount) * 100) : 0;
                      return (
                        <TableRow key={p.productId} className="hover:bg-muted/30">
                          <TableCell className="font-bold text-muted-foreground">{i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {p.productImage ? (
                                <SafeImage src={p.productImage} alt="" className="w-10 h-10 rounded-lg object-cover border" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                                  <Package className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
                                </div>
                              )}
                              <span className="text-sm font-semibold">{p.productName}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{p.productCategory}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{p.vendorName || "—"}</span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            Rs {Number(p.productPrice).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className={p.productInStock
                              ? "text-green-600 border-green-200 bg-green-50"
                              : "text-red-600 border-red-200 bg-red-50"}>
                              {p.productInStock ? "In Stock" : "Out"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center gap-2 justify-center">
                              <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full bg-pink-500 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-sm font-bold text-pink-600">{p.wishlistCount}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>
      </div>
    </PullToRefresh>
  );
}
