import { useState } from 'react'
import {
  makeStyles,
  tokens,
  Title1,
  Title2,
  Caption1,
  Text,
  TabList,
  Tab,
  Card,
  CardHeader,
  CardPreview,
  Badge,
  type SelectTabEventHandler,
} from '@fluentui/react-components'
import {
  HomeRegular,
  PersonBoardRegular,
  TrophyRegular,
  CalendarLtrRegular,
} from '@fluentui/react-icons'
import { TeamBuilder } from './components/TeamBuilder'
import { FixtureList } from './components/FixtureList'
import { TopScorers } from './components/TopScorers'
import { useSquad } from './hooks/useSquad'
import { useAppData } from './context/AppDataContext'

type TabValue = 'home' | 'team' | 'scorers' | 'fixtures'

const useStyles = makeStyles({
  shell: {
    minHeight: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalXXL}`,
    background: 'linear-gradient(120deg, #37003c 0%, #4a0050 45%, #1a1a2e 100%)',
    borderBottom: `3px solid #00ff87`,
  },
  brand: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  brandTitle: {
    color: '#fff',
  },
  brandCaption: {
    color: '#e8d6ec',
  },
  main: {
    maxWidth: '1240px',
    margin: '0 auto',
    padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalXXL} ${tokens.spacingVerticalXXXL}`,
  },
  homeGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr',
    gap: tokens.spacingVerticalL,
    '@media (min-width: 700px)': {
      gridTemplateColumns: 'repeat(3, 1fr)',
    },
  },
  homeCard: {
    padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalL}`,
    cursor: 'pointer',
  },
  homeStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
  },
})

function Home({ onNavigate, teamXPts }: { onNavigate: (tab: TabValue) => void; teamXPts: number }) {
  const styles = useStyles()
  const { currentEvent } = useAppData()
  return (
    <div className={styles.homeStack}>
      <div>
        <Title2>Welcome back</Title2>
        <Text block>Gameweek {currentEvent} - here's your quick overview.</Text>
        <Badge appearance="tint" color="brand" size="large" style={{ marginTop: tokens.spacingVerticalM }}>
          Current squad expected points: {teamXPts.toFixed(1)}
        </Badge>
      </div>
      <div className={styles.homeGrid}>
        <Card className={styles.homeCard} onClick={() => onNavigate('team')}>
          <CardHeader header={<Text weight="semibold">My Team</Text>} image={<PersonBoardRegular fontSize={28} />} />
          <CardPreview>
            <Text>Build and manage your 15-player squad on the pitch, pick chips, and see transfer suggestions - all in one place.</Text>
          </CardPreview>
        </Card>
        <Card className={styles.homeCard} onClick={() => onNavigate('scorers')}>
          <CardHeader header={<Text weight="semibold">Top Scorers</Text>} image={<TrophyRegular fontSize={28} />} />
          <CardPreview>
            <Text>The AI's predicted top-scoring players for this gameweek.</Text>
          </CardPreview>
        </Card>
      </div>
    </div>
  )
}

function App() {
  const styles = useStyles()
  const [tab, setTab] = useState<TabValue>('home')
  const { squad, updateSquad, saveToCloud, saveState } = useSquad()
  const { projections } = useAppData()

  const onTabSelect: SelectTabEventHandler = (_, data) => setTab(data.value as TabValue)

  const teamXPts = squad.players
    .filter((sp) => sp.inStartingXI)
    .reduce((sum, sp) => sum + (projections.get(sp.playerId)?.perGameweek[0]?.expectedPoints ?? 0) * (sp.isCaptain ? 2 : 1), 0)

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Title1 className={styles.brandTitle}>FPL Transfer Assistant</Title1>
          <Caption1 className={styles.brandCaption}>Multi-gameweek transfer tips, grounded in the real FPL rules</Caption1>
        </div>
        <TabList selectedValue={tab} onTabSelect={onTabSelect} size="large">
          <Tab value="home" icon={<HomeRegular />}>Home</Tab>
          <Tab value="team" icon={<PersonBoardRegular />}>My Team</Tab>
          <Tab value="scorers" icon={<TrophyRegular />}>Top Scorers</Tab>
          <Tab value="fixtures" icon={<CalendarLtrRegular />}>Fixtures</Tab>
        </TabList>
      </header>
      <main className={styles.main}>
        {tab === 'home' && <Home onNavigate={setTab} teamXPts={teamXPts} />}
        {tab === 'team' && <TeamBuilder squad={squad} updateSquad={updateSquad} saveToCloud={saveToCloud} saveState={saveState} />}
        {tab === 'scorers' && <TopScorers />}
        {tab === 'fixtures' && <FixtureList />}
      </main>
    </div>
  )
}

export default App

