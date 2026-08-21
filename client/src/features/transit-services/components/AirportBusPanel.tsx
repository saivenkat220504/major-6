import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bus,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  MapPin,
  RefreshCw,
  ExternalLink,
  DollarSign,
  Smartphone,
  Globe,
  Info,
  Navigation,
  Sparkles,
  Shield,
  Building2,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { Airport } from '../types';
import { investigateAirportBus, BusServiceResult, BusOfficialWebsite, BusOfficialApp } from '../services/airportBusService';

interface AirportBusPanelProps {
  selectedAirport: Airport;
}

type LoadingPhase = 'searching' | 'analyzing' | 'structuring' | null;

export default function AirportBusPanel({ selectedAirport }: AirportBusPanelProps) {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const [result, setResult] = useState<BusServiceResult | null>(null);
  const [lastAirportId, setLastAirportId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const runInvestigation = useCallback(async () => {
    setResult(null);
    setLastAirportId(selectedAirport.id);

    setLoadingPhase('searching');
    await new Promise(r => setTimeout(r, 600));

    setLoadingPhase('analyzing');

    const data = await investigateAirportBus({
      airportName: selectedAirport.name,
      airportCode: selectedAirport.code,
      city: selectedAirport.city,
      country: selectedAirport.country,
    });

    setLoadingPhase('structuring');
    await new Promise(r => setTimeout(r, 400));

    setLoadingPhase(null);
    setResult(data);
  }, [selectedAirport]);

  // Auto-trigger LLM check on mount or when airport changes
  useEffect(() => {
    if (selectedAirport.id !== lastAirportId) {
      setResult(null);
      setLoadingPhase(null);
      setLastAirportId(selectedAirport.id);
      runInvestigation();
    }
  }, [selectedAirport.id, lastAirportId, runInvestigation]);

  const isLoading = loadingPhase !== null;
  const hasResult = result !== null;

  // Extract website details safely
  const officialWebsiteObj: BusOfficialWebsite | undefined =
    result?.officialWebsiteObj ||
    (typeof result?.officialWebsite === 'object' ? (result.officialWebsite as BusOfficialWebsite) : undefined);

  const websiteUrl = officialWebsiteObj?.url || (typeof result?.officialWebsite === 'string' ? result.officialWebsite : null);

  // Extract app details safely
  const officialAppObj: BusOfficialApp | null | undefined = result?.officialAppObj;
  const appName = officialAppObj?.name || 'No app available';

  const handleCopyDetails = () => {
    if (!result) return;
    const text = `🚌 ${result.serviceName || 'Not available'} (${selectedAirport.code})
  Operator: ${result.operator || 'Not available'}
  Stops: ${result.busStops?.join(', ') || 'Not available'}
  Fare: ${result.fareRange || 'Not available'}
  Operating Hours: ${result.operatingHours || 'Not available'} | Frequency: ${result.frequency || 'Not available'}
Website: ${websiteUrl || 'N/A'}`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* ── Google AI Mode Header Banner ────────────────────────────────────── */}
      <div className="bg-[#071712]/95 border border-emerald-500/30 rounded-2xl p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow background accent */}
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/10">
              <Bus size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">Google AI Mode — Bus Intelligence</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <Shield size={10} /> Grounded Web Search
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Verify express bus connectivity for {selectedAirport.name} ({selectedAirport.code})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">


            {hasResult && (
              <button
                onClick={runInvestigation}
                disabled={isLoading}
                className="flex items-center gap-2 text-xs font-bold text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-2.5 transition-all disabled:opacity-40"
              >
                <RefreshCw size={14} className={isLoading ? 'animate-spin text-emerald-400' : ''} />
                Re-check Connectivity
              </button>
            )}
          </div>
        </div>

        {/* Airport Row */}
        <div className="mt-4 pt-3.5 border-t border-white/8 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-emerald-400" />
            <span className="font-bold text-slate-200">{selectedAirport.name}</span>
            <span className="text-slate-600">·</span>
            <span>{selectedAirport.city}, {selectedAirport.country}</span>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-emerald-500/30">
              {selectedAirport.code}
            </span>
          </div>
          {result?.lastUpdated && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Clock size={11} /> Live Verified: {new Date(result.lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>


      {/* ── Loading Animation ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-[#071712]/90 border border-emerald-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-xl"
          >
            <div className="space-y-4">
              {[
                { phase: 'searching', icon: Search, text: `Searching live web for airport express bus routes at ${selectedAirport.code}...`, done: loadingPhase === 'analyzing' || loadingPhase === 'structuring' },
                { phase: 'analyzing', icon: Bus, text: 'Verifying transport corporation websites, routes, fares & Play Store apps...', done: loadingPhase === 'structuring' },
                { phase: 'structuring', icon: CheckCircle2, text: 'Structuring Google AI Mode verified bus card...', done: false },
              ].map(({ phase, icon: Icon, text, done }) => {
                const isActive = loadingPhase === phase;
                const isPending = !isActive && !done;
                return (
                  <div key={phase} className={`flex items-center gap-3 transition-all ${isPending ? 'opacity-30' : ''}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      done ? 'bg-emerald-500/20 border border-emerald-500/30' :
                      isActive ? 'bg-emerald-500/20 border border-emerald-500/40' :
                      'bg-white/5 border border-white/10'
                    }`}>
                      {done ? (
                        <CheckCircle2 size={16} className="text-emerald-400" />
                      ) : (
                        <Icon size={16} className={isActive ? 'text-emerald-400 animate-pulse' : 'text-slate-500'} />
                      )}
                    </div>
                    <p className={`text-sm font-bold ${done ? 'text-emerald-300' : isActive ? 'text-white' : 'text-slate-500'}`}>
                      {done ? '✓ ' : isActive ? '🔎 ' : ''}{text}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-4 text-center">
              Google AI Mode Live Web Grounding · Transport Corporation Verification
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Results Display ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {hasResult && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            {/* Error State */}
            {!result.success && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-300">Verification Error</h4>
                  <p className="text-xs text-red-200/80 mt-1">
                    {result.error || 'Unable to fetch live airport bus information right now.'}
                  </p>
                  <button
                    onClick={runInvestigation}
                    className="mt-3 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 rounded-xl px-3 py-1.5 transition-all"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {/* Sources Conflict Alert */}
            {result.success && result.sourcesConflict && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-amber-300">Source Information Notice</h5>
                  <p className="text-xs text-amber-200/90 mt-0.5">
                    {result.sourcesConflictNote || 'Different sources report different information; the official transport authority should be treated as the most reliable source.'}
                  </p>
                </div>
              </div>
            )}

            {/* ── NO BUS SERVICE AVAILABLE ────────────────────────────────────── */}
            {result.success && result.hasBusService === false && (
              <div className="space-y-5">
                {/* Section 1: Connectivity Status (No Bus) */}
                <div className="bg-gradient-to-br from-amber-950/30 via-[#0d1628] to-rose-950/20 border border-amber-500/40 rounded-2xl p-6 shadow-xl">
                  <div className="flex items-start gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                      <XCircle size={28} />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Connectivity Status
                      </span>
                      <h4 className="text-xl font-extrabold text-white leading-tight">
                        No verified public airport bus service could be confirmed for this airport at the moment.
                      </h4>
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                        We verified that {selectedAirport.name} ({selectedAirport.code}) does not currently have confirmed dedicated public airport express bus routes operating from the terminal.
                      </p>
                    </div>
                  </div>

                  {/* Alternative Options */}
                  {result.alternatives && result.alternatives.length > 0 && (
                    <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
                      <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Navigation size={14} className="text-emerald-400" />
                        Recommended Alternative Transport Options
                      </h5>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {result.alternatives.map((alt, idx) => (
                          <div key={idx} className="bg-white/5 border border-white/8 rounded-xl p-3.5 flex items-center gap-2.5 text-xs text-slate-200">
                            <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 font-extrabold flex items-center justify-center shrink-0 text-[11px]">
                              {idx + 1}
                            </span>
                            <span>{alt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── BUS SERVICE AVAILABLE ──────────────────────────────────────── */}
            {result.success && result.hasBusService !== false && (
              <div className="space-y-6">
                {/* ── SECTION 1: Connectivity Status & Service Details ─────── */}
                <div className="bg-gradient-to-br from-emerald-950/40 via-[#0d1628] to-teal-950/30 border border-emerald-500/40 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                        <Bus size={28} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Connectivity Status: Verified
                          </span>
                        </div>
                        <h4 className="text-xl font-black text-white">Airport Bus Service Available</h4>
                        <p className="text-sm font-bold text-emerald-300 mt-0.5">
                          {result.serviceName || 'No specific bus service available'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {result.operator && (
                        <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 flex items-center gap-2">
                          <Building2 size={16} className="text-emerald-400" />
                          <div>
                            <span className="text-[9px] font-bold text-slate-400 block uppercase">Operator</span>
                            <span className="text-xs font-bold text-white">{result.operator || 'Not available'}</span>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleCopyDetails}
                        className="bg-white/10 hover:bg-white/15 border border-white/10 text-slate-200 rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95"
                      >
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Exact app details are shown only when the backend verified a service-specific listing. */}
                <div className="grid grid-cols-1 gap-5">
                  {/* ── SECTION 2: Tracking & Official Information Website ──── */}
                  <div className="bg-[#071712] border border-emerald-500/30 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                          <Globe size={13} /> Official Transport Website
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Official Corporation
                        </span>
                      </div>

                      <h5 className="text-base font-extrabold text-white">Tracking & Official Information Portal</h5>

                      {/* Live tracking availability notice */}
                      {officialWebsiteObj?.isLiveTrackingAvailable === false || (result.notes && result.notes.includes('not available')) ? (
                        <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-xs text-amber-200/90 leading-relaxed flex items-start gap-2">
                          <Info size={14} className="text-amber-400 shrink-0 mt-0.5" />
                          <span>
                            “An official public live-tracking website is not available. The website below provides official routes, schedules, and service information.”
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-300 leading-relaxed">
                          Official transport corporation portal providing official route maps, schedules, bus stop lists, and service updates.
                        </p>
                      )}
                    </div>

                    {websiteUrl ? (
                      <div className="pt-2">
                        <a
                          href={websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all group"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Globe size={15} />
                            <span className="truncate">{websiteUrl}</span>
                          </div>
                          <ExternalLink size={14} className="shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 bg-white/5 border border-white/8 rounded-xl p-3">
                        Official transport corporation portal URL is currently unconfirmed.
                      </div>
                    )}
                  </div>

                  {/* ── BEST TRACKING APP ───────────────────────────────────── */}
                  <div className="bg-[#071712] border border-emerald-500/30 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-teal-400 flex items-center gap-1.5">
                          <Smartphone size={13} /> Best Tracking App
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${officialAppObj ? 'bg-teal-500/20 text-teal-300 border-teal-500/30' : 'bg-white/5 text-slate-400 border-white/10'}`}>
                          {officialAppObj ? 'Verified App' : 'No app available'}
                        </span>
                      </div>

                      <h5 className="text-base font-extrabold text-white">{appName}</h5>
                    </div>

                    <div className="space-y-3 pt-2">
                      {officialAppObj?.playStoreUrl && (
                        <a
                          href={officialAppObj.playStoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-teal-500/20 transition-all group"
                        >
                          <Smartphone size={15} />
                          Install {officialAppObj.name} from Google Play
                          <ExternalLink size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── SECTION 4: Quick Bus Summary Cards ────────────────────── */}
                <div className="bg-[#071712] border border-emerald-500/30 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/8 pb-3">
                    <h5 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Bus size={16} className="text-emerald-400" />
                      Section 4 — Quick Bus Summary
                    </h5>
                    <span className="text-[10px] text-slate-400">Routes & Service Specifications</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* Operator */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Building2 size={12} className="text-emerald-400" /> Operator
                      </span>
                      <p className="text-sm font-extrabold text-white">{result.operator || 'Not available'}</p>
                    </div>

                    {/* Fare Information */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <DollarSign size={12} className="text-emerald-400" /> Fare Information
                      </span>
                      <p className="text-sm font-extrabold text-emerald-300">{result.fareRange || 'Not available'}</p>
                    </div>

                    {/* Operating Hours */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Clock size={12} className="text-blue-400" /> Operating Hours
                      </span>
                      <p className="text-sm font-extrabold text-white">{result.operatingHours || 'Not available'}</p>
                    </div>

                    {/* Frequency */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <RefreshCw size={12} className="text-cyan-400" /> Frequency
                      </span>
                      <p className="text-sm font-extrabold text-white">{result.frequency || 'Not available'}</p>
                    </div>
                  </div>

                  {/* Airport Boarding Stops */}
                  {result.busStops && result.busStops.length > 0 && (
                    <div className="pt-3 border-t border-white/8 space-y-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <MapPin size={12} className="text-emerald-400" /> Major Airport Boarding Points & Route Destinations
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {result.busStops.map((stop, idx) => (
                          <span key={idx} className="text-xs font-semibold bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-slate-200 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                            {stop}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── SECTION 5: Recommendation & Verification ──────────────── */}
                <div className="bg-gradient-to-r from-emerald-950/30 via-[#071712] to-teal-950/20 border border-emerald-500/30 rounded-2xl p-5 space-y-2.5">
                  <h5 className="text-xs font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-2">
                    <Shield size={14} className="text-emerald-400" />
                    Section 5 — Google AI Mode Recommendation Summary
                  </h5>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    This answer is grounded in live web search data verified against official state transport corporation schedules. For real-time updates and ticket booking, use the official transport corporation portal or install the official Play Store app.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
