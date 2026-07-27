import { useEffect, useRef } from 'react'

export default function GpuFallbackDialog({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onCancel}>
      <div
        className="bg-coal-900 border border-coal-700 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-display text-lg text-paper mb-3">CUDA не обнаружена</h3>
        <p className="font-mono text-sm text-paper-muted mb-6 leading-relaxed">
          На вашей системе не найден GPU (CUDA). Авто-тегирование будет работать на CPU — это может быть значительно медленнее.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-mono text-paper-muted border border-coal-600 rounded-md hover:text-paper"
          >
            Отмена
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className="px-4 py-2 text-xs font-mono bg-cyano text-coal-950 rounded-md font-semibold hover:bg-cyano/90"
          >
            Использовать CPU
          </button>
        </div>
      </div>
    </div>
  )
}
