import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Bus,
  Train,
  ChevronDown,
  ArrowRight,
  Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import AirportSelector from '../components/AirportSelector'
import MetroTrackingPanel from '../components/MetroTrackingPanel'
import AirportBusPanel from '../components/AirportBusPanel'

import { Airport } from '../types'
import { AIRPORTS } from '../data/transitData'

type ActiveMode = 'metro' | 'bus' | null
// pendingKey is used to force a remount of the panel (and thus a fresh search) on each click
let _panelKeySeq = 0

export default function TransitServicesPage() {
  const navigate = useNavigate()

  const [selectedAirport, setSelectedAirport] = useState<Airport>(() => {
    const savedId = sessionStorage.getItem('selectedAirportId')
    if (savedId) {
      const found = AIRPORTS.find((a) => a.id === savedId || a.code === savedId)
      if (found) return found
    }
    return AIRPORTS[0]
  })

  const [dropdownMode, setDropdownMode] = useState<'metro' | 'bus'>('metro')
  const [activeMode, setActiveMode] = useState<ActiveMode>(null)
  const [panelKey, setPanelKey] = useState(0)

  useEffect(() => {
    sessionStorage.setItem('selectedAirportId', selectedAirport.id)
  }, [selectedAirport])

  const handleCheckConnectivity = () => {
    _panelKeySeq += 1
    setActiveMode(null)
    // Small delay so AnimatePresence exits the old panel cleanly before mounting the new one
    setTimeout(() => {
      setActiveMode(dropdownMode)
      setPanelKey(_panelKeySeq)
    }, 80)
  }

  return (
    <div className="space-y-6 pb-12">
      {/* ── Airport Selector ──────────────────────────────────────────────────── */}
      <AirportSelector
        selectedAirport={selectedAirport}
        onSelectAirport={(ap) => {
          setSelectedAirport(ap)
          setActiveMode(null)
        }}
      />

      {/* ── Mode of Transport Selector ────────────────────────────────────────── */}
      <div className="p-6 rounded-[28px] bg-[#0E1B2D] border border-white/10 shadow-2xl space-y-4">
        <label className="text-sm font-bold text-[#94A3B8] uppercase tracking-wider">
          Select mode of transport
        </label>
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Mode Dropdown */}
          <div className="relative w-full sm:w-1/2">
            <select
              id="transit-mode-select"
              className="w-full appearance-none bg-[#13243B] border border-white/10 rounded-2xl py-4 pl-4 pr-10 text-[#F8FAFC] font-bold focus:outline-none focus:border-[#14C8FF] transition-colors cursor-pointer"
              value={dropdownMode}
              onChange={(e) => {
                setDropdownMode(e.target.value as 'metro' | 'bus')
                setActiveMode(null)
              }}
            >
              <option value="metro">🚆 Metro</option>
              <option value="bus">🚌 Bus</option>
            </select>
            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 pointer-events-none" />
          </div>

          {/* Check Connectivity Button */}
          <button
            id="check-connectivity-btn"
            onClick={handleCheckConnectivity}
            className="w-full sm:w-1/2 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-black hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
          >
            <Zap className="w-4 h-4" />
            Check Connectivity
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        {/* Mode hint badges */}
        <div className="flex items-center gap-3 pt-1">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
              dropdownMode === 'metro'
                ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                : 'bg-white/5 text-slate-500 border-white/10'
            }`}
          >
            <Train size={13} />
            Metro
          </div>
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
              dropdownMode === 'bus'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-slate-500 border-white/10'
            }`}
          >
            <Bus size={13} />
            Bus
          </div>
          <span className="text-[11px] text-slate-500 ml-auto">
            Select a service and click Check Connectivity
          </span>
        </div>
      </div>

      {/* ── Result Panels ─────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeMode === 'metro' && (
          <motion.div
            key={`metro-${panelKey}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="p-6 rounded-[28px] bg-[#0E1B2D] border border-white/10 shadow-2xl space-y-6"
          >
            <MetroTrackingPanel selectedAirport={selectedAirport} />
          </motion.div>
        )}

        {activeMode === 'bus' && (
          <motion.div
            key={`bus-${panelKey}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="p-6 rounded-[28px] bg-[#0E1B2D] border border-white/10 shadow-2xl space-y-6"
          >
            <AirportBusPanel selectedAirport={selectedAirport} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
