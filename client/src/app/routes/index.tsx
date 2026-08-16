import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Login from '../../pages/Login'
import Register from '../../pages/Register'
import Dashboard from '../../features/home/pages/HomePage'
import ChatPage from '../../features/ai-assistant/pages/Chat'
import FlightTrackingPage from '../../features/flight-tracking/pages/FlightTrackingPage'
import BaggageGuidancePage from '../../features/baggage-guidance/pages/BaggageGuidancePage'
import TranslatePage from '../../features/translation/pages/Translate'
import ProfilePage from '../../pages/Profile'
import BoardingPassPage from '../../features/boarding-pass/pages/BoardingPassPage'
import EmergencyContactPage from '../../features/emergency-contact/pages/EmergencyContactPage'
import StaffResponseDashboardPage from '../../features/emergency-contact/pages/StaffResponseDashboardPage'
import TransitServicesPage from '../../features/transit-services/pages/TransitServicesPage'
import LiveTrackingPage from '../../features/transit-services/pages/LiveTrackingPage'
import HeathrowMapPage from '../../features/navigation/pages/HeathrowMapPage'
import MealDeliveryPage from '../../features/meal-delivery/pages/MealDeliveryPage'
import PersonalGuardianPage from '../../features/personal-guardian/pages/PersonalGuardianPage'
import EventSchedulerPage from '../../features/event-scheduler/pages/EventSchedulerPage'

import TicketScanPage from '../../features/boarding-pass/pages/TicketScanPage'

export default function AppRoutes(){
  return (
    <Routes>
      <Route path='/' element={<Dashboard/>} />
      <Route path='/scan' element={<TicketScanPage/>} />
      <Route path='/login' element={<Login/>} />
      <Route path='/register' element={<Register/>} />
      <Route path='/chat' element={<ChatPage/>} />
      <Route path='/flight-tracking' element={<FlightTrackingPage/>} />
      <Route path='/transit' element={<FlightTrackingPage/>} />
      <Route path='/baggage-guidance' element={<BaggageGuidancePage/>} />
      <Route path='/navigation' element={<HeathrowMapPage/>} />
      <Route path='/navigate' element={<HeathrowMapPage/>} />
      <Route path='/translate' element={<TranslatePage/>} />
      <Route path='/profile' element={<ProfilePage/>} />
      <Route path='/boarding-pass' element={<BoardingPassPage/>} />
      <Route path='/emergency-contact' element={<EmergencyContactPage/>} />
      <Route path='/emergency-contact/staff-dashboard' element={<StaffResponseDashboardPage/>} />
      <Route path='/meal-delivery' element={<MealDeliveryPage/>} />
      <Route path='/transit-services' element={<TransitServicesPage/>} />
      <Route path='/transit-services/track' element={<LiveTrackingPage/>} />
      <Route path='/heathrow-map' element={<HeathrowMapPage/>} />
      <Route path='/personal-guardian' element={<PersonalGuardianPage/>} />
      <Route path='/personal-mentor' element={<PersonalGuardianPage/>} />
      <Route path='/event-scheduler' element={<EventSchedulerPage/>} />
    </Routes>
  )
}
