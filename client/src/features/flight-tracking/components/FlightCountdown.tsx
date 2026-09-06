import React, { useEffect, useState } from 'react'
import { Clock, Zap, ShieldCheck } from 'lucide-react'

interface FlightCountdownProps {
  targetTime?: string | number
  delayMinutes?: number
}

export default function FlightCountdown({ targetTime, delayMinutes = 0 }: FlightCountdownProps) {
  // Demo countdown starts at 35 minutes when the app is opened
  const [initialBaseMs] = useState(() => Date.now() + 35 * 60 * 1000)
  const targetMs =
    (typeof targetTime === 'number'
      ? targetTime
      : targetTime
      ? new Date(targetTime).getTime()
      : initialBaseMs) + Math.max(0, delayMinutes) * 60 * 1000

  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const diffMs = Math.max(0, targetMs - now)
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diffMs % (1000 * 60)) / 1000)

  const formattedHrs = String(hours).padStart(2, '0')
  const formattedMins = String(minutes).padStart(2, '0')
  const formattedSecs = String(seconds).padStart(2, '0')

  // Calculate percentage for progress circle (assuming 60 mins total)
  const totalMins = 60
  const currentMinsLeft = minutes + hours * 60
  const progressPercent = Math.min(100, Math.max(0, ((totalMins - currentMinsLeft) / totalMins) * 100))

  return (
    <div className="rounded-[28px] bg-gradient-to-br from-[#0F1E35] via-[#162742] to-[#071326] p-6 md:p-8 text-[#F8FAFC] border border-white/10 shadow-2xl relative overflow-hidden space-y-6">
      {/* Glow effect */}
      <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
        {/* Left Countdown text info */}
        <div className="space-y-3 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-[#14C8FF] border border-blue-400/20 text-xs font-bold">
            <Zap className="w-3.5 h-3.5 animate-pulse" />
            <span>Boarding Countdown Active</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC]">
            Boarding Gate 14B Opens Soon
          </h2>

          <div className="flex items-baseline justify-center md:justify-start gap-2 font-mono">
            <span className="text-4xl sm:text-6xl font-black text-[#F8FAFC] tracking-tight">
              {formattedHrs}:{formattedMins}
            </span>
            <span className="text-2xl font-bold text-[#14C8FF]">{formattedSecs}s</span>
          </div>

          <div className="flex items-center justify-center md:justify-start gap-2 text-xs text-[#94A3B8]">
            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <span>On-time schedule synced with Air India operations</span>
          </div>
        </div>

        {/* Circular Countdown Ring Graphic */}
        <div className="relative w-36 h-36 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="42"
              className="text-[#162742]"
              strokeWidth="8"
              stroke="currentColor"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r="42"
              className="text-[#2F80FF]"
              strokeWidth="8"
              strokeDasharray={264}
              strokeDashoffset={264 - (264 * progressPercent) / 100}
              strokeLinecap="round"
              stroke="currentColor"
              fill="transparent"
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-xl font-black text-[#F8FAFC]">{minutes}m</span>
            <span className="text-[10px] text-[#94A3B8] font-bold uppercase">Left</span>
          </div>
        </div>
      </div>

      {/* Boarding Progress Bar */}
      <div className="space-y-2 pt-2 border-t border-white/10 relative z-10">
        <div className="flex items-center justify-between text-xs font-semibold text-[#94A3B8]">
          <span>Boarding Gate Preparation</span>
          <span className="text-[#22C55E] font-bold">75% Prepared</span>
        </div>
        <div className="w-full h-3 rounded-full bg-[#162742] overflow-hidden p-0.5 border border-white/5">
          <div className="h-full rounded-full bg-gradient-to-r from-[#2F80FF] via-[#14C8FF] to-[#22C55E] w-[75%] transition-all duration-500" />
        </div>
      </div>
    </div>
  )
}
