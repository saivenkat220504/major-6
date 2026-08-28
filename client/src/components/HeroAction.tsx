import React, { useRef, useState } from 'react'
import { Scan, AlertTriangle, RefreshCw, Upload } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { decodeBarcodeImage } from '../features/boarding-pass/utils/barcodeDecoder'

export default function HeroAction() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const handleUploadClick = () => {
    setError(null)
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Reset so same file can be re-selected
    e.target.value = ''

    setIsProcessing(true)
    setError(null)

    try {
      const data = await decodeBarcodeImage(file)
      // Store in sessionStorage so data is forgotten when the browser is closed
      sessionStorage.setItem('boardingData', JSON.stringify(data))
      navigate('/boarding-pass', { state: { boardingData: data } })
    } catch (err: any) {
      setError(err.message || 'Failed to decode PDF417 boarding pass barcode')
    } finally {
      setIsProcessing(false)
    }
  }

  // ── Error state ──────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 rounded-full flex items-center justify-center">
          <AlertTriangle size={30} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
          {error}
        </p>
        <button
          onClick={handleUploadClick}
          className="flex items-center gap-2 px-6 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-semibold rounded-xl transition-all"
        >
          <RefreshCw size={18} />
          Try Again
        </button>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      </div>
    )
  }

  // ── Default: single prominent button ────────────────────────
  return (
    <div className="flex flex-col items-center">
      {/* Hidden file input */}
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        id="upload-ticket-btn"
        onClick={handleUploadClick}
        disabled={isProcessing}
        className="group relative w-full max-w-xs py-5 px-8 bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 hover:from-sky-400 hover:via-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl shadow-2xl shadow-blue-500/40 hover:shadow-blue-500/60 transition-all duration-300 flex flex-col items-center gap-3 transform active:scale-[0.97] disabled:opacity-70 disabled:cursor-not-allowed overflow-hidden"
      >
        {/* Animated background shimmer */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />

        {isProcessing ? (
          <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <div className="relative w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
            <Scan size={30} strokeWidth={1.8} />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-white/30 rounded-full flex items-center justify-center">
              <Upload size={12} />
            </div>
          </div>
        )}

        <span className="text-lg tracking-wide">
          {isProcessing ? 'Processing…' : 'Scan Boarding Pass Barcode'}
        </span>
      </button>
    </div>
  )
}
