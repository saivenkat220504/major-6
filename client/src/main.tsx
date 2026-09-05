import React, { useState, useEffect } from 'react'
import './config/api'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './app/routes'
import './styles/index.css'
import 'leaflet/dist/leaflet.css'
import Navbar from './shared/components/Navbar'
import { useDarkMode } from './shared/hooks/useDarkMode'
import AuraModal from './features/ai-assistant/components/AuraModal'
import FloatingAskAIButton from './features/ai-assistant/components/FloatingAskAIButton'
import { LanguageProvider } from './shared/context/LanguageContext'
import TicketScanPage from './features/boarding-pass/pages/TicketScanPage'
import { initializePushNotifications } from './features/flight-tracking/services/pushNotificationService'

function AppContent() {
  const [auraOpen, setAuraOpen] = useState(false)
  const [isTicketScanned, setIsTicketScanned] = useState(() => {
    return sessionStorage.getItem('ticketScanned') === 'true'
  })

  useEffect(() => {
    // Read the confirmed flight from sessionStorage (written by TicketScanPage after successful scan).
    // This is intentionally NOT called on cold start before the ticket is scanned
    // so we never register under a stale or default flight number like 'AI-102'.
    const getActiveFlight = () => {
      try {
        const raw = sessionStorage.getItem('boardingData')
        if (raw) {
          const parsed = JSON.parse(raw)
          const rawFlight = (parsed.flight_id || '').trim()
          return rawFlight // normalizeFlightNumber() is called inside initializePushNotifications
        }
      } catch {}
      return '' // Return empty — will cause initializePushNotifications to skip registration
    }

    const handleOpen = () => setAuraOpen(true)
    const handleClose = () => setAuraOpen(false)

    const handleTicketScanned = () => {
      setIsTicketScanned(true)
      // Only now do we have the real flight_id in sessionStorage — safe to register
      const confirmedFlight = getActiveFlight()
      if (confirmedFlight) {
        console.log(`[Main] Ticket scanned. Initiating FCM registration for flight: "${confirmedFlight}"`)
        initializePushNotifications(confirmedFlight).catch((e) =>
          console.warn('[Main] Push notification init after scan:', e)
        )
      } else {
        console.warn('[Main] Ticket scanned but no flight_id found in sessionStorage. FCM registration skipped.')
      }
    }

    const handleResetScan = () => {
      sessionStorage.removeItem('ticketScanned')
      setIsTicketScanned(false)
    }

    // If ticket was already scanned in a previous session (page refresh), re-register token
    if (sessionStorage.getItem('ticketScanned') === 'true') {
      const existingFlight = getActiveFlight()
      if (existingFlight) {
        console.log(`[Main] Session restore: re-registering FCM for flight "${existingFlight}"`)
        initializePushNotifications(existingFlight).catch(() => {})
      }
    }

    window.addEventListener('aura-open-event', handleOpen)
    window.addEventListener('aura-close-event', handleClose)
    window.addEventListener('ticket-scanned-event', handleTicketScanned)
    window.addEventListener('ticket-rescan-event', handleResetScan)

    return () => {
      window.removeEventListener('aura-open-event', handleOpen)
      window.removeEventListener('aura-close-event', handleClose)
      window.removeEventListener('ticket-scanned-event', handleTicketScanned)
      window.removeEventListener('ticket-rescan-event', handleResetScan)
    }
  }, [])


  // Step 1: Render Ticket Scanner exclusively first if ticket has not been scanned yet
  if (!isTicketScanned) {
    return (
      <TicketScanPage
        onScanComplete={() => {
          setIsTicketScanned(true)
        }}
      />
    )
  }

  // Step 2: Render full Navbar, App routes, Floating Ask AI button, and Aura modal
  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 lg:pb-12 text-[#F8FAFC]">
        <AppRoutes />
      </div>
      <FloatingAskAIButton
        isOpen={auraOpen}
        onClick={() => setAuraOpen(true)}
      />
      <AuraModal
        open={auraOpen}
        onClose={() => {
          setAuraOpen(false)
          window.dispatchEvent(new Event('aura-close-event'))
        }}
      />
    </>
  )
}

function App() {
  useDarkMode()

  return (
    <LanguageProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </LanguageProvider>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
