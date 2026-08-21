import { useEffect, useState } from 'react'
import { ArrowRight, Check, Loader2, Save, Sparkles } from 'lucide-react'
import { useAppData } from '../context/AppDataContext'
import { buildSuggestedSquad, getRecommendations } from '../services/fplApi'
import { getFreeTransfersAvailable } from '../lib/freeTransfers'
import { card, primaryAction, secondaryAction } from '../lib/ui'
import { PitchView } from './PitchView'
import { PlayerPicker } from './PlayerPicker'
import { ChipSelector } from './ChipSelector'
import type { RecommendationResult, Squad } from '../types'

type PendingSwap = {
  playerId: number
  direction: 'toStarting' | 'toBench'
} | null

const TOTAL_BUDGET_TENTHS = 1000 // £100.0m

function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`
}

export function TeamBuilder({
  squad,
  updateSquad,
  saveToCloud,
  saveState,
  selectedGameweekIndex,
}: {
  squad: Squad
  updateSquad: (fn: (prev: Squad) => Squad) => void
  saveToCloud: () => Promise<void>
  saveState: 'idle' | 'saving' | 'saved' | 'error'
  selectedGameweekIndex: number
}) {
  const { loading, error, projectionsError, currentEvent, preSeason, horizonGameweeks } = useAppData()
  const [autoBuildLoading, setAutoBuildLoading] = useState(false)
  const [autoBuildNotes, setAutoBuildNotes] = useState<string[] | null>(null)
  const [autoBuildError, setAutoBuildError] = useState<string | null>(null)
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null)
  const [recommendationLoading, setRecommendationLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState<string | null>(null)
  const [pendingSwap, setPendingSwap] = useState<PendingSwap>(null)

  const freeTransfersAvailable = getFreeTransfersAvailable(currentEvent, preSeason, squad.freeTransfers)
  const effectiveSquad = { ...squad, freeTransfers: freeTransfersAvailable }
  const recommendationStartGameweek = currentEvent + selectedGameweekIndex

  const squadKey = squad.players
    .map((p) => `${p.playerId}:${p.inStartingXI ? 1 : 0}`)
    .sort()
    .join(',')

  useEffect(() => {
    if (squad.players.length !== 15) {
      setRecommendation(null)
      return
    }
    let cancelled = false
    setRecommendationLoading(true)
    setRecommendationError(null)
    getRecommendations(effectiveSquad, recommendationStartGameweek, horizonGameweeks, 5)
      .then((data) => {
        if (!cancelled) setRecommendation(data)
      })
      .catch((err) => {
        if (!cancelled) setRecommendationError(err instanceof Error ? err.message : 'Failed to compute transfer suggestions.')
      })
      .finally(() => {
        if (!cancelled) setRecommendationLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squadKey, effectiveSquad.freeTransfers, squad.activeChip, horizonGameweeks, recommendationStartGameweek])

  useEffect(() => {
    if (preSeason || currentEvent > 2 || squad.freeTransfers === 1) return
    updateSquad((prev) => ({ ...prev, freeTransfers: 1 }))
  }, [currentEvent, preSeason, squad.freeTransfers, updateSquad])

  const startingXICount = squad.players.filter((p) => p.inStartingXI).length
  const spent = squad.players.reduce((sum, sp) => sum + sp.purchasePrice, 0)
  const remaining = TOTAL_BUDGET_TENTHS - spent + squad.bank

  function removePlayer(playerId: number) {
    setPendingSwap((current) => (current?.playerId === playerId ? null : current))
    updateSquad((prev) => ({ ...prev, players: prev.players.filter((sp) => sp.playerId !== playerId) }))
  }

  function beginSwap(playerId: number, direction: 'toStarting' | 'toBench') {
    setPendingSwap({ playerId, direction })
  }

  function clearPendingSwap() {
    setPendingSwap(null)
  }

  function setBank(value: number) {
    const nextBank = Math.round(value * 10)
    updateSquad((prev) => ({
      ...prev,
      bank: Math.max(0, Math.min(nextBank, TOTAL_BUDGET_TENTHS)),
    }))
  }

  function applyAllTransfers() {
    if (!recommendation) return
    updateSquad(() => recommendation.resultingSquad)
  }

  function applySingleTransfer(index: number) {
    if (!recommendation) return
    const suggestion = recommendation.suggestions[index]
    if (!suggestion) return
    updateSquad((prev) => {
      const outgoing = prev.players.find((sp) => sp.playerId === suggestion.out.playerId)
      if (!outgoing) return prev
      if (prev.bank + outgoing.purchasePrice < suggestion.in.priceTenths) return prev
      const incoming = {
        playerId: suggestion.in.playerId,
        purchasePrice: suggestion.in.priceTenths,
        inStartingXI: outgoing.inStartingXI,
        isCaptain: !!outgoing.isCaptain,
        isViceCaptain: !!outgoing.isViceCaptain,
      }
      const nextPlayers = prev.players
        .filter((sp) => sp.playerId !== suggestion.out.playerId)
        .map((sp) => ({ ...sp, isCaptain: false, isViceCaptain: false }))
      nextPlayers.push(incoming)
      return {
        ...prev,
        bank: prev.bank + outgoing.purchasePrice - suggestion.in.priceTenths,
        freeTransfers: suggestion.transferCost === 0 ? Math.max(0, prev.freeTransfers - 1) : 0,
        players: nextPlayers,
      }
    })
  }

  async function autoBuildSquad() {
    setAutoBuildLoading(true)
    setAutoBuildNotes(null)
    setAutoBuildError(null)
    try {
      const built = await buildSuggestedSquad(horizonGameweeks)
      if (built.squad.players.length === 0) {
        setAutoBuildError('No eligible players were found - the FPL data source may be unavailable right now.')
        return
      }
      updateSquad(() => built.squad)
      setAutoBuildNotes(built.notes)
    } catch (err) {
      setAutoBuildError(err instanceof Error ? err.message : 'Failed to build a suggested squad.')
    } finally {
      setAutoBuildLoading(false)
    }
  }

  if (loading) {
    return (
      <div className={`${card()} flex items-center justify-center gap-3 px-6 py-16 text-[13px] text-[#9d8fb0]`}>
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading Premier League player data...
      </div>
    )
  }

  if (error) {
    return <div className="rounded-[13px] border border-[#ff5f6d]/25 bg-[#ff5f6d]/10 px-4 py-3 text-[13px] text-[#ff8f9a]">{error}</div>
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-1.2px]">My Team</h1>
          <p className="mt-1.5 text-[13px] text-[#9d8fb0]">
            {squad.players.length}/15 picked · {startingXICount}/11 starting · {formatPrice(remaining)} of £100.0m left
            {squad.players.length > 0 ? ' · drag a player to swap with the bench' : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex items-center gap-2 rounded-[11px] border border-white/[0.07] bg-white/[0.04] px-3 py-2 text-[11px] text-[#9d8fb0] focus-within:border-[#00ff87]/40">
            <span className="whitespace-nowrap uppercase tracking-[1.2px]">Bank</span>
            <input
              type="number"
              step={0.1}
              min={0}
              value={squad.bank / 10}
              onChange={(e) => setBank(Number(e.target.value))}
              className="num w-16 bg-transparent text-right text-sm font-bold text-[#f2ecf7] outline-none"
            />
          </label>
          <button type="button" className={secondaryAction} disabled={autoBuildLoading} onClick={() => void autoBuildSquad()}>
            {autoBuildLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
            {autoBuildLoading ? 'Building...' : 'AI build squad'}
          </button>
          <button type="button" className={primaryAction} disabled={saveState === 'saving'} onClick={() => void saveToCloud()}>
            {saveState === 'saved' ? <Check className="h-4 w-4" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
            {saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {saveState === 'error' && (
        <div className="rounded-[13px] border border-[#ff5f6d]/25 bg-[#ff5f6d]/10 px-4 py-3 text-[13px] text-[#ff8f9a]">Save failed.</div>
      )}
      {projectionsError && (
        <div className="rounded-[13px] border border-[#ffb86c]/25 bg-[#ffb86c]/10 px-4 py-3 text-[13px] text-[#ffb86c]">
          Expected points unavailable: {projectionsError}
        </div>
      )}
      {autoBuildError && (
        <div className="rounded-[13px] border border-[#ff5f6d]/25 bg-[#ff5f6d]/10 px-4 py-3 text-[13px] text-[#ff8f9a]">{autoBuildError}</div>
      )}
      {autoBuildNotes && (
        <ul className="flex flex-col gap-1 text-[12px] leading-relaxed text-[#9d8fb0]">
          {autoBuildNotes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}

      {squad.players.length > 0 ? (
        <PitchView
          squad={squad}
          updateSquad={updateSquad}
          onRemovePlayer={removePlayer}
          selectedGameweekIndex={selectedGameweekIndex}
          pendingSwap={pendingSwap}
          onBeginSwap={beginSwap}
          onClearSwap={clearPendingSwap}
        />
      ) : (
        <div className={`${card()} px-6 py-12 text-center text-[13px] text-[#9d8fb0]`}>
          No players yet — use <span className="font-semibold text-[#f2ecf7]">AI build squad</span>, or add players below.
        </div>
      )}

      <ChipSelector squad={squad} updateSquad={updateSquad} />

      <div className="flex flex-col gap-3">
        <h3 className="eyebrow">Add / remove players</h3>
        <PlayerPicker squad={squad} updateSquad={updateSquad} pendingSwap={pendingSwap} onBeginSwap={beginSwap} />
      </div>

      {recommendationLoading && (
        <div className={`${card()} flex items-center gap-3 px-5 py-4 text-[13px] text-[#9d8fb0]`}>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Checking for better transfers...
        </div>
      )}

      {recommendationError && (
        <div className="rounded-[13px] border border-[#ff5f6d]/25 bg-[#ff5f6d]/10 px-4 py-3 text-[13px] text-[#ff8f9a]">{recommendationError}</div>
      )}

      {recommendation && recommendation.suggestions.length > 0 && (
        <div className={`${card()} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="eyebrow">Transfer plan</h3>
              <p className="mt-1 text-[11px] text-[#9d8fb0]">
                Sequential over the next {recommendation.horizonGameweeks} gameweeks · free transfers first, a -4 hit only when it still wins
              </p>
            </div>
            <button type="button" className="text-[11px] font-semibold text-[#00ff87] transition hover:brightness-110" onClick={applyAllTransfers}>
              Apply all
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {recommendation.suggestions.map((s, i) => (
              <div key={i} className="rounded-[13px] border border-white/[0.06] bg-white/[0.025] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="num text-[10px] font-bold tracking-[0.6px] text-[#9d8fb0]">GW{s.recommendedGameweek}</span>
                  <span className="text-[13px] font-semibold text-[#ff8f9a]">{s.out.webName}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-[#7d7089]" aria-hidden="true" />
                  <span className="text-[13px] font-semibold text-[#00ff87]">{s.in.webName}</span>
                  <span className="num text-[11px] text-[#9d8fb0]">£{(s.in.priceTenths / 10).toFixed(1)}m</span>
                  <span className="num ml-auto text-[12px] font-bold text-[#f2ecf7]">+{s.netGain}</span>
                  <span
                    className={`rounded-[6px] px-1.5 py-0.5 text-[10px] font-bold ${
                      s.transferCost === 0 ? 'bg-[#00ff87]/16 text-[#00ff87]' : 'bg-[#ffb86c]/16 text-[#ffb86c]'
                    }`}
                  >
                    {s.transferCost === 0 ? 'FREE' : '-4'}
                  </span>
                  <button
                    type="button"
                    className="rounded-[8px] border border-white/[0.08] px-2 py-1 text-[11px] font-semibold text-[#f2ecf7] transition hover:bg-white/[0.08]"
                    onClick={() => applySingleTransfer(i)}
                  >
                    Apply
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-[#9d8fb0]">{s.reason}</p>
              </div>
            ))}
            {recommendation.notes.length > 0 && (
              <ul className="flex flex-col gap-1 pt-1 text-[11px] leading-relaxed text-[#7d7089]">
                {recommendation.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {recommendation && recommendation.suggestions.length === 0 && !recommendationLoading && (
        <div className="rounded-[13px] border border-[#00ff87]/20 bg-[#00ff87]/8 px-4 py-3 text-[13px] text-[#00ff87]">
          Your squad already looks strong — no beneficial transfers found.
        </div>
      )}
    </div>
  )
}
