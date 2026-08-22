import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, Loader, Plus, MessageSquare, Menu, Trash2, Mic, Square } from 'lucide-react';
import { pois, findShortestPath } from '../../navigation/data/mapData';

// ── Types ─────────────────────────────────────────────────────────────────────
interface AuraChat {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface DbMessage {
  id: string;
  chatId: string;
  role: string;
  content: string;
  timestamp: string;
}

interface DisplayMessage {
  id: string;
  role: 'user' | 'aura';
  text: string;
  timestamp: Date;
}

interface AuraModalProps {
  open: boolean;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getPassengerData(): Record<string, any> | null {
  try {
    const raw = sessionStorage.getItem('boardingData');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function getPassengerName(p: Record<string, any> | null): string {
  return p?.passenger_name || 'Passenger';
}

function dbToDisplay(m: DbMessage): DisplayMessage {
  return {
    id: m.id,
    role: m.role === 'user' ? 'user' : 'aura',
    text: m.content,
    timestamp: new Date(m.timestamp),
  };
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 mb-3">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
        style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>A</div>
      <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 150, 300].map(d => (
          <span key={d} className="w-2 h-2 rounded-full bg-blue-300 animate-bounce"
            style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
    </div>
  );
}

function MsgBubble({ msg }: { msg: DisplayMessage }) {
  const isUser = msg.role === 'user';
  const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isUser) {
    return (
      <div className="flex justify-end mb-3 aura-fade-up">
        <div className="max-w-[78%]">
          <div className="px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}>{msg.text}</div>
          <div className="text-[10px] text-right mt-1 text-slate-400">{time}</div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-end gap-2 mb-3 aura-fade-up">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
        style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>A</div>
      <div className="max-w-[78%]">
        <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
          {msg.text}</div>
        <div className="text-[10px] mt-1 text-slate-400">{time}</div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AuraModal({ open, onClose }: AuraModalProps) {
  const navigate = useNavigate();
  const [passenger, setPassenger] = useState<Record<string, any> | null>(() => getPassengerData());
  const passengerName = getPassengerName(passenger);

  // Sync passenger boarding pass whenever modal opens or ticket is scanned
  useEffect(() => {
    const refreshPassenger = () => {
      setPassenger(getPassengerData());
    };
    if (open) {
      refreshPassenger();
    }
    window.addEventListener('ticket-scanned-event', refreshPassenger);
    return () => window.removeEventListener('ticket-scanned-event', refreshPassenger);
  }, [open]);

  // ── State ─────────────────────────────────────────────────────────────────
  const [chats, setChats] = useState<AuraChat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMsgs, setIsLoadingMsgs] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState('');

  // ── Voice recording state ─────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const liveTranscriptRef = useRef('');
  const finalTranscriptRef = useRef('');

  const msgEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const msgIdRef = useRef(0);
  const nextId = () => `local-${++msgIdRef.current}`;

  // ── Welcome message (UI-only, not stored in DB) ───────────────────────────
  const welcomeMsg: DisplayMessage = {
    id: 'welcome',
    role: 'aura',
    text: `Hi ${passengerName}! 👋\nI'm Aura, your Airport AI Assistant.\nI can help you with your airport and flight journey.`,
    timestamp: new Date(),
  };

  // ── On open: initialise ───────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      initChats();
      setTimeout(() => inputRef.current?.focus(), 400);
      document.body.classList.add('aura-open');
    } else {
      document.body.classList.remove('aura-open');
    }
    return () => {
      document.body.classList.remove('aura-open');
    };
  }, [open]); // eslint-disable-line

  // ── When active chat changes: load its messages ───────────────────────────
  useEffect(() => {
    if (activeChatId) loadMessages(activeChatId);
    else setMessages([]);
  }, [activeChatId]); // eslint-disable-line

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Escape key ────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  // ── API actions ───────────────────────────────────────────────────────────
  const initChats = async () => {
    setIsInitializing(true);
    try {
      const data: AuraChat[] = await apiFetch('/api/aura/chats');
      setChats(data);
      // Automatically create and select a clean new chat session when opening
      const newChat: AuraChat = await apiFetch('/api/aura/new-chat', { method: 'POST' });
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat.id);
    } catch (e) {
      console.error('[AuraModal] initChats error', e);
    } finally {
      setIsInitializing(false);
    }
  };

  const loadMessages = async (chatId: string) => {
    setIsLoadingMsgs(true);
    setMessages([]);
    try {
      const data: DbMessage[] = await apiFetch(`/api/aura/chat/${chatId}`);
      setMessages(data.map(dbToDisplay));
    } catch (e) {
      console.error('[AuraModal] loadMessages error', e);
    } finally {
      setIsLoadingMsgs(false);
    }
  };

  const handleNewChat = async () => {
    try {
      const newChat: AuraChat = await apiFetch('/api/aura/new-chat', { method: 'POST' });
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChat.id);
      setSidebarOpen(false);
    } catch (e) {
      console.error('[AuraModal] createChat error', e);
    }
  };

  const handleDeleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!window.confirm('Delete this chat?')) return;
    try {
      await apiFetch(`/api/aura/chat/${chatId}`, { method: 'DELETE' });
      const updated = chats.filter(c => c.id !== chatId);
      setChats(updated);
      if (activeChatId === chatId) {
        setActiveChatId(updated.length > 0 ? updated[0].id : null);
      }
    } catch (e) {
      console.error('[AuraModal] deleteChat error', e);
    }
  };

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setError('');

    // If no active chat, auto-create one
    let chatId = activeChatId;
    if (!chatId) {
      try {
        const newChat: AuraChat = await apiFetch('/api/aura/new-chat', { method: 'POST' });
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        chatId = newChat.id;
      } catch {
        setError('Could not create chat. Please try again.');
        return;
      }
    }

    // Optimistic user bubble
    const userMsg: DisplayMessage = { id: nextId(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    const currentPassenger = getPassengerData() || passenger;

    try {
      const data = await apiFetch('/api/aura/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message: text,
          passenger: currentPassenger,
          flightTrackingData: {
            countdown: "01h 18m",
            gate: currentPassenger?.gate || "Gate 14B",
            status: "Boarding Soon"
          },
          destinations: pois.map(p => {
            let path = [];
            try { path = findShortestPath('main_entrance', p.id); } catch { }
            let dist = 0;
            if (path && path.length > 0) {
              for (let i = 0; i < path.length - 1; i++) {
                dist += Math.sqrt(
                  Math.pow(path[i].x - path[i + 1].x, 2) +
                  Math.pow(path[i].y - path[i + 1].y, 2)
                );
              }
            }
            return {
              id: p.id,
              label: p.label,
              category: p.category,
              distance: Math.round(dist * 1.2)
            };
          })
        }),
      });

      const auraMsg: DisplayMessage = {
        id: nextId(),
        role: 'aura',
        text: data.response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, auraMsg]);

      // Automatically trigger navigation or tool page navigation without closing Aura chat
      if (data.action?.type === 'route' || (data.action?.type === 'navigate' && data.action?.from && data.action?.to)) {
        const from = data.action.from;
        const to = data.action.to;
        navigate(`/navigation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { state: { from, to } });
      } else if (data.action?.type === 'navigate' && data.action?.poiId) {
        sessionStorage.setItem('autoSelectPoiId', data.action.poiId);
        navigate('/navigation', { state: { autoSelectPoiId: data.action.poiId } });
      } else if (data.action?.type === 'navigate') {
        navigate('/navigation');
      } else if (data.action?.type === 'customer_support') {
        navigate('/chat');
      } else if (data.action?.type === 'baggage_guidance') {
        if (data.action?.autoCheckTag) {
          sessionStorage.setItem('autoCheckBagTag', data.action.autoCheckTag);
        }
        navigate('/baggage-guidance');
      } else if (data.action?.type === 'bus_service' || data.action?.type === 'transit_services' || data.action?.type === 'transit') {
        navigate('/transit-services');
      } else if (data.action?.type === 'flight_tracking') {
        navigate('/flight-tracking');
      } else if (data.action?.type === 'meal_delivery') {
        navigate('/meal-delivery');
      } else if (data.action?.type === 'emergency_contact' || data.action?.type === 'emergency') {
        navigate('/emergency-contact');
      } else if (data.action?.type === 'staff_dashboard') {
        navigate('/emergency-contact/staff-dashboard');
      } else if (data.action?.type === 'personal_guardian' || data.action?.type === 'personal_mentor') {
        navigate('/personal-guardian');
      } else if (data.action?.type === 'translate' || data.action?.type === 'translation') {
        navigate('/translate');
      } else if (data.action?.type === 'boarding_pass') {
        navigate('/boarding-pass');
      } else if (data.action?.type === 'profile') {
        navigate('/profile');
      } else if (data.action?.type === 'event_scheduler') {
        navigate('/event-scheduler', { state: { eventName: data.action.eventName, eventTime: data.action.eventTime } });
      }

      // Bump the chat to top in the sidebar list (update updatedAt locally)
      setChats(prev =>
        [
          { ...prev.find(c => c.id === chatId)!, updatedAt: new Date().toISOString() },
          ...prev.filter(c => c.id !== chatId),
        ]
      );
    } catch (err: any) {
      const errTxt = err.message || 'Failed to get a response. Please try again.';
      setError(errTxt);
      setMessages(prev => [...prev, { id: nextId(), role: 'aura', text: `⚠️ ${errTxt}`, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, isLoading, activeChatId, passenger]); // eslint-disable-line

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Voice recording actions ───────────────────────────────────────────────
  const SpeechRecognitionAPI =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  const sendVoiceMessage = useCallback(async (transcript: string) => {
    const text = transcript.trim();
    if (!text || isLoading) return;
    setInput('');
    setError('');

    let chatId = activeChatId;
    if (!chatId) {
      try {
        const newChat: AuraChat = await apiFetch('/api/aura/new-chat', { method: 'POST' });
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        chatId = newChat.id;
      } catch {
        setError('Could not create chat. Please try again.');
        return;
      }
    }

    const userMsg: DisplayMessage = { id: nextId(), role: 'user', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    const currentPassenger = getPassengerData() || passenger;

    try {
      const data = await apiFetch('/api/aura/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          message: text,
          passenger: currentPassenger,
          flightTrackingData: {
            countdown: '01h 18m',
            gate: currentPassenger?.gate || 'Gate 14B',
            status: 'Boarding Soon',
          },
          destinations: pois.map(p => {
            let path: any[] = [];
            try { path = findShortestPath('main_entrance', p.id); } catch { }
            let dist = 0;
            if (path && path.length > 0) {
              for (let i = 0; i < path.length - 1; i++) {
                dist += Math.sqrt(
                  Math.pow(path[i].x - path[i + 1].x, 2) +
                  Math.pow(path[i].y - path[i + 1].y, 2)
                );
              }
            }
            return { id: p.id, label: p.label, category: p.category, distance: Math.round(dist * 1.2) };
          }),
        }),
      });

      const auraMsg: DisplayMessage = {
        id: nextId(), role: 'aura', text: data.response, timestamp: new Date(),
      };
      setMessages(prev => [...prev, auraMsg]);

      if (data.action?.type === 'route' || (data.action?.type === 'navigate' && data.action?.from && data.action?.to)) {
        const from = data.action.from;
        const to = data.action.to;
        navigate(`/navigation?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, { state: { from, to } });
      } else if (data.action?.type === 'navigate' && data.action?.poiId) {
        sessionStorage.setItem('autoSelectPoiId', data.action.poiId);
        navigate('/navigation', { state: { autoSelectPoiId: data.action.poiId } });
      } else if (data.action?.type === 'navigate') {
        navigate('/navigation');
      } else if (data.action?.type === 'customer_support') {
        navigate('/chat');
      } else if (data.action?.type === 'baggage_guidance') {
        if (data.action?.autoCheckTag) {
          sessionStorage.setItem('autoCheckBagTag', data.action.autoCheckTag);
        }
        navigate('/baggage-guidance');
      } else if (data.action?.type === 'bus_service' || data.action?.type === 'transit_services' || data.action?.type === 'transit') {
        navigate('/transit-services');
      } else if (data.action?.type === 'flight_tracking') {
        navigate('/flight-tracking');
      } else if (data.action?.type === 'meal_delivery') {
        navigate('/meal-delivery');
      } else if (data.action?.type === 'emergency_contact' || data.action?.type === 'emergency') {
        navigate('/emergency-contact');
      } else if (data.action?.type === 'staff_dashboard') {
        navigate('/emergency-contact/staff-dashboard');
      } else if (data.action?.type === 'personal_guardian' || data.action?.type === 'personal_mentor') {
        navigate('/personal-guardian');
      } else if (data.action?.type === 'translate' || data.action?.type === 'translation') {
        navigate('/translate');
      } else if (data.action?.type === 'boarding_pass') {
        navigate('/boarding-pass');
      } else if (data.action?.type === 'profile') {
        navigate('/profile');
      } else if (data.action?.type === 'event_scheduler') {
        navigate('/event-scheduler', { state: { eventName: data.action.eventName, eventTime: data.action.eventTime } });
      }

      setChats(prev => [
        { ...prev.find(c => c.id === chatId)!, updatedAt: new Date().toISOString() },
        ...prev.filter(c => c.id !== chatId),
      ]);
    } catch (err: any) {
      const errTxt = err.message || 'Failed to get a response. Please try again.';
      setError(errTxt);
      setMessages(prev => [...prev, { id: nextId(), role: 'aura', text: `⚠️ ${errTxt}`, timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isLoading, activeChatId, passenger]); // eslint-disable-line

  const startVoiceInput = useCallback(() => {
    if (!SpeechRecognitionAPI) {
      setVoiceError('Voice input not supported. Please use Chrome or Edge.');
      return;
    }
    setVoiceError('');
    liveTranscriptRef.current = '';
    finalTranscriptRef.current = '';
    setLiveTranscript('');

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      let currentFinal = '';
      let currentInterim = '';
      for (let i = 0; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) currentFinal += r[0].transcript;
        else currentInterim += r[0].transcript;
      }
      finalTranscriptRef.current = currentFinal;
      liveTranscriptRef.current = currentFinal + currentInterim;
      setLiveTranscript(currentFinal + currentInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted') return;
      let msg = `Voice error: ${event.error}`;
      if (event.error === 'no-speech') msg = 'No speech detected. Please speak clearly.';
      if (event.error === 'not-allowed' || event.error === 'permission-denied')
        msg = 'Microphone access denied. Allow it in browser settings.';
      if (event.error === 'network') msg = 'Network error — check your connection.';
      setVoiceError(msg);
      setIsRecording(false);
      setLiveTranscript('');
    };

    recognition.onend = () => {
      setIsRecording(false);
      const transcript = (finalTranscriptRef.current || liveTranscriptRef.current).trim();
      setLiveTranscript('');
      if (transcript) {
        sendVoiceMessage(transcript);
      } else {
        setVoiceError('No speech captured. Please try again.');
      }
    };

    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      setVoiceError('Failed to start microphone. Check permissions and try again.');
    }
  }, [SpeechRecognitionAPI, sendVoiceMessage]); // eslint-disable-line

  const stopVoiceInput = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  // ── Displayed messages (add welcome when chat is empty) ───────────────────
  const displayMessages = messages.length === 0 && activeChatId && !isLoadingMsgs
    ? [welcomeMsg]
    : messages;

  const activeChat = chats.find(c => c.id === activeChatId);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed bottom-0 left-1/2 -translate-x-1/2 z-50 w-full flex flex-col overflow-hidden aura-container-desktop"
        style={{
          maxWidth: '680px',
          height: '92vh',
          borderRadius: '24px 24px 0 0',
          background: 'linear-gradient(160deg,#0f172a 0%,#1e1b4b 55%,#0f172a 100%)',
          boxShadow: '0 -8px 60px rgba(37,99,235,0.28)',
        }}
        role="dialog" aria-modal="true" aria-label="Aura AI Assistant"
      >
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}>

          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(s => !s)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
            aria-label="Toggle chat history"
          >
            <Menu size={18} />
          </button>

          {/* Aura logo + active chat */}
          <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-white text-sm font-bold shadow-lg"
            style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>A</div>

          <div className="flex-1 min-w-0">
            <div className="text-white font-extrabold text-sm leading-tight truncate">Aura</div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-[10px] font-semibold truncate">
                {activeChat ? activeChat.title : 'Airport AI Assistant'}
              </span>
            </div>
          </div>

          {/* New Chat */}
          <button
            id="aura-new-chat-btn"
            onClick={handleNewChat}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-300 hover:text-white hover:bg-blue-600/30 border border-blue-500/30 transition-all flex-shrink-0"
            aria-label="New chat"
          >
            <Plus size={14} /> New
          </button>

          {/* Close */}
          <button
            id="aura-modal-close-btn"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
            aria-label="Close Aura"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body (sidebar + main) ─────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* ── Sidebar ─────────────────────────────────────────────────────── */}
          <div
            className="absolute top-0 left-0 bottom-0 z-20 flex flex-col transition-all duration-300 overflow-hidden"
            style={{
              width: sidebarOpen ? '220px' : '0px',
              background: 'rgba(10,14,30,0.97)',
              borderRight: sidebarOpen ? '1px solid rgba(255,255,255,0.08)' : 'none',
            }}
          >
            {sidebarOpen && (
              <>
                {/* Sidebar header */}
                <div className="px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aura Chats</div>
                </div>

                {/* New Chat button in sidebar */}
                <button
                  onClick={handleNewChat}
                  className="mx-3 mt-3 mb-1 flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-blue-300 hover:text-white hover:bg-blue-600/25 border border-blue-500/20 transition-all flex-shrink-0"
                >
                  <Plus size={14} /> New Chat
                </button>

                {/* Chat list */}
                <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
                  {isInitializing ? (
                    <div className="flex justify-center py-6">
                      <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    </div>
                  ) : chats.length === 0 ? (
                    <div className="text-slate-500 text-xs text-center py-6 px-2">
                      No chats yet.<br />Click New Chat to begin.
                    </div>
                  ) : (
                    chats.map(chat => (
                      <button
                        key={chat.id}
                        onClick={() => { setActiveChatId(chat.id); setSidebarOpen(false); }}
                        className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-all group flex items-center gap-2 ${activeChatId === chat.id
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-slate-300 hover:bg-white/8 hover:text-white'
                          }`}
                        style={activeChatId !== chat.id ? { background: 'transparent' } : {}}
                      >
                        <MessageSquare size={12} className="flex-shrink-0 opacity-70" />
                        <span className="flex-1 truncate font-medium">{chat.title}</span>
                        {/* Delete button */}
                        <span
                          role="button"
                          onClick={(e) => handleDeleteChat(e, chat.id)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all"
                          aria-label={`Delete ${chat.title}`}
                        >
                          <Trash2 size={11} />
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Main chat area ───────────────────────────────────────────────── */}
          <div
            className="flex flex-col flex-1 overflow-hidden transition-all duration-300"
            style={{ marginLeft: sidebarOpen ? '220px' : '0' }}
          >
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {/* Empty state (no chat selected) */}
              {!activeChatId && !isInitializing && (
                <div className="flex flex-col items-center justify-center h-full text-center gap-4">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-xl"
                    style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>A</div>
                  <div>
                    <div className="text-white font-extrabold text-lg">Welcome, {passengerName}!</div>
                    <div className="text-slate-400 text-sm mt-1">Click <span className="text-blue-400 font-semibold">+ New</span> to start chatting with Aura.</div>
                  </div>
                </div>
              )}

              {/* Loading spinner */}
              {isInitializing && (
                <div className="flex justify-center py-12">
                  <div className="w-7 h-7 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                </div>
              )}

              {/* Messages list */}
              {activeChatId && !isInitializing && (
                <>
                  {isLoadingMsgs ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    displayMessages.map(msg => <MsgBubble key={msg.id} msg={msg} />)
                  )}
                  {isLoading && <TypingIndicator />}
                  <div ref={msgEndRef} />
                </>
              )}
            </div>

            {/* Input area */}
            <div
              className="flex-shrink-0 px-4 py-3 border-t"
              style={{
                borderColor: 'rgba(255,255,255,0.08)',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom,0px))',
              }}
            >
              {/* Talk to AI button row */}
              <div className="flex items-center mb-2">
                <button
                  id="aura-talk-btn"
                  type="button"
                  onClick={isRecording ? stopVoiceInput : startVoiceInput}
                  disabled={isLoading || isInitializing}
                  aria-label={isRecording ? 'Stop recording' : 'Talk to AI'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${isRecording
                      ? 'text-red-300 border-red-500/50 bg-red-500/15 hover:bg-red-500/25 animate-pulse'
                      : 'text-violet-300 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 hover:text-white'
                    }`}
                >
                  {isRecording
                    ? <><Square size={11} className="fill-current" /><span>Stop</span></>
                    : <><Mic size={11} /><span>Talk to AI</span></>
                  }
                </button>
                {/* Live transcript preview */}
                {isRecording && liveTranscript && (
                  <span className="ml-2 text-[11px] text-slate-400 truncate max-w-[200px] italic">
                    "{liveTranscript}"
                  </span>
                )}
                {isRecording && !liveTranscript && (
                  <span className="ml-2 text-[11px] text-red-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
                    Listening…
                  </span>
                )}
              </div>

              {(voiceError || error) && (
                <div className="text-xs text-red-400 mb-2 px-1">⚠️ {voiceError || error}</div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  id="aura-chat-input"
                  type="text"
                  value={input}
                  onChange={e => { setInput(e.target.value); setError(''); }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isRecording
                      ? 'Listening… press Stop when done.'
                      : activeChatId
                        ? 'Ask about your flight or airport…'
                        : 'Create a new chat to start…'
                  }
                  disabled={isLoading || isInitializing || isRecording}
                  autoComplete="off"
                  className="flex-1 text-white placeholder-slate-500 text-sm px-4 py-3 rounded-2xl outline-none transition-all border focus:border-blue-500/60 disabled:opacity-50"
                  style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
                />
                <button
                  id="aura-send-btn"
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading || isInitializing || isRecording}
                  className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}
                  aria-label="Send message"
                >
                  {isLoading ? <Loader size={16} className="text-white animate-spin" /> : <Send size={16} className="text-white" />}
                </button>
              </div>
              <div className="text-center mt-1.5">
                <span className="text-[10px] text-slate-600">Powered by OpenRouter · Airport journeys only · Last 7 exchanges remembered</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keyframe animation */}
      <style>{`
        @keyframes aura-fade-up {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .aura-fade-up { animation: aura-fade-up 0.2s ease-out both; }
      `}</style>
    </>
  );
}
