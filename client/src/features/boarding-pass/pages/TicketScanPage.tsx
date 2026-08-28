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
  RefreshCw,
  X,
  FlipHorizontal,
  FileText,
} from 'lucide-react';
import {
  BrowserPDF417Reader,
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

export default function TicketScanPage({ onScanComplete }: TicketScanPageProps) {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { currentLang, changeLanguage, getLanguageObj } = useLanguage();

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scannedSuccess, setScannedSuccess] = useState<BoardingPassData | null>(null);
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  // Live Camera Scanner States
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | undefined>(undefined);
  const [cameraLoading, setCameraLoading] = useState(false);

  // Reader reference for live stream
  const liveReaderRef = useRef<BrowserMultiFormatReader | null>(null);

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
    // Ensure terminal is always enforced as 'T1'
    const finalData: BoardingPassData = {
      ...data,
      terminal: 'T1',
    };

    sessionStorage.setItem('boardingData', JSON.stringify(finalData));
    sessionStorage.setItem('ticketScanned', 'true');
    setScannedSuccess(finalData);

    // Stop camera stream if active
    stopCamera();

    // Notify application that ticket has been scanned
    window.dispatchEvent(new Event('ticket-scanned-event'));

    setTimeout(() => {
      if (onScanComplete) {
        onScanComplete(finalData);
      } else {
        navigate('/');
      }
    }, 900);
  };

  // ── Live Camera Scanning Implementation ──────────────────────────────────────

  const stopCamera = () => {
    if (liveReaderRef.current) {
      try {
        liveReaderRef.current.reset();
      } catch (e) {
        console.warn('Error resetting live reader:', e);
      }
      liveReaderRef.current = null;
    }
    setIsCameraActive(false);
    setCameraLoading(false);
  };

  const startCamera = async (deviceId?: string) => {
    setError(null);
    setCameraLoading(true);
    setIsCameraActive(true);

    try {
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.PDF_417,
        BarcodeFormat.QR_CODE,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODE_39,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);

      const reader = new BrowserMultiFormatReader(hints, 400);
      liveReaderRef.current = reader;

      const devices = await reader.listVideoInputDevices();
      setVideoDevices(devices);

      let targetDevice = deviceId;
      if (!targetDevice && devices.length > 0) {
        // Default to back/rear camera on mobile devices
        const backCamera = devices.find((d) =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        targetDevice = backCamera ? backCamera.deviceId : devices[0].deviceId;
      }
      setCurrentDeviceId(targetDevice);

      if (!videoRef.current) {
        setCameraLoading(false);
        return;
      }

      await reader.decodeFromVideoDevice(
        targetDevice ?? null,
        videoRef.current,
        (result, decodeErr) => {
          if (result && result.getText()) {
            try {
              const parsed = parseBoardingPassBarcode(result.getText());
              handleSelectTicket(parsed);
            } catch (err: any) {
              console.warn('Scanned data parse error:', err);
              setError(err.message || 'Scanned barcode does not contain valid boarding pass data.');
            }
          }
        }
      );
      setCameraLoading(false);
    } catch (err: any) {
      console.error('Camera initialization failed:', err);
      setError(err.message || 'Unable to access device camera. Please grant camera permissions or upload an image file.');
      stopCamera();
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
      terminal: 'T1', // Always T1
      seat: (manualTicket.seat || '14B').trim().toUpperCase(),
    };

    handleSelectTicket(data);
  };

  return (
    <div className="min-h-screen bg-[#06121F] text-white flex flex-col justify-between p-4 sm:p-6 font-sans">
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

        {/* Language Selector in Top Right Header */}
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
            Position your airline boarding pass PDF417 barcode in the camera or upload an image. Once verified, your personalized Dashboard will open automatically.
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

        {/* ── Live Camera Modal / Inline Viewfinder ────────────────────────── */}
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
                <div className="relative w-11/12 max-w-md h-36 sm:h-44 border-2 border-cyan-400/80 rounded-2xl bg-cyan-400/5 shadow-[0_0_20px_rgba(20,200,255,0.3)]">
                  {/* Corner accents */}
                  <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-[#14C8FF] rounded-tl" />
                  <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-[#14C8FF] rounded-tr" />
                  <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-[#14C8FF] rounded-bl" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-[#14C8FF] rounded-br" />

                  {/* Animated laser scanline */}
                  <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-cyan-300 to-transparent shadow-[0_0_8px_#14C8FF] animate-pulse relative top-1/2 -translate-y-1/2" />
                </div>
                <div className="mt-3 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[11px] font-bold text-cyan-300 border border-cyan-400/30">
                  Align PDF417 Barcode Inside Box
                </div>
              </div>

              {cameraLoading && (
                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <div className="text-xs font-bold text-cyan-300">Initializing Camera Stream…</div>
                </div>
              )}
            </div>

            {/* Camera Control Bar */}
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                onClick={stopCamera}
                className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-2 transition-colors"
              >
                <X size={16} />
                Close Camera
              </button>

              {videoDevices.length > 1 && (
                <button
                  onClick={switchCamera}
                  className="py-2.5 px-4 rounded-xl bg-[#162742] hover:bg-[#1f3454] border border-white/10 text-xs font-bold text-cyan-300 flex items-center gap-2 transition-colors"
                >
                  <FlipHorizontal size={16} />
                  Switch Camera
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
                    Scan your physical paper boarding pass PDF417 barcode using your camera
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

            {/* Option 2: Upload Barcode Image */}
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
