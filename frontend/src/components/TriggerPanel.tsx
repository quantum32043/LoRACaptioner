import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Target, Plus, CheckCircle, AlertTriangle, AlertCircle } from 'lucide-react'
import { api, type TriggerCheckStats } from '../api/client'
import { useDatasetStore } from '../store/useDatasetStore'

function normalize(s: string) {
  return s.toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}

export function checkTriggerWords(items: { filename: string; caption: string }[], triggerWords: string[]): { stats: TriggerCheckStats; results: Record<string, { status: string; variant: string | null }> } {
  const warnBuckets: Record<string, { count: number; examples: Set<string> }> = { case: { count: 0, examples: new Set() }, separator: { count: 0, examples: new Set() } }
  let exact = 0
  let missing = 0
  const results: Record<string, { status: string; variant: string | null }> = {}

  for (const item of items) {
    const tags = item.caption.split(',').map((t) => t.trim()).filter(Boolean)
    let status = 'missing'
    let variant: string | null = null

    for (const tag of tags) {
      for (const tw of triggerWords) {
        const tws = tw.trim()
        if (!tws) continue
        if (tag === tws) { status = 'exact'; break }
        if (tag.toLowerCase() === tws.toLowerCase()) { status = 'case'; variant = tag; break }
        if (normalize(tag) === normalize(tws)) { status = 'separator'; variant = tag; break }
      }
      if (status === 'exact') break
    }

    if (status === 'exact') exact++
    else if (status === 'missing') missing++
    else {
      const bucket = warnBuckets[status]
      bucket.count++
      if (variant) bucket.examples.add(variant)
    }
    results[item.filename] = { status, variant }
  }

  const warnings: TriggerCheckStats['warnings'] = []
  for (const type of ['case', 'separator'] as const) {
    if (warnBuckets[type].count > 0) {
      warnings.push({ type, count: warnBuckets[type].count, examples: Array.from(warnBuckets[type].examples).slice(0, 5) })
    }
  }

  return { stats: { total: items.length, exact, warnings, missing }, results }
}

export default function TriggerPanel() {
  const items = useDatasetStore((s) => s.items)
  const triggerWords = useDatasetStore((s) => s.triggerWords)
  const triggerCheckStats = useDatasetStore((s) => s.triggerCheckStats)
  const setTriggerWords = useDatasetStore((s) => s.setTriggerWords)
  const setTriggerCheckStats = useDatasetStore((s) => s.setTriggerCheckStats)

  const [inputValue, setInputValue] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const [onlyUntagged, setOnlyUntagged] = useState(false)
  const queryClient = useQueryClient()

  const handleAddTrigger = () => {
    const val = inputValue.trim()
    if (!val || triggerWords.includes(val)) return
    setTriggerWords([...triggerWords, val])
    setInputValue('')
  }

  const handleRemoveTrigger = (idx: number) => {
    setTriggerWords(triggerWords.filter((_, i) => i !== idx))
  }

  const handleEditTrigger = (idx: number) => {
    setEditingIdx(idx)
    setEditValue(triggerWords[idx])
  }

  const handleEditCommit = (idx: number) => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== triggerWords[idx]) {
      const next = [...triggerWords]
      next[idx] = trimmed
      setTriggerWords(next)
    }
    setEditingIdx(null)
  }

  const handleAdd = () => {
    if (triggerWords.length === 0) return
    let filenames: string[] | undefined
    if (onlyMissing && triggerCheckStats) {
      const missingFns = items.filter((item) => {
        const tags = item.caption.split(',').map((t) => t.trim()).filter(Boolean)
        for (const tw of triggerWords) {
          const tws = tw.trim()
          if (!tws) continue
          for (const tag of tags) {
            if (tag === tws) return false
            if (tag.toLowerCase() === tws.toLowerCase()) return false
            if (normalize(tag) === normalize(tws)) return false
          }
        }
        return true
      }).map((i) => i.filename)
      if (missingFns.length === 0) { toast.info('Все файлы уже содержат триггер'); return }
      filenames = missingFns
    }
    runAdd({ trigger_words: triggerWords, filenames: filenames || null, only_untagged: onlyUntagged })
  }

  const { mutate: runAdd, isPending } = useMutation({
    mutationFn: (body: { trigger_words: string[]; filenames: string[] | null; only_untagged: boolean }) =>
      api.triggerAdd({ trigger_words: body.trigger_words, filenames: body.filenames, only_untagged: body.only_untagged }),
    onSuccess: (data) => {
      toast.success(`Триггер добавлен в ${data.changed} из ${data.total} файлов`)
      setTriggerCheckStats(null)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: () => toast.error('Ошибка при добавлении триггера'),
  })

  return (
    <div className="px-4 py-3 border-b border-coal-700 bg-coal-850">
      <div className="flex items-center gap-2 mb-2">
        <Target size={16} className="text-safe shrink-0" />
        <span className="font-mono text-xs text-paper uppercase tracking-wider">Trigger words</span>
      </div>

      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {triggerWords.map((word, i) =>
          editingIdx === i ? (
            <input
              key={i}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleEditCommit(i) }
                if (e.key === 'Escape') setEditingIdx(null)
              }}
              onBlur={() => handleEditCommit(i)}
              autoFocus
              className="inline-flex px-2 py-0.5 rounded-md text-xs font-mono border border-cyano bg-coal-900 text-paper outline-none w-28"
            />
          ) : (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-coal-700 text-paper rounded-md text-xs font-mono border border-coal-600">
              <span className="cursor-pointer hover:text-cyano" onClick={() => handleEditTrigger(i)}>{word}</span>
              <button onClick={() => handleRemoveTrigger(i)} className="text-paper-faint hover:text-ember ml-0.5">&times;</button>
            </span>
          )
        )}
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTrigger() } }}
            placeholder="триггер..."
            className="bg-transparent text-sm text-paper placeholder-paper-faint outline-none font-mono w-24"
          />
          <button
            onClick={handleAddTrigger}
            disabled={!inputValue.trim()}
            className="p-1 text-cyano hover:text-cyano/80 disabled:text-paper-faint/30"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {triggerCheckStats && (
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-cyano flex items-center gap-1"><CheckCircle size={12} />{triggerCheckStats.exact}</span>
            <span className="text-paper-faint">/</span>
            <span className="text-paper-muted">{triggerCheckStats.total}</span>
            {triggerCheckStats.exact === triggerCheckStats.total && (
              <span className="text-cyano text-[10px] tracking-wider uppercase">— все ок</span>
            )}
          </div>

          {triggerCheckStats.warnings.map((w) => (
            <div key={w.type} className="flex items-center gap-1.5 text-xs font-mono text-safe">
              <AlertTriangle size={12} />
              <span>
                {w.type === 'case' ? 'Другой регистр' : 'Разделитель'}
                : {w.count} файлов
              </span>
              {w.examples.length > 0 && (
                <span className="text-paper-faint">({w.examples.join(', ')})</span>
              )}
            </div>
          ))}

          {triggerCheckStats.missing > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-mono text-ember">
              <AlertCircle size={12} />
              <span>Отсутствует: {triggerCheckStats.missing} файлов</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-coal-700/50">
        <label className="flex items-center gap-1.5 text-xs font-mono text-paper-muted cursor-pointer">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} className="accent-safe" />
          только без триггера
        </label>

        <label className="flex items-center gap-1.5 text-xs font-mono text-paper-muted cursor-pointer">
          <input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} className="accent-safe" />
          только пустые
        </label>

        <button
          onClick={handleAdd}
          disabled={triggerWords.length === 0 || isPending}
          className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider bg-safe text-coal-950 rounded-md font-semibold disabled:opacity-50"
        >
          {isPending ? '...' : 'Добавить триггер'}
        </button>
      </div>
    </div>
  )
}
