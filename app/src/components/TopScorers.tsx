import { useMemo, useState } from 'react'
import { Trophy } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { PlayerShirt } from './PlayerShirt'
import type { Position } from '../types'

type ScopeKey = 'next' | 'horizon'

function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`
}

function surfaceClassName() {
  return 'rounded-[28px] border border-white/10 bg-white/8 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.30)]'
}

function selectClassName() {
  return 'h-11 rounded-2xl border border-white/10 bg-slate-950/55 px-4 text-sm text-white outline-none transition focus:border-emerald-300/40 focus:bg-slate-950/75 focus:ring-2 focus:ring-emerald-300/20'
}

const POSITION_STYLES: Record<Position, string> = {
  GKP: 'border-amber-300/20 bg-amber-300/12 text-amber-100',
  DEF: 'border-sky-300/20 bg-sky-300/12 text-sky-100',
  MID: 'border-emerald-300/20 bg-emerald-300/12 text-emerald-100',
  FWD: 'border-rose-300/20 bg-rose-300/12 text-rose-100',
}

export function TopScorers() {
  const { players, teamsById, projections, projectionsLoading, projectionsError, currentEvent, horizonGameweeks } = useAppData()
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL')
  const [scope, setScope] = useState<ScopeKey>('next')

  const ranked = useMemo(() => {
    return players
      .filter((p) => positionFilter === 'ALL' || p.position === positionFilter)
      .map((p) => {
        const proj = projections.get(p.id)
        const nextGw = proj?.perGameweek[0]?.expectedPoints ?? 0
        const horizon = proj?.horizonTotal ?? 0
        return { player: p, nextGw, horizon }
      })
      .filter((r) => r.nextGw > 0 || r.horizon > 0)
      .sort((a, b) => (scope === 'next' ? b.nextGw - a.nextGw : b.horizon - a.horizon))
      .slice(0, 25)
  }, [players, projections, positionFilter, scope])

  if (projectionsLoading) {
    return (
      <div className="flex items-center justify-center rounded-[28px] border border-white/10 bg-white/6 px-6 py-16 backdrop-blur-2xl">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-300" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="display-font text-2xl font-bold text-white">AI Top Scorers</h2>
          <p className="mt-2 text-sm text-white/75">
            Predicted top performers for {scope === 'next' ? `Gameweek ${currentEvent}` : `the next ${horizonGameweeks} gameweeks`}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white/70">
            <span className="text-xs uppercase tracking-[0.24em] text-white/35">Scope</span>
            <select className={selectClassName()} value={scope} onChange={(event) => setScope(event.target.value as ScopeKey)}>
              <option value="next">This gameweek</option>
              <option value="horizon">Next {horizonGameweeks} gameweeks</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white/70">
            <span className="text-xs uppercase tracking-[0.24em] text-white/35">Position</span>
            <select className={selectClassName()} value={positionFilter} onChange={(event) => setPositionFilter(event.target.value as Position | 'ALL')}>
              <option value="ALL">All positions</option>
              <option value="GKP">Goalkeepers</option>
              <option value="DEF">Defenders</option>
              <option value="MID">Midfielders</option>
              <option value="FWD">Forwards</option>
            </select>
          </label>
        </div>
      </div>

      {projectionsError && (
        <div className="rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
          Predictions unavailable: {projectionsError}
        </div>
      )}

      <div className={surfaceClassName()}>
        <div className="space-y-2 p-6">
          {ranked.map((r, i) => {
            const team = teamsById.get(r.player.teamId)
            return (
              <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-xl" key={r.player.id}>
                <div className="w-7 text-center text-sm font-semibold text-white/70">{i === 0 ? <Trophy className="h-4 w-4" /> : i + 1}</div>
                <PlayerShirt teamId={r.player.teamId} position={r.player.position} teamShortName={team?.shortName ?? '?'} />
                <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${POSITION_STYLES[r.player.position]}`}>{r.player.position}</span>
                <div className="min-w-0 flex-1 text-white">
                  {r.player.webName} <span className="text-white/70">({team?.shortName})</span> - {formatPrice(r.player.nowCostTenths)}
                </div>
                <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/12 px-3 py-1 text-xs font-semibold text-emerald-100">
                  {(scope === 'next' ? r.nextGw : r.horizon).toFixed(2)} xPts
                </div>
              </div>
            )
          })}
          {ranked.length === 0 && <p className="text-sm text-white/75">No predictions available yet.</p>}
        </div>
      </div>
    </div>
  )
}
