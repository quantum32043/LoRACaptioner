import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { api } from './api/client'
import { useDatasetStore } from './store/useDatasetStore'
import TopBar from './components/TopBar'
import Toolbar from './components/Toolbar'
import BatchPanel from './components/BatchPanel'
import ImageGrid from './components/ImageGrid'
import EditorPanel from './components/EditorPanel'
import StatusStrip from './components/StatusStrip'

function App() {
  const [batchOpen, setBatchOpen] = useState(false)
  const setItems = useDatasetStore((s) => s.setItems)
  const filterUntagged = useDatasetStore((s) => s.filterUntagged)
  const searchQuery = useDatasetStore((s) => s.searchQuery)

  const { data } = useQuery({
    queryKey: ['items', filterUntagged, searchQuery],
    queryFn: () => api.getItems(0, 20000, filterUntagged, searchQuery || undefined),
    placeholderData: (prev) => prev,
  })

  useEffect(() => {
    if (data) setItems(data.items, data.total)
  }, [data])

  return (
    <div className="h-screen w-screen flex flex-col bg-coal-950 text-paper overflow-hidden">
      <TopBar />
      <Toolbar onToggleBatch={() => setBatchOpen(!batchOpen)} />
      {batchOpen && <BatchPanel />}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-col flex-1 overflow-hidden">
          <ImageGrid />
          <StatusStrip />
        </div>
        <EditorPanel />
      </div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1c1815', color: '#ece5d8', border: '1px solid #2e2822' } }} />
    </div>
  )
}

export default App