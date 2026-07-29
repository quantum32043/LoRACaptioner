import { useRef, useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { RotateCw, FolderUp, Download, AlertTriangle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

const CHUNK_SIZE = 20

export default function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null)
  const setItems = useDatasetStore((s) => s.setItems)

  const { data: stats, refetch } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 30_000,
  })

  const total = stats?.total ?? 0
  const tagged = stats?.tagged ?? 0
  const untagged = stats?.untagged ?? 0
  const pct = total > 0 ? Math.floor((tagged / total) * 100) : 0
  const triggerCheckStats = useDatasetStore((s) => s.triggerCheckStats)
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const problemCount = triggerCheckStats ? triggerCheckStats.warnings.reduce((a, w) => a + w.count, 0) + triggerCheckStats.missing : 0

  const segments = 20
  const filled = Math.round((tagged / Math.max(total, 1)) * segments)
  const cyanoStart = filled >= segments ? 0 : Math.floor(segments * 0.7)

  const { mutate: doRescan, isPending: rescanning } = useMutation({
    mutationFn: api.rescan,
    onSuccess: () => refetch(),
  })

  const uploadFiles = useCallback(async (files: File[]) => {
    setUploading(true)
    setProgress({ current: 0, total: files.length })

    let totalSaved = 0
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE)
      const form = new FormData()
      chunk.forEach((f) => form.append('files', f))

      try {
        const res = await fetch('/api/dataset/upload-folder', { method: 'POST', body: form })
        const data = await res.json()
        totalSaved += data.saved || 0
      } catch {
        toast.error(`Error uploading files ${i + 1}-${i + chunk.length}`)
      }

      setProgress({ current: Math.min(i + CHUNK_SIZE, files.length), total: files.length })
    }

    const newData = await api.rescan()
    const itemsData = await api.getItems()
    setItems(itemsData.items, itemsData.total)
    refetch()
    setUploading(false)
    toast.success(`Uploaded ${totalSaved} files. Total in dataset: ${newData.total}`)
  }, [refetch, setItems])

  const handleFolderPick = useCallback(async () => {
    const fileList = inputRef.current?.files
    if (!fileList || fileList.length === 0) return

    const files = Array.from(fileList)

    if (total > 0) {
      setPendingFiles(files)
      return
    }

    await uploadFiles(files)
    inputRef.current!.value = ''
  }, [total, uploadFiles])

  const handleReplace = async () => {
    const files = pendingFiles
    setPendingFiles(null)
    if (!files) return
    try {
      await fetch('/api/dataset/clear', { method: 'POST' })
    } catch { /* ignore */ }
    await uploadFiles(files)
    inputRef.current!.value = ''
  }

  const handleAppend = async () => {
    const files = pendingFiles
    setPendingFiles(null)
    if (!files) return
    await uploadFiles(files)
    inputRef.current!.value = ''
  }

  const handleExport = async () => {
    setExporting(true)
    try { await api.exportDataset() } catch { /* ignore */ }
    setExporting(false)
  }

  const progressText = uploading ? `${progress.current}/${progress.total}` : ''

  return (
    <header className="flex items-center justify-between gap-2 px-3 md:px-4 h-14 border-b border-coal-700 bg-coal-900">
      <div className="flex items-center gap-2 md:gap-3 min-w-0">
        <h1 className="font-display text-sm md:text-lg tracking-wider text-safe truncate">LoRA Captioner</h1>
        <span className="text-paper-faint text-xs font-mono uppercase tracking-widest hidden sm:inline">v1.0</span>
      </div>

      <div className="flex items-center gap-2 md:gap-4 shrink-0">
        <div className="hidden md:flex items-center gap-4 text-sm font-mono">
          <span className="text-paper-muted">{total}</span>
          <span className="text-cyano">{tagged}</span>
          <span className="text-safe">{untagged}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-1.5 md:w-2 rounded-sm transition-colors ${
                i < filled
                  ? i >= cyanoStart ? 'bg-cyano' : 'bg-safe'
                  : 'bg-coal-600'
              }`}
            />
          ))}
          <span className="text-xs font-mono text-paper-muted ml-1 w-6 md:w-8 text-right">{pct}%</span>
        </div>

        {triggerWords.length > 0 && triggerCheckStats && problemCount > 0 && (
          <span className={`flex items-center gap-1 text-xs font-mono ${triggerCheckStats.missing > 0 ? 'text-ember' : 'text-safe'}`} aria-label={`${problemCount} trigger issues`}>
            {triggerCheckStats.missing > 0 ? <AlertCircle size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />}
            {problemCount}
          </span>
        )}

        <input ref={inputRef} type="file" {...{ webkitdirectory: '' }} multiple className="hidden" onChange={handleFolderPick} aria-label="Select folder with images" />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          aria-label="Open folder"
          className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-safe hover:text-safe/80 border border-safe/40 rounded-md disabled:opacity-50"
        >
          <FolderUp size={14} className={uploading ? 'animate-pulse' : ''} aria-hidden="true" />
          <span className="hidden md:inline">{uploading ? progressText : 'Open folder'}</span>
        </button>

        <button
          onClick={() => doRescan()}
          disabled={rescanning}
          aria-label="Rescan dataset"
          className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md disabled:opacity-50"
        >
          <RotateCw size={14} className={rescanning ? 'animate-spin' : ''} aria-hidden="true" />
          <span className="hidden md:inline">Rescan</span>
        </button>

        <button
          onClick={handleExport}
          disabled={exporting}
          aria-label="Export dataset"
          className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md disabled:opacity-50"
        >
          <Download size={14} className={exporting ? 'animate-pulse' : ''} aria-hidden="true" />
          <span className="hidden md:inline">{exporting ? '...' : 'Export'}</span>
        </button>
      </div>

      {pendingFiles && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setPendingFiles(null)}>
          <div className="bg-coal-900 border border-coal-700 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg text-paper mb-2">Dataset already open</h3>
            <p className="font-mono text-sm text-paper-muted mb-1">
              Current dataset has <span className="text-paper">{total}</span> files.
            </p>
            <p className="font-mono text-sm text-paper-muted mb-5">
              The selected folder contains <span className="text-paper">{pendingFiles.length}</span> files.
            </p>
            <div className="flex items-center justify-center gap-4">
              <button onClick={() => setPendingFiles(null)} className="px-5 py-2 text-xs font-mono text-paper-muted border border-coal-600 rounded-md hover:text-paper">Cancel</button>
              <button onClick={handleAppend} className="px-5 py-2 text-xs font-mono bg-coal-800 text-paper border border-coal-600 rounded-md hover:bg-coal-700">Append</button>
              <button onClick={handleReplace} className="px-5 py-2 text-xs font-mono bg-ember/20 text-ember border border-ember/50 rounded-md hover:bg-ember/30 font-semibold">Replace</button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}