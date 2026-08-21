import React, { useState, useEffect, useCallback } from 'react';
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
  Clock,
  MapPin,
  Building2,
  Sparkles,
  Shield,
  Smartphone,
  Navigation,
  DollarSign,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import {
  investigateAirportMetro,
  MetroInvestigationResult,
} from '../services/metroTrackingService';
import { Airport } from '../types';

interface MetroTrackingPanelProps {
  selectedAirport: Airport;
}

type LoadingPhase = 'querying' | 'verifying' | 'structuring' | null;

export default function MetroTrackingPanel({ selectedAirport }: MetroTrackingPanelProps) {
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>(null);
  const [result, setResult] = useState<MetroInvestigationResult | null>(null);
  const [lastAirportId, setLastAirportId] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const runInvestigation = useCallback(async () => {
    setResult(null);
    setLastAirportId(selectedAirport.id);

    setLoadingPhase('querying');
    await new Promise(r => setTimeout(r, 600));

    setLoadingPhase('verifying');

    const data = await investigateAirportMetro({
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

  return (
    <div className="space-y-6">
      {/* ── Google AI Mode Header Banner ────────────────────────────────────── */}
      <div className="bg-[#0b1329]/95 border border-blue-500/30 rounded-2xl p-5 shadow-2xl backdrop-blur-xl relative overflow-hidden">
        {/* Glow decorative background */}
        <div className="absolute -right-12 -top-12 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-center justify-between flex-wrap gap-4 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/10">
              <Train size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">Google AI Mode — Metro Intelligence</h3>
                <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                  <Shield size={10} /> Grounded Web Search
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Verify metro connectivity for {selectedAirport.name} ({selectedAirport.code})
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
                <RefreshCw size={14} className={isLoading ? 'animate-spin text-blue-400' : ''} />
                Re-check Connectivity
              </button>
            )}
          </div>
        </div>

        {/* Airport Row */}
        <div className="mt-4 pt-3.5 border-t border-white/8 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-blue-400" />
            <span className="font-bold text-slate-200">{selectedAirport.name}</span>
            <span className="text-slate-600">·</span>
            <span>{selectedAirport.city}, {selectedAirport.country}</span>
            <span className="bg-blue-500/20 text-blue-300 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-blue-500/30">
              {selectedAirport.code}
            </span>
          </div>
          {result?.timestamp && (
            <span className="text-[11px] text-slate-500 flex items-center gap-1">
              <Clock size={11} /> Live Verified: {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            className="bg-[#0b1329]/90 border border-blue-500/30 rounded-2xl p-6 shadow-xl backdrop-blur-xl"
          >
            <div className="space-y-4">
              {[
                { phase: 'querying', icon: Search, text: `Querying live web for direct metro connectivity at ${selectedAirport.code}...`, done: loadingPhase === 'verifying' || loadingPhase === 'structuring' },
                { phase: 'verifying', icon: Globe, text: 'Verifying official metro rail corporation website & Play Store apps...', done: loadingPhase === 'structuring' },
                { phase: 'structuring', icon: CheckCircle2, text: 'Structuring Google AI Mode verified response...', done: false },
              ].map(({ phase, icon: Icon, text, done }) => {
                const isActive = loadingPhase === phase;
                const isPending = !isActive && !done;
                return (
                  <div key={phase} className={`flex items-center gap-3 transition-all ${isPending ? 'opacity-30' : ''}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      done ? 'bg-emerald-500/20 border border-emerald-500/30' :
                      isActive ? 'bg-blue-500/20 border border-blue-500/40' :
                      'bg-white/5 border border-white/10'
                    }`}>
                      {done ? (
                        <CheckCircle2 size={16} className="text-emerald-400" />
                      ) : (
                        <Icon size={16} className={isActive ? 'text-blue-400 animate-pulse' : 'text-slate-500'} />
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
              Google AI Mode Live Web Grounding · Official Metro Corporation Verification
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
            {/* Error state */}
            {!result.success && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-5 flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-red-300">Verification Error</h4>
                  <p className="text-xs text-red-200/80 mt-1">
                    {result.error || 'Unable to verify metro connectivity right now.'}
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

            {/* Source Conflict Alert */}
            {result.success && (result.sourcesConflict || result.sourceConflict) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-xs font-bold text-amber-300">Source Information Notice</h5>
                  <p className="text-xs text-amber-200/90 mt-0.5">
                    {result.sourcesConflictNote || result.conflictNote || 'Different sources report different information; the official transport authority should be treated as the most reliable source.'}
                  </p>
                </div>
              </div>
            )}

            {/* ── METRO CONNECTIVITY DOES NOT EXIST ────────────────────────────── */}
            {result.success && result.hasMetro === false && (
              <div className="space-y-5">
                {/* Section 1: Connectivity Status (No Metro) */}
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
                        Metro connectivity is not currently available for this airport.
                      </h4>
                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                        {result.noMetroDetails?.message || result.noMetroReason || `${selectedAirport.name} does not have a direct operational metro connection to the airport terminal.`}
                      </p>
                    </div>
                  </div>

                  {/* Alternatives Grid */}
                  <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
                    <h5 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Navigation size={14} className="text-blue-400" />
                      Recommended Transport Alternatives
                    </h5>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Nearest Station */}
                      {result.noMetroDetails?.nearestStation && (
                        <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Nearest Metro/Rail Station</span>
                          <p className="text-xs font-bold text-blue-300 flex items-start gap-1.5">
                            <MapPin size={13} className="text-blue-400 shrink-0 mt-0.5" />
                            {result.noMetroDetails.nearestStation}
                          </p>
                        </div>
                      )}

                      {/* Shuttle Alternatives */}
                      {result.noMetroDetails?.shuttleAlternatives && result.noMetroDetails.shuttleAlternatives.length > 0 && (
                        <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Airport Shuttle Alternatives</span>
                          <ul className="text-xs font-medium text-slate-200 space-y-1">
                            {result.noMetroDetails.shuttleAlternatives.map((sh, idx) => (
                              <li key={idx} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                                {sh}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Taxi or Bus Alternatives */}
                      {result.noMetroDetails?.taxiOrBusAlternatives && result.noMetroDetails.taxiOrBusAlternatives.length > 0 && (
                        <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] font-bold uppercase text-slate-400 block">Taxi & Bus Alternatives</span>
                          <ul className="text-xs font-medium text-slate-200 space-y-1">
                            {result.noMetroDetails.taxiOrBusAlternatives.map((tx, idx) => (
                              <li key={idx} className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0" />
                                {tx}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── METRO CONNECTIVITY EXISTS ───────────────────────────────────── */}
            {result.success && result.hasMetro === true && (
              <div className="space-y-6">
                {/* ── SECTION 1: Connectivity Status & Official System ───────── */}
                <div className="bg-gradient-to-br from-blue-950/40 via-[#0d1628] to-cyan-950/30 border border-blue-500/40 rounded-2xl p-6 shadow-xl space-y-4">
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-14 h-14 rounded-2xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shadow-lg shadow-blue-500/20">
                        <Train size={28} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 size={11} /> Connectivity Status: Verified
                          </span>
                        </div>
                        <h4 className="text-xl font-black text-white">Metro Connectivity Available</h4>
                        <p className="text-sm font-bold text-blue-300 mt-0.5">
                          {result.officialSystemName || result.metroNetwork?.name || 'Not available'}
                        </p>
                      </div>
                    </div>

                    {result.authority && (
                      <div className="bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 flex items-center gap-2">
                        <Building2 size={16} className="text-purple-400" />
                        <div>
                          <span className="text-[9px] font-bold text-slate-400 block uppercase">Authority</span>
                          <span className="text-xs font-bold text-white">{result.authority}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid for Section 2 (Website) & Section 3 (App) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* ── SECTION 2: Official Website ─────────────────────────── */}
                  <div className="bg-[#0b1329] border border-blue-500/30 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-400 flex items-center gap-1.5">
                          <Globe size={13} /> Section 2 — Tracking & Information
                        </span>
                        <span className="text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full">
                          Official Website
                        </span>
                      </div>

                      <h5 className="text-base font-extrabold text-white">Official Metro Website</h5>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Rely on the official portal for live train status, route maps, fare calculators, first/last train timings, and station information.
                      </p>
                    </div>

                    {result.officialWebsite?.url || result.metroNetwork?.officialWebsite ? (
                      <div className="pt-2">
                        <a
                          href={result.officialWebsite?.url || result.metroNetwork?.officialWebsite || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between w-full bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all group"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <Globe size={15} />
                            <span className="truncate">{result.officialWebsite?.url || result.metroNetwork?.officialWebsite}</span>
                          </div>
                          <ExternalLink size={14} className="shrink-0 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 bg-white/5 border border-white/8 rounded-xl p-3">
                        Official metro authority website could not be confirmed automatically.
                      </div>
                    )}
                  </div>

                  {/* ── SECTION 3: Official App ─────────────────────────────── */}
                  <div className="bg-[#0b1329] border border-blue-500/30 rounded-2xl p-5 space-y-3.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
                          <Smartphone size={13} /> Section 3 — Mobile Application
                        </span>
                        <span className="text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                          Official Android App
                        </span>
                      </div>

                      <h5 className="text-base font-extrabold text-white flex items-center gap-2">
                        <span>{result.officialApp?.name || 'No app available'}</span>
                      </h5>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        “{result.officialApp?.description || 'Not available'}”
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      {result.officialApp?.playStoreUrl && (
                        <a
                          href={result.officialApp.playStoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all group"
                        >
                          <Smartphone size={15} />
                          Install from Google Play Store
                          <ExternalLink size={13} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>
                      )}

                      {/* Required Polite Recommendation Callout Prompt */}
                      <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-3 text-xs font-extrabold text-emerald-300 leading-relaxed">
                        💡 {result.officialApp?.recommendationPrompt || 'No app available'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── SECTION 4: Quick Metro Summary ────────────────────────── */}
                <div className="bg-[#0b1329] border border-blue-500/30 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-white/8 pb-3">
                    <h5 className="text-sm font-extrabold text-white flex items-center gap-2">
                      <Train size={16} className="text-blue-400" />
                      Section 4 — Quick Metro Summary
                    </h5>
                    <span className="text-[10px] text-slate-400">Key Journey Details</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {/* Nearest Airport Station */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <MapPin size={12} className="text-blue-400" /> Nearest Airport Station
                      </span>
                      <p className="text-sm font-extrabold text-white">
                        {result.quickSummary?.nearestStation || result.metroNetwork?.airportStation || 'Not available'}
                      </p>
                    </div>

                    {/* Operating Hours */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Clock size={12} className="text-cyan-400" /> Operating Hours
                      </span>
                      <p className="text-sm font-extrabold text-white">
                        {result.quickSummary?.operatingHours || 'Not available'}
                      </p>
                    </div>

                    {/* Typical Fare Range */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <DollarSign size={12} className="text-emerald-400" /> Typical Fare Range
                      </span>
                      <p className="text-sm font-extrabold text-emerald-300">
                        {result.quickSummary?.fareRange || 'Not available'}
                      </p>
                    </div>

                    {/* Approx Travel Time */}
                    <div className="bg-white/5 border border-white/8 rounded-xl p-3.5 space-y-1">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Navigation size={12} className="text-purple-400" /> Travel Time to City Center
                      </span>
                      <p className="text-sm font-extrabold text-white">
                        {result.quickSummary?.travelTime || 'Not available'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── SECTION 5: Recommendation & Verified Grounding Summary ─── */}
                <div className="bg-gradient-to-r from-blue-950/30 via-[#0b1329] to-cyan-950/20 border border-blue-500/30 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-extrabold uppercase tracking-wider text-blue-300 flex items-center gap-2">
                      <Shield size={14} className="text-blue-400" />
                      Section 5 — Recommendation & Verification Summary
                    </h5>
                    <button
                      onClick={() => setSourcesOpen(v => !v)}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                    >
                      {sourcesOpen ? 'Hide Verified Sources' : 'View Verified Sources'}
                      {sourcesOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    This answer has been verified in real-time using live web grounding against official transport authority databases. The official website and Android app listed above represent the sole authoritative sources for live train status and fare ticketing.
                  </p>

                  <AnimatePresence>
                    {sourcesOpen && result.sourcesChecked && result.sourcesChecked.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden space-y-2 pt-2 border-t border-white/8"
                      >
                        {result.sourcesChecked.map((src, idx) => (
                          <div key={idx} className="bg-white/4 border border-white/8 rounded-xl p-3 text-xs space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-200">{src.title}</span>
                              <span className="text-[9px] font-bold bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-500/30">
                                {src.type}
                              </span>
                            </div>
                            <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline block truncate text-[11px]">
                              {src.url}
                            </a>
                            <p className="text-[10px] text-slate-400">{src.credibilityNote}</p>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
