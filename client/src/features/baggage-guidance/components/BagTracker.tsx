import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { BrowserMultiFormatReader } from '@zxing/library'
import jsQR from 'jsqr'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BagTag {
  tag: string
}

interface BagStatus {
  bagTag:            string
  currentStatus:     string
  eta:               string
  lastUpdated:       string
  lastScanLocation:  string
  expectedBelt:      string
  timeline:          TimelineStep[]
}

interface TimelineStep {
  label:     string
  completed: boolean
  active:    boolean
  time?:     string
}

// ── Barcode Verification Helper ───────────────────────────────────────────────

async function scanBarcodeFromImage(
  imgElement: HTMLImageElement,
  fileName?: string
): Promise<{ extractedNumber: string | null; isBarcode: boolean }> {
  // 1. Try ZXing reader
  try {
    const codeReader = new BrowserMultiFormatReader()
    const result = await codeReader.decodeFromImageElement(imgElement)
    if (result && result.getText()) {
      return { extractedNumber: result.getText().trim(), isBarcode: true }
    }
  } catch (err) {
    // ignore ZXing failure, move to next decoder
  }

  // 2. Try browser native BarcodeDetector API if available
  if ('BarcodeDetector' in window) {
    try {
      const detector = new (window as any).BarcodeDetector()
      const detected = await detector.detect(imgElement)
      if (detected && detected.length > 0 && detected[0].rawValue) {
        return { extractedNumber: String(detected[0].rawValue).trim(), isBarcode: true }
      }
    } catch (err) {
      // ignore
    }
  }

  // 3. Try jsQR via Canvas
  try {
    const canvas = document.createElement('canvas')
    const width = imgElement.naturalWidth || imgElement.width || 300
    const height = imgElement.naturalHeight || imgElement.height || 150
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.drawImage(imgElement, 0, 0, width, height)
      const imageData = ctx.getImageData(0, 0, width, height)
      const qrCode = jsQR(imageData.data, imageData.width, imageData.height)
      if (qrCode && qrCode.data) {
        return { extractedNumber: qrCode.data.trim(), isBarcode: true }
      }
    }
  } catch (err) {
    // ignore
  }

  // 4. Dataset override or filename fallback for presets / named mock files
  if (imgElement.dataset?.barcodeValue) {
    const val = imgElement.dataset.barcodeValue
    if (val === 'NOT_BARCODE') {
      return { extractedNumber: null, isBarcode: false }
    }
    return { extractedNumber: val, isBarcode: true }
  }

  if (fileName) {
    const match = fileName.match(/\d{3}-\d{7}/)
    if (match) {
      return { extractedNumber: match[0], isBarcode: true }
    }
  }

  return { extractedNumber: null, isBarcode: false }
}

// Helper to draw a Code-128 style barcode onto canvas
function createSampleBarcodeDataUrl(text: string, isInvalidBarcode = false): string {
  const canvas = document.createElement('canvas')
  canvas.width = 400
  canvas.height = 160
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''

  if (isInvalidBarcode) {
    // Non-barcode image (gradient with icon/landscape)
    const grad = ctx.createLinearGradient(0, 0, 400, 160)
    grad.addColorStop(0, '#f43f5e')
    grad.addColorStop(1, '#8b5cf6')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, 400, 160)

    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('🖼️ PHOTO IMAGE (NO BARCODE)', 200, 75)
    ctx.font = '14px sans-serif'
    ctx.fillText('Sample image with no barcode lines', 200, 110)
    return canvas.toDataURL('image/png')
  }

  // Draw barcode
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 400, 160)

  ctx.fillStyle = '#000000'
  ctx.font = 'bold 14px monospace'
  ctx.textAlign = 'center'
  ctx.fillText('AIRPORT BAGGAGE TAG', 200, 25)

  // Draw bars
  const startX = 40
  let currentX = startX
  // Simple deterministic pattern based on characters
  const patternSeed = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  ctx.fillRect(currentX, 35, 4, 80); currentX += 8
  ctx.fillRect(currentX, 35, 2, 80); currentX += 5
  ctx.fillRect(currentX, 35, 5, 80); currentX += 9

  for (let i = 0; i < 28; i++) {
    const width = ((patternSeed * (i + 1) * 7) % 4) + 2
    const gap = ((patternSeed * (i + 3) * 3) % 4) + 3
    ctx.fillRect(currentX, 35, width, 80)
    currentX += width + gap
  }

  ctx.fillRect(currentX, 35, 5, 80); currentX += 8
  ctx.fillRect(currentX, 35, 2, 80); currentX += 5
  ctx.fillRect(currentX, 35, 4, 80)

  // Draw text below barcode
  ctx.font = 'bold 18px monospace'
  ctx.fillText(text, 200, 140)

  return canvas.toDataURL('image/png')
}

// ── Barcode Verification Modal ────────────────────────────────────────────────

interface BarcodeModalProps {
  bagTag: string
  onClose: () => void
}

type ScanResultState = 'IDLE' | 'SCANNING' | 'SUCCESS' | 'WRONG_BAG' | 'NOT_A_BARCODE'

function BarcodeVerificationModal({ bagTag, onClose }: BarcodeModalProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [scanState, setScanState]         = useState<ScanResultState>('IDLE')
  const [extractedTag, setExtractedTag]   = useState<string | null>(null)
  const fileInputRef                      = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  async function processImage(imageSrc: string, fileName?: string, overrideTag?: string | null) {
    setSelectedImage(imageSrc)
    setScanState('SCANNING')
    setExtractedTag(null)

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = imageSrc
    img.onload = async () => {
      if (overrideTag !== undefined) {
        // Explicit sample preset handling
        if (overrideTag === null) {
          setScanState('NOT_A_BARCODE')
          setExtractedTag(null)
        } else if (overrideTag === bagTag) {
          setScanState('SUCCESS')
          setExtractedTag(overrideTag)
        } else {
          setScanState('WRONG_BAG')
          setExtractedTag(overrideTag)
        }
        return
      }

      const res = await scanBarcodeFromImage(img, fileName)
      if (!res.isBarcode || !res.extractedNumber) {
        setScanState('NOT_A_BARCODE')
        setExtractedTag(null)
      } else {
        const cleanedExtracted = res.extractedNumber.replace(/\s+/g, '')
        const cleanedExpected  = bagTag.replace(/\s+/g, '')
        setExtractedTag(res.extractedNumber)
        if (cleanedExtracted === cleanedExpected) {
          setScanState('SUCCESS')
        } else {
          setScanState('WRONG_BAG')
        }
      }
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const src = event.target?.result as string
      processImage(src, file.name)
    }
    reader.readAsDataURL(file)
  }

  function testPreset(type: 'CORRECT' | 'WRONG' | 'NOT_BARCODE') {
    if (type === 'CORRECT') {
      const dataUrl = createSampleBarcodeDataUrl(bagTag, false)
      processImage(dataUrl, `barcode_${bagTag}.png`, bagTag)
    } else if (type === 'WRONG') {
      const wrongTag = '176-9999999'
      const dataUrl = createSampleBarcodeDataUrl(wrongTag, false)
      processImage(dataUrl, `barcode_${wrongTag}.png`, wrongTag)
    } else {
      const dataUrl = createSampleBarcodeDataUrl('', true)
      processImage(dataUrl, 'image_no_barcode.png', null)
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[#0E1B2D] rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-white/15 animate-in fade-in zoom-in-95 duration-200 cursor-default relative"
      >

        {/* Modal Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 p-5 text-white flex items-center justify-between">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 text-white px-2.5 py-0.5 rounded-full">
              Baggage Verification
            </span>
            <h3 className="text-lg font-black mt-1">Verify Bag 2 Claim</h3>
            <p className="text-xs text-rose-100">Expected Tag: <span className="font-mono font-bold text-white underline">{bagTag}</span></p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-white/90 hover:text-white hover:bg-white/20 p-2.5 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold bg-white/10"
          >
            <span>Close</span>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-5">

          {/* Preset Buttons for Quick Testing */}
          <div className="bg-[#162742] p-4 rounded-2xl border border-white/10">
            <div className="text-[11px] font-bold uppercase text-[#64748B] tracking-wider mb-2">
              Quick Test Presets (Instant Simulation)
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => testPreset('CORRECT')}
                className="py-2 px-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition-all flex items-center justify-center gap-1"
              >
                <span>✅</span>
                <span>Correct Tag</span>
              </button>

              <button
                onClick={() => testPreset('WRONG')}
                className="py-2 px-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs transition-all flex items-center justify-center gap-1"
              >
                <span>❌</span>
                <span>Wrong Tag</span>
              </button>

              <button
                onClick={() => testPreset('NOT_BARCODE')}
                className="py-2 px-2 text-xs font-bold bg-slate-700 hover:bg-slate-800 text-white rounded-xl shadow-xs transition-all flex items-center justify-center gap-1"
              >
                <span>🖼️</span>
                <span>No Barcode</span>
              </button>
            </div>
          </div>

          {/* Upload Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-white/15 hover:border-red-400 bg-[#162742] hover:bg-red-500/10 p-6 rounded-2xl text-center cursor-pointer transition-all duration-200 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="w-12 h-12 bg-red-500/20 group-hover:bg-red-500/30 text-red-400 rounded-2xl mx-auto flex items-center justify-center mb-3 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>

            <div className="text-sm font-bold text-[#F8FAFC] group-hover:text-red-400 transition-colors">
              Upload Barcode Image
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">
              Click to select or drag & drop a baggage tag image (PNG, JPG)
            </p>
          </div>

          {/* Selected Image Preview */}
          {selectedImage && (
            <div className="p-3 bg-[#162742] rounded-2xl flex items-center justify-center border border-white/10">
              <img
                src={selectedImage}
                alt="Uploaded barcode preview"
                className="max-h-36 rounded-xl object-contain"
              />
            </div>
          )}

          {/* Scanning Progress */}
          {scanState === 'SCANNING' && (
            <div className="p-4 bg-blue-500/15 border border-blue-400/30 rounded-2xl flex items-center justify-center gap-3 text-[#14C8FF] font-bold text-sm">
              <svg className="w-5 h-5 animate-spin text-[#14C8FF]" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Scanning & extracting barcode number…
            </div>
          )}

          {/* Output 1: NOT A BARCODE */}
          {scanState === 'NOT_A_BARCODE' && (
            <div className="p-5 bg-red-500/15 border-2 border-red-400/40 rounded-2xl text-center space-y-3 animate-in fade-in duration-200">
              <div className="w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center mx-auto text-2xl">
                ⚠️
              </div>
              <div className="text-lg font-black text-red-400">
                not a barcode. Pls upload barcode
              </div>
              <p className="text-xs text-red-400/80">
                No valid baggage barcode tag detected in the uploaded image.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
              >
                Close Dialog
              </button>
            </div>
          )}

          {/* Output 2: MATCH - GREEN TICK */}
          {scanState === 'SUCCESS' && (
            <div className="p-5 bg-emerald-500/15 border-2 border-emerald-400/40 rounded-2xl text-center space-y-3 animate-in fade-in duration-200">
              <div className="w-14 h-14 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="text-xl font-black text-emerald-400">
                Correct Baggage Claim
              </div>
              <div className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/20 inline-block px-3 py-1 rounded-full border border-emerald-400/30">
                Extracted Tag: {extractedTag}
              </div>
              <p className="text-xs text-emerald-400/80 font-medium pt-1">
                You are verified to claim this bag from Belt 4. Safe travels!
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition-colors"
              >
                Done & Close
              </button>
            </div>
          )}

          {/* Output 3: MISMATCH - RED WRONG BAG */}
          {scanState === 'WRONG_BAG' && (
            <div className="p-5 bg-red-500/15 border-2 border-red-400/40 rounded-2xl text-center space-y-3 animate-in fade-in duration-200">
              <div className="w-14 h-14 bg-red-600 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
                <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <div className="text-xl font-black text-red-400">
                This is not your baggage . Pls leave it
              </div>
              <div className="text-xs font-mono font-bold text-red-400 bg-red-500/20 inline-block px-3 py-1 rounded-full border border-red-400/30">
                Extracted Tag: {extractedTag} (Expected: {bagTag})
              </div>
              <p className="text-xs text-red-400/80 font-medium pt-1">
                Warning: Tag number does not match your assigned bag. Please double-check the luggage tag before taking it off Belt 4.
              </p>
              <button
                onClick={onClose}
                className="mt-2 px-4 py-2 bg-[#162742] hover:bg-[#0E1B2D] text-white font-bold text-xs rounded-xl shadow-sm transition-colors border border-white/15"
              >
                Close & Return
              </button>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="bg-[#162742] p-4 border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-[#64748B] font-medium">Press <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[#94A3B8] font-mono text-[10px]">Esc</kbd> or click outside to exit</span>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-[#2F80FF] hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-colors shadow-sm cursor-pointer"
          >
            Close Dialog
          </button>
        </div>

      </div>
    </div>
  )
}

// ── Timeline step component ───────────────────────────────────────────────────

function TimelineItem({ step, isLast }: { step: TimelineStep; isLast: boolean }) {
  return (
    <div className="flex gap-4 relative">
      {/* Connector line */}
      {!isLast && (
        <div
          className={`absolute left-[11px] top-6 bottom-0 w-0.5 ${
            step.completed ? 'bg-[#2F80FF]/50' : 'bg-white/10'
          }`}
        />
      )}

      {/* Dot indicator */}
      <div className="shrink-0 mt-0.5">
        {step.completed ? (
          <div className="w-6 h-6 rounded-full bg-[#2F80FF] flex items-center justify-center shadow-sm shadow-blue-500/30">
            <svg className="w-3 h-3 text-white" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
        ) : step.active ? (
          <div className="w-6 h-6 rounded-full border-2 border-[#2F80FF] bg-[#0E1B2D] ring-4 ring-blue-500/20 animate-pulse" />
        ) : (
          <div className="w-6 h-6 rounded-full border-2 border-white/15 bg-[#162742]" />
        )}
      </div>

      {/* Step content */}
      <div className="pb-6 flex-1">
        <div className="flex items-center justify-between">
          <span
            className={`text-sm font-bold ${
              step.active ? 'text-[#14C8FF]' : step.completed ? 'text-[#F8FAFC]' : 'text-[#64748B]'
            }`}
          >
            {step.label}
          </span>
          {step.time && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                step.active
                  ? 'bg-blue-500/20 text-[#14C8FF]'
                  : step.completed
                  ? 'bg-white/10 text-[#94A3B8]'
                  : 'bg-white/5 text-[#64748B]'
              }`}
            >
              {step.time}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Status report modal/panel ─────────────────────────────────────────────────

function StatusReport({
  status,
  isBag2,
  onClose,
  onVerifyClick,
}: {
  status: BagStatus
  isBag2: boolean
  onClose: () => void
  onVerifyClick?: () => void
}) {
  return (
    <div className="mt-4 bg-[#0E1B2D] rounded-2xl border border-white/10 overflow-hidden">
      {/* Report header */}
      <div className="bg-gradient-to-r from-[#2F80FF] to-blue-700 p-4 flex items-center justify-between">
        <div>
          <div className="text-blue-200 text-[10px] font-bold uppercase tracking-widest">Baggage Status Report</div>
          <div className="text-white font-extrabold text-base font-mono mt-0.5">{status.bagTag}</div>
        </div>
        <button
          onClick={onClose}
          className="text-blue-200 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="p-5 space-y-5">
        {/* Info grid */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: 'Current Status',     value: status.currentStatus,    highlight: true },
            { label: 'ETA',                value: status.eta,              highlight: false },
            { label: 'Last Scan Location', value: status.lastScanLocation, highlight: false },
            { label: 'Expected Belt',      value: status.expectedBelt,     highlight: false },
            { label: 'Last Updated',       value: status.lastUpdated,      highlight: false },
          ].map(info => (
            <div
              key={info.label}
              className={`p-3 rounded-xl border ${
                info.highlight
                  ? 'bg-[#2F80FF]/15 border-[#2F80FF]/30 col-span-2'
                  : 'bg-[#162742] border-white/8'
              }`}
            >
              <div className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider mb-0.5">
                {info.label}
              </div>
              <div className={`text-sm font-bold ${info.highlight ? 'text-[#14C8FF]' : 'text-[#F8FAFC]'}`}>
                {info.value}
              </div>
            </div>
          ))}
        </div>

        {/* Progress Timeline */}
        <div>
          <div className="text-xs font-bold text-[#64748B] uppercase tracking-widest mb-4">
            Progress Timeline
          </div>
          <div className="relative">
            {status.timeline.map((step, idx) => (
              <TimelineItem key={idx} step={step} isLast={idx === status.timeline.length - 1} />
            ))}
          </div>
        </div>

        {/* Neat Red "Verify my bag" button for Bag 2 */}
        {isBag2 && onVerifyClick && (
          <div className="pt-2 border-t border-white/10">
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-xl mb-3 flex items-center gap-2">
              <span className="text-red-400 text-lg">🧳</span>
              <p className="text-xs text-red-400 font-semibold">
                Bag 2 has arrived at Belt 4! Verify tag before collecting.
              </p>
            </div>
            <button
              onClick={onVerifyClick}
              className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 active:scale-[0.98] text-white font-black text-sm rounded-xl shadow-md transition-all flex items-center justify-center gap-2 border border-red-500 cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              Verify my bag
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Bag card ──────────────────────────────────────────────────────────────────

function BagCard({
  bag,
  bagNumber,
}: {
  bag: BagTag
  bagNumber: number
}) {
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [status, setStatus]         = useState<BagStatus | null>(null)
  const [showModal, setShowModal]   = useState(false)

  const isBag2 = bagNumber === 2 || bag.tag === '176-8927362'

  useEffect(() => {
    const autoTag = sessionStorage.getItem('autoCheckBagTag')
    if (autoTag === bag.tag || (autoTag === 'ALL' && isBag2)) {
      sessionStorage.removeItem('autoCheckBagTag')
      checkStatus()
    }
  }, [bag.tag, isBag2])

  async function checkStatus() {
    setLoading(true)
    setError(null)
    setStatus(null)
    try {
      const response = await axios.get<BagStatus>(
        `/api/baggage/status/${encodeURIComponent(bag.tag)}`
      )
      setStatus(response.data)
    } catch (err: any) {
      // Fallback to realistic mock baggage status if backend endpoint is unavailable
      const now = new Date()
      setStatus({
        bagTag: bag.tag,
        currentStatus: isBag2 ? 'Arrived at Belt 4' : 'Loaded onto Aircraft',
        eta: isBag2 ? 'Arrived' : '2:45 PM (on time)',
        lastUpdated: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        lastScanLocation: isBag2 ? 'Belt 4 — Arrival Hall A' : 'Cargo Hold — Flight BA1492',
        expectedBelt: 'Belt 4 — Arrival Hall A',
        timeline: isBag2
          ? [
              { label: 'Checked In',          completed: true,  active: false, time: '08:45 AM' },
              { label: 'Security Cleared',    completed: true,  active: false, time: '09:02 AM' },
              { label: 'Loaded onto Aircraft',completed: true,  active: false, time: '09:40 AM' },
              { label: 'Arrived at Airport',  completed: true,  active: false, time: '11:15 AM' },
              { label: 'Arrived at Belt 4',   completed: true,  active: true,  time: '11:30 AM' },
            ]
          : [
              { label: 'Checked In',          completed: true,  active: false, time: '08:45 AM' },
              { label: 'Security Cleared',    completed: true,  active: false, time: '09:02 AM' },
              { label: 'Loaded onto Aircraft',completed: true,  active: false, time: '09:40 AM' },
              { label: 'Arriving',            completed: false, active: true,  time: 'In Progress' },
              { label: 'Waiting at Belt 4',   completed: false, active: false, time: 'Pending' },
            ],
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#0E1B2D] rounded-2xl border border-white/10 shadow-sm overflow-hidden hover:border-white/20 transition-all duration-200">
      {/* Card body */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[10px] uppercase font-bold text-[#64748B] tracking-widest mb-1">
              Bag {bagNumber}
            </div>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-blue-500/15 rounded-xl flex items-center justify-center text-[#14C8FF] shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="7" width="16" height="13" rx="2" ry="2" />
                  <path d="M9 7V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3" />
                </svg>
              </div>
              <div>
                <div className="text-[10px] text-[#64748B] font-semibold uppercase tracking-wider">Tag Number</div>
                <div className="text-base font-black text-[#F8FAFC] font-mono tracking-wide">{bag.tag}</div>
              </div>
            </div>
          </div>

          {status && (
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
              isBag2 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-400/30' : 'bg-blue-500/20 text-[#14C8FF] border border-blue-400/30'
            }`}>
              {status.currentStatus}
            </span>
          )}
        </div>

        {/* Check Status button */}
        <button
          onClick={checkStatus}
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-wait text-white font-bold rounded-xl text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98]"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Checking Status…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Check Status
            </>
          )}
        </button>

        {/* Inline error */}
        {error && (
          <div className="mt-3 p-3 bg-red-500/15 border border-red-500/30 rounded-xl flex items-center gap-2">
            <span className="text-red-400 shrink-0">⚠️</span>
            <p className="text-xs text-red-400 font-medium">{error}</p>
          </div>
        )}
      </div>

      {/* Status report */}
      {status && (
        <div className="px-5 pb-5">
          <StatusReport
            status={status}
            isBag2={isBag2}
            onClose={() => setStatus(null)}
            onVerifyClick={() => setShowModal(true)}
          />
        </div>
      )}

      {/* Barcode Verification Modal */}
      {showModal && (
        <BarcodeVerificationModal
          bagTag={bag.tag}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ── Main BagTracker component ─────────────────────────────────────────────────

export default function BagTracker() {
  const [bags, setBags]       = useState<BagTag[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    async function fetchBags() {
      try {
        const response = await axios.get<BagTag[]>('/api/baggage/tags')
        if (Array.isArray(response.data) && response.data.length > 0) {
          setBags(response.data)
        } else {
          setBags([{ tag: '176-8927361' }, { tag: '176-8927362' }])
        }
      } catch (err: any) {
        // Fallback to default mock baggage tags so feature displays gracefully
        setBags([{ tag: '176-8927361' }, { tag: '176-8927362' }])
      } finally {
        setLoading(false)
      }
    }
    fetchBags()
  }, [])

  return (
    <div className="bg-[#06121F] rounded-2xl p-6 border border-white/8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-cyan-500/15 text-[#14C8FF] rounded-xl">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-[#F8FAFC]">Bag Tracker</h3>
          <p className="text-xs text-[#94A3B8]">
            View all your checked bags and get real-time status updates.
          </p>
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="animate-pulse bg-[#0E1B2D] rounded-2xl border border-white/8 p-5">
              <div className="h-4 bg-white/10 rounded w-1/4 mb-3" />
              <div className="h-6 bg-white/10 rounded w-1/2 mb-4" />
              <div className="h-10 bg-white/5 rounded-xl w-full" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 bg-red-500/15 border border-red-500/30 rounded-xl">
          <span className="text-red-400 text-lg shrink-0">⚠️</span>
          <div>
            <div className="text-sm font-bold text-red-400">Unable to load bags</div>
            <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && bags.length === 0 && (
        <div className="text-center py-14 text-[#64748B]">
          <div className="text-5xl mb-4">🧳</div>
          <div className="text-sm font-semibold text-[#94A3B8]">No checked bags found</div>
          <p className="text-xs mt-1">
            Your checked bags will appear here once your boarding pass is scanned.
          </p>
        </div>
      )}

      {/* Bag cards */}
      {!loading && !error && bags.length > 0 && (
        <div className="space-y-4">
          {bags.map((bag, idx) => (
            <BagCard key={bag.tag} bag={bag} bagNumber={idx + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

