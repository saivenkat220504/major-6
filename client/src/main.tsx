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
    // Determine active flight (stored or default AI-102)
    const getActiveFlight = () => {
      try {
        const raw = sessionStorage.getItem('boardingData')
        if (raw) {
          const parsed = JSON.parse(raw)
          return parsed.flight_id || 'AI-102'
        }
      } catch {}
      return 'AI-102'
    }

    // Auto-register native FCM token on application start
    initializePushNotifications(getActiveFlight()).catch((err) => {
      console.warn('[Main] Push notification auto-init notice:', err)
    })

    const handleOpen = () => setAuraOpen(true)
    const handleClose = () => setAuraOpen(false)

    const handleTicketScanned = () => {
      setIsTicketScanned(true)
      initializePushNotifications(getActiveFlight()).catch(() => {})
    }

    const handleResetScan = () => {
      sessionStorage.removeItem('ticketScanned')
      setIsTicketScanned(false)
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
