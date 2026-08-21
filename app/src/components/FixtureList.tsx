import { useEffect, useMemo, useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { getFixtures } from '../services/fplApi'
import type { Fixture } from '../types'

const DIFFICULTY_LABEL: Record<number, string> = {
  1: 'Very easy',
  2: 'Easy',
  3: 'Average',
  4: 'Hard',
  5: 'Very hard',
}

const DIFFICULTY_STYLES: Record<number, { bg: string; fg: string; ring: string }> = {
  1: { bg: 'bg-emerald-300/15', fg: 'text-emerald-100', ring: 'ring-emerald-300/20' },
  2: { bg: 'bg-emerald-300/10', fg: 'text-emerald-100', ring: 'ring-emerald-300/15' },
  3: { bg: 'bg-amber-300/12', fg: 'text-amber-100', ring: 'ring-amber-300/15' },
  4: { bg: 'bg-rose-300/12', fg: 'text-rose-100', ring: 'ring-rose-300/15' },
  5: { bg: 'bg-rose-400/18', fg: 'text-rose-50', ring: 'ring-rose-300/25' },
}

function surfaceClassName(strong = false) {
  return strong
    ? 'rounded-[28px] border border-emerald-300/10 bg-[linear-gradient(180deg,rgba(31,10,39,0.72),rgba(9,10,18,0.66))] shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-2xl'
    : 'rounded-[24px] border border-white/10 bg-white/6 shadow-[0_20px_60px_rgba(0,0,0,0.24)] backdrop-blur-2xl'
}

function difficultyPill(diff: number, compact = false) {
  const style = DIFFICULTY_STYLES[diff] ?? DIFFICULTY_STYLES[3]
  return `${compact ? 'h-5 w-5 text-[10px]' : 'h-6 min-w-6 px-2 text-[11px]'} inline-flex items-center justify-center rounded-md border border-white/10 ${style.bg} ${style.fg} ring-1 ${style.ring} font-bold`
}

function formatTeam(teamsById: Map<number, { shortName: string }>, teamId: number): string {
  return teamsById.get(teamId)?.shortName ?? String(teamId)
}

export function FixtureList() {
  const { teamsById, currentEvent } = useAppData()
  const [fixtures, setFixtures] = useState<Fixture[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getFixtures()
      .then(setFixtures)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load fixtures.'))
  }, [])

  const upcomingByEvent = useMemo(() => {
    const map = new Map<number, Fixture[]>()
    for (const fixture of fixtures) {
      if (fixture.event === null || fixture.finished || fixture.event < currentEvent || fixture.event > currentEvent + 5) continue
      const list = map.get(fixture.event) ?? []
      list.push(fixture)
      map.set(fixture.event, list)
    }
    return [...map.entries()].sort(([a], [b]) => a - b)
  }, [fixtures, currentEvent])

  const heatRows = useMemo(() => {
    const scoreByTeam = new Map<number, number[]>()
    for (const [, list] of upcomingByEvent) {
      for (const fixture of list) {
        const homeScores = scoreByTeam.get(fixture.teamH) ?? []
        homeScores.push(fixture.teamHDifficulty)
        scoreByTeam.set(fixture.teamH, homeScores)

        const awayScores = scoreByTeam.get(fixture.teamA) ?? []
        awayScores.push(fixture.teamADifficulty)
        scoreByTeam.set(fixture.teamA, awayScores)
      }
    }

    return [...scoreByTeam.entries()]
      .map(([teamId, diffs]) => ({
        teamId,
        team: formatTeam(teamsById, teamId),
        average: diffs.reduce((sum, diff) => sum + diff, 0) / Math.max(1, diffs.length),
        cells: diffs.slice(0, 5),
      }))
      .sort((a, b) => a.average - b.average)
  }, [upcomingByEvent, teamsById])

  const summaryCards = useMemo(() => {
    const totalMatches = upcomingByEvent.reduce((sum, [, list]) => sum + list.length, 0)
    const easiest = heatRows[0]
    const hardest = heatRows[heatRows.length - 1]
    return [
      { label: 'Gameweeks shown', value: String(upcomingByEvent.length), hint: 'Next 5 events only' },
      { label: 'Matches tracked', value: String(totalMatches), hint: 'From the live FPL feed' },
      { label: 'Easiest run', value: easiest ? easiest.team : 'N/A', hint: easiest ? `Avg FDR ${easiest.average.toFixed(1)}` : 'No data yet' },
      { label: 'Toughest run', value: hardest ? hardest.team : 'N/A', hint: hardest ? `Avg FDR ${hardest.average.toFixed(1)}` : 'No data yet' },
    ]
  }, [heatRows, upcomingByEvent])

  if (error) {
    return (
      <div className="rounded-[24px] border border-rose-300/20 bg-rose-300/10 px-4 py-3 text-sm text-rose-50">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="display-font text-2xl font-bold text-white sm:text-3xl">Fixtures</h2>
          <p className="mt-2 max-w-2xl text-sm text-white/75">Gameweeks {currentEvent} to {currentEvent + 5} with a green-and-violet glass treatment and difficulty-first planning.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-2 text-xs uppercase tracking-[0.24em] text-white/70 backdrop-blur-xl">
          FDR 1
          <span className={difficultyPill(1, true)}>1</span>
          <span className={difficultyPill(2, true)}>2</span>
          <span className={difficultyPill(3, true)}>3</span>
          <span className={difficultyPill(4, true)}>4</span>
          <span className={difficultyPill(5, true)}>5</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className={surfaceClassName(true)}>
            <div className="p-5">
              <p className="text-[11px] uppercase tracking-[0.34em] text-white/70">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
              <p className="mt-2 text-sm text-white/75">{card.hint}</p>
            </div>
          </div>
        ))}
      </div>

      <section className={surfaceClassName(true)}>
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="display-font text-xl font-bold text-white">Difficulty Heatmap</h3>
              <p className="mt-1 text-sm text-white/75">Average fixture difficulty over the next 5 gameweeks.</p>
            </div>
            <div className="text-xs uppercase tracking-[0.24em] text-white/70">Sorted easiest first</div>
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-[72px_repeat(5,minmax(0,1fr))_56px] gap-2 text-[10px] uppercase tracking-[0.24em] text-white/40">
            <div />
            <div className="text-center">GW{currentEvent}</div>
            <div className="text-center">GW{currentEvent + 1}</div>
            <div className="text-center">GW{currentEvent + 2}</div>
            <div className="text-center">GW{currentEvent + 3}</div>
            <div className="text-center">GW{currentEvent + 4}</div>
            <div className="text-right">Avg</div>
          </div>
          <div className="mt-3 space-y-2">
            {heatRows.map((row) => (
              <div key={row.teamId} className="grid grid-cols-[72px_repeat(5,minmax(0,1fr))_56px] items-center gap-2 rounded-2xl border border-white/8 bg-slate-950/45 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-1 rounded-full" style={{ backgroundColor: `var(--team-${row.teamId}, #00ff87)` }} />
                  <span className="text-sm font-semibold text-white">{row.team}</span>
                </div>
                {row.cells.map((diff, index) => (
                  <div key={index} className="flex justify-center">
                    <span className={difficultyPill(diff, true)} title={DIFFICULTY_LABEL[diff]}>
                      {diff}
                    </span>
                  </div>
                ))}
                <div className="text-right font-mono text-sm font-semibold text-white/70">{row.average.toFixed(1)}</div>
              </div>
            ))}
            {heatRows.length === 0 && <div className="rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-5 text-sm text-white/75">No fixture data loaded yet.</div>}
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {upcomingByEvent.map(([event, list]) => (
          <article key={event} className={surfaceClassName()}>
            <div className="border-b border-white/10 px-6 py-5">
              <h3 className="display-font text-xl font-bold text-white">Gameweek {event}</h3>
              <p className="mt-1 text-sm text-white/75">{list.length} fixture{list.length === 1 ? '' : 's'} in this window.</p>
            </div>
            <div className="space-y-2 p-6">
              {list.map((fixture) => (
                <div key={fixture.id} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-3 backdrop-blur-xl">
                  <div className="min-w-[60px] text-left text-sm font-semibold text-white">{formatTeam(teamsById, fixture.teamH)}</div>
                  <span className={difficultyPill(fixture.teamHDifficulty, true)} title={DIFFICULTY_LABEL[fixture.teamHDifficulty]}>{fixture.teamHDifficulty}</span>
                  <div className="text-xs uppercase tracking-[0.24em] text-white/35">vs</div>
                  <span className={difficultyPill(fixture.teamADifficulty, true)} title={DIFFICULTY_LABEL[fixture.teamADifficulty]}>{fixture.teamADifficulty}</span>
                  <div className="min-w-[60px] text-right text-sm font-semibold text-white">{formatTeam(teamsById, fixture.teamA)}</div>
                </div>
              ))}
              {list.length === 0 && <div className="rounded-2xl border border-white/8 bg-slate-950/45 px-4 py-5 text-sm text-white/75">No fixtures in this range.</div>}
            </div>
          </article>
        ))}
      </section>
    </div>
  )
}
