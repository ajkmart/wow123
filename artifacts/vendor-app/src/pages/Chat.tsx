import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../lib/auth";
import { apiFetch, api } from "../lib/api";
import { io, type Socket } from "socket.io-client";
import { SafeImage } from "../components/ui/SafeImage";
import { getTurnIceServers } from "../lib/turnIceServers";

interface OtherUser { id: string; name: string | null; ajkId: string | null; roles?: string | null; phone?: string | null; }
interface Conversation { id: string; otherUser: OtherUser; lastMessage: { content: string } | null; unreadCount: number; lastMessageAt: string | null; }
interface Message { id: string; content: string; senderId: string; messageType: string; createdAt: string; deliveryStatus: string; voiceNoteUrl?: string; imageUrl?: string; }
interface CommRequest { id: string; status: string; senderId: string; sender?: { name: string; ajkId: string; roles?: string | null }; }
interface SearchResult { id: string; name: string; ajkId: string; role: string; isOnline?: boolean; }
interface IncomingCallData { callId: string; callerId: string; callerName?: string; callerAjkId?: string; }
interface CallSignal { callId: string; callerId?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit; }

const STORAGE_KEY = "vendor_quick_replies";
const MAX_SHORTCUTS = 8;

function loadLocalShortcuts(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.every(s => typeof s === "string")) {
        return parsed.slice(0, MAX_SHORTCUTS);
      }
    }
  } catch {}
  return null;
}

const SUGGESTED_TEMPLATES: { category: string; icon: string; items: string[] }[] = [
  {
    category: "General",
    icon: "💬",
    items: [
      "Thank you for your order! 🙏",
      "Your order has been received ✅",
      "We'll update you shortly ⏳",
      "Please allow a few extra minutes 🙏",
    ],
  },
  {
    category: "Food",
    icon: "🍔",
    items: [
      "Order is being prepared 🍳",
      "Ready for pickup 📦",
      "On its way! 🛵",
      "Will be ready in 10 mins ⏱",
      "Our kitchen is a little busy — 15 mins extra ⏳",
    ],
  },
  {
    category: "Pharmacy",
    icon: "💊",
    items: [
      "Prescription received — preparing your order 💊",
      "One item is out of stock — we'll contact you shortly",
      "Your medicine is packed and ready 📦",
      "Delivery on the way 🛵",
    ],
  },
  {
    category: "Parcel",
    icon: "📦",
    items: [
      "Parcel received and being processed 📦",
      "Your parcel is out for delivery 🛵",
      "Parcel delivered successfully ✅",
      "We couldn't deliver — please confirm your address",
    ],
  },
];

const DEFAULT_SHORTCUTS = [
  "Order is being prepared 🍳",
  "Ready for pickup 📦",
  "On its way! 🛵",
  "Thank you for your order! 🙏",
  "Will be ready in 10 mins ⏱",
];

function saveLocalShortcuts(shortcuts: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts.slice(0, MAX_SHORTCUTS)));
  } catch {}
}

function ShortcutsModal({ shortcuts, onSave, onClose }: { shortcuts: string[]; onSave: (s: string[]) => void; onClose: () => void; }) {
  const [list, setList] = useState<string[]>([...shortcuts]);
  const [newText, setNewText] = useState("");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const addShortcut = () => {
    const trimmed = newText.trim();
    if (!trimmed || list.length >= MAX_SHORTCUTS) return;
    setList(prev => [...prev, trimmed]);
    setNewText("");
  };

  const removeShortcut = (idx: number) => {
    setList(prev => prev.filter((_, i) => i !== idx));
    if (editIdx === idx) { setEditIdx(null); setEditText(""); }
  };

  const startEdit = (idx: number) => {
    setEditIdx(idx);
    setEditText(list[idx]);
  };

  const saveEdit = () => {
    if (editIdx === null) return;
    const trimmed = editText.trim();
    if (!trimmed) { setEditIdx(null); return; }
    setList(prev => prev.map((s, i) => i === editIdx ? trimmed : s));
    setEditIdx(null);
    setEditText("");
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setOverIdx(idx); };
  const handleDrop = (idx: number) => {
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    const next = [...list];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(idx, 0, moved);
    setList(next);
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleSave = () => { onSave(list); onClose(); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="text-lg font-extrabold text-gray-800">Edit Quick Replies</h2>
            <p className="text-xs text-gray-400 mt-0.5">{list.length}/{MAX_SHORTCUTS} shortcuts · drag to reorder</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition text-lg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {list.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-6">No shortcuts yet. Add one below.</p>
          )}
          {list.map((s, idx) => (
            <div
              key={idx}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={e => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
              className={`flex items-center gap-2 p-2 rounded-xl border transition cursor-grab active:cursor-grabbing
                ${overIdx === idx && dragIdx !== idx ? "border-orange-400 bg-orange-50" : "border-gray-100 bg-gray-50"}
                ${dragIdx === idx ? "opacity-40" : "opacity-100"}
              `}
            >
              <span className="text-gray-300 text-lg select-none px-1">⠿</span>
              {editIdx === idx ? (
                <input
                  autoFocus
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") { setEditIdx(null); setEditText(""); } }}
                  className="flex-1 text-sm px-2 py-1 rounded-lg border border-orange-400 focus:ring-2 focus:ring-orange-200 outline-none"
                />
              ) : (
                <span className="flex-1 text-sm text-gray-700 break-words">{s}</span>
              )}
              {editIdx === idx ? (
                <button onClick={saveEdit} className="text-green-600 font-bold text-sm px-2 py-1 rounded-lg hover:bg-green-50 transition flex-shrink-0">Save</button>
              ) : (
                <button onClick={() => startEdit(idx)} className="text-orange-500 text-sm px-2 py-1 rounded-lg hover:bg-orange-50 transition flex-shrink-0">Edit</button>
              )}
              <button onClick={() => removeShortcut(idx)} className="w-7 h-7 rounded-full bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition flex-shrink-0 text-sm">✕</button>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 border-t space-y-3">
          {list.length < MAX_SHORTCUTS ? (
            <>
              <div className="flex gap-2">
                <input
                  value={newText}
                  onChange={e => setNewText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addShortcut(); }}
                  placeholder="Add a new quick reply…"
                  maxLength={120}
                  className="flex-1 h-10 px-3 rounded-xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
                />
                <button
                  onClick={addShortcut}
                  disabled={!newText.trim()}
                  className="h-10 px-4 bg-orange-500 text-white rounded-xl font-bold text-sm disabled:opacity-40 hover:bg-orange-600 transition"
                >
                  Add
                </button>
              </div>

              {/* Suggested templates toggle */}
              <button
                onClick={() => setShowSuggestions(s => !s)}
                className="w-full flex items-center justify-between text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-100 px-3 py-2 rounded-xl hover:bg-orange-100 transition"
              >
                <span>✨ Pick from suggested templates</span>
                <span className="text-gray-400">{showSuggestions ? "▲" : "▼"}</span>
              </button>

              {showSuggestions && (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  {SUGGESTED_TEMPLATES.map(group => (
                    <div key={group.category}>
                      <button
                        onClick={() => setOpenCategory(c => c === group.category ? null : group.category)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition text-left"
                      >
                        <span className="text-sm font-bold text-gray-700">{group.icon} {group.category}</span>
                        <span className="text-gray-400 text-xs">{openCategory === group.category ? "▲" : "▼"}</span>
                      </button>
                      {openCategory === group.category && (
                        <div className="divide-y divide-gray-50">
                          {group.items.map(item => {
                            const alreadyAdded = list.includes(item);
                            const listFull = list.length >= MAX_SHORTCUTS;
                            return (
                              <div key={item} className="flex items-center bg-white px-3 py-2 gap-2">
                                <span className={`flex-1 text-sm ${alreadyAdded ? "text-gray-300" : "text-gray-700"}`}>{item}</span>
                                {alreadyAdded ? (
                                  <span className="text-[10px] text-gray-300 flex-shrink-0 px-1">Added</span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => { setNewText(item); setShowSuggestions(false); setOpenCategory(null); }}
                                      className="flex-shrink-0 h-7 px-2.5 rounded-lg border border-orange-200 text-orange-500 text-[11px] font-semibold hover:bg-orange-50 transition"
                                    >
                                      Use →
                                    </button>
                                    <button
                                      disabled={listFull}
                                      onClick={() => { setList(prev => prev.includes(item) || prev.length >= MAX_SHORTCUTS ? prev : [...prev, item]); }}
                                      title={listFull ? "List is full" : "Add directly"}
                                      className="flex-shrink-0 w-7 h-7 rounded-lg bg-orange-500 text-white text-base font-bold flex items-center justify-center hover:bg-orange-600 disabled:opacity-30 disabled:cursor-not-allowed transition"
                                    >
                                      +
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-400 text-center">Maximum {MAX_SHORTCUTS} shortcuts reached. Remove one to add more.</p>
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-gray-200 text-gray-600 font-bold text-sm hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleSave} className="flex-1 h-11 rounded-xl bg-orange-500 text-white font-bold text-sm hover:bg-orange-600 transition">Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const { user, token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [searchId, setSearchId] = useState("");
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [sending, setSending] = useState(false);
  const [ajkId, setAjkId] = useState("");
  const [requests, setRequests] = useState<CommRequest[]>([]);
  const [tab, setTab] = useState<"chats" | "requests" | "search">("chats");
  const [typing, setTyping] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [callTimer, setCallTimer] = useState(0);
  const [muted, setMuted] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [callFallbackPhone, setCallFallbackPhone] = useState<string | null>(null);
  const [conversationsError, setConversationsError] = useState(false);
  const [requestsError, setRequestsError]           = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [quickReplies, setQuickReplies] = useState<string[]>(loadLocalShortcuts() ?? DEFAULT_SHORTCUTS);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [voiceRecordSecs, setVoiceRecordSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showError = (msg: string) => { setErrorToast(msg); setTimeout(() => setErrorToast(null), 4000); };
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleSaveShortcuts = (updated: string[]) => {
    saveLocalShortcuts(updated);
    setQuickReplies(updated);
    api.updateQuickReplies(updated).catch(() => {});
  };

  useEffect(() => {
    api.getQuickReplies().then(d => {
      if (Array.isArray(d.quickReplies) && d.quickReplies.length > 0) {
        const fromServer = (d.quickReplies as unknown[])
          .filter((s): s is string => typeof s === "string")
          .slice(0, MAX_SHORTCUTS);
        setQuickReplies(fromServer);
        saveLocalShortcuts(fromServer);
      }
      // Server returned [] (never synced) or non-array → keep current local/default state unchanged
    }).catch(() => {});

    apiFetch("/communication/me/ajk-id").then(d => setAjkId(d.ajkId)).catch((e: unknown) => {
      showError(e instanceof Error ? e.message : "Failed to load your AJK ID");
    });
    loadConversations();
    loadRequests();

    const socket = io(window.location.origin, {
      path: "/api/socket.io",
      auth: { token: token || api.getToken() },
      transports: ["polling", "websocket"],
    });
    socketRef.current = socket;

    socket.on("comm:message:new", (msg: Message) => {
      setMessages(prev => [...prev, msg]);
      loadConversations();
    });
    socket.on("comm:typing:start", () => setTyping(true));
    socket.on("comm:typing:stop", () => setTyping(false));
    socket.on("comm:message:read", () => {
      setMessages(prev => prev.map(m => ({ ...m, deliveryStatus: "read" })));
    });
    socket.on("comm:request:new", () => loadRequests());
    socket.on("comm:request:accepted", () => { loadConversations(); loadRequests(); });
    socket.on("comm:call:incoming", (data: IncomingCallData) => setIncomingCall(data));
    socket.on("comm:call:ended", () => endCall());
    socket.on("comm:call:rejected", () => endCall());
    socket.on("comm:call:offer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pcRef.current.createAnswer();
      await pcRef.current.setLocalDescription(answer);
      socket.emit("comm:call:answer", { callId: data.callId, targetUserId: data.callerId, sdp: answer });
    });
    socket.on("comm:call:answer", async (data: CallSignal) => {
      if (!pcRef.current || !data.sdp) return;
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdp));
    });
    socket.on("comm:call:ice-candidate", async (data: CallSignal) => {
      if (!pcRef.current || !data.candidate) return;
      await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
    });

    return () => { socket.disconnect(); };
  }, []);

  const loadConversations = () => apiFetch("/communication/conversations")
    .then(d => { setConversations(d); setConversationsError(false); })
    .catch((e: unknown) => {
      setConversationsError(true);
      showError(e instanceof Error ? e.message : "Failed to load conversations");
    });
  const loadRequests = () => apiFetch("/communication/requests?type=received")
    .then(d => { setRequests(d); setRequestsError(false); })
    .catch((e: unknown) => {
      setRequestsError(true);
      showError(e instanceof Error ? e.message : "Failed to load chat requests");
    });

  const selectConversation = async (conv: Conversation) => {
    setSelectedConv(conv);
    socketRef.current?.emit("join", `conversation:${conv.id}`);
    const msgs = await apiFetch(`/communication/conversations/${conv.id}/messages`);
    setMessages(msgs);
    await apiFetch(`/communication/conversations/${conv.id}/read-all`, { method: "PATCH" });
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const msg = await apiFetch(`/communication/conversations/${selectedConv.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: input, messageType: "text" }),
      });
      setMessages(prev => [...prev, msg]);
      setInput("");
      loadConversations();
      setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 100);
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
    }
    setSending(false);
  };

  const searchUser = async () => {
    if (!searchId.trim()) return;
    try {
      const result = await apiFetch(`/communication/search/${searchId.toUpperCase()}`);
      setSearchResult(result);
    } catch { setSearchResult(null); }
  };

  const sendRequest = async (receiverId: string) => {
    await apiFetch("/communication/requests", { method: "POST", body: JSON.stringify({ receiverId }) });
    setSearchResult(null);
    setSearchId("");
  };

  const acceptRequest = async (id: string) => {
    await apiFetch(`/communication/requests/${id}/accept`, { method: "PATCH" });
    loadRequests();
    loadConversations();
  };

  const rejectRequest = async (id: string) => {
    await apiFetch(`/communication/requests/${id}/reject`, { method: "PATCH" });
    loadRequests();
  };

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      voiceChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) voiceChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (!selectedConv) return;
        const blob = new Blob(voiceChunksRef.current, { type: mimeType });
        const file = new File([blob], `voice_${Date.now()}.${mimeType === "audio/webm" ? "webm" : "ogg"}`, { type: mimeType });
        try {
          const formData = new FormData();
          formData.append("file", file);
          const result = await apiFetch("/uploads/audio", { method: "POST", body: formData });
          const voiceUrl: string = result.url || "";
          await apiFetch(`/communication/conversations/${selectedConv.id}/messages`, {
            method: "POST",
            body: JSON.stringify({ content: voiceUrl, messageType: "voice_note", voiceNoteUrl: voiceUrl }),
          });
          const msgs = await apiFetch(`/communication/conversations/${selectedConv.id}/messages`);
          setMessages(msgs.messages || msgs || []);
        } catch (err) {
          showError(err instanceof Error ? err.message : "Voice note upload failed. Please try again.");
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setVoiceRecordSecs(0);
      setRecordingVoice(true);
      voiceTimerRef.current = setInterval(() => setVoiceRecordSecs(s => s + 1), 1000);
    } catch (err) {
      const isPermission = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      showError(isPermission ? "Microphone access denied. Please allow microphone access." : "Could not start recording.");
    }
  };

  const stopVoiceRecording = () => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    setRecordingVoice(false);
    setVoiceRecordSecs(0);
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current);
    voiceChunksRef.current = [];
    setRecordingVoice(false);
    setVoiceRecordSecs(0);
  };

  const translateMsg = async (text: string, lang: string) => {
    const result = await apiFetch("/communication/translate", { method: "POST", body: JSON.stringify({ text, targetLang: lang }) });
    return result.translated;
  };

  const showCallFallback = (phone: string | null | undefined) => {
    if (phone) {
      setCallFallbackPhone(phone);
      setTimeout(() => setCallFallbackPhone(null), 8000);
    }
  };

  const startCall = async (calleeId: string) => {
    try {
      const data = await apiFetch("/communication/calls/initiate", { method: "POST", body: JSON.stringify({ calleeId, conversationId: selectedConv?.id }) });
      setCallId(data.callId);
      setCallActive(true);
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      localStreamRef.current = stream;

      const apiIceServers: RTCIceServer[] = data.iceServers?.length ? data.iceServers : [{ urls: "stun:stun.l.google.com:19302" }];
      const pc = new RTCPeerConnection({ iceServers: [...apiIceServers, ...getTurnIceServers()] });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit("comm:call:ice-candidate", { callId: data.callId, targetUserId: calleeId, candidate: e.candidate });
        }
      };
      pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play();
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit("comm:call:offer", { callId: data.callId, targetUserId: calleeId, sdp: offer });
    } catch (err) {
      endCall();
      const isPermission = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      showError(isPermission ? "Microphone access denied. Please allow microphone access to make calls." : "Could not start call. Please try again.");
      showCallFallback(selectedConv?.otherUser?.phone);
    }
  };

  const answerCall = async () => {
    if (!incomingCall) return;
    try {
      const answerData = await apiFetch(`/communication/calls/${incomingCall.callId}/answer`, { method: "POST" });
      setCallId(incomingCall.callId);
      setCallActive(true);
      setCallTimer(0);
      timerRef.current = setInterval(() => setCallTimer(t => t + 1), 1000);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      localStreamRef.current = stream;

      const iceServers = [...(answerData.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]), ...getTurnIceServers()];
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.onicecandidate = (e) => {
        if (e.candidate) socketRef.current?.emit("comm:call:ice-candidate", { callId: incomingCall.callId, targetUserId: incomingCall.callerId, candidate: e.candidate });
      };
      pc.ontrack = (e) => {
        const audio = new Audio();
        audio.srcObject = e.streams[0];
        audio.play();
      };

      setIncomingCall(null);
    } catch (err) {
      endCall();
      const isPermission = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      showError(isPermission ? "Microphone access denied. Please allow microphone access to answer calls." : "Could not answer call. Please try again.");
      showCallFallback(selectedConv?.otherUser?.phone);
    }
  };

  const endCall = useCallback(() => {
    if (callId) {
      apiFetch(`/communication/calls/${callId}/end`, { method: "POST", body: JSON.stringify({ duration: callTimer }) }).catch(() => {});
      const otherId = selectedConv ? (selectedConv.otherUser?.id) : null;
      if (otherId) socketRef.current?.emit("comm:call:end", { callId, targetUserId: otherId });
    }
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setCallActive(false);
    setCallId(null);
    setCallTimer(0);
    setIncomingCall(null);
  }, [callId, callTimer, selectedConv]);

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setMuted(!muted);
    }
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="flex flex-col h-full bg-white">
      {showShortcutsModal && (
        <ShortcutsModal
          shortcuts={quickReplies}
          onSave={handleSaveShortcuts}
          onClose={() => setShowShortcutsModal(false)}
        />
      )}

      {/* Error Toast */}
      {errorToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-semibold max-w-xs text-center">
          {errorToast}
        </div>
      )}

      {/* Phone call fallback banner */}
      {callFallbackPhone && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg text-sm max-w-xs text-center flex flex-col gap-2">
          <span className="font-semibold">Call via phone instead?</span>
          <a
            href={`tel:${callFallbackPhone}`}
            className="inline-flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-bold px-4 py-2 rounded-lg transition"
            onClick={() => setCallFallbackPhone(null)}
          >
            📞 Call {callFallbackPhone}
          </a>
          <button onClick={() => setCallFallbackPhone(null)} className="text-xs text-gray-400 hover:text-white transition">Dismiss</button>
        </div>
      )}

      {/* Incoming Call Overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full mx-4">
            <div className="text-6xl mb-4">📞</div>
            <h2 className="text-xl font-bold mb-2">Incoming Call</h2>
            <p className="text-gray-500 mb-6">{incomingCall.callerName} ({incomingCall.callerAjkId})</p>
            <div className="flex gap-4 justify-center">
              <button onClick={() => { setIncomingCall(null); apiFetch(`/communication/calls/${incomingCall.callId}/reject`, { method: "POST" }); }} className="w-16 h-16 rounded-full bg-red-500 text-white text-2xl flex items-center justify-center">✕</button>
              <button onClick={answerCall} className="w-16 h-16 rounded-full bg-green-500 text-white text-2xl flex items-center justify-center">📞</button>
            </div>
          </div>
        </div>
      )}

      {/* Active Call Bar */}
      {callActive && (
        <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold">🔊 Call Active — {fmt(callTimer)}</span>
          <div className="flex gap-2">
            <button onClick={toggleMute} className={`px-3 py-1 rounded-lg text-sm font-bold ${muted ? "bg-red-500" : "bg-white/20"}`}>{muted ? "Unmute" : "Mute"}</button>
            <button onClick={endCall} className="px-3 py-1 rounded-lg text-sm font-bold bg-red-500">End</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-gray-800">💬 Messages</h1>
          {ajkId && (
            <button onClick={() => navigator.clipboard.writeText(ajkId)} className="text-xs bg-orange-100 text-orange-700 px-3 py-1.5 rounded-full font-bold hover:bg-orange-200 transition">
              {ajkId} 📋
            </button>
          )}
        </div>

        {!selectedConv && (
          <div className="flex gap-1 mb-3">
            {(["chats", "requests", "search"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-xl text-sm font-bold transition ${tab === t ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {t === "chats" ? "Chats" : t === "requests" ? `Requests${requests.length ? ` (${requests.length})` : ""}` : "Search"}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4" ref={scrollRef}>
        {selectedConv ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-3 py-3 border-b mb-3">
              <button onClick={() => setSelectedConv(null)} className="text-orange-500 font-bold">← Back</button>
              <div className="flex-1">
                <p className="font-bold text-gray-800">{selectedConv.otherUser?.name || "User"}</p>
                <p className="text-xs text-gray-400">{selectedConv.otherUser?.ajkId} · {selectedConv.otherUser?.roles}</p>
              </div>
              <button onClick={() => startCall(selectedConv.otherUser?.id)} className="w-10 h-10 rounded-full bg-green-500 text-white flex items-center justify-center text-lg">📞</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pb-2">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${msg.senderId === user?.id ? "bg-orange-500 text-white rounded-br-md" : "bg-gray-100 text-gray-800 rounded-bl-md"}`}>
                    {msg.messageType === "image" && msg.imageUrl && <SafeImage src={msg.imageUrl} alt="" className="rounded-xl mb-1 max-w-full" />}
                    {msg.messageType === "voice_note" && msg.voiceNoteUrl && (
                      <audio controls src={msg.voiceNoteUrl} className="max-w-full" />
                    )}
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`text-[10px] ${msg.senderId === user?.id ? "text-orange-200" : "text-gray-400"}`}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.senderId === user?.id && (
                        <span className={`text-[10px] font-bold ${msg.deliveryStatus === "read" ? "text-blue-200" : "text-orange-300"}`}>
                          {msg.deliveryStatus === "read" ? "✓✓" : "✓"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {typing && <div className="text-xs text-gray-400 italic">typing...</div>}
            </div>
          </div>
        ) : tab === "chats" ? (
          <div className="space-y-2">
            {conversations.map(conv => (
              <button key={conv.id} onClick={() => selectConversation(conv)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-gray-50 transition text-left">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white font-bold text-lg">
                  {(conv.otherUser?.name || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="font-bold text-gray-800 truncate">{conv.otherUser?.name || "User"}</p>
                    {conv.lastMessageAt && <span className="text-[10px] text-gray-400">{new Date(conv.lastMessageAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500 truncate">{conv.lastMessage?.content || "No messages yet"}</p>
                    {conv.unreadCount > 0 && <span className="w-5 h-5 rounded-full bg-orange-500 text-white text-[10px] flex items-center justify-center font-bold">{conv.unreadCount}</span>}
                  </div>
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              conversationsError ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                    <span className="text-3xl">⚠️</span>
                  </div>
                  <p className="font-bold text-gray-700 text-base">Could not load chats</p>
                  <p className="text-sm text-gray-400 mt-1">Check your connection and tap to retry</p>
                  <button onClick={loadConversations} className="mt-5 px-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition active:scale-95">
                    Retry
                  </button>
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-5xl mb-4">💬</p>
                  <p className="text-lg font-bold text-gray-600">No conversations yet</p>
                  <p className="text-sm text-gray-400 mt-1">Search for users by AJK ID to start chatting</p>
                </div>
              )
            )}
          </div>
        ) : tab === "requests" ? (
          <div className="space-y-2">
            {requests.map(req => (
              <div key={req.id} className="p-4 rounded-2xl bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{req.sender?.name || "Unknown"}</p>
                  <p className="text-xs text-gray-400">{req.sender?.ajkId} · {req.sender?.roles}</p>
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-2">
                    <button onClick={() => acceptRequest(req.id)} className="px-4 py-2 rounded-xl bg-green-500 text-white text-sm font-bold">Accept</button>
                    <button onClick={() => rejectRequest(req.id)} className="px-4 py-2 rounded-xl bg-red-100 text-red-600 text-sm font-bold">Reject</button>
                  </div>
                )}
              </div>
            ))}
            {requests.length === 0 && (
              requestsError ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                    <span className="text-3xl">⚠️</span>
                  </div>
                  <p className="font-bold text-gray-700 text-base">Could not load requests</p>
                  <p className="text-sm text-gray-400 mt-1">Check your connection and tap to retry</p>
                  <button onClick={loadRequests} className="mt-5 px-6 py-2.5 bg-orange-500 text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition active:scale-95">
                    Retry
                  </button>
                </div>
              ) : (
                <p className="text-center py-12 text-gray-400">No pending requests</p>
              )
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input value={searchId} onChange={e => setSearchId(e.target.value)} placeholder="Enter AJK ID (e.g., AJK-ABC123)" className="flex-1 h-12 px-4 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-sm" />
              <button onClick={searchUser} className="h-12 px-6 bg-orange-500 text-white rounded-xl font-bold text-sm">Search</button>
            </div>
            {searchResult && (
              <div className="p-4 rounded-2xl bg-gray-50 flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{searchResult.name || "Unknown"}</p>
                  <p className="text-xs text-gray-400">{searchResult.ajkId} · {searchResult.role}</p>
                  <span className={`text-xs ${searchResult.isOnline ? "text-green-500" : "text-gray-400"}`}>{searchResult.isOnline ? "Online" : "Offline"}</span>
                </div>
                <button onClick={() => sendRequest(searchResult.id)} className="px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-bold">Send Request</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Message Input */}
      {selectedConv && (
        <div className="border-t bg-white">
          {/* Quick reply chips row */}
          <div className="px-4 pt-3 pb-1 flex items-center gap-2">
            <div className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide">
              {quickReplies.map(reply => (
                <button
                  key={reply}
                  onClick={() => { setInput(reply); }}
                  className="flex-shrink-0 h-8 px-3 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold rounded-full hover:bg-orange-100 active:scale-95 transition whitespace-nowrap"
                >
                  {reply}
                </button>
              ))}
              {quickReplies.length === 0 && (
                <span className="text-xs text-gray-400 self-center">No shortcuts yet</span>
              )}
            </div>
            <button
              onClick={() => setShowShortcutsModal(true)}
              title="Edit quick reply shortcuts"
              className="flex-shrink-0 h-8 px-3 bg-gray-100 text-gray-500 text-xs font-semibold rounded-full hover:bg-gray-200 active:scale-95 transition whitespace-nowrap border border-gray-200"
            >
              ✏️ Edit
            </button>
          </div>
          <div className="flex gap-2 px-4 pb-4 pt-2">
            {recordingVoice ? (
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-xl px-3 h-12">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
                  <span className="text-xs font-bold text-red-600">{Math.floor(voiceRecordSecs/60)}:{String(voiceRecordSecs%60).padStart(2,"0")}</span>
                </div>
                <button onClick={cancelVoiceRecording} title="Cancel" className="h-12 w-12 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center text-lg flex-shrink-0">✕</button>
                <button onClick={stopVoiceRecording} title="Send voice note" className="h-12 w-12 rounded-xl bg-orange-500 text-white flex items-center justify-center text-lg flex-shrink-0">✔</button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  title="Attach image or file"
                  className="h-12 w-12 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-95 transition flex-shrink-0 disabled:opacity-50"
                >
                  {uploadingFile ? (
                    <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"/>
                  ) : (
                    <span className="text-xl">📎</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={startVoiceRecording}
                  title="Record voice note"
                  className="h-12 w-12 rounded-xl border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 active:scale-95 transition flex-shrink-0"
                >
                  <span className="text-xl">🎤</span>
                </button>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file || !selectedConv) return;
                setUploadingFile(true);
                try {
                  const fd = new FormData();
                  fd.append("file", file);
                  const res = await apiFetch("/communication/upload", { method: "POST", body: fd });
                  const url: string = res.url || res.fileUrl || "";
                  const isImage = file.type.startsWith("image/");
                  const msg: any = {
                    conversationId: selectedConv.id,
                    content: url,
                    messageType: isImage ? "image" : "file",
                  };
                  await apiFetch("/communication/messages", { method: "POST", body: JSON.stringify(msg) });
                  const msgs = await apiFetch(`/communication/conversations/${selectedConv.id}/messages`);
                  setMessages(msgs.messages || []);
                } catch (err) {
                  showError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setUploadingFile(false);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }
              }}
            />
            {!recordingVoice && (
              <>
                <input value={input} onChange={e => { setInput(e.target.value); socketRef.current?.emit("comm:typing:start", { conversationId: selectedConv.id, userId: user?.id }); }} onBlur={() => socketRef.current?.emit("comm:typing:stop", { conversationId: selectedConv.id, userId: user?.id })} placeholder="Type a message..." className="flex-1 h-12 px-4 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-200 outline-none text-sm" onKeyDown={e => e.key === "Enter" && sendMessage()} />
                <button onClick={sendMessage} disabled={sending || !input.trim()} className="h-12 px-6 bg-orange-500 text-white rounded-xl font-bold text-sm disabled:opacity-50">Send</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
