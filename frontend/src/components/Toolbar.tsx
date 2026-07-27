import { Search, Filter, PanelRightClose, Package, Sparkles } from 'lucide-react'
import { useContext } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'
import { AutoTagCtx } from '../App'

export default function Toolbar({ onToggleBatch }: { onToggleBatch: () => void }) {
  const searchQuery = useDatasetStore((s) => s.searchQuery)
  const filterUntagged = useDatasetStore((s) => s.filterUntagged)
  const setSearchQuery = useDatasetStore((s) => s.setSearchQuery)
  const setFilterUntagged = useDatasetStore((s) => s.setFilterUntagged)
  const setPanelOpen = useDatasetStore((s) => s.setPanelOpen)
  const autoTagAvailable = useContext(AutoTagCtx)
  const queryClient = useQueryClient()

  const { mutate: doAutoUntagged, isPending: autoUntagging } = useMutation({
    mutationFn: () => api.generateUntagged(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success(`Затегировано ${data.count} файлов`)
    },
    onError: () => toast.error('Ошибка авто-тегирования'),
  })

  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-coal-700 bg-coal-900">
      <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
        <Search size={16} className="text-paper-faint shrink-0" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск..."
          className="bg-transparent text-sm text-paper placeholder-paper-faint outline-none w-full font-mono"
        />
      </div>

      <button
        onClick={() => setFilterUntagged(!filterUntagged)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-md border transition-colors shrink-0 ${
          filterUntagged
            ? 'bg-safe/20 text-safe border-safe'
            : 'text-paper-muted border-coal-600 hover:text-paper'
        }`}
      >
        <Filter size={14} />
        <span className="hidden sm:inline">Только пустые</span>
      </button>

      <button
        onClick={onToggleBatch}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md shrink-0"
      >
        <Package size={14} />
        <span className="hidden sm:inline">Batch</span>
      </button>

      {autoTagAvailable && (
        <button
          onClick={() => doAutoUntagged()}
          disabled={autoUntagging}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-cyano/80 hover:text-cyano border border-cyano/30 rounded-md shrink-0 disabled:opacity-50"
        >
          <Sparkles size={14} className={autoUntagging ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">{autoUntagging ? '...' : 'Auto все'}</span>
        </button>
      )}

      <button
        onClick={() => setPanelOpen(true)}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-paper-muted hover:text-paper border border-coal-600 rounded-md md:hidden shrink-0"
      >
        <PanelRightClose size={14} />
        <span className="hidden sm:inline">Панель</span>
      </button>
    </div>
  )
}