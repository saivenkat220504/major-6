import React, { useState, useEffect } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  Bell,
  Globe,
  ShieldCheck,
  ChevronDown,
  User,
  LayoutDashboard,
  Plane,
  Luggage,
  Train,
  Grid,
} from 'lucide-react'
import { useLanguage, SUPPORTED_LANGUAGES } from '../context/LanguageContext'

const AIRPORTS = [
  { code: 'HYD', name: 'Hyderabad (RGIA)' },
  { code: 'BOM', name: 'Mumbai (CSMIA)' },
  { code: 'MAA', name: 'Chennai (MAA)' },
  { code: 'BLR', name: 'Bengaluru (KIA)' },
  { code: 'COK', name: 'Kochi (CIAL)' },
  { code: 'DEL', name: 'Delhi (IGIA)' },
  { code: 'TRV', name: 'Thiruvananthapuram (TRV)' },
  { code: 'CJB', name: 'Coimbatore (CJB)' },
  { code: 'VTZ', name: 'Visakhapatnam (VTZ)' },
  { code: 'VGA', name: 'Vijayawada (VGA)' },
  { code: 'IXE', name: 'Mangaluru (IXE)' },
  { code: 'CCJ', name: 'Kozhikode / Calicut (CCJ)' },
  { code: 'TRZ', name: 'Tiruchirappalli (TRZ)' },
  { code: 'GOI', name: 'Goa (GOI/GOX)' },
  { code: 'DXB', name: 'Dubai International' },
  { code: 'SIN', name: 'Singapore Changi' },
  { code: 'LHR', name: 'London Heathrow' },
  { code: 'FRA', name: 'Frankfurt Airport' },
  { code: 'ICN', name: 'Incheon International' },
]

const NAV_ZONES = [
  { id: 'home', label: 'Home', path: '/', icon: LayoutDashboard, exact: true },
  { id: 'flights', label: 'Flights', path: '/flight-tracking', icon: Plane, badge: 'LIVE' },
  { id: 'baggage', label: 'Baggage', path: '/baggage-guidance', icon: Luggage },
  { id: 'transit', label: 'Transit', path: '/transit-services', icon: Train },
  { id: 'services', label: 'Services', path: '/profile', icon: Grid },
]

interface AirportHeaderProps {
  onOpenNotifications?: () => void
  unreadCount?: number
}

export default function AirportHeader({ onOpenNotifications, unreadCount = 3 }: AirportHeaderProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentLang, changeLanguage, getLanguageObj } = useLanguage()

  const [selectedAirport, setSelectedAirport] = useState(() => {
    return localStorage.getItem('selectedAirport') || 'HYD'
  })
  const [showAirportDropdown, setShowAirportDropdown] = useState(false)
  const [showLangDropdown, setShowLangDropdown] = useState(false)
  const [passengerName, setPassengerName] = useState<string | null>(null)

  useEffect(() => {
    const dataStr = sessionStorage.getItem('boardingData')
    if (dataStr) {
      try {
        const data = JSON.parse(dataStr)
        if (data.passenger_name) {
          setPassengerName(data.passenger_name)
        }
      } catch {}
    }
  }, [])

  const currentAirportObj = AIRPORTS.find((a) => a.code === selectedAirport) || AIRPORTS[0]
  const currentLangObj = getLanguageObj()

  const handleAirportSelect = (code: string) => {
    setSelectedAirport(code)
    localStorage.setItem('selectedAirport', code)
    setShowAirportDropdown(false)
  }

  const handleLangSelect = (code: string) => {
    changeLanguage(code)
    setShowLangDropdown(false)
  }

  return (
    <header className="sticky top-0 z-50 w-full glass-panel border-b border-white/10 shadow-2xl backdrop-blur-xl bg-[#06121F]/95">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 h-[72px] flex items-center justify-between gap-2 lg:gap-4">
        
        {/* ── LEFT SECTION: SKYOS Logo + Enterprise Badge + Airport Selector ── */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link to="/" className="flex items-center gap-2 sm:gap-2.5 group focus:outline-none focus:ring-2 focus:ring-[#14C8FF] rounded-2xl p-0.5 transition-all">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-[#2F80FF] via-[#1E6DFF] to-[#14C8FF] flex items-center justify-center shadow-lg shadow-blue-500/30 group-hover:scale-105 transition-transform duration-200 border border-blue-400/30 shrink-0">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-[#F8FAFC] font-black text-sm sm:text-base tracking-tight flex items-center gap-1.5 leading-none">
                Airport App
              </div>
              <div className="text-[9px] sm:text-[10px] text-[#94A3B8] font-medium leading-tight mt-0.5 tracking-wide hidden 2xl:block">Passenger Edition</div>
            </div>
          </Link>


        </div>

        {/* ── CENTER SECTION: Navigation Tabs ── */}
        <nav className="hidden lg:flex items-center gap-1 bg-[#0E1B2D]/90 p-1 rounded-2xl border border-white/10 shadow-inner">
          {NAV_ZONES.map((zone) => {
            const Icon = zone.icon
            const isActive = zone.exact
              ? location.pathname === zone.path
              : location.pathname.startsWith(zone.path)

            return (
              <NavLink
                key={zone.id}
                to={zone.path}
                className={`relative flex items-center gap-1.5 px-2.5 xl:px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
                  isActive
                    ? 'text-white bg-[#2F80FF] shadow-lg shadow-blue-500/30 border border-blue-400/40'
                    : 'text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 transition-transform duration-200 ${isActive ? 'scale-110 text-white' : 'text-[#94A3B8]'}`} />
                <span>{zone.label}</span>
                {zone.badge && (
                  <span className="hidden xl:inline-block px-1.5 py-0.2 text-[8px] font-extrabold bg-[#14C8FF]/20 text-[#14C8FF] rounded-full border border-cyan-400/40 animate-pulse">
                    {zone.badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* ── RIGHT SECTION: Actions (Notifications, Language, Profile) ── */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">

          {/* Notifications Trigger Button */}
          <button
            onClick={onOpenNotifications}
            className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#13243B] hover:bg-[#1f3454] active:scale-[0.98] border border-white/15 flex items-center justify-center text-[#F8FAFC] transition-all shadow-md shrink-0"
            aria-label="Open Notifications Center"
            title="Operational Notifications"
          >
            <Bell className="w-4 h-4 text-[#94A3B8] hover:text-[#14C8FF]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#EF4444] text-white text-[9px] font-black flex items-center justify-center shadow-lg shadow-red-500/50 animate-pulse border border-red-400">
                {unreadCount}
              </span>
            )}
          </button>

          {/* International Language Switcher */}
          <div className="relative shrink-0">
            <button
              onClick={() => {
                setShowLangDropdown(!showLangDropdown)
                setShowAirportDropdown(false)
              }}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-[#13243B] hover:bg-[#1f3454] active:scale-[0.98] border border-white/15 text-xs font-bold text-[#F8FAFC] transition-all shadow-md"
              aria-label="Language Selector"
              aria-expanded={showLangDropdown}
              title={`Selected Language: ${currentLangObj.label}`}
            >
              <Globe className="w-4 h-4 text-[#14C8FF]" />
              <span className="text-[#14C8FF] font-extrabold uppercase text-[11px]">
                {currentLangObj.code}
              </span>
              <ChevronDown className="w-3 h-3 text-[#94A3B8]" />
            </button>

            {showLangDropdown && (
              <div className="absolute top-full right-0 mt-2 w-52 sm:w-56 rounded-2xl bg-[#0E1B2D] border border-white/15 shadow-2xl p-2 z-50 backdrop-blur-2xl animate-in fade-in zoom-in-95">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-white/10 flex items-center justify-between">
                  <span>Select Language</span>
                  <span className="text-[9px] text-[#14C8FF] font-mono">{SUPPORTED_LANGUAGES.length} Available</span>
                </div>
                <div className="py-1 space-y-0.5 max-h-64 overflow-y-auto">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLangSelect(lang.code)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors ${
                        lang.code === currentLang
                          ? 'bg-[#2F80FF]/25 text-[#14C8FF] font-bold border border-cyan-400/20'
                          : 'text-[#F8FAFC] hover:bg-white/10'
                      }`}
                    >
                      <span>{lang.nativeLabel} ({lang.label})</span>
                      {lang.code === currentLang && (
                        <span className="w-2 h-2 rounded-full bg-[#14C8FF]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile Avatar Button */}
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gradient-to-tr from-[#2F80FF] to-[#14C8FF] border border-white/30 flex items-center justify-center text-white font-bold text-xs shadow-lg shadow-blue-500/25 active:scale-[0.98] transition-transform hover:scale-105 shrink-0"
            title="Passenger Profile"
          >
            <User className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
          </button>
        </div>
      </div>
    </header>
  )
}
