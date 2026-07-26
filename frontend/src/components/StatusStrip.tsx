import { useDatasetStore } from '../store/useDatasetStore'

export default function StatusStrip() {
  const total = useDatasetStore((s) => s.total)
  const filterUntagged = useDatasetStore((s) => s.filterUntagged)
  const searchQuery = useDatasetStore((s) => s.searchQuery)

  return (
    <div className="flex items-center justify-between px-4 h-8 border-t border-coal-700 bg-coal-900 text-xs font-mono text-paper-faint">
      <div className="flex items-center gap-4">
        <span>{total} кадров</span>
        {filterUntagged && <span className="text-safe">· только пустые</span>}
        {searchQuery && <span className="text-safe">· поиск: "{searchQuery}"</span>}
      </div>
      <div className="flex items-center gap-3">
        <span><kbd className="text-paper-muted border border-coal-600 px-1 rounded">←</kbd> <kbd className="text-paper-muted border border-coal-600 px-1 rounded">→</kbd> навигация</span>
        <span><kbd className="text-paper-muted border border-coal-600 px-1 rounded">⌘S</kbd> сохранить</span>
      </div>
    </div>
  )
}