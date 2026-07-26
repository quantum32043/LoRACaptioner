import { Search, Filter } from 'lucide-react'
import { useDatasetStore } from '../store/useDatasetStore'

export default function Toolbar({ onToggleBatch }: { onToggleBatch: () => void }) {
  const searchQuery = useDatasetStore((s) => s.searchQuery)
  const filterUntagged = useDatasetStore((s) => s.filterUntagged)
  const setSearchQuery = useDatasetStore((s) => s.setSearchQuery)
  const setFilterUntagged = useDatasetStore((s) => s.setFilterUntagged)

  return (
    <div className="flex items-center gap-3 px-4 h-12 border-b border-coal-700 bg-coal-900">
      <div className="flex items-center gap-2 flex-1 max-w-md">
        <Search size={16} className="text-paper-faint" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по имени файла или капшену..."
          className="bg-transparent text-sm text-paper placeholder-paper-faint outline-none w-full font-mono"
        />
      </div>

      <button
        onClick={() => setFilterUntagged(!filterUntagged)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-md border transition-colors ${
          filterUntagged
            ? 'bg-safe/20 text-safe border-safe'
            : 'text-paper-muted border-coal-600 hover:text-paper'
        }`}
      >
        <Filter size={14} />
        Только пустые
      </button>

      <button
        onClick={onToggleBatch}
        className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-paper-muted hover:text-paper border border-coal-600 rounded-md"
      >
        Batch
      </button>
    </div>
  )
}