import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, type BatchRequest } from '../api/client'

export default function BatchPanel() {
  const queryClient = useQueryClient()
  const [op, setOp] = useState<BatchRequest['op']>('prepend')
  const [value, setValue] = useState('')
  const [value2, setValue2] = useState('')
  const [onlyUntagged, setOnlyUntagged] = useState(false)

  const { mutate: runBatch, isPending } = useMutation({
    mutationFn: (body: BatchRequest) => api.batch(body),
    onSuccess: (data) => {
      toast.success(`Files changed: ${data.changed} of ${data.total}`)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: () => toast.error('Operation error'),
  })

  const handleApply = () => {
    if (!value.trim()) return
    runBatch({ op, value: value.trim(), value2: value2.trim() || undefined, only_untagged: onlyUntagged })
  }

  return (
    <div className="px-4 py-3 border-b border-coal-700 bg-coal-850">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as BatchRequest['op'])}
          className="bg-coal-800 text-paper text-sm border border-coal-600 rounded-md px-2 py-1.5 font-mono"
        >
          <option value="prepend">Prepend</option>
          <option value="append">Append</option>
          <option value="remove_tag">Remove tag</option>
          <option value="regex_replace">Regex replace</option>
        </select>

        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={op === 'regex_replace' ? 'pattern...' : 'value...'}
          className="bg-coal-800 text-paper text-sm border border-coal-600 rounded-md px-2 py-1.5 font-mono flex-1 min-w-40 placeholder-paper-faint"
        />

        {op === 'regex_replace' && (
          <input
            type="text"
            value={value2}
            onChange={(e) => setValue2(e.target.value)}
            placeholder="replacement..."
            className="bg-coal-800 text-paper text-sm border border-coal-600 rounded-md px-2 py-1.5 font-mono flex-1 min-w-32 placeholder-paper-faint"
          />
        )}

        <label className="flex items-center gap-1.5 text-xs font-mono text-paper-muted cursor-pointer">
          <input type="checkbox" checked={onlyUntagged} onChange={(e) => setOnlyUntagged(e.target.checked)} className="accent-safe" />
          untagged only
        </label>

        <button
          onClick={handleApply}
          disabled={!value.trim() || isPending}
          className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider bg-safe text-coal-950 rounded-md font-semibold disabled:opacity-50"
        >
          {isPending ? '...' : 'Apply'}
        </button>
      </div>
    </div>
  )
}