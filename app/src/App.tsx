import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, LayoutDashboard, Sparkles, Trophy, Users } from 'lucide-react'
import { TeamBuilder } from './components/TeamBuilder'
import { FixtureList } from './components/FixtureList'
import { TopScorers } from './components/TopScorers'
import { useSquad } from './hooks/useSquad'
import { useAppData } from './context/AppDataContext'
import { getFreeTransfersAvailable } from './lib/freeTransfers'
import { card, field, primaryAction } from './lib/ui'

type TabValue = 'home' | 'team' | 'scorers' | 'fixtures'

const tabs: Array<{ value: TabValue; label: string; icon: typeof LayoutDashboard; description: string }> = [
  { value: 'home', label: 'Overview', icon: LayoutDashboard, description: 'Squad snapshot and next steps' },
  { value: 'team', label: 'My Team', icon: Users, description: 'Pitch, bench, chips, and transfers' },
  { value: 'scorers', label: 'Scorers', icon: Trophy, description: 'Projected points leaders' },
  { value: 'fixtures', label: 'Fixtures', icon: CalendarDays, description: 'Upcoming schedule and FDR' },
]

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className={`${field()} flex items-baseline gap-2 px-3 py-1.5`}>
      <span className="eyebrow">{label}</span>
      <span className="num text-sm font-bold text-[#f2ecf7]">{value}</span>
    </div>
  )
}

function Sidebar({ selected, onSelect }: { selected: TabValue; onSelect: (tab: TabValue) => void }) {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col gap-7 border-r border-white/[0.07] bg-gradient-to-b from-[rgba(55,0,60,0.55)] to-[rgba(11,6,16,0.2)] px-4 py-6 lg:flex">
      <div className="flex items-center gap-3 px-1.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#00ff87] to-[#00c46a] text-[15px] font-bold tracking-tight text-[#12002a] shadow-[0_0_22px_rgba(0,255,135,0.35)]">
          FPL
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight">Transfer Assistant</span>
          <span className="text-[11px] text-[#9d8fb0]">2026/27 season</span>
        </div>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Sections">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = selected === tab.value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onSelect(tab.value)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[11px] px-3 text-left text-[13px] font-medium transition ${
                active ? 'bg-[#00ff87]/12 text-[#00ff87]' : 'text-[#9d8fb0] hover:bg-white/[0.04] hover:text-[#f2ecf7]'
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span className="grow">{tab.label}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-[#00ff87] shadow-[0_0_8px_#00ff87]" />}
            </button>
          )
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="rounded-[14px] border border-[#00ff87]/18 bg-gradient-to-br from-[rgba(0,255,135,0.09)] to-[rgba(0,255,135,0.01)] p-3.5">
          <div className="eyebrow text-[#00ff87]">Squad value</div>
          <SquadValue />
        </div>
        <div className="flex items-center gap-2 px-1.5 text-[11px] text-[#8b7d9c]">
          <span className="h-[7px] w-[7px] rounded-full bg-[#00ff87] shadow-[0_0_8px_#00ff87]" />
          Synced to Dataverse
        </div>
      </div>
    </aside>
  )
}

function SquadValue() {
  const { squad } = useSquad()
  const spent = squad.players.reduce((sum, sp) => sum + sp.purchasePrice, 0)
  return (
    <>
      <div className="num mt-1.5 text-[22px] font-bold">£{(spent / 10).toFixed(1)}m</div>
      <div className="mt-0.5 text-[11px] text-[#9d8fb0]">{squad.players.length} of 15 picked</div>
    </>
  )
}

function Home({ onNavigate, teamXPts }: { onNavigate: (tab: TabValue) => void; teamXPts: number }) {
  const { currentEvent } = useAppData()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-[34px] font-bold leading-[1.1] tracking-[-1.2px]">Overview</h1>
        <p className="mt-1.5 text-[13px] text-[#9d8fb0]">
          Gameweek {currentEvent} · projections over the next 3 gameweeks
        </p>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-3">
        <div className={`${card('plum')} relative overflow-hidden p-4.5`}>
          <div className="eyebrow">Starting XI xPts</div>
          <div className="num mt-2 text-[34px] font-bold leading-none tracking-[-1.8px] text-[#00ff87]">{teamXPts.toFixed(1)}</div>
          <div className="mt-1 text-[11px] text-[#7fd9ab]">captain doubled</div>
        </div>
        <div className={`${card()} p-4.5`}>
          <div className="eyebrow">Gameweek</div>
          <div className="num mt-2 text-[34px] font-bold leading-none tracking-[-1.8px]">{currentEvent}</div>
          <div className="mt-1 text-[11px] text-[#9d8fb0]">live from the FPL API</div>
        </div>
        <div className={`${card()} p-4.5`}>
          <div className="eyebrow">Horizon</div>
          <div className="num mt-2 text-[34px] font-bold leading-none tracking-[-1.8px]">3</div>
          <div className="mt-1 text-[11px] text-[#9d8fb0]">gameweeks projected</div>
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-3">
        {tabs.slice(1).map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onNavigate(tab.value)}
              className={`${card()} group flex items-center gap-3.5 p-4 text-left transition hover:border-white/[0.16] hover:bg-white/[0.05]`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[#00ff87]/12 text-[#00ff87]">
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{tab.label}</span>
                <span className="block text-[11px] leading-snug text-[#9d8fb0]">{tab.description}</span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function App() {
  const [selected, setSelected] = useState<TabValue>('home')
  const [gameweekIndex, setGameweekIndex] = useState(0)
  const { squad, updateSquad, saveToCloud, saveState } = useSquad()
  const { projections, currentEvent, preSeason, horizonGameweeks, availableGameweeks } = useAppData()
  const reduceMotion = useReducedMotion()

  const maxGameweekIndex = Math.max(0, availableGameweeks - 1)
  const viewedGameweek = currentEvent + gameweekIndex
  const freeTransfers = getFreeTransfersAvailable(currentEvent, preSeason, squad.freeTransfers)
  const freeTransfersLabel = Number.isFinite(freeTransfers) ? String(freeTransfers) : '∞'

  const pageTransition = reduceMotion
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 12 }, transition: { duration: 0.28, ease: 'easeOut' as const } }

  const teamXPts = squad.players
    .filter((sp) => sp.inStartingXI)
    .reduce((sum, sp) => sum + (projections.get(sp.playerId)?.perGameweek[gameweekIndex]?.expectedPoints ?? 0) * (sp.isCaptain ? 2 : 1), 0)

  return (
    <div className="flex min-h-screen text-[#f2ecf7]">
      <Sidebar selected={selected} onSelect={setSelected} />

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.07] bg-[rgba(11,6,16,0.6)] px-5 py-3.5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-2.5">
            <div className={`${field()} flex items-center gap-0.5 p-1`}>
              <button
                type="button"
                onClick={() => setGameweekIndex((i) => Math.max(0, i - 1))}
                disabled={gameweekIndex === 0}
                aria-label="Previous gameweek"
                className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#9d8fb0] transition hover:bg-white/[0.06] hover:text-[#f2ecf7] disabled:opacity-35 disabled:hover:bg-transparent"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="px-3 text-[13px] font-semibold tracking-[0.2px]">Gameweek {viewedGameweek}</span>
              <button
                type="button"
                onClick={() => setGameweekIndex((i) => Math.min(maxGameweekIndex, i + 1))}
                disabled={gameweekIndex >= maxGameweekIndex}
                aria-label="Next gameweek"
                className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#00ff87]/12 text-[#f2ecf7] transition hover:bg-[#00ff87]/20 disabled:bg-transparent disabled:text-[#9d8fb0] disabled:opacity-35"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <span className="hidden text-xs text-[#8b7d9c] sm:inline">Horizon: next {horizonGameweeks} GWs</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <StatPill label="Bank" value={`£${(squad.bank / 10).toFixed(1)}m`} />
            <StatPill label="Free transfers" value={freeTransfersLabel} />
            <button type="button" className={primaryAction} onClick={() => setSelected('team')}>
              <Sparkles className="h-[15px] w-[15px]" aria-hidden="true" />
              Optimise squad
            </button>
          </div>
        </div>

        {/* Sidebar is desktop-only, so small screens get the same destinations as a scroll rail. */}
        <nav className="flex gap-2 overflow-x-auto border-b border-white/[0.07] px-5 py-2.5 lg:hidden" aria-label="Sections">
          {tabs.map((tab) => {
            const active = selected === tab.value
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSelected(tab.value)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-11 shrink-0 rounded-[11px] px-3.5 text-[13px] font-medium transition ${
                  active ? 'bg-[#00ff87]/12 text-[#00ff87]' : 'text-[#9d8fb0] hover:text-[#f2ecf7]'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>

        <div className="flex-1 px-5 pb-10 pt-6 sm:px-8">
          <AnimatePresence mode="wait">
            {selected === 'home' && (
              <motion.section key="home" {...pageTransition}>
                <Home onNavigate={setSelected} teamXPts={teamXPts} />
              </motion.section>
            )}
            {selected === 'team' && (
              <motion.section key="team" {...pageTransition}>
                <TeamBuilder
                  squad={squad}
                  updateSquad={updateSquad}
                  saveToCloud={saveToCloud}
                  saveState={saveState}
                  selectedGameweekIndex={gameweekIndex}
                />
              </motion.section>
            )}
            {selected === 'scorers' && (
              <motion.section key="scorers" {...pageTransition}>
                <TopScorers />
              </motion.section>
            )}
            {selected === 'fixtures' && (
              <motion.section key="fixtures" {...pageTransition}>
                <FixtureList />
              </motion.section>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}

export default App
