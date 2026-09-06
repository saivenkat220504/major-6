import React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Navigation,
  Utensils,
  Plane,
  Luggage,
  ShieldAlert,
  UserCheck,
  Train,
  ChevronRight,
  Wifi,
  HeartPulse,
  Languages,
  Accessibility,
} from 'lucide-react'

interface ServiceCard {
  id: string
  title: string
  description: string
  status: string
  statusColor: string
  statusDot: string
  metric: string
  metricColor: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
  borderHover: string
  path: string
  accentGlow?: string
}

const PASSENGER_SERVICES: ServiceCard[] = [
  {
    id: 'nav',
    title: 'Terminal Navigation',
    description: 'Indoor routing, gate & lounge directions with live occupancy',
    status: 'Turn-by-turn Active',
    statusColor: 'text-[#14C8FF]',
    statusDot: 'bg-[#14C8FF]',
    metric: '6 min to gate',
    metricColor: 'text-[#22C55E]',
    icon: Navigation,
    iconBg: 'bg-cyan-500/15',
    iconColor: 'text-[#14C8FF]',
    borderHover: 'hover:border-cyan-400/40',
    path: '/navigation',
  },
  {
    id: 'flight',
    title: 'Flight Tracking',
    description: 'Live aircraft position, gate, boarding countdown & radar',
    status: 'On Time • Boarding 15:45',
    statusColor: 'text-[#22C55E]',
    statusDot: 'bg-[#22C55E] animate-pulse',
    metric: 'Gate 14B • T1',
    metricColor: 'text-[#14C8FF]',
    icon: Plane,
    iconBg: 'bg-blue-500/15',
    iconColor: 'text-[#2F80FF]',
    borderHover: 'hover:border-blue-400/40',
    path: '/flight-tracking',
    accentGlow: 'shadow-blue-500/10',
  },
  {
    id: 'baggage',
    title: 'Baggage Guidance',
    description: 'Weight rules, prohibited items, baggage tag tracking',
    status: 'Bag Loaded on Aircraft',
    statusColor: 'text-[#22C55E]',
    statusDot: 'bg-[#22C55E]',
    metric: 'Hold 3 • ETA 8 min',
    metricColor: 'text-[#F8FAFC]',
    icon: Luggage,
    iconBg: 'bg-teal-500/15',
    iconColor: 'text-teal-400',
    borderHover: 'hover:border-teal-400/40',
    path: '/baggage-guidance',
  },
  {
    id: 'transit',
    title: 'Airport Transit Hub',
    description: 'Metro Express, Pushpak Buses, Cab & Shuttle options',
    status: 'Express Metro 3 min',
    statusColor: 'text-[#22C55E]',
    statusDot: 'bg-[#22C55E] animate-pulse',
    metric: 'Platform 1 • 11 seats',
    metricColor: 'text-[#F8FAFC]',
    icon: Train,
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    borderHover: 'hover:border-emerald-400/40',
    path: '/transit-services',
  },
  {
    id: 'dining',
    title: 'Meal Delivery',
    description: 'Restaurant orders delivered to your seat before takeoff',
    status: 'Open • Seat Delivery',
    statusColor: 'text-amber-400',
    statusDot: 'bg-amber-400',
    metric: '24 restaurants',
    metricColor: 'text-amber-300',
    icon: Utensils,
    iconBg: 'bg-amber-500/15',
    iconColor: 'text-amber-400',
    borderHover: 'hover:border-amber-400/40',
    path: '/meal-delivery',
  },
  {
    id: 'guardian',
    title: 'Personal Guardian',
    description: 'Live travel updates sent to your nominated trusted contact',
    status: 'Guardian Configured',
    statusColor: 'text-violet-400',
    statusDot: 'bg-violet-400',
    metric: '2 contacts linked',
    metricColor: 'text-violet-300',
    icon: UserCheck,
    iconBg: 'bg-violet-500/15',
    iconColor: 'text-violet-400',
    borderHover: 'hover:border-violet-400/40',
    path: '/personal-guardian',
  },
  {
    id: 'emergency',
    title: 'Emergency Contact',
    description: '24/7 Police, Medical, Fire & Airport Security dispatch',
    status: '24/7 • Response < 3 min',
    statusColor: 'text-red-400',
    statusDot: 'bg-red-400 animate-pulse',
    metric: 'SOS Ready',
    metricColor: 'text-red-300',
    icon: ShieldAlert,
    iconBg: 'bg-red-500/15',
    iconColor: 'text-red-400',
    borderHover: 'hover:border-red-400/40',
    path: '/emergency-contact',
    accentGlow: 'shadow-red-500/10',
  },
  {
    id: 'translation',
    title: 'Language Translation',
    description: 'Real-time two-way voice interpreter across language barriers',
    status: 'AI Powered • Live',
    statusColor: 'text-indigo-400',
    statusDot: 'bg-indigo-400 animate-pulse',
    metric: '50+ languages',
    metricColor: 'text-indigo-300',
    icon: Languages,
    iconBg: 'bg-indigo-500/15',
    iconColor: 'text-indigo-400',
    borderHover: 'hover:border-indigo-400/40',
    path: '/translate',
    accentGlow: 'shadow-indigo-500/10',
  },
  {
    id: 'disability-assistance',
    title: 'Disability Assistance',
    description: 'Wheelchair mobility and companion support for passengers with disabilities',
    status: 'Airport Staff • Live',
    statusColor: 'text-emerald-400',
    statusDot: 'bg-emerald-400 animate-pulse',
    metric: 'Priority Care',
    metricColor: 'text-emerald-300',
    icon: Accessibility,
    iconBg: 'bg-emerald-500/15',
    iconColor: 'text-emerald-400',
    borderHover: 'hover:border-emerald-400/40',
    path: '/disability-assistance',
    accentGlow: 'shadow-emerald-500/10',
  },
]

export default function QuickActions() {
  const navigate = useNavigate()

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {PASSENGER_SERVICES.map((srv) => {
        const Icon = srv.icon
        return (
          <div
            key={srv.id}
            onClick={() => navigate(srv.path)}
            className={`relative p-5 rounded-[20px] bg-[#0E1B2D] hover:bg-[#111f35] border border-white/8 ${srv.borderHover} cursor-pointer transition-all duration-200 shadow-lg hover:shadow-xl ${srv.accentGlow || ''} flex flex-col justify-between space-y-3 group hover:-translate-y-0.5 overflow-hidden`}
          >
            {/* Subtle top-right glow accent */}
            <div className="absolute top-0 right-0 w-24 h-24 opacity-10 rounded-full blur-2xl pointer-events-none bg-white" />

            {/* Top Row: Icon + Arrow */}
            <div className="flex items-start justify-between">
              <div className={`w-11 h-11 rounded-2xl ${srv.iconBg} border border-white/5 flex items-center justify-center group-hover:scale-110 transition-transform duration-200 shadow-sm`}>
                <Icon className={`w-5 h-5 ${srv.iconColor}`} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${srv.statusDot}`} />
                <ChevronRight className="w-4 h-4 text-[#94A3B8] group-hover:translate-x-0.5 group-hover:text-[#F8FAFC] transition-all" />
              </div>
            </div>

            {/* Middle: Title + Description */}
            <div>
              <h3 className="text-[15px] font-extrabold text-[#F8FAFC] tracking-tight leading-snug">{srv.title}</h3>
              <p className="text-[11px] text-[#94A3B8] mt-1 leading-relaxed">{srv.description}</p>
            </div>

            {/* Bottom: Status + Metric */}
            <div className="pt-2.5 border-t border-white/5 space-y-1">
              <div className={`text-[11px] font-bold ${srv.statusColor}`}>{srv.status}</div>
              <div className={`text-[11px] font-medium ${srv.metricColor} opacity-80`}>{srv.metric}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
