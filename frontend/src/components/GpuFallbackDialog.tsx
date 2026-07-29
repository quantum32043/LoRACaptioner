import { useEffect, useRef, useCallback } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

export default function GpuFallbackDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const trapFocus = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }, [])

  useEffect(() => {
    confirmRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      trapFocus(e)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel, trapFocus])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel} role="dialog" aria-modal="true" aria-labelledby="gpu-dialog-title">
      <div
        ref={dialogRef}
        className="bg-coal-900 border border-coal-700 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="gpu-dialog-title" className="font-display text-lg text-paper mb-3">CUDA not found</h3>
        <p className="font-mono text-sm text-paper-muted mb-6 leading-relaxed">
          No GPU (CUDA) found on your system. Auto-tagging will use the CPU — this may be significantly slower.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-mono text-paper-muted border border-coal-600 rounded-md hover:text-paper"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-mono bg-cyano text-coal-950 rounded-md font-semibold hover:bg-cyano/90"
          >
            Use CPU
          </button>
        </div>
      </div>
    </div>
  )
}
