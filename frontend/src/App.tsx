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
  const panelOpen = useDatasetStore((s) => s.panelOpen)
  const setPanelOpen = useDatasetStore((s) => s.setPanelOpen)
  const filterUntagged = useDatasetStore((s) => s.filterUntagged)
  const searchQuery = useDatasetStore((s) => s.searchQuery)
  const setAutoTagStatus = useDatasetStore((s) => s.setAutoTagStatus)
  const setAutoTagModes = useDatasetStore((s) => s.setAutoTagModes)

  const { data } = useQuery({
    queryKey: ['items', filterUntagged, searchQuery],
    queryFn: () => api.getItems(0, 20000, filterUntagged, searchQuery || undefined),
    placeholderData: (prev) => prev,
  })

  useQuery({
    queryKey: ['auto-tag-status'],
    queryFn: async () => {
      const status = await api.getAutoTagStatus()
      setAutoTagStatus(status)
      return status
    },
    refetchInterval: 30000,
  })

  useQuery({
    queryKey: ['auto-tag-modes'],
    queryFn: async () => {
      const res = await api.getAutoTagModes()
      setAutoTagModes(res.modes, res.current)
      return res
    },
    staleTime: 60000,
  })

  useEffect(() => {
    if (data) setItems(data.items, data.total)
  }, [data])

  return (
    <div className="h-screen w-screen flex flex-col bg-coal-950 text-paper overflow-hidden relative">
      <div className="film-grain fixed inset-0 z-50" />
      <div className="vignette fixed inset-0 z-40" />
      <TopBar />
      <Toolbar onToggleBatch={() => setBatchOpen(!batchOpen)} />
      {batchOpen && <BatchPanel />}
      <div className="flex flex-1 overflow-hidden relative z-10">
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <ImageGrid />
          <StatusStrip />
        </div>

        {panelOpen && (
          <div className="fixed inset-0 bg-black/50 z-20 md:hidden" onClick={() => setPanelOpen(false)} />
        )}

        <div className={`
          ${panelOpen ? 'fixed inset-y-0 right-0 z-30 w-full max-w-lg shadow-2xl' : 'hidden'}
          md:relative md:flex md:w-80 lg:w-96 xl:w-[440px]
        `}>
          <EditorPanel />
        </div>
      </div>
      <Toaster position="bottom-right" toastOptions={{ style: { background: '#1c1815', color: '#ece5d8', border: '1px solid #2e2822' } }} />
    </div>
  )
}

export default App
