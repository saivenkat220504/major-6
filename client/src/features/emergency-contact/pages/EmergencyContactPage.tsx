import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Siren, MapPin, Loader, ShieldCheck, ShieldAlert, Radio, Clock, PhoneCall } from 'lucide-react'
import EmergencyNotice from '../components/EmergencyNotice'
import CategorizedEmergencySelector from '../components/CategorizedEmergencySelector'
import AlertConfirmationDashboard from '../components/AlertConfirmationDashboard'
import { EmergencyReasonItem, EMERGENCY_REASONS } from '../data/emergencyCategories'

const ALERT_SENT_KEY = 'emergencyAlertSent_v2'
const ALERT_DATA_KEY = 'emergencyAlertData_v2'

type Status = 'idle' | 'locating' | 'sending' | 'error'

export default function EmergencyContactPage() {
  const navigate = useNavigate()

  const [alertSent, setAlertSent] = useState<boolean>(
    () => sessionStorage.getItem(ALERT_SENT_KEY) === 'true'
  )

  const [selectedReason, setSelectedReason] = useState<EmergencyReasonItem | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')
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

  const handleEmergencyAlert = async () => {
    if (!selectedReason || isLoading) return

    setStatus('locating')
    setErrorMsg('')

    if (!navigator.geolocation) {
      setErrorMsg('Live location is not supported by this browser.')
      setStatus('error')
      return
    }

    let position: GeolocationPosition
    try {
      position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          resolve,
          reject,
          {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0,
          }
        )
      })
    } catch (err: any) {
      let msg = 'Live location could not be obtained. Please try again.'
      if (err?.code === 1 || err?.code === err?.PERMISSION_DENIED) {
        msg = 'Location permission is required to share your live location. Please allow location access and try again.'
      } else if (err?.code === 2 || err?.code === err?.POSITION_UNAVAILABLE) {
        msg = 'Your current location could not be detected. Please check your device location settings and try again.'
      } else if (err?.code === 3 || err?.code === err?.TIMEOUT) {
        msg = 'Live location could not be obtained in time. Please try again.'
      }
      setErrorMsg(msg)
      setStatus('error')
      return
    }

    const { latitude, longitude, accuracy } = position.coords

    // Validate coordinates
    if (
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      setErrorMsg('Detected coordinates are invalid. Please check your GPS and try again.')
      setStatus('error')
      return
    }

    const boarding = getBoardingData()
    setStatus('sending')

    try {
      const payload = {
        passengerName: boarding?.passenger_name ?? 'Sai Venkat',
        ticketId: boarding?.ticket_id ?? '3409967503',
        emergencyType: selectedReason.label,
        category: selectedReason.category,
        primaryAgency: selectedReason.primaryAgency,
        additionalAgencies: selectedReason.additionalAgencies,
        priority: selectedReason.priority,
        latitude,
        longitude,
        accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
        terminal: boarding?.terminal || 'Terminal 3',
        timestamp: new Date(position.timestamp || Date.now()).toISOString(),
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

      const savedData = {
        reason: selectedReason,
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
      setErrorMsg(err.message || 'Failed to dispatch emergency alert. Please try again.')
      setStatus('error')
    }
  }

  const handleResetAlert = () => {
    sessionStorage.removeItem(ALERT_SENT_KEY)
    sessionStorage.removeItem(ALERT_DATA_KEY)
    setAlertSent(false)
    setAlertData(null)
    setStatus('idle')
    setSelectedReason(null)
  }

  const isLoading = status === 'locating' || status === 'sending'
  const canSend = !!selectedReason && !isLoading

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

          <div className="flex items-center gap-2">
            <button
              onClick={handleResetAlert}
              className="px-4 py-2 rounded-xl bg-red-500/20 text-red-300 border border-red-500/30 font-bold text-xs flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Resolve & Dismiss Alert</span>
            </button>
            <button
              onClick={() => navigate('/emergency-contact/staff-dashboard')}
              className="px-4 py-2 rounded-xl bg-blue-500/20 text-[#14C8FF] border border-blue-400/30 font-bold text-xs flex items-center gap-1.5"
            >
              <Radio className="w-4 h-4 animate-pulse" />
              <span>Staff Portal</span>
            </button>
          </div>
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
      <div className="p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 shadow-xl flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#EF4444] flex items-center gap-1">
              <Siren className="w-3.5 h-3.5 animate-pulse" />
              Multi-Agency Emergency Response
            </span>
            <h1 className="text-2xl font-black text-[#F8FAFC]">Airport Security & Dispatch Platform</h1>
          </div>
        </div>

        <button
          onClick={() => navigate('/emergency-contact/staff-dashboard')}
          className="px-4 py-2 rounded-xl bg-blue-500/20 text-[#14C8FF] border border-blue-400/30 font-bold text-xs flex items-center gap-1.5"
        >
          <Radio className="w-4 h-4 animate-pulse" />
          <span>Staff Dashboard</span>
        </button>
      </div>

      <EmergencyNotice />

      <div className="p-6 rounded-[28px] bg-[#0F1E35] border border-white/10 shadow-xl space-y-6">
        <CategorizedEmergencySelector
          selectedReason={selectedReason}
          onSelectReason={(r) => setSelectedReason(r)}
        />

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-start gap-3 text-red-300 text-xs font-semibold animate-in fade-in duration-200">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-red-200">{errorMsg}</p>
              <p className="text-[11px] text-red-300/80">Please check your location settings/permissions and click Broadcast again to retry.</p>
            </div>
          </div>
        )}

        <button
          id="emergency-alert-btn"
          onClick={handleEmergencyAlert}
          disabled={!canSend}
          className={`w-full py-4 flex items-center justify-center gap-3 font-extrabold text-base rounded-[18px] shadow-2xl transition-all ${
            canSend
              ? 'bg-[#EF4444] hover:bg-red-600 text-white shadow-red-500/30 active:scale-[0.98]'
              : 'bg-white/5 text-[#94A3B8]/40 border border-white/5 cursor-not-allowed'
          }`}
        >
          {isLoading ? <Loader className="w-5 h-5 animate-spin" /> : <Siren className="w-5 h-5" />}
          <span>
            {status === 'locating'
              ? 'Getting your live location...'
              : status === 'sending'
              ? 'Dispatching Emergency Alert...'
              : 'Broadcast Multi-Agency Emergency Alert'}
          </span>
        </button>
      </div>
    </div>
  )
}
