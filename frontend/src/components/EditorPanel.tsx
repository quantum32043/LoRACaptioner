import { useState, useEffect, useCallback, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Save, Type, X } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

function TagChip({ tag, onRemove, onEdit, id }: { tag: string; onRemove: () => void; onEdit: () => void; id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <span ref={setNodeRef} style={style} {...attributes} {...listeners} className="inline-flex items-center gap-1 px-2 py-0.5 bg-coal-700 text-paper rounded-md text-xs font-mono cursor-grab active:cursor-grabbing border border-coal-600">
      <span className="cursor-pointer hover:text-cyano" onClick={onEdit}>{tag}</span>
      <button onClick={onRemove} className="text-paper-faint hover:text-ember ml-0.5">&times;</button>
    </span>
  )
}

export default function EditorPanel() {
  const items = useDatasetStore((s) => s.items)
  const selectedFilename = useDatasetStore((s) => s.selectedFilename)
  const selectedFilenames = useDatasetStore((s) => s.selectedFilenames)
  const setSelected = useDatasetStore((s) => s.setSelected)
  const clearSelection = useDatasetStore((s) => s.clearSelection)
  const setPanelOpen = useDatasetStore((s) => s.setPanelOpen)
  const updateItem = useDatasetStore((s) => s.updateItem)
  const total = useDatasetStore((s) => s.total)

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
    onSuccess: () => {
      setDirty(false)
      if (selectedItem) updateItem(selectedItem.filename, caption)
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: () => toast.error('Ошибка сохранения'),
  })

  const { mutate: batchSave, isPending: batchSaving } = useMutation({
    mutationFn: async ({ filenames, caption, mode, remove }: { filenames: string[]; caption: string; mode: 'append' | 'prepend' | 'set'; remove: string[] }) => {
      for (const fn of filenames) {
        const item = items.find((i) => i.filename === fn)
        const existingTags = (item?.caption || '').split(',').map((t) => t.trim()).filter(Boolean)
        const filtered = existingTags.filter((t) => !remove.includes(t))
        const existing = filtered.join(', ')
        let newCaption: string
        if (mode === 'set') {
          newCaption = caption
        } else if (!existing) {
          newCaption = caption
        } else if (mode === 'prepend') {
          newCaption = `${caption}, ${existing}`
        } else {
          newCaption = existing ? `${existing}, ${caption}` : caption
        }
        await api.saveCaption(fn, newCaption)
      }
    },
    onSuccess: (_, { filenames }) => {
      setDirty(false)
      setRemovedTags([])
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      toast.success(`Сохранено для ${filenames.length} кадров`)
    },
    onError: () => toast.error('Ошибка массового сохранения'),
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
      toast.success('Тег переименован')
    },
    onError: () => toast.error('Ошибка переименования'),
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
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
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

  if (!isBatch && !selectedItem) {
    return (
      <aside className="w-full md:w-80 lg:w-96 xl:w-[440px] border-l border-coal-700 bg-coal-900 flex items-center justify-center">
        <div className="text-center px-8">
          <p className="font-mono text-sm text-paper-muted mb-2">Выберите кадр</p>
          <p className="font-mono text-xs text-paper-faint">Кликните на изображение в сетке</p>
          <p className="font-mono text-xs text-paper-faint mt-1"><kbd className="border border-coal-600 px-1 rounded">←</kbd> <kbd className="border border-coal-600 px-1 rounded">→</kbd> навигация</p>
        </div>
      </aside>
    )
  }

  return (
    <aside className="w-full md:w-80 lg:w-96 xl:w-[440px] border-l border-coal-700 bg-coal-900 flex flex-col overflow-hidden">
      {isBatch ? (
        <div className="px-4 py-2 border-b border-coal-700 flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-cyano truncate">выбрано {selectedFilenames.length} / {total}</span>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={handleSave} disabled={batchSaving} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-coal-600 rounded-md text-paper hover:bg-coal-700"><Save size={14} />{batchSaving ? '...' : 'Сохранить всем'}</button>
            <button onClick={clearSelection} className="text-xs font-mono text-paper-faint hover:text-paper border border-coal-600 px-2 py-0.5 rounded-md">Снять</button>
            <button onClick={() => setPanelOpen(false)} className="text-paper-faint hover:text-paper md:hidden"><X size={16} /></button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-2 border-b border-coal-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => setPanelOpen(false)} className="text-paper-faint hover:text-paper md:hidden shrink-0"><X size={16} /></button>
            <span className="font-mono text-xs text-paper-muted truncate">кадр {selectedIdx + 1} / {total}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`w-2 h-2 rounded-full ${dirty ? 'bg-safe animate-pulse shadow-[0_0_6px_#f5a02c]' : 'bg-cyano'}`} />
            <button onClick={() => setTagMode(!tagMode)} className="text-paper-faint hover:text-paper"><Type size={16} /></button>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 px-2 py-1 text-xs font-mono bg-coal-800 border border-coal-600 rounded-md text-paper hover:bg-coal-700"><Save size={14} />{saving ? '...' : 'Сохранить'}</button>
          </div>
        </div>
      )}

      {isBatch ? (
        <div className="flex-1 overflow-y-auto bg-coal-950 px-4 py-3">
          {commonTags.length > 0 && (
            <div className="mb-3">
              <p className="font-mono text-xs text-paper-faint mb-1.5">Общие теги ({commonTags.length}):</p>
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
                  return (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-mono border transition-colors ${
                        isRemoved
                          ? 'bg-coal-900 text-paper-faint/50 border-coal-700 line-through cursor-pointer'
                          : 'bg-coal-800 text-paper-muted border-coal-600'
                      }`}
                    >
                      <span
                        className="cursor-pointer hover:text-paper"
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
                        {isRemoved ? '↩' : '×'}
                      </span>
                    </span>
                  )
                })}
              </div>
              {differingCount > 0 && (
                <p className="font-mono text-xs text-paper-faint mt-1.5">...и ещё {differingCount} тегов различаются</p>
              )}
              {removedTags.length > 0 && (
                <p className="font-mono text-xs text-ember mt-1.5">Будут удалены: {removedTags.join(', ')}</p>
              )}
            </div>
          )}
          {commonTags.length === 0 && differingCount === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="font-mono text-xs text-paper-faint">У выбранных кадров нет капшенов</p>
            </div>
          )}
        </div>
      ) : (
        <>
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
        </>
      )}

      <div className="px-4 py-3 border-t border-coal-700">
        <div className="flex items-center gap-2 mb-2">
          {isBatch && (
            <>
              <select
                value={batchMode}
                onChange={(e) => setBatchMode(e.target.value as 'append' | 'prepend' | 'set')}
                className="bg-coal-800 text-paper text-xs font-mono border border-coal-600 rounded-md px-2 py-1"
              >
                <option value="append">В конец</option>
                <option value="prepend">В начало</option>
                <option value="set">Заменить</option>
              </select>
              <span className="font-mono text-xs text-paper-faint">для {selectedFilenames.length} кадров</span>
            </>
          )}
        </div>
        {tagMode && !isBatch ? (
          <div>
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
              placeholder="Добавить тег и Enter..."
              onKeyDown={handleAddTag}
              onKeyUp={(e) => { if (e.key === 'Backspace' && !e.currentTarget.value) { handleRemoveTag(tags.length - 1) } }}
              className="w-full bg-transparent text-sm text-paper placeholder-paper-faint outline-none font-mono"
            />
          </div>
        ) : (
          <textarea
            value={caption}
            onChange={(e) => { setCaption(e.target.value); setDirty(true) }}
            className="w-full h-32 bg-coal-800 text-paper text-sm font-mono p-2 rounded-md border border-coal-600 outline-none resize-none placeholder-paper-faint"
            placeholder="Введите капшен..."
          />
        )}
      </div>
    </aside>
  )
}