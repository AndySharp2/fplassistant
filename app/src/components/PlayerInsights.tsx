import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { getPlayerHistory, type PlayerHistory } from '../lib/fplClient'

/** On-demand prior-season + this-season history for one player - fetched only when opened (not part of bulk scoring). */
export function PlayerInsights({ playerId, playerName }: { playerId: number; playerName: string }) {
  const [open, setOpen] = useState(false)
  const [history, setHistory] = useState<PlayerHistory | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // The dialog carried role="dialog" and aria-modal but none of the behaviour those
  // promise: Escape did nothing and focus was left behind on the trigger's old position.
  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      triggerRef.current?.focus()
      return
    }
    if (!history) {
      setLoading(true)
      setError(null)
      getPlayerHistory(playerId)
        .then(setHistory)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load player history.'))
        .finally(() => setLoading(false))
    }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => onOpenChange(true)}
        aria-label={`${playerName} performance history`}
        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/12 bg-white/6 text-white/75 transition hover:border-emerald-300/25 hover:bg-emerald-300/12 hover:text-emerald-100"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-md" onClick={() => onOpenChange(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${playerName} performance history`}
            className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/88 text-white shadow-[0_30px_100px_rgba(0,0,0,0.45)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <h3 className="display-font text-xl font-bold">{playerName}</h3>
                <p className="mt-1 text-sm text-white/75">Performance history</p>
              </div>
              <button
                type="button"
                ref={closeRef}
                onClick={() => onOpenChange(false)}
                className="min-h-11 rounded-full border border-white/12 bg-white/6 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/12"
              >
                Close
              </button>
            </div>

            <div className="max-h-[calc(90vh-84px)] overflow-y-auto px-6 py-5">
              {loading && <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-white/70">Loading history...</div>}
              {error && <div className="rounded-2xl border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">{error}</div>}
              {history && (
                <div className="space-y-5">
                  <div className="overflow-hidden rounded-[24px] border border-white/10 bg-white/6">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-white/5 text-xs uppercase tracking-[0.24em] text-white/70">
                        <tr>
                          <th className="px-4 py-3">Season</th>
                          <th className="px-4 py-3">Points</th>
                          <th className="px-4 py-3">Mins</th>
                          <th className="px-4 py-3">Goals</th>
                          <th className="px-4 py-3">Assists</th>
                          <th className="px-4 py-3">Clean sheets</th>
                          <th className="px-4 py-3">Bonus</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.pastSeasons.map((season) => (
                          <tr key={season.seasonName} className="border-t border-white/8 text-white/85">
                            <td className="px-4 py-3 font-medium">{season.seasonName}</td>
                            <td className="px-4 py-3">{season.totalPoints}</td>
                            <td className="px-4 py-3">{season.minutes}</td>
                            <td className="px-4 py-3">{season.goalsScored}</td>
                            <td className="px-4 py-3">{season.assists}</td>
                            <td className="px-4 py-3">{season.cleanSheets}</td>
                            <td className="px-4 py-3">{season.bonus}</td>
                          </tr>
                        ))}
                        {history.pastSeasons.length === 0 && (
                          <tr className="border-t border-white/8 text-white/70">
                            <td className="px-4 py-4" colSpan={7}>
                              No prior-season data (new to the Premier League, or a debut season).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 text-sm text-white/75">
                    This season so far: {history.thisSeasonByRound.length} gameweek(s) played, {history.thisSeasonByRound.reduce((sum, round) => sum + round.totalPoints, 0)} total points.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
