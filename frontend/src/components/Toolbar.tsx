import { Search, PanelRightClose, Package, Target, X } from 'lucide-react'
import { useDatasetStore } from '../store/useDatasetStore'
import AutoTagPanel from './AutoTagPanel'

export default function Toolbar({ onToggleBatch, onToggleTrigger }: { onToggleBatch: () => void; onToggleTrigger: () => void }) {
  const searchQuery = useDatasetStore((s) => s.searchQuery)
  const datasetFilter = useDatasetStore((s) => s.datasetFilter)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const setSearchQuery = useDatasetStore((s) => s.setSearchQuery)
  const setDatasetFilter = useDatasetStore((s) => s.setDatasetFilter)
  const clearSelection = useDatasetStore((s) => s.clearSelection)
  const setPanelOpen = useDatasetStore((s) => s.setPanelOpen)

  const hasSelection = selectedFilenames.length > 0 || selectedFilename !== null
  const selectionCount = selectedFilenames.length || (selectedFilename ? 1 : 0)

  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-coal-700 bg-coal-900">
      <div className="flex items-center gap-2 flex-1 min-w-0 max-w-md">
        <Search size={16} className="text-paper-faint shrink-0" aria-hidden="true" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          aria-label="Search frames"
          className="bg-transparent text-sm text-paper placeholder-paper-faint outline-none w-full font-mono"
        />
      </div>

      <select
        value={datasetFilter}
        onChange={(e) => setDatasetFilter(e.target.value as any)}
        aria-label="Filter frames"
        className="bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1.5 shrink-0"
      >
        <option value="all">All</option>
        <option value="untagged">Untagged only</option>
        <option value="has_trigger">Has trigger</option>
        <option value="no_trigger">No trigger</option>
        <option value="trigger_warning">Warnings</option>
      </select>

      <button
        onClick={onToggleBatch}
        aria-label="Batch operations"
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md shrink-0"
      >
        <Package size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Batch</span>
      </button>

      <button
        onClick={onToggleTrigger}
        aria-label="Trigger words"
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md shrink-0"
      >
        <Target size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Trigger</span>
      </button>

      <AutoTagPanel />

      {hasSelection && (
        <button
          onClick={clearSelection}
          aria-label={`Clear selection (${selectionCount})`}
          className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-paper-faint hover:text-paper border border-coal-600 rounded-md shrink-0"
        >
          <X size={14} aria-hidden="true" />
          <span className="hidden sm:inline">Clear ({selectionCount})</span>
        </button>
      )}

      <button
        onClick={() => setPanelOpen(true)}
        aria-label="Open editor panel"
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-mono text-paper-muted hover:text-paper border border-coal-600 rounded-md md:hidden shrink-0"
      >
        <PanelRightClose size={14} aria-hidden="true" />
        <span className="hidden sm:inline">Panel</span>
      </button>
    </div>
  )
}
