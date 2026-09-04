import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Send, Loader, Plus, MessageSquare, Menu, Trash2, Mic, Square, Camera, Volume2, VolumeX, StopCircle } from 'lucide-react';
import { pois, findShortestPath } from '../../navigation/data/mapData';
import { cleanSpeechTranscript } from '../../../utils/speechUtils';

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
  action?: any;
  imageUrl?: string;   // base64 preview for user-uploaded image
  translatedText?: string; // final translated text for listen action
  originalOcr?: string; // raw OCR text before translation, for retranslation
  currentLang?: string; // code of language currently translated to
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

function renderFormattedText(text: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={i} className="font-bold text-blue-200 bg-blue-500/20 px-1 py-0.5 rounded">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

function MsgBubble({ msg, onActionClick, onListenClick, ttsPlayingMsgId }: {
  msg: DisplayMessage;
  onActionClick?: (action: any) => void;
  onListenClick?: (text: string, lang: string, msgId: string) => void;
  ttsPlayingMsgId?: string | null;
}) {
  const isUser = msg.role === 'user';
  const time = msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isUser) {
    return (
      <div className="flex justify-end mb-3 aura-fade-up">
        <div className="max-w-[80%]">
          {msg.imageUrl && (
            <img
              src={msg.imageUrl}
              alt="Uploaded board"
              className="rounded-2xl rounded-br-sm mb-1 max-h-48 w-full object-cover border border-white/10"
            />
          )}
          {msg.text && (
            <div className="px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg,#2563eb,#4f46e5)' }}>{renderFormattedText(msg.text)}</div>
          )}
          <div className="text-[10px] text-right mt-1 text-slate-400">{time}</div>
        </div>
      </div>
    );
  }

  const isListenAction = msg.action?.type === 'listen';
  const isScanAction = msg.action?.type === 'scan_board';
  const isPlaying = ttsPlayingMsgId === msg.id;

  return (
    <div className="flex items-end gap-2 mb-3 aura-fade-up">
      <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
        style={{ background: 'linear-gradient(135deg,#2563eb,#7c3aed)' }}>A</div>
      <div className="max-w-[82%]">
        <div className="bg-white/10 border border-white/10 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-slate-100 whitespace-pre-wrap">
          {renderFormattedText(msg.text)}

          {/* Scan / Upload Board action button */}
          {isScanAction && (
            <button
              onClick={() => onActionClick && onActionClick(msg.action)}
              className="mt-3 w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg text-sm transition-colors active:scale-95"
            >
              <Camera size={16} />
              {msg.action.label || '📷 Scan / Upload Board'}
            </button>
          )}

          {/* Listen (TTS) action button */}
          {isListenAction && (
            <button
              onClick={() => onListenClick && onListenClick(msg.translatedText || msg.text, msg.action.lang || 'en', msg.id)}
              className={`mt-3 w-full flex items-center justify-center gap-2 font-bold py-2.5 px-4 rounded-xl shadow-lg text-sm transition-colors active:scale-95 ${
                isPlaying
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white'
              }`}
            >
              {isPlaying ? <StopCircle size={16} /> : <Volume2 size={16} />}
              {isPlaying ? '⏹ Stop Audio' : '🔊 Listen'}
            </button>
          )}

          {/* Generic action button (food, transit, navigation etc.) */}
          {msg.action && !isScanAction && !isListenAction && (
            <button
              onClick={() => onActionClick && onActionClick(msg.action)}
              className="mt-3 w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg flex items-center justify-center gap-2 text-sm transition-colors active:scale-95"
            >
              {msg.action.label || 'Continue'}
            </button>
          )}
        </div>
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

  // ── Image / OCR / TTS state ──────────────────────────────────────────────
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [targetLang, setTargetLang] = useState('en'); // BCP-47 language code
  const [ttsPlayingMsgId, setTtsPlayingMsgId] = useState<string | null>(null);
  const lastOcrTextRef = useRef<string>(''); // Keeps the latest scanned raw text for live re-translation
  const lastOcrMsgIdRef = useRef<string | null>(null);

  // Language options shown in the selector
  const LANG_OPTIONS = [
    { code: 'en', label: 'English' },
    { code: 'te', label: 'Telugu' },
    { code: 'hi', label: 'Hindi' },
    { code: 'ta', label: 'Tamil' },
    { code: 'kn', label: 'Kannada' },
    { code: 'ml', label: 'Malayalam' },
    { code: 'mr', label: 'Marathi' },
    { code: 'bn', label: 'Bengali' },
    { code: 'ur', label: 'Urdu' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'ar', label: 'Arabic' },
    { code: 'zh', label: 'Chinese' },
    { code: 'ja', label: 'Japanese' },
    { code: 'es', label: 'Spanish' },
  ];

  // Helper to translate text using MyMemory API with fallback
  const translateWithFallback = async (sourceText: string, toLang: string): Promise<string> => {
    if (!sourceText.trim() || toLang === 'en') return sourceText;
    try {
      const resp = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(sourceText)}&langpair=en|${toLang}`
      );
      const json = await resp.json();
      if (json?.responseStatus === 200 && json.responseData?.translatedText) {
        return json.responseData.translatedText;
      }
    } catch (err) {
      console.warn('[Aura] MyMemory translation error:', err);
    }
    return sourceText;
  };

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
    // If already have an active chat loaded in state, keep using it
    if (activeChatId && messages.length > 0) {
      return;
    }

    setIsInitializing(true);
    try {
      const data: AuraChat[] = await apiFetch('/api/aura/chats');
      setChats(data);

      const savedChatId = localStorage.getItem('aura_last_chat_id');
      const chatToSelect = data.find(c => c.id === savedChatId) || data[0];

      if (chatToSelect) {
        // Reuse old/existing chat
        setActiveChatId(chatToSelect.id);
        localStorage.setItem('aura_last_chat_id', chatToSelect.id);
      } else {
        // Only create a new chat if no chats exist at all
        const newChat: AuraChat = await apiFetch('/api/aura/new-chat', { method: 'POST' });
        setChats([newChat]);
        setActiveChatId(newChat.id);
        localStorage.setItem('aura_last_chat_id', newChat.id);
      }
    } catch (e) {
      console.error('[AuraModal] initChats error', e);
      // Fallback: create a local fallback session
      if (!activeChatId) {
        const fallbackId = 'chat-default';
        setActiveChatId(fallbackId);
      }
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
      localStorage.setItem('aura_last_chat_id', newChat.id);
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
        const { resolveIntent } = await import('../services/intentResolver');
        const resolved = resolveIntent(text);
        
        let auraMsg: DisplayMessage = {
          id: nextId(),
          role: 'aura',
          text: resolved.response,
          timestamp: new Date(),
          action: resolved.action
        };
        
        setMessages(prev => [...prev, auraMsg]);

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

  // ── Image Upload & OCR Handler ────────────────────────────────────────────
  const handleImageChosen = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (imageInputRef.current) imageInputRef.current.value = '';

    // 1. Read image as base64 and add as user bubble with preview
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      if (!base64) return;

      const userImgMsg: DisplayMessage = {
        id: nextId(),
        role: 'user',
        text: '📷 Uploaded a board / sign image',
        imageUrl: base64,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, userImgMsg]);
      setIsOcrProcessing(true);

      // 2. Run OCR via Tesseract.js
      try {
        const Tesseract = await import('tesseract.js');
        const { data: { text: ocrText } } = await Tesseract.recognize(base64, 'eng', {
          logger: () => {},
        });

        const cleanedOcr = ocrText.trim();
        if (!cleanedOcr) {
          const failMsg: DisplayMessage = {
            id: nextId(), role: 'aura',
            text: "I couldn't extract any text from the image. Please make sure the board text is clearly visible and well-lit. Try again.",
            timestamp: new Date(),
          };
          setMessages(prev => [...prev, failMsg]);
          setIsOcrProcessing(false);
          return;
        }

        // Cache the latest OCR text for live re-translation on language change
        lastOcrTextRef.current = cleanedOcr;

        // 3. Translate using MyMemory API
        const translatedText = await translateWithFallback(cleanedOcr, targetLang);
        const langLabel = LANG_OPTIONS.find(l => l.code === targetLang)?.label || 'English';
        const sameLanguage = targetLang === 'en';

        // 4. Post result as Aura bubble with listen action
        const resultMsgId = nextId();
        lastOcrMsgIdRef.current = resultMsgId;

        const resultMsg: DisplayMessage = {
          id: resultMsgId,
          role: 'aura',
          text: sameLanguage
            ? `✅ **Text found on board:**\n\n${cleanedOcr}\n\nClick the button below to hear it read aloud.`
            : `✅ **Original Text:**\n${cleanedOcr}\n\n🌐 **Translated to ${langLabel}:**\n${translatedText}\n\nClick the button below to hear the translation.`,
          translatedText,
          originalOcr: cleanedOcr,
          currentLang: targetLang,
          timestamp: new Date(),
          action: { type: 'listen', label: '🔊 Listen', lang: targetLang },
        };
        setMessages(prev => [...prev, resultMsg]);
      } catch (ocrErr: any) {
        const errMsg: DisplayMessage = {
          id: nextId(), role: 'aura',
          text: `⚠️ OCR failed: ${ocrErr?.message || 'Unknown error'}. Please try a clearer image.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errMsg]);
      } finally {
        setIsOcrProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  }, [targetLang, LANG_OPTIONS]); // eslint-disable-line

  // ── Language Change Handler with Live Re-translation ─────────────────────
  const handleLanguageChange = async (newLang: string) => {
    setTargetLang(newLang);

    // If there is a recent board OCR in chat, re-translate it in real time!
    const rawOcr = lastOcrTextRef.current;
    if (rawOcr) {
      setIsOcrProcessing(true);
      try {
        const langLabel = LANG_OPTIONS.find(l => l.code === newLang)?.label || 'English';
        const translated = await translateWithFallback(rawOcr, newLang);
        const sameLanguage = newLang === 'en';

        // Update the existing result message or append a new translation bubble
        const resultMsgId = nextId();
        lastOcrMsgIdRef.current = resultMsgId;

        const newMsg: DisplayMessage = {
          id: resultMsgId,
          role: 'aura',
          text: sameLanguage
            ? `✅ **Text found on board (English):**\n\n${rawOcr}\n\nClick the button below to hear it read aloud.`
            : `🌐 **Translated to ${langLabel}:**\n${translated}\n\nOriginal: "${rawOcr}"\n\nClick the button below to hear the translation.`,
          translatedText: translated,
          originalOcr: rawOcr,
          currentLang: newLang,
          timestamp: new Date(),
          action: { type: 'listen', label: '🔊 Listen', lang: newLang },
        };
        setMessages(prev => [...prev, newMsg]);
      } catch (e) {
        console.warn('[Aura] re-translation failed:', e);
      } finally {
        setIsOcrProcessing(false);
      }
    }
  };

  // ── TTS Listen Handler ────────────────────────────────────────────────────
  const handleListenClick = useCallback((text: string, lang: string, msgId: string) => {
    if (!window.speechSynthesis) {
      alert('Text-to-speech is not supported on this device/browser.');
      return;
    }
    // If already playing this message — stop it
    if (ttsPlayingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setTtsPlayingMsgId(null);
      return;
    }
    // Stop any existing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.onstart = () => setTtsPlayingMsgId(msgId);
    utterance.onend = () => setTtsPlayingMsgId(null);
    utterance.onerror = () => setTtsPlayingMsgId(null);
    window.speechSynthesis.speak(utterance);
  }, [ttsPlayingMsgId]);

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
      const { resolveIntent } = await import('../services/intentResolver');
      const resolved = resolveIntent(text);
      
      const auraMsg: DisplayMessage = {
        id: nextId(), 
        role: 'aura', 
        text: resolved.response, 
        timestamp: new Date(),
        action: resolved.action
      };
      setMessages(prev => [...prev, auraMsg]);

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

  const startVoiceInput = useCallback(async () => {
    if (!SpeechRecognitionAPI) {
      setVoiceError('Voice input not supported on this device/browser.');
      return;
    }
    setVoiceError('');
    liveTranscriptRef.current = '';
    finalTranscriptRef.current = '';
    setLiveTranscript('');

    // Pre-request microphone permission via getUserMedia to ensure the WebView/Browser permission dialog triggers
    if (navigator?.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop audio tracks immediately once permission is verified
        stream.getTracks().forEach(track => track.stop());
      } catch (micErr: any) {
        console.warn('Microphone permission check error:', micErr);
        // If explicitly denied or blocked
        if (micErr?.name === 'NotAllowedError' || micErr?.name === 'PermissionDeniedError') {
          setVoiceError('Microphone permission denied. Please allow microphone access in App Settings.');
          return;
        }
      }
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SpeechRecognitionAPI();
    // Use targetLang for voice input locale if regional (e.g. te-IN for Telugu, hi-IN for Hindi) or default to en-US / en-IN
    const speechLangMap: Record<string, string> = {
      te: 'te-IN',
      hi: 'hi-IN',
      ta: 'ta-IN',
      kn: 'kn-IN',
      ml: 'ml-IN',
      mr: 'mr-IN',
      bn: 'bn-IN',
      ur: 'ur-IN',
      fr: 'fr-FR',
      de: 'de-DE',
      ar: 'ar-SA',
      zh: 'zh-CN',
      ja: 'ja-JP',
      es: 'es-ES',
      en: 'en-US',
    };
    recognition.lang = speechLangMap[targetLang] || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: any) => {
      const { finalTranscript, liveTranscript } = cleanSpeechTranscript(event.results);
      finalTranscriptRef.current = finalTranscript;
      liveTranscriptRef.current = liveTranscript;
      setLiveTranscript(liveTranscript);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted') return;
      let msg = `Voice error: ${event.error}`;
      if (event.error === 'no-speech') msg = 'No speech detected. Please speak clearly.';
      if (event.error === 'not-allowed' || event.error === 'permission-denied')
        msg = 'Microphone access denied. Please grant Microphone permission in Android App Settings.';
      if (event.error === 'network') msg = 'Network error — speech recognition service unavailable.';
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
                        onClick={() => {
                          setActiveChatId(chat.id);
                          localStorage.setItem('aura_last_chat_id', chat.id);
                          setSidebarOpen(false);
                        }}
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
                    displayMessages.map(msg => (
                      <MsgBubble
                        key={msg.id}
                        msg={msg}
                        ttsPlayingMsgId={ttsPlayingMsgId}
                        onListenClick={handleListenClick}
                        onActionClick={(action) => {
                          // scan_board: trigger the image file input
                          if (action.type === 'scan_board') {
                            imageInputRef.current?.click();
                            return;
                          }

                          // 1. Immediately close the Aura chat modal so the target page is fully visible
                          onClose();
                          window.dispatchEvent(new Event('aura-close-event'));

                          // 2. Perform navigation to the desired feature
                          setTimeout(() => {
                            if (action.type === 'route' || (action.type === 'navigate' && action.from && action.to)) {
                              navigate(`/navigation?from=${encodeURIComponent(action.from)}&to=${encodeURIComponent(action.to)}`, { state: { from: action.from, to: action.to } });
                            } else if (action.type === 'navigate' && action.poiId) {
                              sessionStorage.setItem('autoSelectPoiId', action.poiId);
                              navigate('/navigation', { state: { autoSelectPoiId: action.poiId } });
                            } else if (action.type === 'navigate') {
                              navigate('/navigation');
                            } else if (action.type === 'bus_service' || action.type === 'transit_services' || action.type === 'transit') {
                              navigate('/transit-services');
                            } else if (action.type === 'flight_tracking') {
                              navigate('/flight-tracking');
                            } else if (action.type === 'meal_delivery') {
                              navigate('/meal-delivery');
                            } else if (action.type === 'emergency_contact' || action.type === 'emergency') {
                              navigate('/emergency-contact');
                            } else if (action.type === 'baggage_guidance') {
                              navigate('/baggage-guidance');
                            }
                          }, 50);
                        }}
                      />
                    ))
                  )}
                  {(isLoading || isOcrProcessing) && <TypingIndicator />}
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
              {/* Controls row: Talk to AI + Language Selector + Upload Image */}
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Talk to AI */}
                <button
                  id="aura-talk-btn"
                  type="button"
                  onClick={isRecording ? stopVoiceInput : startVoiceInput}
                  disabled={isLoading || isInitializing || isOcrProcessing}
                  aria-label={isRecording ? 'Stop recording' : 'Talk to AI'}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 ${isRecording
                      ? 'text-red-300 border-red-500/50 bg-red-500/15 hover:bg-red-500/25 animate-pulse'
                      : 'text-violet-300 border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 hover:text-white'
                    }`}
                >
                  {isRecording
                    ? <><Square size={11} className="fill-current" /><span>Stop</span></>
                    : <><Mic size={11} /><span>Talk to AI</span></>
                  }
                </button>

                {/* Language selector */}
                <select
                  id="aura-lang-select"
                  value={targetLang}
                  onChange={e => handleLanguageChange(e.target.value)}
                  aria-label="Translation target language"
                  className="flex-1 min-w-0 text-xs font-semibold text-blue-200 border border-blue-500/25 rounded-xl px-2 py-1.5 outline-none transition-all cursor-pointer"
                  style={{ background: 'rgba(37,99,235,0.12)' }}
                >
                  {LANG_OPTIONS.map(l => (
                    <option key={l.code} value={l.code} style={{ background: '#1e1b4b', color: '#e2e8f0' }}>
                      {l.label}
                    </option>
                  ))}
                </select>

                {/* Upload / Scan image button */}
                <button
                  id="aura-image-upload-btn"
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isLoading || isInitializing || isOcrProcessing || isRecording}
                  aria-label="Upload image for translation"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/25 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  {isOcrProcessing
                    ? <><Loader size={11} className="animate-spin" /><span>Reading…</span></>
                    : <><Camera size={11} /><span>Scan Board</span></>
                  }
                </button>

                {/* Hidden file input for camera/gallery */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleImageChosen}
                  className="hidden"
                  aria-hidden="true"
                />

                {/* Live transcript preview */}
                {isRecording && liveTranscript && (
                  <span className="text-[11px] text-slate-400 truncate max-w-[180px] italic">
                    "{liveTranscript}"
                  </span>
                )}
                {isRecording && !liveTranscript && (
                  <span className="text-[11px] text-red-400 flex items-center gap-1">
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
