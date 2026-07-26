import { useRef } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { RotateCw, FolderUp } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api/client'

export default function TopBar() {
  const inputRef = useRef<HTMLInputElement>(null)
  const { data: stats, refetch } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
    refetchInterval: 30_000,
  })

  const total = stats?.total ?? 0
  const tagged = stats?.tagged ?? 0
  const untagged = stats?.untagged ?? 0
  const pct = total > 0 ? Math.round((tagged / total) * 100) : 0

  const segments = 20
  const filled = Math.round((tagged / Math.max(total, 1)) * segments)
  const cyanoStart = Math.floor(segments * 0.7)

  const { mutate: doRescan, isPending: rescanning } = useMutation({
    mutationFn: api.rescan,
    onSuccess: () => refetch(),
  })

  const { mutate: doUpload, isPending: uploading } = useMutation({
    mutationFn: (files: FileList) => api.uploadFolder(files),
    onSuccess: (data) => {
      toast.success(`Загружено ${data.saved} файлов. Всего в датасете: ${data.total}`)
      refetch()
    },
    onError: () => toast.error('Ошибка при загрузке папки'),
  })

  const handleFolderPick = () => {
    const files = inputRef.current?.files
    if (files && files.length > 0) doUpload(files)
  }

  return (
    <header className="flex items-center justify-between px-4 h-14 border-b border-coal-700 bg-coal-900">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-lg tracking-wider text-safe">LoRA Captioner</h1>
        <span className="text-paper-faint text-xs font-mono uppercase tracking-widest">v1.0</span>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 text-sm font-mono">
          <span className="text-paper-muted">{total}</span>
          <span className="text-cyano">{tagged}</span>
          <span className="text-safe">{untagged}</span>
        </div>

        <div className="flex items-center gap-1.5">
          {Array.from({ length: segments }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-sm transition-colors ${
                i < filled
                  ? i >= cyanoStart ? 'bg-cyano' : 'bg-safe'
                  : 'bg-coal-600'
              }`}
            />
          ))}
          <span className="text-xs font-mono text-paper-muted ml-1 w-8">{pct}%</span>
        </div>

        <input ref={inputRef} type="file" {...{ webkitdirectory: '' }} multiple className="hidden" onChange={handleFolderPick} />

        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-safe hover:text-safe/80 border border-safe/40 rounded-md disabled:opacity-50"
        >
          <FolderUp size={14} className={uploading ? 'animate-pulse' : ''} />
          {uploading ? '...' : 'Выбрать папку'}
        </button>

        <button
          onClick={() => doRescan()}
          disabled={rescanning}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md disabled:opacity-50"
        >
          <RotateCw size={14} className={rescanning ? 'animate-spin' : ''} />
          Рескан
        </button>
      </div>
    </header>
  )
}