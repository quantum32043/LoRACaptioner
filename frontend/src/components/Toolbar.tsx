import { Search, Filter, PanelRightClose, Package, Target, X } from 'lucide-react'
import { useDatasetStore } from '../store/useDatasetStore'
import AutoTagPanel from './AutoTagPanel'

export default function Toolbar({ onToggleBatch, onToggleTrigger }: { onToggleBatch: () => void; onToggleTrigger: () => void }) {
  const searchQuery = useDatasetStore((s) => s.searchQuery)
  const filterUntagged = useDatasetStore((s) => s.filterUntagged)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const setSearchQuery = useDatasetStore((s) => s.setSearchQuery)
  const setFilterUntagged = useDatasetStore((s) => s.setFilterUntagged)
  const clearSelection = useDatasetStore((s) => s.clearSelection)
  const setPanelOpen = useDatasetStore((s) => s.setPanelOpen)
  const triggerFilter = useDatasetStore((s) => s.triggerFilter)
  const setTriggerFilter = useDatasetStore((s) => s.setTriggerFilter)

  const hasSelection = selectedFilenames.length > 0 || selectedFilename !== null
  const selectionCount = selectedFilenames.length || (selectedFilename ? 1 : 0)

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

      <button
        onClick={onToggleTrigger}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md shrink-0"
      >
        <Target size={14} />
        <span className="hidden sm:inline">Trigger</span>
      </button>

      <select
        value={triggerFilter}
        onChange={(e) => setTriggerFilter(e.target.value as any)}
        className="bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1.5 shrink-0"
      >
        <option value="all">Все</option>
        <option value="has_trigger">С триггером</option>
        <option value="missing">Без триггера</option>
        <option value="warning">С варнингами</option>
      </select>

      <AutoTagPanel />

      {hasSelection && (
        <button
          onClick={clearSelection}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-paper-faint hover:text-paper border border-coal-600 rounded-md shrink-0"
        >
          <X size={14} />
          <span className="hidden sm:inline">Снять ({selectionCount})</span>
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
