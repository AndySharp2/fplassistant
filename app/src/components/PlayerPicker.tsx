import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CircleSlash2, Plus, Search } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { PlayerInsights } from './PlayerInsights'
import type { Position, Squad } from '../types'

const SQUAD_LIMITS: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 }
const STARTING_LIMITS: Record<Position, { min: number; max: number }> = {
  GKP: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 3, max: 5 },
  FWD: { min: 1, max: 3 },
}

type SortKey = 'xpts' | 'points' | 'price'

type PendingSwap = {
  playerId: number
  direction: 'toStarting' | 'toBench'
} | null

function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`
}

function pillClassName(active = false) {
  return active
    ? 'inline-flex items-center rounded-full border border-emerald-300/25 bg-emerald-300/12 px-2.5 py-1 text-[11px] font-semibold text-emerald-100'
    : 'inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-white/75'
}

function actionButtonClassName(kind: 'add' | 'remove' | 'swap') {
  if (kind === 'add') return 'inline-flex h-10 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/14 px-4 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-300/22'
  if (kind === 'remove') return 'inline-flex h-10 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-300/12 px-4 text-sm font-semibold text-rose-50 transition hover:bg-rose-300/22'
  return 'inline-flex h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/6 px-4 text-sm font-semibold text-white transition hover:bg-white/12'
}

/** Shared player list used by both "My Team" and "Transfers" - add/remove toggle per row, like the FPL site's Player Selection panel. */
export function PlayerPicker({
  squad,
  updateSquad,
  pendingSwap,
  onBeginSwap,
}: {
  squad: Squad
  updateSquad: (fn: (prev: Squad) => Squad) => void
  pendingSwap: PendingSwap
  onBeginSwap: (playerId: number, direction: 'toStarting' | 'toBench') => void
}) {
  const { players, teamsById, playersById, projections } = useAppData()
  const [search, setSearch] = useState('')
  const [positionFilter, setPositionFilter] = useState<Position | 'ALL'>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('xpts')

  const squadIds = useMemo(() => new Set(squad.players.map((sp) => sp.playerId)), [squad.players])
  const startingXICount = squad.players.filter((p) => p.inStartingXI).length

  const squadPositionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const sp of squad.players) {
      const player = playersById.get(sp.playerId)
      if (player) counts[player.position]++
    }
    return counts
  }, [squad.players, playersById])

  const startingPositionCounts = useMemo(() => {
    const counts: Record<Position, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const sp of squad.players) {
      if (!sp.inStartingXI) continue
      const player = playersById.get(sp.playerId)
      if (player) counts[player.position]++
    }
    return counts
  }, [squad.players, playersById])

  const remainingBudget = useMemo(() => {
    const spent = squad.players.reduce((sum, sp) => sum + sp.purchasePrice, 0)
    return 1000 - spent + squad.bank
  }, [squad.bank, squad.players])

  function xPts(playerId: number): number {
    return projections.get(playerId)?.perGameweek[0]?.expectedPoints ?? 0
  }

  function horizonPts(playerId: number): number {
    return projections.get(playerId)?.horizonTotal ?? 0
  }

  function sortValue(p: (typeof players)[number]): number {
    if (sortKey === 'points') return p.totalPoints
    if (sortKey === 'price') return p.nowCostTenths
    return xPts(p.id)
  }

  const filteredPlayers = players
    .filter((p) => positionFilter === 'ALL' || p.position === positionFilter)
    .filter((p) => p.webName.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => sortValue(b) - sortValue(a))
    .slice(0, 40)

  function addPlayer(playerId: number, position: Position, price: number) {
    if (squad.players.length >= 15) return
    if (squadPositionCounts[position] >= SQUAD_LIMITS[position]) return
    const clubCount = squad.players.filter((sp) => playersById.get(sp.playerId)?.teamId === players.find((p) => p.id === playerId)?.teamId).length
    if (clubCount >= 3) return
    if (price > remainingBudget) return
    const shouldStart = startingXICount < 11 && canStartPlayer(position)
    updateSquad((prev) => ({
      ...prev,
      players: [...prev.players, { playerId, purchasePrice: price, inStartingXI: shouldStart }],
    }))
  }

  function removePlayer(playerId: number) {
    updateSquad((prev) => ({ ...prev, players: prev.players.filter((sp) => sp.playerId !== playerId) }))
  }

  function canStartPlayer(position: Position): boolean {
    const current = startingPositionCounts[position]
    return current < STARTING_LIMITS[position].max
  }

  function canBenchPlayer(position: Position): boolean {
    const current = startingPositionCounts[position]
    return current > STARTING_LIMITS[position].min
  }

  function beginSwap(playerId: number, direction: 'toStarting' | 'toBench') {
    const player = playersById.get(playerId)
    if (!player) return
    if (direction === 'toStarting' && !canStartPlayer(player.position)) return
    if (direction === 'toBench' && !canBenchPlayer(player.position)) return
    onBeginSwap(playerId, direction)
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur-xl lg:grid-cols-[minmax(0,1.3fr)_170px_170px]">
        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white/70 focus-within:border-emerald-300/40 focus-within:ring-2 focus-within:ring-emerald-300/20">
          <Search className="h-4 w-4 flex-shrink-0" />
          <input
            className="w-full bg-transparent outline-none placeholder:text-white/35"
            placeholder="Find a player..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white/70">
          <span className="flex-shrink-0 text-xs uppercase tracking-[0.24em] text-white/35">Filter</span>
          <select
            className="w-full bg-transparent outline-none"
            value={positionFilter}
            onChange={(event) => setPositionFilter(event.target.value as Position | 'ALL')}
          >
            <option value="ALL">All players</option>
            <option value="GKP">Goalkeepers</option>
            <option value="DEF">Defenders</option>
            <option value="MID">Midfielders</option>
            <option value="FWD">Forwards</option>
          </select>
        </label>

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 text-sm text-white/70">
          <span className="flex-shrink-0 text-xs uppercase tracking-[0.24em] text-white/35">Sort</span>
          <select className="w-full bg-transparent outline-none" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="xpts">xPts</option>
            <option value="points">Total points</option>
            <option value="price">Price</option>
          </select>
        </label>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.3em] text-white/70">
        <span>{filteredPlayers.length} players</span>
        <span>{startingXICount}/11 starting</span>
      </div>

      <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
        {filteredPlayers.map((p) => {
          const selected = squadIds.has(p.id)
          const squadPlayer = squad.players.find((sp) => sp.playerId === p.id)
          const isStarting = !!squadPlayer?.inStartingXI
          const isPendingSource = pendingSwap?.playerId === p.id
          return (
            <div
              className={`grid items-center gap-3 rounded-[22px] border px-4 py-3 transition lg:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] ${selected || isPendingSource ? 'border-emerald-300/25 bg-emerald-300/10' : 'border-white/10 bg-slate-950/45 hover:border-white/15 hover:bg-slate-950/60'}`}
              key={p.id}
            >
              <div className="inline-flex items-center rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold text-white/75">
                {p.position}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-white">
                  {p.webName} <span className="text-white/70">({teamsById.get(p.teamId)?.shortName})</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
                  <span>{formatPrice(p.nowCostTenths)}</span>
                  <span className={pillClassName(selected)}>Squad {selected ? 'yes' : 'no'}</span>
                  {isPendingSource && <span className={pillClassName(true)}>Selected for swap</span>}
                </div>
              </div>
              <div className="justify-self-start lg:justify-self-end">
                <div className="inline-flex rounded-full border border-emerald-300/20 bg-emerald-300/12 px-3 py-1 text-xs font-semibold text-emerald-100">
                  {xPts(p.id).toFixed(2)} / {horizonPts(p.id).toFixed(2)} xPts
                </div>
              </div>
              <div className="justify-self-start lg:justify-self-end">
                <PlayerInsights playerId={p.id} playerName={p.webName} />
              </div>
              <div className="flex flex-wrap items-center gap-2 justify-self-start lg:justify-self-end">
                {selected ? (
                  <>
                    {isStarting ? (
                      <button className={actionButtonClassName('swap')} type="button" onClick={() => beginSwap(p.id, 'toBench')} aria-label={`Move ${p.webName} to the bench`}>
                        <ChevronDown className="h-4 w-4" />
                        <span className="ml-1">Bench</span>
                      </button>
                    ) : (
                      <button className={actionButtonClassName('swap')} type="button" onClick={() => beginSwap(p.id, 'toStarting')} aria-label={`Move ${p.webName} to the starting XI`}>
                        <ChevronUp className="h-4 w-4" />
                        <span className="ml-1">Start</span>
                      </button>
                    )}
                    <button className={actionButtonClassName('remove')} type="button" onClick={() => removePlayer(p.id)} aria-label={`Remove ${p.webName} from squad`}>
                      <CircleSlash2 className="h-4 w-4" />
                    </button>
                  </>
                ) : (
                  <button className={actionButtonClassName('add')} type="button" onClick={() => addPlayer(p.id, p.position, p.nowCostTenths)}>
                      <Plus className="h-4 w-4" />
                    <span className="ml-1">Add</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
