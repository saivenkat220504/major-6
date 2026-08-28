import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Scan,
  Camera,
  Upload,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Building2,
  Globe,
  ChevronDown,
  X,
  FlipHorizontal,
  Zap,
  ZapOff,
} from 'lucide-react';
import { readBarcodesFromImageData } from 'zxing-wasm';
import {
  BrowserMultiFormatReader,
  BarcodeFormat,
  DecodeHintType,
} from '@zxing/library';
import {
  decodeBarcodeImage,
  parseBoardingPassBarcode,
  BoardingPassData,
} from '../utils/barcodeDecoder';
import { useLanguage, SUPPORTED_LANGUAGES } from '../../../shared/context/LanguageContext';

interface TicketScanPageProps {
  onScanComplete?: (data: BoardingPassData) => void;
}

/**
 * Plays a subtle, pleasant synthetic confirmation chime (like GPay / Paytm)
 * on successful barcode verification using Web AudioContext.
 */
function playScanSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(880, now); // A5
    osc.frequency.setValueAtTime(1108.73, now + 0.08); // C#6

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) {
    // Audio Context restricted or unavailable
  }
}

/**
 * 3x3 Median Filter pre-pass for live video frames to strip moiré / scanlines
 * when scanning a barcode shown on a computer screen or monitor.
 */
function applyMedianFilter(srcRgba: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(srcRgba.length);
  const srcL = new Uint8Array(w * h);

  for (let i = 0, j = 0; i < srcRgba.length; i += 4, j++) {
    srcL[j] = Math.round(0.299 * srcRgba[i] + 0.587 * srcRgba[i + 1] + 0.114 * srcRgba[i + 2]);
  }

  const win = new Uint8Array(9);
  for (let y = 1; y < h - 1; y += 2) {
    for (let x = 1; x < w - 1; x += 2) {
      let idx = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          win[idx++] = srcL[(y + dy) * w + (x + dx)];
        }
      }
      win.sort();
      const m = win[4];
      const outIdx = (y * w + x) * 4;
      out[outIdx] = m; out[outIdx + 1] = m; out[outIdx + 2] = m; out[outIdx + 3] = 255;
    }
  }
  return out;
}

export default function TicketScanPage({ onScanComplete }: TicketScanPageProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { currentLang, changeLanguage, getLanguageObj } = useLanguage();

  const [isProcessing, setIsProcessing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedSuccess, setScannedSuccess] = useState<BoardingPassData | null>(null);
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  // Live Camera Scanner States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [isTorchSupported, setIsTorchSupported] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Stream & Loop References
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanLoopTimerRef = useRef<any>(null);
  const isScanningActiveRef = useRef(false);

  const [manualTicket, setManualTicket] = useState({
    passenger_name: '',
    flight_id: '',
    ticket_id: '',
    date: '',
    from: 'HYD',
    to: 'DEL',
    terminal: 'T1',
    seat: '12A',
  });

  const currentLangObj = getLanguageObj();

  const handleSelectTicket = (data: BoardingPassData) => {
    isScanningActiveRef.current = false;

    // Haptic & Audio Confirmation Feedback
    try {
      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    } catch {}
    playScanSuccessChime();

    // Ensure terminal is always enforced as 'T1'
    const finalData: BoardingPassData = {
      ...data,
      terminal: 'T1',
    };

    sessionStorage.setItem('boardingData', JSON.stringify(finalData));
    sessionStorage.setItem('ticketScanned', 'true');
    setScannedSuccess(finalData);

    // Stop camera stream
    stopCamera();

    // Notify application that ticket has been scanned
    window.dispatchEvent(new Event('ticket-scanned-event'));

    setTimeout(() => {
      if (onScanComplete) {
        onScanComplete(finalData);
      } else {
        navigate('/');
      }
    }, 850);
  };

  // ── Ultra-Fast GPay-Style Camera Scanner Engine ─────────────────────────────

  const stopCamera = () => {
    isScanningActiveRef.current = false;

    if (scanLoopTimerRef.current) {
      clearInterval(scanLoopTimerRef.current);
      scanLoopTimerRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setIsCameraActive(false);
    setCameraLoading(false);
    setIsTorchOn(false);
    setIsTorchSupported(false);
    setIsCapturing(false);
  };

  const startCamera = async (deviceId?: string) => {
    setError(null);
    setCameraLoading(true);
    setIsCameraActive(true);
    isScanningActiveRef.current = true;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(videoInputs);

      let targetId = deviceId;
      if (!targetId && videoInputs.length > 0) {
        const backCam = videoInputs.find((d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        targetId = backCam ? backCam.deviceId : videoInputs[0].deviceId;
      }
      setCurrentDeviceId(targetId || null);

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          deviceId: targetId ? { exact: targetId } : undefined,
          facingMode: targetId ? undefined : { ideal: 'environment' },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          advanced: [{ focusMode: 'continuous' } as any],
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      const track = stream.getVideoTracks()[0];
      if (track) {
        const capabilities: any = track.getCapabilities ? track.getCapabilities() : {};
        if (capabilities.torch) {
          setIsTorchSupported(true);
        }
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraLoading(false);
      startScanSamplingLoop();
    } catch (err: any) {
      console.error('Camera launch error:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        mediaStreamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          await videoRef.current.play();
        }
        setCameraLoading(false);
        startScanSamplingLoop();
      } catch (fallbackErr: any) {
        setError(fallbackErr.message || 'Unable to access camera. Please grant camera permissions or upload an image file.');
        stopCamera();
      }
    }
  };

  const toggleTorch = async () => {
    if (!mediaStreamRef.current) return;
    const track = mediaStreamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Failed to toggle torch:', err);
    }
  };

  const switchCamera = () => {
    if (videoDevices.length <= 1) return;
    const currentIndex = videoDevices.findIndex((d) => d.deviceId === currentDeviceId);
    const nextIndex = (currentIndex + 1) % videoDevices.length;
    const nextDevice = videoDevices[nextIndex].deviceId;
    stopCamera();
    startCamera(nextDevice);
  };

  /**
   * Manual Still Frame Snapshot Handler:
   * Captures high-res still frame from the video stream and runs full multi-pass decoding
   * (WASM + Median Filtering + Rotation + Contrast + Server Fallback).
   */
  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;

    setIsCapturing(true);
    setError(null);

    try {
      const vw = video.videoWidth || 1920;
      const vh = video.videoHeight || 1080;

      const canvas = document.createElement('canvas');
      canvas.width = vw;
      canvas.height = vh;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas context unavailable');

      ctx.drawImage(video, 0, 0, vw, vh);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png')
      );

      if (!blob) throw new Error('Failed to capture image frame from camera');

      const file = new File([blob], `barcode_snapshot_${Date.now()}.png`, { type: 'image/png' });
      const result = await decodeBarcodeImage(file);
      handleSelectTicket(result);
    } catch (err: any) {
      console.error('Snapshot decode error:', err);
      setError(err.message || 'Could not decode barcode from captured picture. Please hold camera steady and align within box.');
    } finally {
      setIsCapturing(false);
    }
  };

  /**
   * Ultra-fast continuous frame sampling loop.
   */
  const startScanSamplingLoop = () => {
    if (scanLoopTimerRef.current) clearInterval(scanLoopTimerRef.current);

    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [
      BarcodeFormat.PDF_417,
      BarcodeFormat.QR_CODE,
      BarcodeFormat.CODE_128,
      BarcodeFormat.CODE_39,
    ]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const zxingLibReader = new BrowserMultiFormatReader(hints);
    let isFrameBusy = false;

    scanLoopTimerRef.current = setInterval(async () => {
      if (!isScanningActiveRef.current || isFrameBusy) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      isFrameBusy = true;

      try {
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        if (vw === 0 || vh === 0) {
          isFrameBusy = false;
          return;
        }

        let canvas = canvasRef.current;
        if (!canvas) {
          canvas = document.createElement('canvas');
          canvasRef.current = canvas;
        }
        canvas.width = vw;
        canvas.height = vh;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          isFrameBusy = false;
          return;
        }

        ctx.drawImage(video, 0, 0, vw, vh);
        const imgData = ctx.getImageData(0, 0, vw, vh);

        // Pass 1: zxing-wasm on raw frame
        const wasmResults = await readBarcodesFromImageData(imgData, {
          formats: ['PDF417', 'QRCode', 'Code128', 'Code39'],
          tryHarder: true,
          tryRotate: true,
        });

        if (wasmResults && wasmResults.length > 0 && wasmResults[0].text) {
          const parsed = parseBoardingPassBarcode(wasmResults[0].text);
          handleSelectTicket(parsed);
          isFrameBusy = false;
          return;
        }

        // Pass 2: zxing-wasm on 3x3 median filtered frame (for monitor screen scanlines)
        const medianData = applyMedianFilter(imgData.data, vw, vh);
        const wasmMedianRes = await readBarcodesFromImageData(
          { data: medianData, width: vw, height: vh },
          { formats: ['PDF417', 'QRCode', 'Code128'], tryHarder: true }
        );

        if (wasmMedianRes && wasmMedianRes.length > 0 && wasmMedianRes[0].text) {
          const parsed = parseBoardingPassBarcode(wasmMedianRes[0].text);
          handleSelectTicket(parsed);
          isFrameBusy = false;
          return;
        }

        // Pass 3: BrowserMultiFormatReader fallback
        try {
          const libRes = await zxingLibReader.decodeFromVideoElement(video);
          if (libRes && libRes.getText()) {
            const parsed = parseBoardingPassBarcode(libRes.getText());
            handleSelectTicket(parsed);
            isFrameBusy = false;
            return;
          }
        } catch {
          // Continue smoothly
        }
      } catch (err) {
        // Continue scan loop
      } finally {
        isFrameBusy = false;
      }
    }, 75);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // ── Upload Image File Handler ────────────────────────────────────────────────

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';
    setIsProcessing(true);
    setError(null);

    try {
      const data = await decodeBarcodeImage(file);
      handleSelectTicket(data);
    } catch (err: any) {
      console.error('[TicketScan] Decode failure:', err);
      setError(err.message || 'Failed to decode PDF417 boarding pass barcode. Please ensure the image is sharp and well-lit.');
    } finally {
      setIsProcessing(false);
    }
  };

  // ── Manual Submission Fallback ───────────────────────────────────────────────

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTicket.passenger_name || !manualTicket.flight_id) {
      setError('Please fill in passenger name and flight number');
      return;
    }

    const data: BoardingPassData = {
      ticket_id: manualTicket.ticket_id || `TKT-${Math.floor(100000 + Math.random() * 900000)}`,
      passenger_name: manualTicket.passenger_name.trim(),
      flight_id: manualTicket.flight_id.trim().toUpperCase(),
      date: manualTicket.date || new Date().toISOString().split('T')[0],
      from: (manualTicket.from || 'HYD').trim().toUpperCase(),
      to: (manualTicket.to || 'DEL').trim().toUpperCase(),
      terminal: 'T1',
      seat: (manualTicket.seat || '14B').trim().toUpperCase(),
    };

    handleSelectTicket(data);
  };

  return (
    <div className="min-h-screen bg-[#06121F] text-white flex flex-col justify-between p-4 sm:p-6 font-sans">
      {/* Hidden offscreen canvas for frame processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Header Bar */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#2F80FF] to-[#14C8FF] flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <div className="font-black text-lg text-white tracking-tight">AIRPORT APP</div>
            <div className="text-[10px] text-[#94A3B8] font-medium">Step 1: Boarding Pass Barcode Verification</div>
          </div>
        </div>

        {/* Language Selector */}
        <div className="relative">
          <button
            onClick={() => setShowLangDropdown(!showLangDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#13243B] hover:bg-[#1f3454] border border-white/15 text-xs font-bold text-white transition-all shadow-md"
          >
            <Globe className="w-4 h-4 text-[#14C8FF]" />
            <span className="text-[#14C8FF] uppercase text-xs">{currentLangObj.code}</span>
            <span className="hidden sm:inline text-slate-300 font-normal">{currentLangObj.nativeLabel}</span>
            <ChevronDown className="w-3.5 h-3.5 text-[#94A3B8]" />
          </button>

          {showLangDropdown && (
            <div className="absolute top-full right-0 mt-2 w-52 rounded-2xl bg-[#0E1B2D] border border-white/15 shadow-2xl p-2 z-50 backdrop-blur-2xl">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-white/10">
                Select Language
              </div>
              <div className="py-1 space-y-0.5 max-h-60 overflow-y-auto">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      changeLanguage(lang.code);
                      setShowLangDropdown(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                      lang.code === currentLang
                        ? 'bg-[#2F80FF]/25 text-[#14C8FF] font-bold border border-cyan-400/20'
                        : 'text-[#F8FAFC] hover:bg-white/10'
                    }`}
                  >
                    <span>{lang.nativeLabel} ({lang.label})</span>
                    {lang.code === currentLang && <span className="w-2 h-2 rounded-full bg-[#14C8FF]" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Barcode Scanner Body */}
      <main className="max-w-4xl mx-auto w-full my-auto py-8 space-y-8">
        {/* Banner Title */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-blue-500/20 text-[#14C8FF] border border-blue-400/30 text-xs font-bold tracking-wider uppercase">
            <ShieldCheck size={14} />
            <span>PDF417 BOARDING PASS SCANNER</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Scan Your Boarding Pass
          </h1>
          <p className="text-sm sm:text-base text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
            Position your airline boarding pass PDF417 barcode in the camera, capture a photo, or upload an image. Once verified, your Dashboard opens automatically.
          </p>
        </div>

        {/* Success Banner */}
        {scannedSuccess && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-5 rounded-2xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center gap-4 shadow-xl"
          >
            <CheckCircle2 size={36} className="shrink-0 text-emerald-400 animate-bounce" />
            <div>
              <div className="font-extrabold text-xl text-white">Boarding Pass Verified!</div>
              <div className="text-sm text-emerald-200 mt-0.5">
                Welcome, {scannedSuccess.passenger_name} (Flight: {scannedSuccess.flight_id}, Seat: {scannedSuccess.seat}, Terminal: T1). Opening Home Page…
              </div>
            </div>
          </motion.div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-2xl bg-red-500/20 border border-red-400/40 text-red-300 flex items-center gap-3 text-sm">
            <AlertCircle size={20} className="shrink-0" />
            <div className="flex-1">{error}</div>
            <button
              onClick={() => setError(null)}
              className="p-1 hover:bg-white/10 rounded-lg text-red-300"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* ── Ultra-Fast GPay-Style Live Camera Viewfinder Modal ────────────── */}
        {isCameraActive && (
          <div className="relative p-4 sm:p-6 rounded-3xl bg-black border border-cyan-400/40 shadow-2xl overflow-hidden max-w-2xl mx-auto w-full">
            <div className="relative w-full aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
              />

              {/* Viewfinder Target Box tailored for rectangular PDF417 boarding pass barcodes */}
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-6">
                <div className="relative w-11/12 max-w-md h-36 sm:h-44 border-2 border-cyan-400/90 rounded-2xl bg-cyan-400/5 shadow-[0_0_25px_rgba(20,200,255,0.4)]">
                  {/* GPay-style corner brackets */}
                  <div className="absolute -top-1.5 -left-1.5 w-6 h-6 border-t-4 border-l-4 border-[#14C8FF] rounded-tl-lg shadow-[0_0_8px_#14C8FF]" />
                  <div className="absolute -top-1.5 -right-1.5 w-6 h-6 border-t-4 border-r-4 border-[#14C8FF] rounded-tr-lg shadow-[0_0_8px_#14C8FF]" />
                  <div className="absolute -bottom-1.5 -left-1.5 w-6 h-6 border-b-4 border-l-4 border-[#14C8FF] rounded-bl-lg shadow-[0_0_8px_#14C8FF]" />
                  <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 border-b-4 border-r-4 border-[#14C8FF] rounded-br-lg shadow-[0_0_8px_#14C8FF]" />

                  {/* High-speed animated laser scanline */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_12px_#14C8FF] animate-pulse relative top-1/2 -translate-y-1/2" />
                </div>

                <div className="mt-4 px-4 py-1.5 rounded-full bg-black/80 backdrop-blur-md text-xs font-bold text-cyan-300 border border-cyan-400/40 shadow-lg flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                  <span>Align Barcode & Tap Capture Below</span>
                </div>
              </div>

              {cameraLoading && (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 z-20">
                  <div className="w-9 h-9 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <div className="text-xs font-bold text-cyan-300">Launching High-Speed Camera Stream…</div>
                </div>
              )}

              {isCapturing && (
                <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-3 z-30">
                  <div className="w-10 h-10 border-4 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <div className="text-sm font-extrabold text-cyan-300">Processing Captured Photo…</div>
                </div>
              )}
            </div>

            {/* Camera Control Bar with Prominent Capture Picture Button */}
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                <button
                  onClick={stopCamera}
                  className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-2 transition-colors"
                >
                  <X size={16} />
                  <span>Close</span>
                </button>

                {isTorchSupported && (
                  <button
                    onClick={toggleTorch}
                    className={`py-2.5 px-4 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                      isTorchOn
                        ? 'bg-amber-500/30 text-amber-300 border border-amber-400/50'
                        : 'bg-[#162742] text-slate-300 hover:bg-[#1f3454] border border-white/10'
                    }`}
                  >
                    {isTorchOn ? <Zap size={16} className="text-amber-400" /> : <ZapOff size={16} />}
                    <span>{isTorchOn ? 'Torch On' : 'Torch Off'}</span>
                  </button>
                )}
              </div>

              {/* Prominent Center Snapshot Button */}
              <button
                id="capture-picture-btn"
                onClick={handleCaptureSnapshot}
                disabled={isCapturing || cameraLoading}
                className="w-full sm:w-auto py-3 px-6 rounded-2xl bg-gradient-to-r from-[#2F80FF] via-[#1E6DFF] to-[#14C8FF] hover:from-blue-600 hover:to-cyan-500 text-white font-extrabold text-xs sm:text-sm shadow-xl shadow-cyan-500/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                <Camera size={18} />
                <span>Capture & Process Photo</span>
              </button>

              {videoDevices.length > 1 && (
                <button
                  onClick={switchCamera}
                  className="py-2.5 px-4 rounded-xl bg-[#162742] hover:bg-[#1f3454] border border-white/10 text-xs font-bold text-cyan-300 flex items-center gap-2 transition-colors"
                >
                  <FlipHorizontal size={16} />
                  <span>Switch Camera</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Main Scan Options (Live Camera & File Upload) ────────────────── */}
        {!isCameraActive && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto w-full">
            {/* Option 1: Live Phone Camera Scan */}
            <div className="flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#0E1B2D] to-[#0A1524] border border-white/15 hover:border-cyan-400/50 transition-all shadow-2xl group">
              <div className="space-y-4 text-center">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/30 group-hover:scale-105 transition-transform">
                  <Camera size={40} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">Live Camera Scan</h3>
                  <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">
                    Auto-focus scanner with instant one-tap photo capture
                  </p>
                </div>
              </div>

              <button
                onClick={() => startCamera()}
                className="mt-8 w-full py-3.5 px-5 bg-gradient-to-r from-[#2F80FF] via-[#1E6DFF] to-[#14C8FF] hover:from-blue-600 hover:to-cyan-500 text-white font-extrabold rounded-2xl shadow-xl shadow-blue-500/30 flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98]"
              >
                <Camera size={18} />
                <span>Open Barcode Scanner</span>
              </button>
            </div>

            {/* Option 2: Upload Barcode File */}
            <div className="flex flex-col justify-between p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-[#0E1B2D] to-[#0A1524] border border-white/15 hover:border-cyan-400/50 transition-all shadow-2xl group">
              <div className="space-y-4 text-center">
                <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-500/30 group-hover:scale-105 transition-transform">
                  <Scan size={40} className="text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">Upload Barcode File</h3>
                  <p className="text-xs text-[#94A3B8] mt-1.5 leading-relaxed">
                    Upload an e-boarding pass screenshot or barcode image photo
                  </p>
                </div>
              </div>

              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="mt-8 w-full py-3.5 px-5 bg-[#162742] hover:bg-[#1E3352] border border-white/15 text-white font-extrabold rounded-2xl shadow-lg flex items-center justify-center gap-2 text-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {isProcessing ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <Upload size={18} />
                    <span>Choose Image File</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Manual PNR Entry Fallback */}
        <div className="pt-4 border-t border-white/10 max-w-3xl mx-auto w-full">
          <details className="group">
            <summary className="cursor-pointer text-xs font-bold text-[#14C8FF] hover:underline flex items-center justify-between">
              <span>Or enter PNR / Boarding details manually</span>
              <span className="text-[#94A3B8] group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <form onSubmit={handleManualSubmit} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#94A3B8] mb-1">Passenger Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sai Venkat"
                  value={manualTicket.passenger_name}
                  onChange={(e) => setManualTicket({ ...manualTicket, passenger_name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#94A3B8] mb-1">Flight Number</label>
                <input
                  type="text"
                  placeholder="e.g. 6E2412 or AI-102"
                  value={manualTicket.flight_id}
                  onChange={(e) => setManualTicket({ ...manualTicket, flight_id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#94A3B8] mb-1">Origin (From)</label>
                <input
                  type="text"
                  placeholder="e.g. HYD"
                  value={manualTicket.from}
                  onChange={(e) => setManualTicket({ ...manualTicket, from: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#94A3B8] mb-1">Destination (To)</label>
                <input
                  type="text"
                  placeholder="e.g. DEL"
                  value={manualTicket.to}
                  onChange={(e) => setManualTicket({ ...manualTicket, to: e.target.value.toUpperCase() })}
                  className="w-full px-3.5 py-2.5 bg-white/5 border border-white/15 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div className="sm:col-span-2 pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-md"
                >
                  Verify & Submit Ticket (Terminal: T1)
                </button>
              </div>
            </form>
          </details>
        </div>
      </main>

      {/* Footer info */}
      <footer className="text-center text-xs text-[#94A3B8] py-2 border-t border-white/5">
        Airport App • Encrypted Terminal Control Center
      </footer>
    </div>
  );
}
