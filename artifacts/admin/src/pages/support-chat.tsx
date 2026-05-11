import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { adminAbsoluteFetch } from "@/lib/adminFetcher";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageCircle, Send, CheckCircle2, Clock, User, RefreshCw,
  ChevronLeft, Search, Circle, CheckCheck, AlertCircle, Headphones,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { io, type Socket } from "socket.io-client";
import { PageHeader } from "@/components/shared";
import { LastUpdated } from "@/components/ui/LastUpdated";


async function apiFetch(path: string, opts: RequestInit = {}) {
  return adminAbsoluteFetch(`/api${path}`, opts);
}

type Conversation = {
  userId: string;
  lastMessage: string;
  lastAt: string;
  totalMessages: number;
  unreadCount: number;
  isResolved: boolean;
};

type ChatMessage = {
  id: string;
  userId: string;
  message: string;
  isFromSupport: boolean;
  isReadByAdmin: boolean;
  isResolved: boolean;
  createdAt: string;
};

function timeAgo(iso: string) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short" });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });
}

export default function SupportChatPage() {
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [search, setSearch] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: convsData, isLoading: convsLoading, refetch: refetchConvs, dataUpdatedAt: convsUpdatedAt } = useQuery({
    queryKey: ["admin-support-conversations"],
    queryFn: () => apiFetch("/support-chat/conversations"),
    refetchInterval: 15000,
  });

  const { data: msgsData, isLoading: msgsLoading } = useQuery({
    queryKey: ["admin-support-messages", selectedUserId],
    queryFn: () => apiFetch(`/support-chat/conversations/${selectedUserId}`),
    enabled: !!selectedUserId,
    refetchInterval: false,
  });

  const resolveMut = useMutation({
    mutationFn: ({ userId, resolved }: { userId: string; resolved: boolean }) =>
      apiFetch(`/support-chat/conversations/${userId}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
      qc.invalidateQueries({ queryKey: ["admin-support-messages", selectedUserId] });
    },
  });

  const conversations: Conversation[] = convsData?.conversations ?? [];
  const messages = useMemo<ChatMessage[]>(() => msgsData?.messages ?? [], [msgsData?.messages]);

  const filtered = conversations.filter(c =>
    !search || c.userId.toLowerCase().includes(search.toLowerCase()) ||
    c.lastMessage.toLowerCase().includes(search.toLowerCase())
  );

  const selected = conversations.find(c => c.userId === selectedUserId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!selectedUserId) return;
    qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
  }, [selectedUserId, qc]);

  useEffect(() => {
    const origin = window.location.origin;
    const socket = io(origin, { path: "/api/socket.io", transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("support_message", (msg: ChatMessage) => {
      qc.setQueryData(["admin-support-messages", msg.userId], (old: { messages: ChatMessage[] } | undefined) => {
        if (!old) return old;
        const exists = old.messages.some(m => m.id === msg.id);
        if (exists) return old;
        return { ...old, messages: [...old.messages, msg] };
      });
      qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
    });
    return () => { socket.disconnect(); };
  }, [qc]);

  const handleSend = useCallback(async () => {
    if (!selectedUserId || !reply.trim() || sending) return;
    setSending(true);
    try {
      const json = await adminAbsoluteFetch(`/api/admin/support-chat/conversations/${selectedUserId}/reply`, {
        method: "POST",
        body: JSON.stringify({ message: reply.trim() }),
      }).then((d: any) => ({ data: d })).catch((e: any) => ({ error: e?.message || "Failed" }));
      if (!("error" in json) && json.data?.message) {
        qc.setQueryData(["admin-support-messages", selectedUserId], (old: { messages: ChatMessage[] } | undefined) => {
          if (!old) return old;
          const exists = old.messages.some(m => m.id === json.data.message?.id);
          if (exists) return old;
          return { ...old, messages: [...old.messages, json.data.message] };
        });
        qc.invalidateQueries({ queryKey: ["admin-support-conversations"] });
        setReply("");
        inputRef.current?.focus();
      }
    } finally {
      setSending(false);
    }
  }, [selectedUserId, reply, sending, qc]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const totalUnread = conversations.reduce((s, c) => s + (c.unreadCount || 0), 0);

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <PageHeader
        icon={Headphones}
        title="Support Chat"
        subtitle="Manage live customer conversations"
        iconBgClass="bg-blue-100"
        iconColorClass="text-blue-600"
        actions={<LastUpdated dataUpdatedAt={convsUpdatedAt} onRefresh={refetchConvs} isRefreshing={convsLoading} />}
      />
      <div className="flex flex-1 min-h-0 bg-gray-50">
      {/* Sidebar */}
      <div className={cn(
        "flex flex-col border-r bg-white",
        selectedUserId ? "hidden md:flex w-80 shrink-0" : "flex w-full md:w-80 md:shrink-0"
      )}>
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary" />
              <h1 className="font-bold text-gray-900 text-base">Support Inbox</h1>
              {totalUnread > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0 min-w-[20px] text-center rounded-full">
                  {totalUnread}
                </Badge>
              )}
            </div>
            <Button size="icon" variant="ghost" onClick={() => refetchConvs()} className="h-7 w-7">
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-gray-400" />
            <Input
              placeholder="Search conversations..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm rounded-xl"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {convsLoading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2 px-4 text-center">
              <MessageCircle className="w-8 h-8 opacity-30" />
              <p className="text-sm">No conversations yet</p>
            </div>
          ) : (
            filtered.map(conv => {
              const isSelected = selectedUserId === conv.userId;
              const shortId = conv.userId.slice(-6).toUpperCase();
              return (
                <button
                  key={conv.userId}
                  onClick={() => setSelectedUserId(conv.userId)}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50 hover:bg-gray-50",
                    isSelected && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-gray-800 text-sm truncate">User #{shortId}</span>
                      <span className="text-gray-400 text-[10px] shrink-0">{timeAgo(conv.lastAt)}</span>
                    </div>
                    <p className="text-gray-500 text-xs truncate leading-relaxed">{conv.lastMessage}</p>
                    {conv.isResolved && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 mt-0.5">
                        <CheckCircle2 className="w-2.5 h-2.5" /> Resolved
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat panel */}
      {selectedUserId ? (
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-white border-b shadow-sm">
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setSelectedUserId(null)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 text-sm">User #{selectedUserId.slice(-6).toUpperCase()}</p>
              <p className="text-gray-400 text-xs truncate">{selectedUserId}</p>
            </div>
            <div className="flex items-center gap-2">
              {selected?.isResolved ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => resolveMut.mutate({ userId: selectedUserId, resolved: false })}
                >
                  <Circle className="w-3 h-3" /> Reopen
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => resolveMut.mutate({ userId: selectedUserId, resolved: true })}
                >
                  <CheckCheck className="w-3 h-3" /> Mark Resolved
                </Button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgsLoading ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading messages…</div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
                <AlertCircle className="w-8 h-8 opacity-30" />
                <p className="text-sm">No messages yet</p>
              </div>
            ) : (
              messages.map((msg: ChatMessage) => {
                const isSupport = msg.isFromSupport;
                return (
                  <div key={msg.id} className={cn("flex", isSupport ? "justify-end" : "justify-start")}>
                    {!isSupport && (
                      <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center mr-2 mt-1 shrink-0">
                        <User className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                    )}
                    <div className={cn(
                      "max-w-[72%] rounded-2xl px-4 py-2.5 shadow-sm",
                      isSupport
                        ? "bg-primary text-white rounded-br-sm"
                        : "bg-white text-gray-800 rounded-bl-sm border border-gray-100"
                    )}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                      <p className={cn("text-[10px] mt-1", isSupport ? "text-white/60 text-right" : "text-gray-400")}>
                        {formatTime(msg.createdAt)}
                        {isSupport && <span className="ml-1">✓ Support</span>}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-3 bg-white border-t">
            {selected?.isResolved ? (
              <div className="flex items-center justify-center gap-2 py-2 text-sm text-green-700 bg-green-50 rounded-xl border border-green-200">
                <CheckCircle2 className="w-4 h-4" />
                <span>Conversation resolved — reopen to reply</span>
              </div>
            ) : (
              <div className="flex gap-2 items-end">
                <Input
                  ref={inputRef}
                  placeholder="Type a reply…"
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 rounded-xl text-sm min-h-[40px]"
                />
                <Button
                  onClick={handleSend}
                  disabled={!reply.trim() || sending}
                  className="h-10 w-10 shrink-0 rounded-xl p-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center flex-col gap-3 text-gray-400">
          <MessageCircle className="w-14 h-14 opacity-20" />
          <p className="text-base font-medium">Select a conversation</p>
          <p className="text-sm">Choose from the list to view and reply</p>
        </div>
      )}
      </div>
    </div>
  );
}
