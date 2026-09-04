import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  ExternalLink,
  Plane,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import FlightCountdown from '../components/FlightCountdown'
import { initializePushNotifications } from '../services/pushNotificationService'

interface BoardingData {
  passenger_name?: string
  ticket_id?: string
  flight_id?: string
  from?: string
  to?: string
  terminal?: string
  seat?: string
  gate?: string
  date?: string
}

export interface FlightInfoData {
  id?: string
  flightNumber?: string
  departureTerminal: string
  assignedGate: string
  seatAssignment: string
  flightDate: string
  departure_terminal?: string
  assigned_gate?: string
  seat_assignment?: string
  flight_date?: string
  createdAt?: string
  updatedAt?: string
}

type FlightStatusType = 'boarding_soon' | 'delayed' | 'on_time' | 'gate_changed'

const STATUS_CONFIG: Record<
  FlightStatusType,
  { label: string; badgeBg: string; textColor: string; borderColor: string }
> = {
  boarding_soon: {
    label: 'Boarding Soon',
    badgeBg: 'bg-emerald-500/20',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
  },
  on_time: {
    label: 'On Time',
    badgeBg: 'bg-blue-500/20',
    textColor: 'text-[#14C8FF]',
    borderColor: 'border-blue-400/30',
  },
  delayed: {
    label: 'Delayed',
    badgeBg: 'bg-amber-500/20',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-500/30',
  },
  gate_changed: {
    label: 'Gate Changed',
    badgeBg: 'bg-red-500/20',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/30',
  },
}

export default function FlightTrackingPage() {
  const navigate = useNavigate()
  const [boardingData, setBoardingData] = useState<BoardingData | null>(null)
  const [currentStatus] = useState<FlightStatusType>('boarding_soon')
  
  // Database-backed Flight Information State
  const [flightInfo, setFlightInfo] = useState<FlightInfoData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFlightData = async () => {
    try {
      setLoading(true)
      setError(null)

      let flightNumber = ''
      try {
        const raw = sessionStorage.getItem('boardingData')
        if (raw) {
          const parsed = JSON.parse(raw)
          setBoardingData(parsed)
          flightNumber = parsed.flight_id || ''
        }
      } catch (e) {
        console.error('Failed to parse boarding data:', e)
      }

      const endpoint = flightNumber
        ? `/api/flight-info?flightNumber=${encodeURIComponent(flightNumber)}`
        : '/api/flight-info'

      const response = await fetch(endpoint)
      if (!response.ok) {
        throw new Error(`Failed to fetch flight info from database (Status ${response.status})`)
      }

      const json = await response.json()
      if (json.success && json.data) {
        setFlightInfo(json.data)
      } else {
        throw new Error(json.error || 'Invalid flight info response from database')
      }
    } catch (err: any) {
      console.error('[FlightTracking] Error loading data from backend:', err)
      setError(err.message || 'Could not load flight data from database')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchFlightData()
  }, [])

  useEffect(() => {
    const flightNum = flightInfo?.flightNumber || boardingData?.flight_id || 'AI-102'
    if (flightNum) {
      initializePushNotifications(flightNum).catch((e) =>
        console.error('[FlightTracking] Failed to register push token:', e)
      )
    }
  }, [flightInfo?.flightNumber, boardingData?.flight_id])

  // Derived values from database response
  const departureTerminal = flightInfo?.departureTerminal || flightInfo?.departure_terminal
  const assignedGate = flightInfo?.assignedGate || flightInfo?.assigned_gate
  const seatAssignment = flightInfo?.seatAssignment || flightInfo?.seat_assignment
  const flightDate = flightInfo?.flightDate || flightInfo?.flight_date
  const flightNumber = flightInfo?.flightNumber || boardingData?.flight_id || 'AI-102'

  const statusInfo = STATUS_CONFIG[currentStatus]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
            title="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#14C8FF]">
              Passenger Flight Hub
            </span>
            <h1 className="text-2xl font-black text-[#F8FAFC] flex items-center gap-2">
              <Plane className="w-6 h-6 text-[#2F80FF]" />
              <span>Flight {flightNumber} Tracking</span>
            </h1>
          </div>
        </div>

        <span
          className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border ${statusInfo.badgeBg} ${statusInfo.textColor} ${statusInfo.borderColor} flex items-center gap-1.5`}
        >
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          {statusInfo.label}
        </span>
      </div>

      {/* SECTION 1: Circular Boarding Countdown & Progress */}
      <FlightCountdown />

      {/* Error state banner if backend call fails */}
      {error && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-red-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Database synchronization issue: {error}.</span>
          </div>
          <button
            onClick={fetchFlightData}
            className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-300 font-bold flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* SECTION 2: Airline Boarding Pass Cards (Values Loaded Dynamically from DB) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Flight Spec Card */}
        <div className="md:col-span-2 p-6 rounded-[24px] bg-[#0F1E35] border border-white/10 shadow-xl space-y-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <div className="text-[10px] font-bold uppercase text-[#94A3B8] tracking-wider">Airline & Aircraft</div>
              <div className="text-lg font-extrabold text-[#F8FAFC]">Air India • Boeing 787-9 Dreamliner</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-[#94A3B8] tracking-wider">Boarding Group</div>
              <div className="text-lg font-black text-[#14C8FF]">Group B (Zone 2)</div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {/* 1. Departure Terminal */}
            <div className="p-3 rounded-2xl bg-[#162742] border border-white/5">
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold">Departure Terminal</div>
              <div className="text-base font-extrabold text-[#F8FAFC] mt-0.5">
                {loading ? (
                  <span className="animate-pulse text-[#64748B]">Loading...</span>
                ) : (
                  departureTerminal || '—'
                )}
              </div>
            </div>

            {/* 2. Assigned Gate */}
            <div className="p-3 rounded-2xl bg-[#162742] border border-white/5">
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold">Assigned Gate</div>
              <div className="text-base font-extrabold text-[#14C8FF] mt-0.5">
                {loading ? (
                  <span className="animate-pulse text-[#64748B]">Loading...</span>
                ) : (
                  assignedGate || '—'
                )}
              </div>
            </div>

            {/* 3. Seat Assignment */}
            <div className="p-3 rounded-2xl bg-[#162742] border border-white/5">
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold">Seat Assignment</div>
              <div className="text-base font-extrabold text-[#F8FAFC] mt-0.5">
                {loading ? (
                  <span className="animate-pulse text-[#64748B]">Loading...</span>
                ) : (
                  seatAssignment || '—'
                )}
              </div>
            </div>

            {/* 4. Flight Date */}
            <div className="p-3 rounded-2xl bg-[#162742] border border-white/5">
              <div className="text-[10px] text-[#94A3B8] uppercase font-bold">Flight Date</div>
              <div className="text-base font-extrabold text-[#F8FAFC] mt-0.5">
                {loading ? (
                  <span className="animate-pulse text-[#64748B]">Loading...</span>
                ) : (
                  flightDate || '—'
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Live Flight Radar Trigger */}
        <div className="p-6 rounded-[24px] bg-[#0F1E35] border border-white/10 shadow-xl space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-[#14C8FF] uppercase tracking-wider mb-2">
              <ShieldCheck className="w-4 h-4 text-[#2F80FF]" />
              <span>Live Satellite Flight Radar</span>
            </div>
            <h3 className="text-lg font-bold text-[#F8FAFC]">Track 3D Radar Trajectory</h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">
              View real-time altitude, airspeed, aircraft position, and live flight path on global ADS-B radar.
            </p>
          </div>

          <a
            href="https://www.flightradar24.com"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#2F80FF] to-[#14C8FF] hover:from-[#1E6DFF] hover:to-cyan-400 text-white font-extrabold text-sm shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <Plane className="w-4 h-4" />
            <span>Open Live Flight Location</span>
            <ExternalLink className="w-4 h-4 opacity-80" />
          </a>
        </div>
      </div>
    </div>
  )
}
