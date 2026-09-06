import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Siren, Phone, ShieldAlert, Loader, MapPin, X } from 'lucide-react'
import { Geolocation } from '@capacitor/geolocation'
import EmergencyNotice from '../components/EmergencyNotice'
import AlertConfirmationDashboard from '../components/AlertConfirmationDashboard'

const ALERT_SENT_KEY = 'emergencyAlertSent_v2'
const ALERT_DATA_KEY = 'emergencyAlertData_v2'

interface EmergencyContactCard {
  id: string
  title: string
  subtitle?: string
  phone: string
  hasSos: boolean
  category: 'Medical' | 'Police' | 'Operations'
  primaryAgency: string
}

const EMERGENCY_CONTACTS: EmergencyContactCard[] = [
  {
    id: 'medical_apollo',
    title: 'Medical Emergency',
    subtitle: 'Apollo',
    phone: '1066',
    hasSos: true,
    category: 'Medical',
    primaryAgency: 'medical',
  },
  {
    id: 'police',
    title: 'Police',
    phone: '112',
    hasSos: true,
    category: 'Police',
    primaryAgency: 'police',
  },
  {
    id: 'baggage_misplaced',
    title: 'Baggage Misplaced',
    phone: '+91 40 6660 6660',
    hasSos: false,
    category: 'Operations',
    primaryAgency: 'operations',
  },
]

type Status = 'idle' | 'locating' | 'sending' | 'error'

export default function EmergencyContactPage() {
  const navigate = useNavigate()

  const [alertSent, setAlertSent] = useState<boolean>(
    () => sessionStorage.getItem(ALERT_SENT_KEY) === 'true'
  )

  const [activeContact, setActiveContact] = useState<EmergencyContactCard | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [showLocationDialog, setShowLocationDialog] = useState(false)
  const [pendingContact, setPendingContact] = useState<EmergencyContactCard | null>(null)

  const [alertData, setAlertData] = useState<any>(() => {
    try {
      const raw = sessionStorage.getItem(ALERT_DATA_KEY)
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })

  const getBoardingData = () => {
    try {
      const raw = sessionStorage.getItem('boardingData')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  }

  // Dial handler: opens phone dial keypad with prefilled number
  const handleDial = (phone: string) => {
    const cleanNumber = phone.replace(/\s+/g, '')
    window.location.href = `tel:${cleanNumber}`
  }

  // Step 1: User clicks main card "SOS" button -> Directly open location dialog
  const handleSosClick = (contact: EmergencyContactCard) => {
    setErrorMsg('')
    setPendingContact(contact)
    setActiveContact(contact)
    setShowLocationDialog(true)
  }

  // Step 2: User clicks the red broadcast button inside the dialog -> extract REAL location using Capacitor native GPS
  const handleConfirmLocationAndSendSos = async () => {
    if (!pendingContact) return

    const contact = pendingContact
    setStatus('locating')
    setErrorMsg('')

    let lat: number
    let lng: number
    let accuracy: number | null = null

    try {
      // First, check & request native permissions via Capacitor
      let permStatus = await Geolocation.checkPermissions()

      if (permStatus.location === 'denied') {
        // Permission was previously denied — ask once more
        permStatus = await Geolocation.requestPermissions()
      }

      if (permStatus.location === 'denied') {
        setShowLocationDialog(false)
        setStatus('error')
        setErrorMsg('Location permission denied. Please go to phone Settings > Apps > Smart Airport > Permissions and enable Location access.')
        return
      }

      // Extract REAL position from native GPS — NO fallback, NO dummy data
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
      })

      lat = position.coords.latitude
      lng = position.coords.longitude
      accuracy = position.coords.accuracy || null

      // Safety: reject obviously invalid coordinates
      if (lat === 0 && lng === 0) {
        throw new Error('GPS returned (0, 0) which indicates device GPS is not ready. Please wait a moment and try again.')
      }

    } catch (err: any) {
      console.warn('[Capacitor Location Extractor Error]:', err)
      setShowLocationDialog(false)
      setStatus('error')

      const msg = err?.message || ''

      if (msg.includes('denied') || msg.includes('permission')) {
        setErrorMsg('Location permission denied. Please go to phone Settings > Apps > Smart Airport > Permissions and enable Location access.')
      } else if (msg.includes('disabled') || msg.includes('turned off') || msg.includes('location service')) {
        setErrorMsg('Please turn on live location / GPS on your phone from the Settings.')
      } else if (msg.includes('timeout') || msg.includes('timed out')) {
        setErrorMsg('System error: Location request timed out. Please check your GPS signal and try again.')
      } else {
        setErrorMsg(`System error extracting location: ${msg || 'Unknown error'}`)
      }
      return
    }

    setShowLocationDialog(false)
    await dispatchSos(contact, lat, lng, accuracy)
  }

  const dispatchSos = async (
    contact: EmergencyContactCard,
    latitude: number,
    longitude: number,
    accuracy: number | null
  ) => {
    setStatus('sending')
    setErrorMsg('')

    const boarding = getBoardingData()
    const fullReasonLabel = contact.subtitle
      ? `${contact.title} — ${contact.subtitle}`
      : contact.title

    try {
      const payload = {
        passengerName: boarding?.passenger_name ?? 'Sai Venkat',
        ticketId: boarding?.ticket_id ?? '3409967503',
        emergencyType: fullReasonLabel,
        category: contact.category,
        primaryAgency: contact.primaryAgency,
        additionalAgencies: [],
        priority: 'CRITICAL',
        latitude,
        longitude,
        accuracy,
        terminal: boarding?.terminal || 'Terminal 3',
        timestamp: new Date().toISOString(),
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

      const savedReasonItem = {
        id: contact.id,
        label: fullReasonLabel,
        category: contact.category,
        primaryAgency: contact.primaryAgency,
        additionalAgencies: [],
        priority: 'CRITICAL',
      }

      const savedData = {
        reason: savedReasonItem,
        latitude,
        longitude,
        passengerName: payload.passengerName,
        ticketId: payload.ticketId,
        terminal: payload.terminal,
      }

      sessionStorage.setItem(ALERT_SENT_KEY, 'true')
      sessionStorage.setItem(ALERT_DATA_KEY, JSON.stringify(savedData))

      setAlertData(savedData)
      setAlertSent(true)
      setStatus('idle')
    } catch (err: any) {
      setErrorMsg(err.message || 'System error: Failed to dispatch emergency alert. Please try again.')
      setStatus('error')
    }
  }

  const handleResetAlert = () => {
    sessionStorage.removeItem(ALERT_SENT_KEY)
    sessionStorage.removeItem(ALERT_DATA_KEY)
    setAlertSent(false)
    setAlertData(null)
    setStatus('idle')
    setActiveContact(null)
  }

  const isLoading = status === 'locating' || status === 'sending'

  if (alertSent && alertData?.reason) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              handleResetAlert()
              navigate(-1)
            }}
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        </div>

        <AlertConfirmationDashboard
          reason={alertData.reason}
          latitude={alertData.latitude}
          longitude={alertData.longitude}
          passengerName={alertData.passengerName}
          ticketId={alertData.ticketId}
          terminal={alertData.terminal}
          onReset={handleResetAlert}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 shadow-xl flex items-center gap-4">
        <button
          onClick={() => navigate('/')}
          className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#EF4444] flex items-center gap-1">
            <Siren className="w-3.5 h-3.5 animate-pulse" />
            Emergency Services
          </span>
          <h1 className="text-2xl font-black text-[#F8FAFC]">Emergency Contacts</h1>
        </div>
      </div>

      {/* Emergency Alert Notice Board (Preserved exactly) */}
      <EmergencyNotice />

      {/* Emergency Contacts Section */}
      <div className="p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 shadow-xl space-y-4">
        <h2 className="text-base font-extrabold text-[#F8FAFC] tracking-wide mb-2">
          Emergency Contacts
        </h2>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/40 flex items-start gap-3 text-red-300 text-xs font-semibold animate-in fade-in duration-200">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-red-200">{errorMsg}</p>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {EMERGENCY_CONTACTS.map((c) => (
            <div
              key={c.id}
              className="p-4 rounded-2xl bg-[#162742] border border-white/10 flex items-center justify-between gap-3 shadow-md hover:border-white/20 transition-all"
            >
              {/* Left Info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black text-[#F8FAFC] truncate">
                    {c.title}
                  </h3>
                  {c.subtitle && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-[#14C8FF] border border-cyan-500/30">
                      {c.subtitle}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-[#94A3B8] mt-0.5">
                  {c.phone}
                </p>
              </div>

              {/* Right Actions: Dial Icon & optional SOS */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Blue Dial Icon */}
                <button
                  onClick={() => handleDial(c.phone)}
                  title={`Dial ${c.phone}`}
                  className="w-11 h-11 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 text-[#14C8FF] border border-cyan-400/40 flex items-center justify-center transition-all active:scale-95"
                >
                  <Phone className="w-5 h-5" />
                </button>

                {/* Red SOS Button (Only for Medical & Police) */}
                {c.hasSos && (
                  <button
                    onClick={() => handleSosClick(c)}
                    disabled={isLoading}
                    className="px-4 py-2.5 rounded-xl bg-[#EF4444] hover:bg-red-600 active:scale-95 text-white font-black text-xs tracking-wider shadow-lg shadow-red-500/30 flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    {isLoading && activeContact?.id === c.id ? (
                      <Loader className="w-4 h-4 animate-spin" />
                    ) : (
                      <Siren className="w-4 h-4 animate-pulse" />
                    )}
                    <span>SOS</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Location Dialog Modal */}
      {showLocationDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm p-6 rounded-[24px] bg-[#0F1E35] border border-white/20 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400 font-extrabold text-base">
                <MapPin className="w-5 h-5" />
                <span>Enable Live Location</span>
              </div>
              <button
                onClick={() => setShowLocationDialog(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs font-semibold text-slate-300 leading-relaxed">
              Please turn on your live location and click on the below red button to dispatch your emergency alert.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleConfirmLocationAndSendSos}
                disabled={isLoading}
                className="w-full py-3 rounded-xl bg-[#EF4444] hover:bg-red-600 active:scale-95 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                {isLoading ? (
                  <Loader className="w-4 h-4 animate-spin" />
                ) : (
                  <Siren className="w-4 h-4" />
                )}
                <span>Send Emergency SOS Alert</span>
              </button>

              <button
                onClick={() => setShowLocationDialog(false)}
                className="w-full py-2.5 rounded-xl bg-white/10 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
