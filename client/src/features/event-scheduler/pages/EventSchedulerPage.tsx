import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays,
  Clock,
  Bell,
  BellOff,
  Trash2,
  Plus,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  Info,
  CalendarCheck,
  Sparkles,
} from 'lucide-react'
import {
  addEvent,
  deleteEvent,
  loadEvents,
  initializeScheduler,
  type ScheduledEvent,
} from '../services/eventStore'
import {
  requestPermission,
  getPermissionState,
  registerInAppHandler,
  unregisterInAppHandler,
  type PermissionState,
} from '../services/notificationService'

// ── helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function timeFromNow(ts: number): string {
  const diff = ts - Date.now()
  if (diff <= 0) return 'Past'
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `in ${hrs} hr`
  const days = Math.floor(hrs / 24)
  return `in ${days} day${days > 1 ? 's' : ''}`
}

// Today's date in YYYY-MM-DD for the min attribute on the date input
function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

// Current time HH:MM (local) — used as the min for time when the date is today
function currentTimeStr(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── sub-components ────────────────────────────────────────────────────────────

function PermissionBanner({ state }: { state: PermissionState }) {
  if (state === 'granted') return null
  const isDenied = state === 'denied'
  const isUnsupported = state === 'unsupported'
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-start gap-3 p-4 rounded-2xl border text-sm ${
        isDenied || isUnsupported
          ? 'bg-red-500/10 border-red-500/25 text-red-400'
          : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
      }`}
    >
      {isDenied || isUnsupported ? (
        <BellOff className="w-5 h-5 shrink-0 mt-0.5" />
      ) : (
        <Bell className="w-5 h-5 shrink-0 mt-0.5" />
      )}
      <div className="flex-1">
        {isUnsupported ? (
          <span className="font-semibold">Your browser does not support notifications. Events are still saved locally.</span>
        ) : isDenied ? (
          <span className="font-semibold">Notifications blocked. Please allow them in your browser settings to receive event reminders.</span>
        ) : (
          <span>Notification permission not yet granted. <strong>Allow notifications</strong> to receive event reminders on time.</span>
        )}
      </div>
    </motion.div>
  )
}

interface EventCardProps {
  event: ScheduledEvent
  onDelete: (id: string) => void
}

function EventCard({ event, onDelete }: EventCardProps) {
  const isPast = event.scheduledAt <= Date.now()
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0, marginTop: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex items-center gap-4 p-4 rounded-2xl border ${
        isPast
          ? 'bg-white/3 border-white/8 opacity-50'
          : 'bg-[#0F1E35] border-white/10 hover:border-[#2F80FF]/40 transition-colors'
      }`}
    >
      {/* icon */}
      <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
        isPast ? 'bg-white/5 text-[#64748B]' : 'bg-[#2F80FF]/15 text-[#14C8FF]'
      }`}>
        <CalendarCheck className="w-5 h-5" />
      </div>

      {/* info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-[#F8FAFC] truncate">{event.name}</div>
        <div className="text-[11px] text-[#94A3B8] mt-0.5">{formatDateTime(event.scheduledAt)}</div>
        <div className={`text-[10px] font-semibold mt-1 ${isPast ? 'text-[#64748B]' : 'text-[#22C55E]'}`}>
          {isPast ? '✓ Elapsed' : `⏱ ${timeFromNow(event.scheduledAt)}`}
        </div>
      </div>

      {/* delete */}
      <button
        onClick={() => onDelete(event.id)}
        aria-label="Delete event"
        className="w-9 h-9 rounded-xl flex items-center justify-center text-[#64748B] hover:bg-red-500/15 hover:text-red-400 transition-all shrink-0"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </motion.div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function EventSchedulerPage() {
  const navigate = useNavigate()
  const location = useLocation()

  // Initial values from state if navigated by AI Agent
  const initialName = location.state?.eventName || ''
  
  let initialDate = ''
  let initialTime = ''
  if (location.state?.eventTime) {
    try {
      const dt = new Date(location.state.eventTime)
      if (!isNaN(dt.getTime())) {
        initialDate = dt.toISOString().split('T')[0]
        initialTime = dt.toTimeString().slice(0, 5)
      }
    } catch (e) {}
  }

  // form state
  const [name, setName]       = useState(initialName)
  const [date, setDate]       = useState(initialDate)
  const [time, setTime]       = useState(initialTime)

  // events
  const [events, setEvents]   = useState<ScheduledEvent[]>([])

  // UI state
  const [permState, setPermState]   = useState<PermissionState>('default')
  const [toast, setToast]           = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [saving, setSaving]         = useState(false)

  // in-app notification state
  const [activeAlert, setActiveAlert] = useState<string | null>(null)

  // ── on mount ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    initializeScheduler()
    setEvents(loadEvents().sort((a, b) => a.scheduledAt - b.scheduledAt))
    setPermState(getPermissionState())

    registerInAppHandler((eventName) => {
      setActiveAlert(eventName)
      // also auto-refresh the event list so the UI moves it to 'Past'
      setEvents(loadEvents().sort((a, b) => a.scheduledAt - b.scheduledAt))
    })

    return () => unregisterInAppHandler()
  }, [])

  // auto-dismiss toast
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  // ── permission request ────────────────────────────────────────────────────────
  async function ensurePermission(): Promise<boolean> {
    if (getPermissionState() === 'granted') return true
    const result = await requestPermission()
    setPermState(result)
    return result === 'granted'
  }

  // ── save handler ──────────────────────────────────────────────────────────────
  async function handleSave() {
    // Validation
    if (!name.trim()) { setToast({ type: 'error', msg: 'Please enter an event name.' }); return }
    if (!date)        { setToast({ type: 'error', msg: 'Please select a date.' }); return }
    if (!time)        { setToast({ type: 'error', msg: 'Please select a time.' }); return }

    const scheduledAt = new Date(`${date}T${time}`).getTime()
    if (isNaN(scheduledAt)) { setToast({ type: 'error', msg: 'Invalid date/time combination.' }); return }
    if (scheduledAt <= Date.now()) {
      setToast({ type: 'error', msg: 'Please choose a future date and time.' })
      return
    }

    setSaving(true)
    await ensurePermission()

    const event = addEvent(name.trim(), scheduledAt)
    setEvents(prev => [...prev, event].sort((a, b) => a.scheduledAt - b.scheduledAt))

    // reset form
    setName(''); setDate(''); setTime('')
    setToast({ type: 'success', msg: `"${event.name}" scheduled for ${formatDateTime(scheduledAt)}` })
    setSaving(false)
  }

  // ── delete handler ────────────────────────────────────────────────────────────
  const handleDelete = useCallback((id: string) => {
    deleteEvent(id)
    setEvents(prev => prev.filter(e => e.id !== id))
    setToast({ type: 'success', msg: 'Event cancelled and removed.' })
  }, [])

  const upcoming = events.filter(e => e.scheduledAt > Date.now())
  const past     = events.filter(e => e.scheduledAt <= Date.now())

  // ── render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#06121F] flex flex-col">
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-2 pb-8 space-y-6">

        {/* ── Page title ── */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-[#94A3B8] hover:text-[#F8FAFC] transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-[#F8FAFC] tracking-tight">Event Scheduler</h1>
            <p className="text-xs text-[#94A3B8]">Schedule events and get notified at the exact time</p>
          </div>
          <div className="ml-auto w-11 h-11 rounded-2xl bg-[#2F80FF]/15 border border-[#2F80FF]/20 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-[#14C8FF]" />
          </div>
        </div>

        {/* ── Permission banner ── */}
        <PermissionBanner state={permState} />

        {/* ── Create Event Form ── */}
        <div className="p-6 rounded-[24px] bg-[#0F1E35] border border-white/10 space-y-5 shadow-xl shadow-black/20">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#14C8FF]" />
            <span className="text-sm font-extrabold text-[#F8FAFC]">New Event</span>
          </div>

          {/* Event name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Event Name
            </label>
            <input
              id="event-name-input"
              type="text"
              placeholder="e.g. Boarding Gate Opens, Flight Check-in…"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={80}
              className="w-full bg-[#162742] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#2F80FF]/60 transition-all"
            />
          </div>

          {/* Date + Time row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" /> Date
              </label>
              <input
                id="event-date-input"
                type="date"
                min={todayStr()}
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-[#162742] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2F80FF]/60 transition-all [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Time
              </label>
              <input
                id="event-time-input"
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full bg-[#162742] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#F8FAFC] focus:outline-none focus:ring-2 focus:ring-[#2F80FF]/60 transition-all [color-scheme:dark]"
              />
            </div>
          </div>

          {/* Preview */}
          {date && time && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-4 py-2.5 bg-[#2F80FF]/10 border border-[#2F80FF]/25 rounded-xl"
            >
              <Info className="w-4 h-4 text-[#14C8FF] shrink-0" />
              <span className="text-xs text-[#94A3B8]">
                Notification will fire on{' '}
                <strong className="text-[#F8FAFC]">
                  {formatDateTime(new Date(`${date}T${time}`).getTime())}
                </strong>
              </span>
            </motion.div>
          )}

          {/* Save button */}
          <button
            id="save-event-btn"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3.5 rounded-2xl font-black text-sm bg-gradient-to-r from-[#2F80FF] to-[#14C8FF] hover:from-blue-500 hover:to-cyan-400 text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Scheduling…' : 'Save Event'}
          </button>
        </div>

        {/* ── Toast ── */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className={`fixed bottom-28 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold border ${
                toast.type === 'success'
                  ? 'bg-[#0F1E35] border-emerald-400/30 text-emerald-400'
                  : 'bg-[#0F1E35] border-red-400/30 text-red-400'
              }`}
            >
              {toast.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <AlertTriangle className="w-4 h-4 shrink-0" />
              }
              <span>{toast.msg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Upcoming Events ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#14C8FF]" />
              <h2 className="text-sm font-extrabold text-[#F8FAFC]">Upcoming Events</h2>
              {upcoming.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-[#2F80FF]/20 text-[#14C8FF] text-[10px] font-bold border border-[#2F80FF]/25">
                  {upcoming.length}
                </span>
              )}
            </div>
          </div>

          {upcoming.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3 text-center border border-white/5 rounded-2xl bg-white/2">
              <div className="w-14 h-14 rounded-2xl bg-[#0F1E35] border border-white/8 flex items-center justify-center text-2xl">
                📅
              </div>
              <div className="text-sm font-semibold text-[#94A3B8]">No upcoming events</div>
              <p className="text-xs text-[#64748B] max-w-[220px]">
                Create your first event above and we'll notify you exactly on time.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {upcoming.map(ev => (
                <EventCard key={ev.id} event={ev} onDelete={handleDelete} />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* ── Past Events ── */}
        {past.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#64748B]" />
              <h2 className="text-sm font-bold text-[#64748B]">Past Events</h2>
              <span className="px-2 py-0.5 rounded-full bg-white/5 text-[#64748B] text-[10px] font-bold border border-white/8">
                {past.length}
              </span>
            </div>
            <AnimatePresence mode="popLayout">
              {past.map(ev => (
                <EventCard key={ev.id} event={ev} onDelete={handleDelete} />
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* ── How it works ── */}
        <div className="p-5 rounded-2xl bg-[#0F1E35] border border-white/8 space-y-3">
          <div className="text-xs font-extrabold text-[#64748B] uppercase tracking-widest">How It Works</div>
          <div className="space-y-2.5">
            {[
              { icon: '🔔', text: 'Allow notifications when prompted by your browser.' },
              { icon: '📅', text: 'Enter an event name, pick a future date and time, then tap Save.' },
              { icon: '⏱', text: 'A notification fires at exactly that date/time — even if you switch tabs.' },
              { icon: '🗑', text: 'Tap the trash icon to cancel an event and its notification anytime.' },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-xs text-[#94A3B8]">
                <span className="text-base leading-none">{item.icon}</span>
                <span>{item.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── In-App Alert Overlay ── */}
        <AnimatePresence>
          {activeAlert && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="fixed top-20 left-4 right-4 z-50 flex items-center gap-4 p-5 rounded-[24px] bg-gradient-to-r from-[#0F1E35] to-[#162742] border border-[#2F80FF]/30 shadow-2xl shadow-blue-900/40"
            >
              <div className="w-12 h-12 rounded-full bg-[#2F80FF]/20 flex items-center justify-center shrink-0 animate-pulse">
                <Bell className="w-6 h-6 text-[#14C8FF]" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold uppercase tracking-widest text-[#14C8FF] mb-0.5">Event Reminder</div>
                <div className="text-base font-extrabold text-white">{activeAlert} is happening now.</div>
              </div>
              <button
                onClick={() => setActiveAlert(null)}
                className="px-4 py-2 bg-[#2F80FF] hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-colors shrink-0"
              >
                Dismiss
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  )
}
