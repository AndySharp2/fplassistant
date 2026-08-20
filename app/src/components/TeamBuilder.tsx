import {
  makeStyles,
  tokens,
  shorthands,
  Card,
  CardHeader,
  CardPreview,
  Text,
  Title2,
  Title3,
  Subtitle2,
  Body1,
  Input,
  Button,
  Badge,
  Spinner,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Field,
  Divider,
} from '@fluentui/react-components';
import { SaveRegular, CheckmarkCircleRegular, SparkleRegular, ArrowRightRegular, LightbulbRegular } from '@fluentui/react-icons';
import { useAppData } from '../context/AppDataContext';
import { buildSuggestedSquad, getRecommendations } from '../services/fplApi';
import { getFreeTransfersAvailable } from '../lib/freeTransfers';
import { PitchView } from './PitchView';
import { PlayerPicker } from './PlayerPicker';
import { ChipSelector } from './ChipSelector';
import { useEffect, useState } from 'react';
import type { RecommendationResult, Squad } from '../types';

type PendingSwap = {
  playerId: number;
  direction: 'toStarting' | 'toBench';
} | null;

const TOTAL_BUDGET_TENTHS = 1000; // £100.0m

function formatPrice(tenths: number): string {
  return `£${(tenths / 10).toFixed(1)}m`;
}

const useStyles = makeStyles({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXL,
  },
  card: {
    ...shorthands.padding(tokens.spacingVerticalL, tokens.spacingHorizontalL),
  },
  summaryRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalL,
    alignItems: 'flex-end',
    marginTop: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
  },
  budgetBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minWidth: '200px',
  },
  fieldsRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  smallField: {
    width: '110px',
  },
  saveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  centerState: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
  },
  notes: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    marginTop: tokens.spacingVerticalS,
  },
  suggestionCard: {
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL}`,
  },
  transferLine: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  reason: {
    color: tokens.colorNeutralForeground3,
  },
  suggestionsStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

export function TeamBuilder({
  squad,
  updateSquad,
  saveToCloud,
  saveState,
}: {
  squad: Squad;
  updateSquad: (fn: (prev: Squad) => Squad) => void;
  saveToCloud: () => Promise<void>;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
}) {
  const styles = useStyles();
  const { loading, error, projectionsError, currentEvent, preSeason, horizonGameweeks } = useAppData();
  const [autoBuildLoading, setAutoBuildLoading] = useState(false);
  const [autoBuildNotes, setAutoBuildNotes] = useState<string[] | null>(null);
  const [autoBuildError, setAutoBuildError] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState<string | null>(null);
  const [selectedGameweekIndex, setSelectedGameweekIndex] = useState(0);
  const [pendingSwap, setPendingSwap] = useState<PendingSwap>(null);
  const freeTransfersAvailable = getFreeTransfersAvailable(currentEvent, preSeason, squad.freeTransfers);
  const effectiveSquad = { ...squad, freeTransfers: freeTransfersAvailable };
  const freeTransfersDisplay = Number.isFinite(freeTransfersAvailable) ? String(freeTransfersAvailable) : '∞';
  const recommendationStartGameweek = currentEvent + selectedGameweekIndex;

  const squadKey = squad.players
    .map((p) => `${p.playerId}:${p.inStartingXI ? 1 : 0}`)
    .sort()
    .join(',');

  useEffect(() => {
    if (squad.players.length !== 15) {
      setRecommendation(null);
      return;
    }
    let cancelled = false;
    setRecommendationLoading(true);
    setRecommendationError(null);
    getRecommendations(effectiveSquad, recommendationStartGameweek, horizonGameweeks, 5)
      .then((data) => {
        if (!cancelled) setRecommendation(data);
      })
      .catch((err) => {
        if (!cancelled) setRecommendationError(err instanceof Error ? err.message : 'Failed to compute transfer suggestions.');
      })
      .finally(() => {
        if (!cancelled) setRecommendationLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squadKey, effectiveSquad.freeTransfers, squad.activeChip, horizonGameweeks, recommendationStartGameweek]);

  useEffect(() => {
    if (preSeason || currentEvent > 2 || squad.freeTransfers === 1) return;
    updateSquad((prev) => ({ ...prev, freeTransfers: 1 }));
  }, [currentEvent, preSeason, squad.freeTransfers, updateSquad]);

  const startingXICount = squad.players.filter((p) => p.inStartingXI).length;
  const spent = squad.players.reduce((sum, sp) => sum + sp.purchasePrice, 0);
  const remaining = TOTAL_BUDGET_TENTHS - spent + squad.bank;
  const budgetUsedRatio = Math.min(1, spent / TOTAL_BUDGET_TENTHS);

  function removePlayer(playerId: number) {
    setPendingSwap((current) => (current?.playerId === playerId ? null : current));
    updateSquad((prev) => ({ ...prev, players: prev.players.filter((sp) => sp.playerId !== playerId) }));
  }

  function beginSwap(playerId: number, direction: 'toStarting' | 'toBench') {
    setPendingSwap({ playerId, direction });
  }

  function clearPendingSwap() {
    setPendingSwap(null);
  }

  function setBank(value: number) {
    const nextBank = Math.round(value * 10);
    updateSquad((prev) => ({
      ...prev,
      bank: Math.max(0, Math.min(nextBank, TOTAL_BUDGET_TENTHS)),
    }));
  }

  function applyAllTransfers() {
    if (!recommendation) return;
    updateSquad(() => recommendation.resultingSquad);
  }

  function applySingleTransfer(index: number) {
    if (!recommendation) return;
    const suggestion = recommendation.suggestions[index];
    if (!suggestion) return;
    updateSquad((prev) => {
      const outgoing = prev.players.find((sp) => sp.playerId === suggestion.out.playerId);
      if (!outgoing) return prev;
      if (prev.bank + outgoing.purchasePrice < suggestion.in.priceTenths) return prev;
      const incoming = {
        playerId: suggestion.in.playerId,
        purchasePrice: suggestion.in.priceTenths,
        inStartingXI: outgoing.inStartingXI,
        isCaptain: !!outgoing.isCaptain,
        isViceCaptain: !!outgoing.isViceCaptain,
      } as {
        playerId: number;
        purchasePrice: number;
        inStartingXI: boolean;
        isCaptain: boolean;
        isViceCaptain: boolean;
      };
      const nextPlayers = prev.players
        .filter((sp) => sp.playerId !== suggestion.out.playerId)
        .map((sp) => ({ ...sp, isCaptain: false, isViceCaptain: false }));
      nextPlayers.push(incoming);
      return {
        ...prev,
        bank: prev.bank + outgoing.purchasePrice - suggestion.in.priceTenths,
        freeTransfers: suggestion.transferCost === 0 ? Math.max(0, prev.freeTransfers - 1) : 0,
        players: nextPlayers,
      };
    });
  }

  async function autoBuildSquad() {
    setAutoBuildLoading(true);
    setAutoBuildNotes(null);
    setAutoBuildError(null);
    try {
      const built = await buildSuggestedSquad(horizonGameweeks);
      if (built.squad.players.length === 0) {
        setAutoBuildError('No eligible players were found - the FPL data source may be unavailable right now.');
        return;
      }
      updateSquad(() => built.squad);
      setAutoBuildNotes(built.notes);
    } catch (err) {
      setAutoBuildError(err instanceof Error ? err.message : 'Failed to build a suggested squad.');
    } finally {
      setAutoBuildLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.centerState}>
        <Spinner label="Loading Premier League player data..." />
      </div>
    );
  }
  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    );
  }

  return (
    <div className={styles.stack}>
      <Card className={styles.card}>
        <CardHeader
          header={<Title2>My Squad ({squad.players.length}/15)</Title2>}
          description={<Body1>{startingXICount}/11 in starting XI - drag players between the pitch and bench</Body1>}
        />
        <CardPreview>
          <div className={styles.summaryRow}>
            <div className={styles.budgetBlock}>
              <Text weight="semibold">Budget remaining: {formatPrice(remaining)}</Text>
              <ProgressBar value={budgetUsedRatio} thickness="large" color={budgetUsedRatio > 0.95 ? 'error' : 'brand'} />
            </div>
            <div className={styles.fieldsRow}>
              <Field label="Bank (£m)" className={styles.smallField}>
                <Input
                  type="number"
                  step={0.1}
                  value={String(squad.bank / 10)}
                  onChange={(_, data) => setBank(Number(data.value))}
                />
              </Field>
              <Field label="Free transfers" className={styles.smallField}>
                <Input type="text" value={freeTransfersDisplay} readOnly />
              </Field>
            </div>
          </div>
          <Divider />
          <div className={styles.saveRow} style={{ marginTop: tokens.spacingVerticalM }}>
            <Button
              appearance="outline"
              icon={autoBuildLoading ? <Spinner size="tiny" /> : <SparkleRegular />}
              disabled={autoBuildLoading}
              onClick={() => void autoBuildSquad()}
            >
              {autoBuildLoading ? 'Building...' : `Let AI build my Gameweek ${currentEvent} squad`}
            </Button>
            <Button appearance="primary" icon={<SaveRegular />} disabled={saveState === 'saving'} onClick={() => void saveToCloud()}>
              {saveState === 'saving' ? 'Saving...' : 'Save to Dataverse'}
            </Button>
            {saveState === 'saved' && (
              <Badge appearance="tint" color="success" icon={<CheckmarkCircleRegular />}>
                Saved
              </Badge>
            )}
            {saveState === 'error' && <Badge appearance="tint" color="danger">Save failed</Badge>}
          </div>
          {projectionsError && (
            <MessageBar intent="warning" style={{ marginTop: tokens.spacingVerticalM }}>
              <MessageBarBody>Expected points unavailable: {projectionsError}</MessageBarBody>
            </MessageBar>
          )}
          {autoBuildError && (
            <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalM }}>
              <MessageBarBody>{autoBuildError}</MessageBarBody>
            </MessageBar>
          )}
          {autoBuildNotes && (
            <div className={styles.notes}>
              {autoBuildNotes.map((n, i) => (
                <Text key={i} size={200}>
                  {n}
                </Text>
              ))}
            </div>
          )}

          {squad.players.length > 0 ? (
            <PitchView
              squad={squad}
              updateSquad={updateSquad}
              onRemovePlayer={removePlayer}
              selectedGameweekIndex={selectedGameweekIndex}
              onSelectedGameweekChange={setSelectedGameweekIndex}
              pendingSwap={pendingSwap}
              onBeginSwap={beginSwap}
              onClearSwap={clearPendingSwap}
            />
          ) : (
            <Text italic>No players added yet - click "Let AI build my Gameweek {currentEvent} squad" or add players below.</Text>
          )}
        </CardPreview>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Subtitle2>Chips</Subtitle2>} />
        <CardPreview>
          <ChipSelector squad={squad} updateSquad={updateSquad} />
        </CardPreview>
      </Card>

      <Card className={styles.card}>
        <CardHeader header={<Subtitle2>Add / remove players</Subtitle2>} />
        <CardPreview>
          <PlayerPicker squad={squad} updateSquad={updateSquad} pendingSwap={pendingSwap} onBeginSwap={beginSwap} />
        </CardPreview>
      </Card>

      {recommendationLoading && (
        <Card className={styles.card}>
          <CardPreview>
            <Spinner label="Checking for better transfers..." />
          </CardPreview>
        </Card>
      )}
      {recommendationError && (
        <MessageBar intent="error">
          <MessageBarBody>{recommendationError}</MessageBarBody>
        </MessageBar>
      )}
      {recommendation && recommendation.suggestions.length > 0 && (
        <Card className={styles.card}>
          <CardHeader
            header={<Title3>Transfer Plan</Title3>}
            description={<Text>Sequential plan over the next {recommendation.horizonGameweeks} gameweeks, using free transfers first and only showing a -4 hit if it improves the squad</Text>}
          />
          <CardPreview>
            <div className={styles.saveRow} style={{ marginBottom: tokens.spacingVerticalM }}>
              <Button appearance="primary" icon={<SparkleRegular />} onClick={applyAllTransfers}>
                Make all transfers
              </Button>
              <Text className={styles.reason}>Applies the full plan to your squad, then recalculates the starting XI and captaincy.</Text>
            </div>
            <div className={styles.suggestionsStack}>
              {recommendation.suggestions.map((s, i) => (
                <Card className={styles.suggestionCard} key={i}>
                  <CardHeader
                    header={
                      <div className={styles.transferLine}>
                        <Badge appearance="tint" color="brand">Step {i + 1}</Badge>
                        <Badge appearance="tint" color="informative">GW {s.recommendedGameweek}</Badge>
                        <Badge color="danger" appearance="tint">OUT</Badge>
                        <Text weight="semibold">{s.out.webName}</Text>
                        <ArrowRightRegular />
                        <Badge color="success" appearance="tint">IN</Badge>
                        <Text weight="semibold">{s.in.webName}</Text>
                        <Text>({(s.in.priceTenths / 10).toFixed(1)}m)</Text>
                      </div>
                    }
                    description={
                      <div className={styles.transferLine}>
                        <Badge appearance="tint" color="brand">Net gain: {s.netGain} pts</Badge>
                        <Badge appearance="tint" color={s.transferCost === 0 ? 'success' : 'warning'}>
                          {s.transferCost === 0 ? 'Free transfer' : 'Take -4 hit'}
                        </Badge>
                        <Button appearance="primary" size="small" onClick={() => applySingleTransfer(i)}>
                          Make transfer
                        </Button>
                      </div>
                    }
                  />
                  <CardPreview>
                    <Text className={styles.reason}>{s.reason}</Text>
                  </CardPreview>
                </Card>
              ))}
            </div>
            {recommendation.notes.length > 0 && (
              <div className={styles.suggestionsStack} style={{ marginTop: tokens.spacingVerticalM }}>
                {recommendation.notes.map((n, i) => (
                  <div className={styles.transferLine} key={i}>
                    <LightbulbRegular />
                    <Text className={styles.reason}>{n}</Text>
                  </div>
                ))}
              </div>
            )}
          </CardPreview>
        </Card>
      )}
      {recommendation && recommendation.suggestions.length === 0 && !recommendationLoading && (
        <MessageBar intent="success">
          <MessageBarBody>Your squad already looks strong - no beneficial transfers found this week.</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}
