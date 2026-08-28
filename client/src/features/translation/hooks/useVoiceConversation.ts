import { useCallback, useRef, useState } from 'react';
import { GeminiTranslationProvider } from '../services/GeminiTranslationProvider';
import {
  ConversationEntry,
  LanguageOption,
  RecordingState,
  SUPPORTED_LANGUAGES,
  TurnState,
} from '../types/translation.types';
import { cleanSpeechTranscript } from '../../../utils/speechUtils';

// ─────────────────────────────────────────────────────────────────────────────
// Browser SpeechRecognition type shim
// ─────────────────────────────────────────────────────────────────────────────
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function findLanguageOption(label: string): LanguageOption | undefined {
  return SUPPORTED_LANGUAGES.find((l) => l.label === label);
}

/**
 * Speak text aloud using a reliable external TTS service (Google Translate TTS).
 *
 * This completely replaces window.speechSynthesis, which fails silently if the
 * user's OS does not have the target language voice pack installed (e.g., Telugu).
 *
 * Uses the HTML5 Audio API. If auto-play is blocked, returns 'silent'.
 */
function speakText(text: string, bcp47: string): Promise<'spoke' | 'silent'> {
  return new Promise((resolve) => {
    console.log(`[TTS] Preparing Audio: "${text.slice(0, 80)}" lang=${bcp47}`);

    const langPrefix = bcp47.split('-')[0];
    
    // Proxy through our backend to bypass Google's Referer 404 blocking
    // The Vite dev server will proxy /api to localhost:4000
    const url = `/api/tts?lang=${langPrefix}&text=${encodeURIComponent(text)}`;
    
    const audio = new Audio(url);
    audio.volume = 1.0;

    // Safety: resolve after 20s to prevent permanent blocking
    const safetyTimer = setTimeout(() => {
      console.warn('[TTS] 20s safety timeout — resolving without audio');
      resolve('silent');
    }, 20000);

    audio.onplay = () => {
      console.log(`[TTS] ▶ PLAYING ALOUD: "${text.slice(0, 60)}"`);
    };

    audio.onended = () => {
      clearTimeout(safetyTimer);
      console.log(`[TTS] ✓ Finished speaking loudly!`);
      resolve('spoke');
    };

    audio.onerror = (e) => {
      clearTimeout(safetyTimer);
      console.error(`[TTS] Error loading external audio:`, e);
      // If external fails, fallback to browser synthesis
      fallbackSpeakText(text, bcp47).then(resolve);
    };

    console.log('[TTS] audio.play() called');
    audio.play().catch((err) => {
      console.warn('[TTS] Auto-play blocked by browser:', err);
      clearTimeout(safetyTimer);
      resolve('silent');
    });
  });
}

/**
 * Fallback browser TTS if the external audio fails.
 */
function fallbackSpeakText(text: string, bcp47: string): Promise<'spoke' | 'silent'> {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve('silent');
      return;
    }
    
    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = bcp47;
    utterance.volume = 1.0;
    
    let audioStarted = false;
    
    utterance.onstart = () => { audioStarted = true; };
    utterance.onend = () => resolve(audioStarted ? 'spoke' : 'silent');
    utterance.onerror = () => resolve(audioStarted ? 'spoke' : 'silent');
    
    synth.speak(utterance);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook interfaces
// ─────────────────────────────────────────────────────────────────────────────

/** Describes the pending TTS playback that needs a user tap to play */
export interface PendingPlayback {
  text: string;
  bcp47: string;
  targetLang: string;
  speaker: 'person-a' | 'person-b';
}

export interface VoiceConversationState {
  turn: TurnState;
  recordingState: RecordingState;
  liveTranscript: string;
  finalTranscript: string;
  latestTranslation: string;
  history: ConversationEntry[];
  error: string | null;
  isActive: boolean;
  personALanguage: string;
  personBLanguage: string;
  /** Set when TTS needs a user tap to play (Chrome user-gesture restriction) */
  pendingPlayback: PendingPlayback | null;
  /** True while the "tap to hear" TTS is actively playing */
  isSpeaking: boolean;
}

export interface VoiceConversationActions {
  startConversation: (personALang: string, personBLang: string) => void;
  startRecording: () => void;
  stopRecording: () => void;
  resetConversation: () => void;
  clearError: () => void;
  /** Call this from a button click to speak pending translation & advance turn */
  playAndAdvanceTurn: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useVoiceConversation(): VoiceConversationState & VoiceConversationActions {
  // ── React state (for rendering) ──────────────────────────────────────────
  const [turn, setTurn] = useState<TurnState>('idle');
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [latestTranslation, setLatestTranslation] = useState('');
  const [history, setHistory] = useState<ConversationEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [personALanguage, setPersonALanguage] = useState('English');
  const [personBLanguage, setPersonBLanguage] = useState('Telugu');
  const [pendingPlayback, setPendingPlayback] = useState<PendingPlayback | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  // ── Refs (synchronous access inside DOM/async callbacks) ──────────────────
  const recognitionRef      = useRef<any>(null);
  const providerRef         = useRef(new GeminiTranslationProvider());
  const turnRef             = useRef<TurnState>('idle');
  const personALangRef      = useRef('English');
  const personBLangRef      = useRef('Telugu');
  const liveTranscriptRef   = useRef('');
  const finalTranscriptRef  = useRef('');
  const pipelineRunningRef  = useRef(false);
  const pendingPlaybackRef  = useRef<PendingPlayback | null>(null);

  // ── Sync helpers ─────────────────────────────────────────────────────────

  const setTurnSync = (t: TurnState) => { turnRef.current = t; setTurn(t); };
  const setPersonALangSync = (lang: string) => { personALangRef.current = lang; setPersonALanguage(lang); };
  const setPersonBLangSync = (lang: string) => { personBLangRef.current = lang; setPersonBLanguage(lang); };

  // ── Advance turn (shared helper) ─────────────────────────────────────────

  const advanceTurn = useCallback((speaker: 'person-a' | 'person-b') => {
    const nextTurn: TurnState = speaker === 'person-a' ? 'person-b' : 'person-a';
    console.log(`[Turn] Advancing to ${nextTurn}`);
    setTurnSync(nextTurn);
    setRecordingState('idle');
    setLiveTranscript('');
    setFinalTranscript('');
    setLatestTranslation('');
    liveTranscriptRef.current  = '';
    finalTranscriptRef.current = '';
  }, []);

  // ── playAndAdvanceTurn ────────────────────────────────────────────────────
  /**
   * MUST be called from a button click (user gesture) so Chrome allows audio.
   * Speaks the pending translation then switches the turn to the other speaker.
   */
  const playAndAdvanceTurn = useCallback(async () => {
    const pb = pendingPlaybackRef.current;
    if (!pb) { console.warn('[playAndAdvanceTurn] No pending playback'); return; }

    console.log(`[playAndAdvanceTurn] Speaking: "${pb.text.slice(0, 60)}" (${pb.bcp47})`);
    setIsSpeaking(true);

    const result = await speakText(pb.text, pb.bcp47);
    console.log(`[playAndAdvanceTurn] speakText result: ${result}`);

    setIsSpeaking(false);
    pendingPlaybackRef.current = null;
    setPendingPlayback(null);
    advanceTurn(pb.speaker);
    pipelineRunningRef.current = false;
  }, [advanceTurn]);

  // ── Pipeline ─────────────────────────────────────────────────────────────

  const runTranslationPipeline = useCallback(
    async (spokenText: string, speaker: 'person-a' | 'person-b', aLang: string, bLang: string) => {
      if (pipelineRunningRef.current) {
        console.warn('[Pipeline] Already running — skipping duplicate');
        return;
      }
      pipelineRunningRef.current = true;

      const sourceLang = speaker === 'person-a' ? aLang : bLang;
      const targetLang = speaker === 'person-a' ? bLang : aLang;
      const targetOption = findLanguageOption(targetLang);

      console.log(`[Pipeline] START | ${sourceLang} → ${targetLang} | "${spokenText}"`);

      setTurnSync('processing');
      setFinalTranscript(spokenText);
      setLatestTranslation('');
      setRecordingState('processing');

      try {
        // ── 1. Translate ──────────────────────────────────────────────────
        console.log('[Pipeline] Calling Gemini…');
        const translated = await providerRef.current.translate(spokenText, sourceLang, targetLang);
        console.log(`[Pipeline] Gemini response: "${translated}"`);

        if (!translated?.trim()) throw new Error('Empty translation from Gemini');

        // ── 2. Display translation ────────────────────────────────────────
        setLatestTranslation(translated);

        // ── 3. Save to history ────────────────────────────────────────────
        const entry: ConversationEntry = {
          id: makeid(),
          speaker,
          spokenLanguage: sourceLang,
          translatedLanguage: targetLang,
          originalText: spokenText,
          translatedText: translated,
          timestamp: new Date().toISOString(),
        };
        setHistory((prev: ConversationEntry[]) => [...prev, entry]);

        // ── 4. TTS ───────────────────────────────────────────────────────
        // First: always prepare the pendingPlayback (tap-to-hear button).
        // This is the guaranteed fallback if auto-play is blocked.
        const pb: PendingPlayback = {
          text: translated,
          bcp47: targetOption?.bcp47 ?? 'en-US',
          targetLang,
          speaker,
        };
        pendingPlaybackRef.current = pb;
        setPendingPlayback(pb);

        // Return to the current speaker's idle state while TTS is pending
        setTurnSync(speaker);
        setRecordingState('idle');

        // Auto-play attempt: works if warmupTTS() was called during startRecording
        console.log('[Pipeline] Attempting auto-play TTS…');
        const result = await speakText(translated, targetOption?.bcp47 ?? 'en-US');

        if (result === 'spoke') {
          // Auto-play worked — advance turn immediately
          console.log('[Pipeline] Auto-play succeeded — advancing turn');
          pendingPlaybackRef.current = null;
          setPendingPlayback(null);
          advanceTurn(speaker);
          pipelineRunningRef.current = false;
        } else {
          // Auto-play was silent/blocked — leave pendingPlayback so user taps
          console.log('[Pipeline] Auto-play silent/blocked — showing Tap to Hear button');
          // pipelineRunningRef stays true until playAndAdvanceTurn() clears it
        }
      } catch (err: any) {
        console.error('[Pipeline] ERROR:', err);
        setError(err?.message ?? 'Unexpected error — please try again.');
        setTurnSync(speaker);
        setRecordingState('idle');
        pendingPlaybackRef.current = null;
        setPendingPlayback(null);
        pipelineRunningRef.current = false;
      }
    },
    [advanceTurn]
  );

  // ── Actions ──────────────────────────────────────────────────────────────

  const startConversation = useCallback((personALang: string, personBLang: string) => {
    if (!SpeechRecognitionAPI) {
      setError('Your browser does not support Web Speech API. Please use Chrome or Edge.');
      return;
    }
    console.log(`[Conversation] Starting: ${personALang} ↔ ${personBLang}`);
    setPersonALangSync(personALang);
    setPersonBLangSync(personBLang);
    setHistory([]);
    setError(null);
    setLiveTranscript('');
    setFinalTranscript('');
    setLatestTranslation('');
    liveTranscriptRef.current  = '';
    finalTranscriptRef.current = '';
    pipelineRunningRef.current = false;
    pendingPlaybackRef.current = null;
    setPendingPlayback(null);
    setIsActive(true);
    setTurnSync('person-a');
    setRecordingState('idle');
  }, []);

  const startRecording = useCallback(() => {
    const currentTurn = turnRef.current;
    if (currentTurn !== 'person-a' && currentTurn !== 'person-b') {
      console.warn('[Recording] Cannot start — turn is:', currentTurn);
      return;
    }

    // ── Pre-warm TTS (user gesture context) ──────────────────────────────
    // Chrome requires speechSynthesis.speak() to be called within a user-gesture
    // context. We warm up here (during the button click) so subsequent async
    // calls are permitted. Voices are also pre-loaded here.
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices(); // trigger voice loading
      const warmup = new SpeechSynthesisUtterance(' ');
      warmup.volume = 0;
      warmup.rate = 10;
      window.speechSynthesis.speak(warmup);
      console.log('[TTS] Warmup utterance sent during user gesture');
    }

    // Read language from refs (never stale, unlike state)
    const speakerLang = currentTurn === 'person-a' ? personALangRef.current : personBLangRef.current;
    const langOption  = findLanguageOption(speakerLang);

    if (!langOption) {
      setError(`Language "${speakerLang}" is not supported.`);
      return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    liveTranscriptRef.current  = '';
    finalTranscriptRef.current = '';
    pipelineRunningRef.current = false;

    setLiveTranscript('');
    setFinalTranscript('');
    setLatestTranslation('');
    setError(null);
    pendingPlaybackRef.current = null;
    setPendingPlayback(null);

    const recognition = new SpeechRecognitionAPI();
    recognition.lang            = langOption.bcp47;
    recognition.interimResults  = true;
    recognition.continuous      = true;  // Keep listening until the user explicitly presses Stop
    recognition.maxAlternatives = 1;
    recognitionRef.current      = recognition;

    console.log(`[Recognition] Starting lang=${langOption.bcp47} speaker=${currentTurn}`);

    recognition.onresult = (event: any) => {
      const { finalTranscript: cFinal, liveTranscript: cLive } = cleanSpeechTranscript(event.results);

      finalTranscriptRef.current = cFinal;
      liveTranscriptRef.current = cLive;

      setFinalTranscript(cFinal);
      setLiveTranscript(cLive);

      if (cFinal) {
        console.log(`[Recognition] Final accumulated: "${cFinal}"`);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('[Recognition] Error:', event.error);
      if (event.error === 'aborted') return;
      let msg = `Speech error: ${event.error}`;
      if (event.error === 'no-speech')                                       msg = 'No speech detected. Please speak clearly.';
      if (event.error === 'not-allowed' || event.error === 'permission-denied') msg = 'Microphone access denied. Allow it in browser settings.';
      if (event.error === 'network')                                          msg = 'Network error — check your connection.';
      setError(msg);
      setRecordingState('idle');
      pipelineRunningRef.current = false;
    };

    // onend is the SINGLE place that triggers the pipeline
    recognition.onend = () => {
      console.log('[Recognition] onend — transcript:', finalTranscriptRef.current || liveTranscriptRef.current);
      setRecordingState('processing');

      const transcript = finalTranscriptRef.current.trim() || liveTranscriptRef.current.trim();
      if (!transcript) {
        console.warn('[Recognition] No transcript captured');
        setError('No speech captured. Please speak clearly and try again.');
        setRecordingState('idle');
        pipelineRunningRef.current = false;
        return;
      }

      const speaker = turnRef.current === 'person-a' ? 'person-a' : 'person-b';
      const aLang   = personALangRef.current;
      const bLang   = personBLangRef.current;
      runTranslationPipeline(transcript, speaker, aLang, bLang);
    };

    try {
      recognition.start();
      setRecordingState('recording');
    } catch (err) {
      console.error('[Recognition] Failed to start:', err);
      setError('Failed to start microphone. Check permissions and try again.');
      setRecordingState('idle');
    }
  }, [runTranslationPipeline]);

  const stopRecording = useCallback(() => {
    console.log('[Recording] Stop called');
    recognitionRef.current?.stop();
    // onend will fire and trigger the pipeline
  }, []);

  const resetConversation = useCallback(() => {
    console.log('[Conversation] Reset');
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    window.speechSynthesis?.cancel();
    setTurnSync('idle');
    setRecordingState('idle');
    setLiveTranscript('');
    setFinalTranscript('');
    setLatestTranslation('');
    setHistory([]);
    setError(null);
    setIsActive(false);
    setIsSpeaking(false);
    liveTranscriptRef.current  = '';
    finalTranscriptRef.current = '';
    pipelineRunningRef.current = false;
    pendingPlaybackRef.current = null;
    setPendingPlayback(null);
    personALangRef.current = 'English';
    personBLangRef.current = 'Telugu';
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    turn, recordingState, liveTranscript, finalTranscript, latestTranslation,
    history, error, isActive, personALanguage, personBLanguage,
    pendingPlayback, isSpeaking,
    startConversation, startRecording, stopRecording, resetConversation,
    clearError, playAndAdvanceTurn,
  };
}
