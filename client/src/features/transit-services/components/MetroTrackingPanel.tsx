import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Train,
  Globe,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  MapPin,
  Sparkles,
  Shield,
  Smartphone,
  Navigation,
  AlertCircle,
  HelpCircle,
  Wifi,
  WifiOff,
} from 'lucide-react';

import {
  checkTransitConnectivity,
  TransitConnectivityResult,
} from '../services/transitConnectivityService';
import { Airport } from '../types';

interface MetroTrackingPanelProps {
  selectedAirport: Airport;
}

type LoadingPhase = 'step1' | 'step2' | 'step3' | null;

const LOADING_STEPS = [
  {
    phase: 'step1' as LoadingPhase,
    icon: Search,
    label: (code: string) => `Checking Metro connectivity at ${code}…`,
    subtitle: 'Verifying service availability',
  },
  {
    phase: 'step2' as LoadingPhase,
    icon: Globe,
    label: () => 'Searching for official service information…',
    subtitle: 'Finding official website & schedules',
  },
  {
    phase: 'step3' as LoadingPhase,
    icon: Smartphone,
    label: () => 'Finding the best tracking app…',
    subtitle: 'Identifying official / recommended apps',
  },
];

export default function MetroTrackingPanel({ selectedAirport }: MetroTrackingPanelProps) {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const [result, setResult] = useState<TransitConnectivityResult | null>(null);

  const isLoading = loadingPhase !== null;
  const hasResult = result !== null;

  const runCheck = useCallback(async () => {
    setResult(null);

    // Phased loading UX: each phase represents a network round-trip
    setLoadingPhase('step1');
    await new Promise((r) => setTimeout(r, 500));

    // The server internally does step1 → (if available) step2 + step3
    const promise = checkTransitConnectivity({
      airportName: selectedAirport.name,
      airportCode: selectedAirport.code,
      city: selectedAirport.city,
      country: selectedAirport.country,
      service: 'metro',
    });

    // After a delay, simulate step-2 and step-3 in UI
    const phaseTimer = setTimeout(() => setLoadingPhase('step2'), 3000);
    const phaseTimer2 = setTimeout(() => setLoadingPhase('step3'), 5500);

    const data = await promise;
    clearTimeout(phaseTimer);
    clearTimeout(phaseTimer2);

    setLoadingPhase(null);
    setResult(data);
  }, [selectedAirport]);

  // Auto-trigger on first mount
  const hasStartedRef = React.useRef(false);
  React.useEffect(() => {
    if (!hasStartedRef.current) {
      hasStartedRef.current = true;
      runCheck();
    }
  }, [runCheck]);

  const currentStepIndex = LOADING_STEPS.findIndex((s) => s.phase === loadingPhase);

  return (
    <div className="space-y-6">
      {/* ── Header Banner ─────────────────────────────────────────────────────── */}
      <div className="bg-[#0b1329]/95 border border-blue-500/30 rounded-2xl p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
              <Train size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">Metro Connectivity</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                  <Shield size={10} /> Live Web Search
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedAirport.name} ({selectedAirport.code}) · {selectedAirport.city}
              </p>
            </div>
          </div>

          {hasResult && (
            <button
              onClick={runCheck}
              disabled={isLoading}
              className="flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 transition-all disabled:opacity-40"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin text-blue-400' : ''} />
              Re-check
            </button>
          )}
        </div>

        {/* Airport Row */}
        <div className="mt-4 pt-3.5 border-t border-white/8 flex items-center gap-2 text-xs text-slate-400 flex-wrap">
          <MapPin size={14} className="text-blue-400" />
          <span className="font-bold text-slate-200">{selectedAirport.name}</span>
          <span className="text-slate-600">·</span>
          <span>
            {selectedAirport.city}, {selectedAirport.country}
          </span>
          <span className="bg-blue-500/20 text-blue-300 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-blue-500/30">
            {selectedAirport.code}
          </span>
        </div>
      </div>

      {/* ── Loading Steps ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#0b1329]/90 border border-blue-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-xl"
          >
            <div className="space-y-4">
              {LOADING_STEPS.map(({ phase, icon: Icon, label, subtitle }, idx) => {
                const isActive = loadingPhase === phase;
                const isDone = currentStepIndex > idx;
                const isPending = !isActive && !isDone;
                return (
                  <div
                    key={phase}
                    className={`flex items-start gap-3 transition-all duration-300 ${isPending ? 'opacity-25' : ''}`}
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isDone
                          ? 'bg-emerald-500/20 border border-emerald-500/30'
                          : isActive
                          ? 'bg-blue-500/20 border border-blue-500/40'
                          : 'bg-white/5 border border-white/10'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 size={17} className="text-emerald-400" />
                      ) : (
                        <Icon
                          size={17}
                          className={isActive ? 'text-blue-400 animate-pulse' : 'text-slate-500'}
                        />
                      )}
                    </div>
                    <div>
                      <p
                        className={`text-sm font-bold ${
                          isDone ? 'text-emerald-300' : isActive ? 'text-white' : 'text-slate-500'
                        }`}
                      >
                        {isDone ? '✓ ' : isActive ? '🔎 ' : ''}
                        {label(selectedAirport.code)}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-5 text-center">
              Live Web Search · Sequential Verification · Official Source Priority
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {hasResult && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Error state */}
            {!result.success && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-300">Search Failed</h4>
                  <p className="text-xs text-red-200/80 mt-1">
                    {result.error || 'Unable to verify metro connectivity right now.'}
                  </p>
                  <button
                    onClick={runCheck}
                    className="mt-3 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl px-3 py-1.5 transition-all"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Selected Service Card */}
            {result.success && (
              <div className="bg-[#0b1329]/80 border border-white/10 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                  <Train size={18} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Selected Service</p>
                  <p className="text-sm font-extrabold text-white">🚆 Metro</p>
                </div>
                <div className="ml-auto">
                  {result.status === 'Available' && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Available
                    </span>
                  )}
                  {result.status === 'Not available' && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Not Available
                    </span>
                  )}
                  {result.status === 'Unclear' && (
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Unable to Verify
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── NOT AVAILABLE ──────────────────────────────────────────────────── */}
            {result.success && result.status === 'Not available' && (
              <div className="bg-gradient-to-br from-rose-950/40 via-[#0d1628] to-amber-950/20 border border-rose-500/40 rounded-2xl p-6 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center shrink-0">
                    <XCircle size={28} className="text-rose-400" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                      Connectivity Status: Not Connected
                    </span>
                    <h4 className="text-lg font-extrabold text-white mt-2 leading-snug">
                      Sorry, Metro service is not available at {result.airportName}.
                    </h4>
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">{result.reason}</p>
                    <p className="text-[11px] text-slate-500 mt-3 flex items-center gap-1">
                      <Sparkles size={11} className="text-blue-400" />
                      Please check the official airport website for the latest information.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── UNCLEAR ───────────────────────────────────────────────────────── */}
            {result.success && result.status === 'Unclear' && (
              <div className="bg-gradient-to-br from-amber-950/30 via-[#0d1628] to-[#0d1628] border border-amber-500/40 rounded-2xl p-6 shadow-xl">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                    <HelpCircle size={28} className="text-amber-400" />
                  </div>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Unable to Verify
                    </span>
                    <h4 className="text-base font-extrabold text-white mt-2">
                      We could not verify Metro availability.
                    </h4>
                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                      We could not verify the availability of Metro service for{' '}
                      {result.airportName}. Please check the official airport website for the latest
                      information.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── AVAILABLE ─────────────────────────────────────────────────────── */}
            {result.success && result.status === 'Available' && (
              <div className="space-y-4">
                {/* Connectivity Status Banner */}
                <div className="bg-gradient-to-br from-emerald-950/30 via-[#0d1628] to-[#0d1628] border border-emerald-500/40 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <CheckCircle2 size={28} className="text-emerald-400" />
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Connectivity Status: Available
                      </span>
                      <h4 className="text-lg font-extrabold text-white mt-2 leading-snug">
                        Metro service is available at {result.airportName}.
                      </h4>
                      {result.reason && (
                        <p className="text-xs text-slate-300 mt-2 leading-relaxed">{result.reason}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Official Website Card */}
                {result.officialWebsite && result.officialWebsite.url && (
                  <div className="bg-[#0b1329]/80 border border-blue-500/20 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                        <Globe size={17} className="text-blue-400" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Official Website</p>
                        <h5 className="text-sm font-extrabold text-white">{result.officialWebsite.name}</h5>
                      </div>
                    </div>
                    {result.officialWebsite.description && (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {result.officialWebsite.description}
                      </p>
                    )}
                    <a
                      href={result.officialWebsite.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-bold text-blue-300 hover:text-white bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl px-4 py-2 transition-all"
                    >
                      Open Website <ExternalLink size={13} />
                    </a>
                  </div>
                )}

                {/* Recommended App Card */}
                {result.recommendedApp && result.recommendedApp.name && (
                  <div className="bg-[#0b1329]/80 border border-cyan-500/20 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                          <Smartphone size={17} className="text-cyan-400" />
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommended App</p>
                          <h5 className="text-sm font-extrabold text-white">{result.recommendedApp.name}</h5>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                          result.recommendedApp.type === 'Official'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                            : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                        }`}
                      >
                        {result.recommendedApp.type}
                      </span>
                    </div>
                    {result.recommendedApp.description && (
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {result.recommendedApp.description}
                      </p>
                    )}
                    {result.recommendedApp.url ? (
                      <a
                        href={result.recommendedApp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs font-bold text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl px-4 py-2 transition-all"
                      >
                        Open App <ExternalLink size={13} />
                      </a>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        Direct app link not available — search for it on the Play Store.
                      </p>
                    )}
                  </div>
                )}

                {/* Tracking Information Card */}
                {result.trackingInformation && (
                  <div className="bg-[#0b1329]/80 border border-white/10 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                          result.trackingInformation.liveTrackingAvailable
                            ? 'bg-emerald-500/20 border-emerald-500/30'
                            : 'bg-slate-500/20 border-slate-500/30'
                        }`}
                      >
                        {result.trackingInformation.liveTrackingAvailable ? (
                          <Wifi size={17} className="text-emerald-400" />
                        ) : (
                          <WifiOff size={17} className="text-slate-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Tracking Information
                        </p>
                        <h5
                          className={`text-sm font-extrabold ${
                            result.trackingInformation.liveTrackingAvailable
                              ? 'text-emerald-300'
                              : 'text-slate-300'
                          }`}
                        >
                          {result.trackingInformation.liveTrackingAvailable
                            ? 'Live Tracking Available'
                            : 'Live Tracking Not Available'}
                        </h5>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {result.trackingInformation.details}
                    </p>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
