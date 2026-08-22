import React from 'react'
import { Sparkles } from 'lucide-react'

interface FloatingAskAIButtonProps {
  onClick?: () => void
  isOpen?: boolean
}

export default function FloatingAskAIButton({ onClick, isOpen = false }: FloatingAskAIButtonProps) {
  const handleClick = () => {
    if (onClick) {
      onClick()
    } else {
      window.dispatchEvent(new Event('aura-open-event'))
    }
  }

  if (isOpen) return null

  return (
    <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8 z-40 select-none animate-in fade-in zoom-in duration-300">
      <button
        id="floating-ask-ai-btn"
        onClick={handleClick}
        aria-label="Ask AI Airport Assistant"
        className="group relative flex items-center gap-2.5 px-4 py-3 sm:px-5 sm:py-3.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:via-indigo-500 hover:to-cyan-400 text-white font-black text-sm shadow-xl shadow-cyan-500/25 hover:shadow-2xl hover:shadow-cyan-500/40 border border-white/20 active:scale-95 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer backdrop-blur-md"
      >
        {/* Ambient background glow */}
        <span className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 opacity-40 blur-sm group-hover:opacity-75 transition-opacity duration-300 -z-10" />

        {/* Pulsing AI Icon container */}
        <div className="relative flex items-center justify-center w-6 h-6 rounded-full bg-white/15 text-cyan-200 group-hover:text-white transition-colors">
          <Sparkles className="w-3.5 h-3.5 animate-pulse text-cyan-300" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900 animate-ping" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-slate-900" />
        </div>

        {/* Clear Ask AI label and subtext */}
        <div className="flex flex-col text-left leading-tight">
          <span className="text-xs sm:text-sm font-extrabold tracking-wide text-white drop-shadow-sm flex items-center gap-1">
            Ask AI
          </span>
          <span className="text-[9px] font-semibold text-cyan-100/80 tracking-wider uppercase font-mono">
            Aura Concierge
          </span>
        </div>
      </button>
    </div>
  )
}
