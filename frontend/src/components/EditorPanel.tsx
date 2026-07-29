import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Save, Type, X, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

function normalize(s: string) {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

function getTagMatchType(tag: string, triggerWords: string[]): 'exact' | 'case' | 'separator' | null {
  if (!triggerWords.length) return null
  for (const tw of triggerWords) {
    const tws = tw.trim()
    if (!tws) continue
    if (tag === tws) return 'exact'
    if (tag.toLowerCase() === tws.toLowerCase()) return 'case'
    if (normalize(tag) === normalize(tws)) return 'separator'
  }
  return null
}

function highlightCaptionEditor(caption: string, triggerWords: string[]) {
  if (!triggerWords.length || !caption) return caption
  const parts = caption.split(/(,\s*)/)
  return parts.map((part, i) => {
    const tag = part.replace(/,\s*$/, '').trim()
    if (!tag) return part
    const mt = getTagMatchType(tag, triggerWords)
    if (mt === 'exact') return <span key={i} className="text-cyano">{part}</span>
    if (mt) return <span key={i} className="text-safe underline decoration-safe/40 decoration-dotted underline-offset-2">{part}</span>
    return part
  })
}

function TagChip({ tag, onRemove, onEdit, id }: { tag: string; onRemove: () => void; onEdit: () => void; id: string }) {
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const matchType = getTagMatchType(tag, triggerWords)
  const matchBorder = matchType === 'exact' ? 'border-l-cyano' : matchType ? 'border-l-safe' : 'border-coal-600'
  const matchText = matchType === 'exact' ? 'text-cyano' : matchType ? 'text-safe' : ''
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <span ref={setNodeRef} style={style} {...attributes} {...listeners} className={`inline-flex items-center gap-1 px-2 py-0.5 bg-coal-700 rounded-md text-xs font-mono cursor-grab active:cursor-grabbing border-l-2 ${matchBorder} border-r border-t border-b border-coal-600`}>
      <span className={`cursor-pointer hover:text-cyano ${matchText}`} onClick={onEdit}>{tag}</span>
      <button onClick={onRemove} className="text-paper-faint hover:text-ember ml-0.5">&times;</button>
    </span>
  )
}

export default function EditorPanel() {
  const items = useDatasetStore((s) => s.items)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const setSelected = useDatasetStore((s) => s.setSelected)
  const setPanelOpen = useDatasetStore((s) => s.setPanelOpen)
  const updateItem = useDatasetStore((s) => s.updateItem)
  const total = useDatasetStore((s) => s.total)
  const autoTagState = useDatasetStore((s) => s.autoTagState)
  const autoTagGpuAvailable = useDatasetStore((s) => s.autoTagGpuAvailable)
  const gpuFallbackConfirmed = useDatasetStore((s) => s.gpuFallbackConfirmed)
  const setGpuFallbackConfirmed = useDatasetStore((s) => s.setGpuFallbackConfirmed)

  const asideRef = useRef<HTMLDivElement>(null)
  const [editorHeight, setEditorHeight] = useState(180)
  const resizing = useRef(false)

  const handleEditorResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    resizing.current = true
    const startY = e.clientY
    const startH = editorHeight

    const onMove = (ev: PointerEvent) => {
      if (!resizing.current) return
      const aside = asideRef.current
      if (!aside) return
      const asideBottom = aside.getBoundingClientRect().bottom
      const maxH = asideBottom - ev.clientY - 10
      const newH = Math.max(80, Math.min(maxH, startH + (startY - ev.clientY)))
      setEditorHeight(newH)
    }

    const onUp = () => {
      resizing.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [editorHeight])

  const selectedItem = items.find((i) => i.filename === selectedFilename)
  const [caption, setCaption] = useState('')
  const captionRef = useRef(caption)
  captionRef.current = caption
  const [tagMode, setTagMode] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [batchMode, setBatchMode] = useState<'append' | 'prepend' | 'set'>('append')
  const [removedTags, setRemovedTags] = useState<string[]>([])
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [editingTagIdx, setEditingTagIdx] = useState<number | null>(null)
  const [editTagValue, setEditTagValue] = useState('')
  const [showGpuDialog, setShowGpuDialog] = useState(false)
  const isBatch = selectedFilenames.length > 0

  const selectedItems = items.filter((i) => selectedFilenames.includes(i.filename))
  const allTagSets = selectedItems.map((i) => new Set(i.caption.split(',').map((t) => t.trim()).filter(Boolean)))
  const commonTags = allTagSets.length > 0
    ? Array.from(allTagSets[0]).filter((tag) => allTagSets.every((set) => set.has(tag)))
    : []
  const totalUniqueTags = new Set(allTagSets.flatMap((s) => Array.from(s)))
  const differingCount = totalUniqueTags.size - commonTags.length

  useEffect(() => {
    if (isBatch) {
      setCaption('')
      setDirty(false)
      setTagMode(false)
      setRemovedTags([])
    } else if (selectedItem) {
      setCaption(selectedItem.caption)
      setDirty(false)
    }
  }, [isBatch, selectedItem])

  const selectedIdx = selectedItem ? items.indexOf(selectedItem) : -1
  const queryClient = useQueryClient()

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: ({ filename, caption }: { filename: string; caption: string }) => api.saveCaption(filename, caption),
    onSuccess: (_, { filename, caption }) => {
      setDirty(false)
      updateItem(filename, caption)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: () => toast.error('Save error'),
  })

  const { mutate: batchSave, isPending: batchSaving } = useMutation({
    mutationFn: async ({ filenames, caption, mode, remove }: { filenames: string[]; caption: string; mode: 'append' | 'prepend' | 'set'; remove: string[] }) => {
      for (const fn of filenames) {
        const item = items.find((i) => i.filename === fn)
        const existingTags = (item?.caption || '').split(',').map((t) => t.trim()).filter(Boolean)
        const filtered = existingTags.filter((t) => !remove.includes(t))
        const newTags = caption.split(',').map((t) => t.trim()).filter(Boolean)
        const uniqueNew = newTags.filter((t) => !filtered.includes(t))
        let newCaption: string
        if (mode === 'set') {
          newCaption = caption
        } else if (!filtered.length) {
          newCaption = uniqueNew.join(', ')
        } else if (mode === 'prepend') {
          newCaption = uniqueNew.length ? `${uniqueNew.join(', ')}, ${filtered.join(', ')}` : filtered.join(', ')
        } else {
          newCaption = uniqueNew.length ? `${filtered.join(', ')}, ${uniqueNew.join(', ')}` : filtered.join(', ')
        }
        await api.saveCaption(fn, newCaption)
      }
    },
    onSuccess: (_, { filenames }) => {
      setDirty(false)
      setRemovedTags([])
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success(`Saved for ${filenames.length} frames`)
    },
    onError: () => toast.error('Batch save error'),
  })

  const { mutate: renameTag } = useMutation({
    mutationFn: async ({ filenames, oldTag, newTag }: { filenames: string[]; oldTag: string; newTag: string }) => {
      for (const fn of filenames) {
        const item = items.find((i) => i.filename === fn)
        const tags = (item?.caption || '').split(',').map((t) => t.trim()).filter(Boolean)
        const updated = tags.map((t) => (t === oldTag ? newTag : t))
        await api.saveCaption(fn, updated.join(', '))
      }
    },
    onSuccess: () => {
      setEditingTag(null)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Tag renamed')
    },
    onError: () => toast.error('Rename error'),
  })

  const handleSave = () => {
    if (isBatch) {
      batchSave({ filenames: selectedFilenames, caption, mode: batchMode, remove: removedTags })
    } else if (selectedItem) {
      save({ filename: selectedItem.filename, caption: captionRef.current })
    }
  }

  const handlePrev = () => { if (selectedIdx > 0) setSelected(items[selectedIdx - 1].filename) }
  const handleNext = () => { if (selectedIdx < items.length - 1) setSelected(items[selectedIdx + 1].filename) }

  const tags = caption.split(',').map((t) => t.trim()).filter(Boolean)

  const handleRemoveTag = (idx: number) => {
    const newTags = tags.filter((_, i) => i !== idx)
    setCaption(newTags.join(', '))
    setDirty(true)
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const input = e.currentTarget
      const val = input.value.trim()
      if (val) { setCaption(caption ? `${caption}, ${val}` : val); setDirty(true) }
      input.value = ''
    }
  }

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyS') {
        e.preventDefault()
        handleSaveRef.current()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isBatch) return
    if (e.key === 'ArrowLeft' && document.activeElement?.tagName !== 'INPUT') handlePrev()
    if (e.key === 'ArrowRight' && document.activeElement?.tagName !== 'INPUT') handleNext()
  }, [selectedIdx, items, isBatch])

  useEffect(() => { window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown) }, [handleKeyDown])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const { mutate: doAutoTag, isPending: autoTagging } = useMutation({
    mutationFn: (filename: string) => {
      const s = useDatasetStore.getState()
      return api.generateCaption(filename, s.autoTagTaskMode, s.autoTagTemperature)
    },
    onSuccess: (data, filename) => {
      setCaption(data.caption)
      setDirty(true)
      updateItem(filename, data.caption)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success('Tags generated')
    },
    onError: () => toast.error('Generation error'),
  })

  const handleAutoTag = () => {
    if (!selectedItem) return
    if (!autoTagGpuAvailable && !gpuFallbackConfirmed) {
      setShowGpuDialog(true)
      return
    }
    doAutoTag(selectedItem.filename)
  }

  const [batchAutoTagging, setBatchAutoTagging] = useState(false)

  const handleBatchAutoTag = async () => {
    const s = useDatasetStore.getState()
    if (s.selectedFilenames.length === 0) return
    if (!s.autoTagGpuAvailable && !s.gpuFallbackConfirmed) {
      setShowGpuDialog(true)
      return
    }

    setBatchAutoTagging(true)
    const filenames = s.selectedFilenames
    const taskMode = s.autoTagTaskMode
    const temperature = s.autoTagTemperature
    console.log('[AutoTag] mode from store:', taskMode)
    try {
      for await (const msg of api.generateBatchSSE(filenames, taskMode, temperature)) {
        if (msg.event === 'result') {
          const r = JSON.parse(msg.data)
          useDatasetStore.getState().updateItem(r.filename, r.caption)
        } else if (msg.event === 'done') {
          const d = JSON.parse(msg.data)
          queryClient.invalidateQueries({ queryKey: ['items'] })
          queryClient.invalidateQueries({ queryKey: ['stats'] })
          if (d.errors > 0 && d.count > 0) {
            toast.warning(`Processed ${d.count}, ${d.errors} errors`)
          } else if (d.errors > 0) {
            toast.error(`All ${d.errors} files had errors`)
          } else {
            toast.success(`Tags added for ${d.count} files`)
          }
        } else if (msg.event === 'error') {
          const err = JSON.parse(msg.data)
          toast.error(`Error: ${err.filename} — ${err.error}`)
        }
      }
    } catch (e) {
      toast.error('Auto-tagging error')
    } finally {
      setBatchAutoTagging(false)
    }
  }

  if (!isBatch && !selectedItem) {
    return (
      <aside className="w-full md:w-80 lg:w-96 xl:w-[440px] border-l border-coal-700 bg-coal-900 flex items-center justify-center">
        <div className="text-center px-8">
          <p className="font-mono text-sm text-paper-muted mb-2">Select a frame</p>
          <p className="font-mono text-xs text-paper-faint">Click an image in the grid</p>
          <p className="font-mono text-xs text-paper-faint mt-1"><kbd className="border border-coal-600 px-1 rounded">&larr;</kbd> <kbd className="border border-coal-600 px-1 rounded">&rarr;</kbd> navigate</p>
        </div>
      </aside>
    )
  }

  return (
    <>
      {showGpuDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowGpuDialog(false)} role="dialog" aria-modal="true" aria-labelledby="editor-gpu-title">
          <div className="bg-coal-900 border border-coal-700 rounded-xl shadow-2xl max-w-sm w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 id="editor-gpu-title" className="font-display text-lg text-paper mb-3">CUDA not found</h3>
            <p className="font-mono text-sm text-paper-muted mb-6 leading-relaxed">
              No GPU (CUDA) found on your system. Auto-tagging will use the CPU — this may be significantly slower.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowGpuDialog(false)} className="px-4 py-2 text-xs font-mono text-paper-muted border border-coal-600 rounded-md hover:text-paper">Cancel</button>
              <button onClick={() => { setShowGpuDialog(false); setGpuFallbackConfirmed(true); }} className="px-4 py-2 text-xs font-mono bg-cyano text-coal-950 rounded-md font-semibold hover:bg-cyano/90">Use CPU</button>
            </div>
          </div>
        </div>
      )}

      <aside ref={asideRef} className="w-full md:w-80 lg:w-96 xl:w-[440px] border-l border-coal-700 bg-coal-900 flex flex-col overflow-hidden">
        {isBatch ? (
          <div className="px-4 py-2 border-b border-coal-700 flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-cyano truncate">selected {selectedFilenames.length} / {total}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleSave} disabled={batchSaving} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-coal-600 rounded-md text-paper hover:bg-coal-700"><Save size={14} />{batchSaving ? '...' : 'Save all'}</button>
              {(autoTagState === 'ready' || autoTagState === 'unloaded') && (
                <button onClick={handleBatchAutoTag} disabled={batchAutoTagging} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-cyano/50 rounded-md text-cyano hover:bg-coal-700" title="Auto-tag selected"><Sparkles size={14} />{batchAutoTagging ? '...' : 'Auto'}</button>
              )}
              <button onClick={() => setPanelOpen(false)} className="text-paper-faint hover:text-paper md:hidden"><X size={16} /></button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-2 border-b border-coal-700 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={() => setPanelOpen(false)} className="text-paper-faint hover:text-paper md:hidden shrink-0"><X size={16} /></button>
              <span className="font-mono text-xs text-paper-muted truncate">frame {selectedIdx + 1} / {total}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`w-2 h-2 rounded-full ${dirty ? 'bg-safe animate-pulse shadow-[0_0_6px_#f5a02c]' : 'bg-cyano'}`} />
              <button onClick={() => setTagMode(!tagMode)} className="text-paper-faint hover:text-paper"><Type size={16} /></button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-coal-600 rounded-md text-paper hover:bg-coal-700"><Save size={14} />{saving ? '...' : 'Save'}</button>
              {(autoTagState === 'ready' || autoTagState === 'unloaded') && (
                <button onClick={handleAutoTag} disabled={autoTagging} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-cyano/50 rounded-md text-cyano hover:bg-coal-700" title="Auto-tag"><Sparkles size={14} />{autoTagging ? '...' : 'Auto'}</button>
              )}
            </div>
          </div>
        )}

        {isBatch ? (<>
          <div className="flex-1 overflow-y-auto bg-coal-950 px-4 py-3">
            {commonTags.length > 0 && (
              <div className="mb-3">
                <p className="font-mono text-xs text-paper-faint mb-1.5">Common tags ({commonTags.length}):</p>
                <div className="flex flex-wrap gap-1">
                  {commonTags.map((tag, i) => {
                    const isRemoved = removedTags.includes(tag)
                    const isEditing = editingTag === tag
                    if (isEditing) {
                      return (
                        <input
                          key={i}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const trimmed = editValue.trim()
                              if (trimmed && trimmed !== tag) {
                                renameTag({ filenames: selectedFilenames, oldTag: tag, newTag: trimmed })
                              } else {
                                setEditingTag(null)
                              }
                            }
                            if (e.key === 'Escape') {
                              setEditingTag(null)
                            }
                          }}
                          onBlur={() => setEditingTag(null)}
                          autoFocus
                          className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono border border-cyano bg-coal-900 text-paper outline-none w-32"
                        />
                      )
                    }
                    const batchMatchType = getTagMatchType(tag, triggerWords)
                    const batchMatchBorder = batchMatchType === 'exact' ? 'border-l-cyano' : batchMatchType ? 'border-l-safe' : ''
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border transition-colors ${
                          isRemoved
                            ? 'bg-coal-900 text-paper-faint/50 border-coal-700 line-through cursor-pointer'
                            : `bg-coal-800 text-paper-muted ${batchMatchBorder ? `border-l-2 ${batchMatchBorder} border-r border-t border-b border-coal-600` : 'border-coal-600'}`
                        }`}
                      >
                        <span
                          className={`cursor-pointer hover:text-paper ${batchMatchType === 'exact' ? 'text-cyano' : batchMatchType ? 'text-safe' : ''}`}
                          onClick={() => {
                            if (!isRemoved) {
                              setEditingTag(tag)
                              setEditValue(tag)
                            }
                          }}
                        >
                          {tag}
                        </span>
                        <span
                          className={`ml-0.5 cursor-pointer ${isRemoved ? 'text-paper-faint/30 hover:text-paper-faint' : 'text-paper-faint hover:text-ember'}`}
                          onClick={() => {
                            setRemovedTags((prev) =>
                              isRemoved ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                            setDirty(true)
                          }}
                        >
                          {isRemoved ? '\u21A9' : '\u00D7'}
                        </span>
                      </span>
                    )
                  })}
                </div>
                {differingCount > 0 && (
                  <p className="font-mono text-xs text-paper-faint mt-1.5">...and {differingCount} tags differ</p>
                )}
                {removedTags.length > 0 && (
                  <p className="font-mono text-xs text-ember mt-1.5">Will be removed: {removedTags.join(', ')}</p>
                )}
              </div>
            )}
            {commonTags.length === 0 && differingCount === 0 && (
              <div className="flex items-center justify-center h-full">
                <p className="font-mono text-xs text-paper-faint">Selected frames have no captions</p>
              </div>
            )}
          </div>
          <div className="px-4 py-3 border-t border-coal-700">
            <div className="flex items-center gap-2 mb-2">
              <select
                value={batchMode}
                onChange={(e) => setBatchMode(e.target.value as 'append' | 'prepend' | 'set')}
                aria-label="Batch operation mode"
                className="bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1"
              >
                <option value="append">Append</option>
                <option value="prepend">Prepend</option>
                <option value="set">Replace</option>
              </select>
              <span className="font-mono text-xs text-paper-faint">for {selectedFilenames.length} frames</span>
            </div>
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={(e) => { setCaption(e.target.value); setDirty(true) }}
                aria-label="Batch caption text"
                className="w-full h-32 bg-coal-800 text-paper text-sm font-mono p-2 rounded-md border border-coal-600 outline-none resize-none placeholder-paper-faint"
                placeholder="Enter caption..."
              />
            </div>
          </div>
        </>) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="px-4 py-2 border-b border-coal-700">
              <p className="font-mono text-xs text-paper-faint truncate">{selectedItem!.filename}</p>
            </div>

            <div className="flex-1 overflow-hidden bg-coal-950 relative">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-safe/60 z-10" />
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-safe/60 z-10" />
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-safe/60 z-10" />
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-safe/60 z-10" />
              <TransformWrapper>
                <TransformComponent>
                  <img src={selectedItem!.full_url} alt={selectedItem!.filename} className="w-full h-full object-contain" />
                </TransformComponent>
              </TransformWrapper>
            </div>

            <div
              onPointerDown={handleEditorResizeStart}
              className="h-2 cursor-row-resize shrink-0 relative group"
              role="separator"
              aria-label="Resize caption editor"
            >
              <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 h-0.5 rounded-full bg-coal-600 group-hover:bg-coal-500 transition-colors" />
            </div>

            <div style={{ height: editorHeight }} className="shrink-0 border-t border-coal-700">
              {tagMode ? (
                <div className="overflow-y-auto h-full px-4 py-3">
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => {
                    const { active, over } = e
                    if (over && active.id !== over.id) {
                      const oldIdx = tags.findIndex((_, i) => `tag-${i}` === active.id)
                      const newIdx = tags.findIndex((_, i) => `tag-${i}` === over.id)
                      if (oldIdx !== -1 && newIdx !== -1) {
                        const newTags = [...tags]
                        const [moved] = newTags.splice(oldIdx, 1)
                        newTags.splice(newIdx, 0, moved)
                        setCaption(newTags.join(', '))
                        setDirty(true)
                      }
                    }
                  }}>
                    <SortableContext items={tags.map((_, i) => `tag-${i}`)} strategy={horizontalListSortingStrategy}>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {tags.map((tag, i) =>
                          editingTagIdx === i ? (
                            <input
                              key={`tag-${i}`}
                              value={editTagValue}
                              onChange={(e) => setEditTagValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  const trimmed = editTagValue.trim()
                                  const newTags = [...tags]
                                  newTags[i] = trimmed
                                  setCaption(newTags.join(', '))
                                  setDirty(true)
                                  setEditingTagIdx(null)
                                }
                                if (e.key === 'Escape') setEditingTagIdx(null)
                              }}
                              onBlur={() => setEditingTagIdx(null)}
                              autoFocus
                              className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono border border-cyano bg-coal-900 text-paper outline-none w-32"
                            />
                          ) : (
                            <TagChip key={`tag-${i}`} id={`tag-${i}`} tag={tag} onRemove={() => handleRemoveTag(i)} onEdit={() => { setEditingTagIdx(i); setEditTagValue(tag) }} />
                          )
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                  <input
                    type="text"
                    placeholder="Add tag and press Enter..."
                    onKeyDown={handleAddTag}
                    onKeyUp={(e) => { if (e.key === 'Backspace' && !e.currentTarget.value) { handleRemoveTag(tags.length - 1) } }}
                    className="w-full bg-transparent text-sm text-paper placeholder-paper-faint outline-none font-mono"
                  />
                </div>
              ) : (
                <div className="flex flex-col h-full px-4 py-3 min-h-0">
                  <textarea
                    value={caption}
                    onChange={(e) => { setCaption(e.target.value); setDirty(true) }}
                    className="flex-1 min-h-0 w-full bg-coal-800 text-paper text-sm font-mono p-2 rounded-md border border-coal-600 outline-none resize-none placeholder-paper-faint"
                    placeholder="Enter caption..."
                  />
                  {triggerWords.length > 0 && caption && (
                    <div className="font-mono text-xs text-paper-muted leading-snug p-2 bg-coal-800/50 rounded-md border border-coal-700 mt-2 shrink-0">
                      <span className="text-paper-faint mr-1.5">preview:</span>
                      {highlightCaptionEditor(caption, triggerWords)}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>
    </>
  )
}
