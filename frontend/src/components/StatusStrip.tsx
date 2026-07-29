import { useDatasetStore } from '../store/useDatasetStore'

export default function StatusStrip() {
  const total = useDatasetStore((s) => s.total)
  const datasetFilter = useDatasetStore((s) => s.datasetFilter)
  const searchQuery = useDatasetStore((s) => s.searchQuery)

  const filterLabels: Record<string, string> = { untagged: 'untagged only', has_trigger: 'has trigger', no_trigger: 'no trigger', trigger_warning: 'warnings' }

  return (
    <div className="flex items-center justify-between px-4 h-8 border-t border-coal-700 bg-coal-900 text-xs font-mono text-paper-faint">
      <div className="flex items-center gap-4">
        <span>{total} frames</span>
        {datasetFilter !== 'all' && <span className="text-safe">· {filterLabels[datasetFilter]}</span>}
        {searchQuery && <span className="text-safe">· search: "{searchQuery}"</span>}
      </div>
      <div className="flex items-center gap-3">
        <span><kbd className="text-paper-muted border border-coal-600 px-1 rounded">←</kbd> <kbd className="text-paper-muted border border-coal-600 px-1 rounded">→</kbd> navigate</span>
        <span><kbd className="text-paper-muted border border-coal-600 px-1 rounded">Ctrl+S</kbd> save</span>
      </div>
    </div>
  )
}