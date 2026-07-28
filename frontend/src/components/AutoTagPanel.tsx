import { useState, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles, Download, Trash2, RotateCw } from 'lucide-react'
import { toast } from 'sonner'
import { api, type TaskMode } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'
import GpuFallbackDialog from './GpuFallbackDialog'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export default function AutoTagPanel() {
  const queryClient = useQueryClient()
  const [showMenu, setShowMenu] = useState(false)

  const autoTagState = useDatasetStore((s) => s.autoTagState)
  const autoTagGpuAvailable = useDatasetStore((s) => s.autoTagGpuAvailable)
  const autoTagTaskMode = useDatasetStore((s) => s.autoTagTaskMode)
  const autoTagModes = useDatasetStore((s) => s.autoTagModes)
  const autoTagTemperature = useDatasetStore((s) => s.autoTagTemperature)
  const downloadProgress = useDatasetStore((s) => s.downloadProgress)
  const batchTagProgress = useDatasetStore((s) => s.batchTagProgress)
  const gpuFallbackConfirmed = useDatasetStore((s) => s.gpuFallbackConfirmed)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const effectiveSelection = selectedFilenames.length > 0 ? selectedFilenames : (selectedFilename ? [selectedFilename] : [])
  const setAutoTagStatus = useDatasetStore((s) => s.setAutoTagStatus)
  const setAutoTagModes = useDatasetStore((s) => s.setAutoTagModes)
  const setDownloadProgress = useDatasetStore((s) => s.setDownloadProgress)
  const setBatchTagProgress = useDatasetStore((s) => s.setBatchTagProgress)
  const setGpuFallbackConfirmed = useDatasetStore((s) => s.setGpuFallbackConfirmed)

  const [showGpuDialog, setShowGpuDialog] = useState(false)
  const [batchRunning, setBatchRunning] = useState(false)
  const prevAutoTagState = useRef<string | null>(null)
  const manualUnloadRef = useRef(false)

  useQuery({
    queryKey: ['auto-tag-status'],
    queryFn: async () => {
      const status = await api.getAutoTagStatus()
      const newState = status.state
      if (prevAutoTagState.current === 'ready' && newState === 'unloaded' && !manualUnloadRef.current) {
        toast.info('Модель выгружена из-за отсутствия активности')
      }
      prevAutoTagState.current = newState
      setAutoTagStatus(status)
      return status
    },
    refetchInterval: (autoTagState === 'downloading' || autoTagState === 'loading') ? 2000 : 30000,
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

  const { mutate: doSetMode } = useMutation({
    mutationFn: (mode: string) => api.setAutoTagMode(mode),
    onMutate: (mode) => {
      useDatasetStore.getState().setAutoTagTaskMode(mode)
    },
    onError: () => {
      toast.error('Ошибка при смене режима')
    },
  })

  const { mutate: doSetTemperature } = useMutation({
    mutationFn: (temp: number) => api.setAutoTagTemperature(temp),
    onMutate: (temp) => {
      useDatasetStore.getState().setAutoTagTemperature(temp)
    },
    onError: () => {
      toast.error('Ошибка при смене температуры')
    },
  })

  const stateLabel: Record<string, string> = {
    unavailable: 'Недоступна',
    not_downloaded: 'Не скачана',
    downloading: 'Скачивание...',
    loading: 'Загрузка...',
    ready: 'Готова',
    unloaded: 'Не загружена',
    error: 'Ошибка',
  }

  const stateColor: Record<string, string> = {
    unavailable: 'text-paper-faint',
    not_downloaded: 'text-ember',
    downloading: 'text-cyano',
    loading: 'text-cyano',
    ready: 'text-safe',
    unloaded: 'text-paper-faint',
    error: 'text-ember',
  }

  const handleDownload = useCallback(async () => {
    setDownloadProgress({ downloaded_bytes: 0, total_bytes: 0, current_file: '', files_done: 0, files_total: 0 })
    try {
      for await (const msg of api.downloadModelSSE()) {
        if (msg.event === 'progress') {
          setDownloadProgress(JSON.parse(msg.data))
        } else if (msg.event === 'complete') {
          setDownloadProgress(null)
          queryClient.invalidateQueries({ queryKey: ['auto-tag-status'] })
          toast.success('Модель скачана')
        } else if (msg.event === 'error') {
          const err = JSON.parse(msg.data)
          setDownloadProgress(null)
          toast.error(`Ошибка скачивания: ${err.error}`)
          queryClient.invalidateQueries({ queryKey: ['auto-tag-status'] })
        }
      }
    } catch (e) {
      setDownloadProgress(null)
      queryClient.invalidateQueries({ queryKey: ['auto-tag-status'] })
      toast.error(`Ошибка подключения: ${e instanceof Error ? e.message : 'Неизвестная ошибка'}`)
    }
  }, [queryClient, setDownloadProgress])

  const runBatchUntagged = useCallback(async () => {
    setBatchRunning(true)
    try {
      const s = useDatasetStore.getState()
      const taskMode = s.autoTagTaskMode
      const temperature = s.autoTagTemperature
      for await (const msg of api.generateUntaggedSSE(taskMode, temperature)) {
        if (msg.event === 'progress') {
          setBatchTagProgress(JSON.parse(msg.data))
        } else if (msg.event === 'result') {
          const r = JSON.parse(msg.data)
          useDatasetStore.getState().updateItem(r.filename, r.caption)
        } else if (msg.event === 'done') {
          const d = JSON.parse(msg.data)
          setBatchTagProgress(null)
          queryClient.invalidateQueries({ queryKey: ['items'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
          setBatchRunning(false)
          if (d.errors > 0 && d.count > 0) {
            toast.warning(`Обработано ${d.count}, ошибок ${d.errors}`)
          } else if (d.errors > 0) {
            toast.error(`Все ${d.errors} файлов с ошибкой`)
          } else {
            toast.success(`Теги добавлены для ${d.count} файлов`)
          }
        } else if (msg.event === 'error') {
          const err = JSON.parse(msg.data)
          toast.error(`Ошибка: ${err.filename} — ${err.error}`)
        }
      }
    } catch (e) {
      setBatchTagProgress(null)
      setBatchRunning(false)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    }
  }, [queryClient, setBatchTagProgress])

  const runBatchSelected = useCallback(async (filenames: string[]) => {
    if (filenames.length === 0) return
    setBatchRunning(true)
    try {
      const s = useDatasetStore.getState()
      const taskMode = s.autoTagTaskMode
      const temperature = s.autoTagTemperature
      for await (const msg of api.generateBatchSSE(filenames, taskMode, temperature)) {
        if (msg.event === 'progress') {
          setBatchTagProgress(JSON.parse(msg.data))
        } else if (msg.event === 'result') {
          const r = JSON.parse(msg.data)
          useDatasetStore.getState().updateItem(r.filename, r.caption)
        } else if (msg.event === 'done') {
          const d = JSON.parse(msg.data)
          setBatchTagProgress(null)
          queryClient.invalidateQueries({ queryKey: ['items'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
          setBatchRunning(false)
          if (d.errors > 0 && d.count > 0) {
            toast.warning(`Обработано ${d.count}, ошибок ${d.errors}`)
          } else if (d.errors > 0) {
            toast.error(`Все ${d.errors} файлов с ошибкой`)
          } else {
            toast.success(`Теги добавлены для ${d.count} файлов`)
          }
        } else if (msg.event === 'error') {
          const err = JSON.parse(msg.data)
          toast.error(`Ошибка: ${err.filename} — ${err.error}`)
        }
      }
    } catch (e) {
      setBatchTagProgress(null)
      setBatchRunning(false)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    }
  }, [queryClient, setBatchTagProgress])

  const handleAutoAll = useCallback(() => {
    if (!autoTagGpuAvailable && !gpuFallbackConfirmed) {
      setShowGpuDialog(true)
      return
    }
    runBatchUntagged()
  }, [autoTagGpuAvailable, gpuFallbackConfirmed, runBatchUntagged])

  const handleAutoSelected = useCallback(() => {
    const filenames = useDatasetStore.getState().selectedFilenames
    const single = useDatasetStore.getState().selectedFilename
    const effective = filenames.length > 0 ? filenames : (single ? [single] : [])
    if (effective.length === 0) {
      toast.error('Не выбрано ни одного кадра')
      return
    }
    if (!autoTagGpuAvailable && !gpuFallbackConfirmed) {
      setShowGpuDialog(true)
      return
    }
    runBatchSelected(effective)
  }, [autoTagGpuAvailable, gpuFallbackConfirmed, runBatchSelected])

  const handleGpuConfirm = useCallback(() => {
    setShowGpuDialog(false)
    setGpuFallbackConfirmed(true)
  }, [setGpuFallbackConfirmed])

  const isIdle = autoTagState === 'ready' || autoTagState === 'unloaded'
  const pct = downloadProgress && downloadProgress.total_bytes > 0
    ? Math.round((downloadProgress.downloaded_bytes / downloadProgress.total_bytes) * 100)
    : 0

  return (
    <>
      {showGpuDialog && (
        <GpuFallbackDialog
          onConfirm={handleGpuConfirm}
          onCancel={() => setShowGpuDialog(false)}
        />
      )}

      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono uppercase tracking-wider rounded-md border shrink-0 transition-colors ${
            showMenu
              ? 'bg-cyano/20 text-cyano border-cyano'
              : 'text-cyano/80 hover:text-cyano border-cyano/30'
          }`}
        >
          <Sparkles size={14} className={!isIdle ? 'animate-pulse' : ''} />
          <span className="hidden sm:inline">Auto</span>
        </button>

        {showMenu && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setShowMenu(false)} />
            <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-coal-900 border border-coal-700 rounded-xl shadow-2xl p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs text-paper-muted">Авто-тегирование</span>
                <span className={`font-mono text-xs ${stateColor[autoTagState]}`}>
                  {stateLabel[autoTagState]}
                </span>
              </div>
              {autoTagState === 'unloaded' && (
                <p className="mb-3 text-xs font-mono text-paper-faint text-center">
                  Модель загрузится автоматически при запуске
                </p>
              )}

              <div className="mb-3">
                <select
                  value={autoTagTaskMode}
                  onChange={(e) => doSetMode(e.target.value)}
                  className="w-full bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1.5"
                >
                  {autoTagModes.map((mode: TaskMode) => (
                    <option key={mode.id} value={mode.id}>{mode.label}</option>
                  ))}
                </select>
              </div>

              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="font-mono text-xs text-paper-muted">Температура</label>
                  <span className="font-mono text-xs text-paper-faint">{autoTagTemperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="2.0"
                  step="0.1"
                  value={autoTagTemperature}
                  onChange={(e) => doSetTemperature(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-coal-700 rounded-full appearance-none cursor-pointer accent-cyano"
                />
                <div className="flex justify-between text-[10px] font-mono text-paper-faint mt-0.5">
                  <span>0.1</span>
                  <span>1.0</span>
                  <span>2.0</span>
                </div>
              </div>

              {autoTagState === 'loading' && (
                <div className="mb-3 flex items-center gap-2 text-xs font-mono text-cyano">
                  <RotateCw size={12} className="animate-spin" />
                  <span>Загрузка модели...</span>
                </div>
              )}

              {downloadProgress && (
                <div className="mb-3">
                  <div className="flex justify-between text-xs font-mono text-paper-faint mb-1">
                    <span>{formatBytes(downloadProgress.downloaded_bytes)} / {formatBytes(downloadProgress.total_bytes)}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 bg-coal-700 rounded-full overflow-hidden">
                    <div className="h-full bg-cyano rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs font-mono text-paper-faint mt-1 truncate">{downloadProgress.current_file}</p>
                </div>
              )}

              {batchTagProgress && (
                <div className="mb-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-cyano mb-1">
                    <RotateCw size={12} className="animate-spin" />
                    <span>{batchTagProgress.current} / {batchTagProgress.total}</span>
                  </div>
                  <div className="h-1.5 bg-coal-700 rounded-full overflow-hidden">
                    <div className="h-full bg-cyano rounded-full transition-all" style={{ width: `${(batchTagProgress.current / batchTagProgress.total) * 100}%` }} />
                  </div>
                  <p className="text-xs font-mono text-paper-faint mt-1 truncate">{batchTagProgress.filename}</p>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                {(autoTagState === 'not_downloaded' || autoTagState === 'unavailable' || autoTagState === 'error') && (
                  <button
                    onClick={handleDownload}
                    className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-mono bg-cyano/20 text-cyano border border-cyano/40 rounded-md hover:bg-cyano/30"
                  >
                    <Download size={14} />
                    {autoTagState === 'error' ? 'Повторить скачивание' : 'Скачать модель'}
                  </button>
                )}

                {(autoTagState === 'ready' || autoTagState === 'unloaded') && (
                  <>
                    <button
                      onClick={handleAutoAll}
                      disabled={(autoTagState !== 'ready' && autoTagState !== 'unloaded') || batchRunning}
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-mono bg-safe/20 text-safe border border-safe/40 rounded-md hover:bg-safe/30 disabled:opacity-50"
                    >
                      <Sparkles size={14} />
                      Auto все пустые
                    </button>
                    <button
                      onClick={handleAutoSelected}
                      disabled={(autoTagState !== 'ready' && autoTagState !== 'unloaded') || batchRunning || effectiveSelection.length === 0}
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-mono bg-coal-800 text-paper-muted border border-coal-600 rounded-md hover:text-paper disabled:opacity-50"
                    >
                      <Sparkles size={14} />
                      Auto выбранные ({effectiveSelection.length})
                    </button>
                    <button
                      onClick={() => {
                        manualUnloadRef.current = true
                        api.unloadModel()
                        queryClient.invalidateQueries({ queryKey: ['auto-tag-status'] })
                        toast.success('Модель выгружена')
                        setTimeout(() => { manualUnloadRef.current = false }, 2000)
                      }}
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 text-xs font-mono text-paper-faint border border-coal-600 rounded-md hover:text-ember hover:border-ember/40"
                    >
                      <Trash2 size={14} />
                      Выгрузить модель
                    </button>
                  </>
                )}

                {autoTagState === 'error' && (
                  <div className="text-xs font-mono text-ember text-center">
                    {useDatasetStore.getState().autoTagLastError || 'Неизвестная ошибка'}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}
