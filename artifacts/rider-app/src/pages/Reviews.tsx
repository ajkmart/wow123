import { useQuery } from "@tanstack/react-query";
import { Star, ArrowLeft, Package, Bike, MessageSquare } from "lucide-react";
import { Link } from "wouter";
import { api } from "../lib/api";
import { usePlatformConfig, formatDateTz } from "../lib/useConfig";

interface Review {
  id: string;
  rating: number;
  comment?: string | null;
  customerName?: string | null;
  createdAt: string;
  orderId?: string | null;
  rideId?: string | null;
  orderType?: string | null;
}

interface ReviewsData {
  reviews: Review[];
  avgRating?: number;
  total?: number;
}

function StarRow({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          size={size}
          className={i <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}
        />
      ))}
    </span>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-3xl border border-gray-100 p-4 animate-pulse space-y-3">
      <div className="flex items-center justify-between">
        <div className="h-3.5 bg-gray-200 rounded-full w-24" />
        <div className="h-3 bg-gray-100 rounded-full w-16" />
      </div>
      <div className="flex gap-1">
        {[1,2,3,4,5].map(i => <div key={i} className="w-3.5 h-3.5 bg-gray-200 rounded-full" />)}
      </div>
      <div className="h-3 bg-gray-100 rounded-full w-3/4" />
    </div>
  );
}

export default function Reviews() {
  const { config } = usePlatformConfig();
  const tz = config.regional?.timezone ?? "Asia/Karachi";

  const { data, isLoading, isError, refetch } = useQuery<ReviewsData>({
    queryKey: ["rider-my-reviews-full"],
    queryFn: () => api.getMyReviews(),
    staleTime: 60_000,
  });

  const reviews: Review[] = data?.reviews ?? [];
  const avgRating: number = data?.avgRating ?? 0;
  const totalReviews: number = data?.total ?? reviews.length;

  function formatDate(d: string) {
    return formatDateTz(d, { day: "numeric", month: "short", year: "numeric" }, tz);
  }

  return (
    <div className="min-h-screen bg-[#F5F6F8]">
      <div
        className="bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 px-5 pb-8 rounded-b-[2rem] relative overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 3.5rem)" }}
      >
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-amber-400/[0.04]" />
        <div className="absolute bottom-10 -left-16 w-56 h-56 rounded-full bg-white/[0.02]" />
        <div className="relative flex items-center gap-3 mb-5">
          <Link href="/profile" className="w-10 h-10 flex items-center justify-center bg-white/[0.07] border border-white/[0.07] rounded-xl text-white/70 hover:bg-white/[0.12] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-white/40 text-xs font-semibold tracking-widest uppercase mb-0.5">Customer Feedback</p>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">My Reviews</h1>
          </div>
        </div>

        {!isLoading && !isError && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]">
              <p className="text-lg font-extrabold text-white">{avgRating > 0 ? avgRating.toFixed(1) : "—"}</p>
              <p className="text-[9px] text-white/30 font-semibold mt-0.5 uppercase tracking-wider">Avg Rating</p>
            </div>
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]">
              <p className="text-lg font-extrabold text-white">{totalReviews}</p>
              <p className="text-[9px] text-white/30 font-semibold mt-0.5 uppercase tracking-wider">Total Reviews</p>
            </div>
            <div className="bg-white/[0.06] backdrop-blur-sm rounded-2xl p-3 text-center border border-white/[0.06]">
              <p className="text-lg font-extrabold text-amber-400">
                {reviews.filter(r => r.rating >= 4).length}
              </p>
              <p className="text-[9px] text-white/30 font-semibold mt-0.5 uppercase tracking-wider">Positive</p>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pt-4 pb-8 space-y-3">
        {isLoading ? (
          [1, 2, 3, 4].map(i => <SkeletonCard key={i} />)
        ) : isError ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-3">
              <MessageSquare size={28} className="text-red-300" />
            </div>
            <p className="font-bold text-gray-700 text-base">Could not load reviews</p>
            <p className="text-gray-400 text-sm mt-1">Check your connection and try again.</p>
            <button
              onClick={() => refetch()}
              className="mt-4 px-5 py-2.5 bg-gray-900 text-white text-sm font-bold rounded-full active:bg-gray-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center mx-auto mb-3">
              <Star size={28} className="text-amber-300" />
            </div>
            <p className="font-bold text-gray-700 text-base">No reviews yet</p>
            <p className="text-gray-400 text-sm mt-1">Complete deliveries and rides to earn your first review.</p>
          </div>
        ) : (
          reviews.map(review => (
            <div key={review.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <StarRow rating={review.rating} size={15} />
                  <p className="text-xs text-gray-500 font-medium">
                    {review.customerName ? review.customerName : "Customer"}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${
                    review.rideId
                      ? "bg-green-50 text-green-700"
                      : "bg-blue-50 text-blue-700"
                  }`}>
                    {review.rideId
                      ? <><Bike size={10}/> Ride</>
                      : <><Package size={10}/> {review.orderType ?? "Order"}</>
                    }
                  </span>
                  {(review.orderId || review.rideId) && (
                    <p className="text-[10px] font-mono text-gray-400 mt-1 truncate max-w-[120px]">
                      #{(review.orderId ?? review.rideId ?? "").slice(-8).toUpperCase()}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(review.createdAt)}</p>
                </div>
              </div>

              {review.comment && review.comment.trim() && (
                <div className="bg-gray-50 rounded-2xl px-3.5 py-2.5">
                  <p className="text-sm text-gray-600 leading-relaxed italic">"{review.comment.trim()}"</p>
                </div>
              )}

              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full ${i <= Math.round(review.rating) ? "bg-amber-400" : "bg-gray-100"}`}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
