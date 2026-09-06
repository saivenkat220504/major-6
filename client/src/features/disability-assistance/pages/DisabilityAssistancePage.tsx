import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  Phone,
  Accessibility,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MapPin,
  X,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { Geolocation } from '@capacitor/geolocation'

const AIRPORT_ASSISTANCE_PHONE = '+91 40 6660 6660'

interface AssistanceOption {
  id: 'wheelchair' | 'companion'
  type: 'Wheelchair' | 'Staff Companion'
  title: string
  targetAudience: string
  description: string
  icon: React.ElementType
  badgeColor: string
  iconBg: string
  iconColor: string
  borderAccent: string
}

const ASSISTANCE_OPTIONS: AssistanceOption[] = [
  {
    id: 'wheelchair',
    type: 'Wheelchair',
    title: 'Wheelchair Assistance',
    targetAudience: 'For passengers with physical disabilities',
    description:
      'Dedicated wheelchair support, gate boarding escort, and physical mobility assistance across all airport terminals.',
    icon: Accessibility,
    badgeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    borderAccent: 'hover:border-emerald-500/40',
  },
  {
    id: 'companion',
    type: 'Staff Companion',
    title: 'Staff Companion',
    targetAudience: 'For passengers with visual or other disabilities',
    description:
      'Trained airport assistance staff to guide and accompany passengers with visual impairments, neurodivergent, or special needs.',
    icon: Users,
    badgeColor: 'bg-cyan-500/15 text-[#14C8FF] border-cyan-500/30',
    iconBg: 'bg-cyan-500/15',
    iconColor: 'text-[#14C8FF]',
    borderAccent: 'hover:border-cyan-500/40',
  },
]

type RequestStatus = 'idle' | 'locating' | 'sending' | 'error' | 'success'

export default function DisabilityAssistancePage() {
  const navigate = useNavigate()

  const [selectedOption, setSelectedOption] = useState<AssistanceOption | null>(null)
  const [showHelpDialog, setShowHelpDialog] = useState(false)
  const [showSuccessDialog, setShowSuccessDialog] = useState(false)
  const [status, setStatus] = useState<RequestStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  // Retrieve existing boarding / passenger data if available
  const getBoardingData = () => {
    try {
      const raw = sessionStorage.getItem('boardingData')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  // Dial handler: opens phone dial keypad with prefilled number, does NOT auto-call
  const handleDial = (phone: string = AIRPORT_ASSISTANCE_PHONE) => {
    const cleanNumber = phone.replace(/\s+/g, '')
    window.location.href = `tel:${cleanNumber}`
  }

  // Step 1: User clicks "Help Me" -> Show advisory dialog
  const handleHelpMeClick = (option: AssistanceOption) => {
    setSelectedOption(option)
    setErrorMessage('')
    setShowHelpDialog(true)
  }

  // Step 2: User clicks green confirmation button -> Extract live location & dispatch
  const handleConfirmHelpRequest = async () => {
    if (!selectedOption) return

    setStatus('locating')
    setErrorMessage('')

    let lat: number
    let lng: number
    let accuracy: number | null = null

    try {
      // Check and request native location permissions via Capacitor
      let permStatus = await Geolocation.checkPermissions()

      if (permStatus.location === 'denied') {
        permStatus = await Geolocation.requestPermissions()
      }

      if (permStatus.location === 'denied') {
        setShowHelpDialog(false)
        setStatus('error')
        setErrorMessage('Please turn on live location.')
        return
      }

      // Extract real device GPS position
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      })

      lat = position.coords.latitude
      lng = position.coords.longitude
      accuracy = position.coords.accuracy || null

      if ((lat === 0 && lng === 0) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        throw new Error('Please turn on live location.')
      }
    } catch (err: any) {
      console.warn('[Disability Assistance Location Error]:', err)
      setShowHelpDialog(false)
      setStatus('error')

      const msg = (err?.message || '').toLowerCase()
      if (
        msg.includes('denied') ||
        msg.includes('disabled') ||
        msg.includes('turned off') ||
        msg.includes('location service') ||
        msg.includes('unavailable') ||
        msg.includes('live location')
      ) {
        setErrorMessage('Please turn on live location.')
      } else {
        setErrorMessage('Please turn on live location.')
      }
      return
    }

    // Step 3: Location successfully obtained -> Send assistance alert
    setShowHelpDialog(false)
    await dispatchAssistance(selectedOption, lat, lng, accuracy)
  }

  const dispatchAssistance = async (
    option: AssistanceOption,
    latitude: number,
    longitude: number,
    accuracy: number | null
  ) => {
    setStatus('sending')
    setErrorMessage('')

    const boarding = getBoardingData()
    const passengerName =
      boarding?.passenger_name || localStorage.getItem('name') || 'Sai Venkat'
    const ticketId = boarding?.ticket_id || '3409967503'
    const flightInfo = boarding?.flight_id
      ? `${boarding.flight_id} (${boarding.from || 'HYD'} → ${boarding.to || 'DEL'})`
      : 'AI-102 (HYD → DEL)'
    const sender =
      localStorage.getItem('email') ||
      localStorage.getItem('name') ||
      `${passengerName} (Passenger App)`

    try {
      const payload = {
        passengerName,
        ticketId,
        pnr: ticketId,
        flightDetails: flightInfo,
        senderDetails: sender,
        assistanceType: option.type,
        emergencyType: `Disability Assistance — ${option.type}`,
        category: 'Disability',
        primaryAgency: 'operations',
        additionalAgencies: [],
        priority: 'HIGH',
        latitude,
        longitude,
        accuracy,
        terminal: boarding?.terminal || 'Terminal 3',
        timestamp: new Date().toISOString(),
        requestDetails: `Immediate staff assistance requested for ${option.type} (${option.targetAudience}) at passenger live location.`,
      }

      const response = await fetch('/api/emergency-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Server responded with status ${response.status}`)
      }

      setStatus('success')
      setShowSuccessDialog(true)
    } catch (err: any) {
      console.error('[Disability Assistance Dispatch Error]:', err)
      setStatus('error')
      setErrorMessage(
        err?.message ||
          'Failed to dispatch disability assistance request. Please contact the helpdesk directly.'
      )
    }
  }

  const isLoading = status === 'locating' || status === 'sending'

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Top Header Card */}
      <div className="p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
            title="Go Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Special Passenger Care • 24/7
            </span>
            <h1 className="text-2xl font-black text-[#F8FAFC]">Disability Assistance</h1>
          </div>
        </div>

        {/* Airport Helpdesk Quick Dial Button */}
        <button
          onClick={() => handleDial()}
          title={`Call Airport Assistance (${AIRPORT_ASSISTANCE_PHONE})`}
          className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-[#14C8FF] border border-cyan-500/30 text-xs font-bold transition-all active:scale-95"
        >
          <Phone className="w-4 h-4" />
          <span>{AIRPORT_ASSISTANCE_PHONE}</span>
        </button>
      </div>

      {/* Info Banner */}
      <div className="p-5 rounded-[24px] bg-gradient-to-r from-[#0F1E35] to-[#14233D] border border-white/10 shadow-lg flex items-start gap-4">
        <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-sm font-bold text-[#F8FAFC]">
            Airport Special Assistance & Priority Support
          </h2>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Our specialized airport care staff are stationed throughout the terminal to ensure smooth,
            dignified, and accessible journeys. Choose your required assistance below to dispatch
            staff directly to your current location or dial our assistance desk.
          </p>
        </div>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-start gap-3 text-red-300 text-xs font-semibold animate-in fade-in duration-200">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-red-200">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Two Assistance Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {ASSISTANCE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isCurrentLoading = isLoading && selectedOption?.id === opt.id

          return (
            <div
              key={opt.id}
              className={`p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 ${opt.borderAccent} shadow-xl flex flex-col justify-between space-y-5 transition-all duration-200`}
            >
              {/* Box Header & Icon */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl ${opt.iconBg} border border-white/5 flex items-center justify-center`}
                  >
                    <Icon className={`w-6 h-6 ${opt.iconColor}`} />
                  </div>
                  <span
                    className={`text-[11px] font-extrabold px-2.5 py-1 rounded-full border ${opt.badgeColor}`}
                  >
                    {opt.type}
                  </span>
                </div>

                <div>
                  <h3 className="text-lg font-black text-[#F8FAFC] tracking-tight">
                    {opt.title}
                  </h3>
                  <p className="text-xs font-semibold text-emerald-400 mt-0.5">
                    {opt.targetAudience}
                  </p>
                </div>

                <p className="text-xs text-[#94A3B8] leading-relaxed">{opt.description}</p>
              </div>

              {/* Action Buttons: Help Me + Dial Phone Number */}
              <div className="flex items-center gap-3 pt-2">
                {/* 1. Help Me Button */}
                <button
                  onClick={() => handleHelpMeClick(opt)}
                  disabled={isLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 active:scale-95 text-white font-extrabold text-xs tracking-wider shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isCurrentLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span>Help Me</span>
                </button>

                {/* 2. Dial Phone Number Button with Phone Icon */}
                <button
                  onClick={() => handleDial()}
                  title={`Dial ${AIRPORT_ASSISTANCE_PHONE}`}
                  className="py-3 px-4 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 active:scale-95 text-[#14C8FF] border border-cyan-400/30 flex items-center justify-center gap-2 text-xs font-bold transition-all shadow-md"
                >
                  <Phone className="w-4 h-4" />
                  <span className="hidden sm:inline">{AIRPORT_ASSISTANCE_PHONE}</span>
                  <span className="sm:hidden">Dial</span>
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Step 1 Dialog: Help Me Advisory Modal */}
      {showHelpDialog && selectedOption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 rounded-[28px] bg-[#0F1E35] border border-white/20 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-emerald-400 font-extrabold text-base">
                <MapPin className="w-5 h-5 text-emerald-400" />
                <span>Request {selectedOption.type} Assistance</span>
              </div>
              <button
                onClick={() => setShowHelpDialog(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Advisory Points (Strictly specified requirements) */}
            <div className="p-4 rounded-2xl bg-[#162742] border border-white/10 space-y-3 text-xs text-slate-200 leading-relaxed font-medium">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                  1
                </span>
                <p>To access this feature, you need to be present within the airport premises.</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                  2
                </span>
                <p>You need to turn on your live location.</p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-black shrink-0 mt-0.5">
                  3
                </span>
                <p>
                  If you press the green button below, your location will be sent to the airport
                  authority, and they will send staff for your disability help.
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2.5 pt-1">
              {/* Green Confirmation Button */}
              <button
                onClick={handleConfirmHelpRequest}
                disabled={isLoading}
                className="w-full py-3.5 rounded-xl bg-[#10B981] hover:bg-[#059669] active:scale-95 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 transition-all disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Extracting Location & Sending...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Send Location & Request Staff</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowHelpDialog(false)}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 Dialog: Confirmation Modal on Successful Dispatch */}
      {showSuccessDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md p-6 rounded-[28px] bg-[#0F1E35] border border-emerald-500/40 shadow-2xl space-y-5 text-center">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-3xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mx-auto shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black text-[#F8FAFC]">Request Dispatched</h3>
              {/* Required wording */}
              <p className="text-sm font-semibold text-slate-200 leading-relaxed">
                Message sent successfully. Please contact this number for any further help.
              </p>
            </div>

            {/* Assistance Phone Contact Box with Dial Action */}
            <div className="p-4 rounded-2xl bg-[#162742] border border-white/10 flex items-center justify-between gap-3">
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  Airport Assistance
                </span>
                <p className="text-base font-black text-[#F8FAFC]">
                  {AIRPORT_ASSISTANCE_PHONE}
                </p>
              </div>

              {/* Usable Dial button */}
              <button
                onClick={() => handleDial(AIRPORT_ASSISTANCE_PHONE)}
                title={`Dial ${AIRPORT_ASSISTANCE_PHONE}`}
                className="py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-[#14C8FF] border border-cyan-400/40 flex items-center gap-2 text-xs font-extrabold transition-all active:scale-95"
              >
                <Phone className="w-4 h-4" />
                <span>Dial</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={() => {
                setShowSuccessDialog(false)
                setSelectedOption(null)
                setStatus('idle')
              }}
              className="w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
