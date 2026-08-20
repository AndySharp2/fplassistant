import { useState } from 'react';
import {
  Dialog,
  DialogSurface,
  DialogBody,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogTrigger,
  Button,
  Spinner,
  Table,
  TableHeader,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { InfoRegular } from '@fluentui/react-icons';
import { getPlayerHistory, type PlayerHistory } from '../lib/fplClient';

/** On-demand prior-season + this-season history for one player - fetched only when opened (not part of bulk scoring). */
export function PlayerInsights({ playerId, playerName }: { playerId: number; playerName: string }) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<PlayerHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen && !history) {
      setLoading(true);
      setError(null);
      getPlayerHistory(playerId)
        .then(setHistory)
        .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load player history.'))
        .finally(() => setLoading(false));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => onOpenChange(data.open)}>
      <DialogTrigger disableButtonEnhancement>
        <Button appearance="transparent" size="small" icon={<InfoRegular />} title={`${playerName} history`} />
      </DialogTrigger>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{playerName} - performance history</DialogTitle>
          <DialogContent>
            {loading && <Spinner label="Loading history..." />}
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            {history && (
              <>
                <Table size="small">
                  <TableHeader>
                    <TableRow>
                      <TableHeaderCell>Season</TableHeaderCell>
                      <TableHeaderCell>Points</TableHeaderCell>
                      <TableHeaderCell>Mins</TableHeaderCell>
                      <TableHeaderCell>Goals</TableHeaderCell>
                      <TableHeaderCell>Assists</TableHeaderCell>
                      <TableHeaderCell>Clean sheets</TableHeaderCell>
                      <TableHeaderCell>Bonus</TableHeaderCell>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.pastSeasons.map((s) => (
                      <TableRow key={s.seasonName}>
                        <TableCell>{s.seasonName}</TableCell>
                        <TableCell>{s.totalPoints}</TableCell>
                        <TableCell>{s.minutes}</TableCell>
                        <TableCell>{s.goalsScored}</TableCell>
                        <TableCell>{s.assists}</TableCell>
                        <TableCell>{s.cleanSheets}</TableCell>
                        <TableCell>{s.bonus}</TableCell>
                      </TableRow>
                    ))}
                    {history.pastSeasons.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7}>No prior-season data (new to the Premier League, or a debut season).</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <p>This season so far: {history.thisSeasonByRound.length} gameweek(s) played, {history.thisSeasonByRound.reduce((s, r) => s + r.totalPoints, 0)} total points.</p>
              </>
            )}
          </DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary">Close</Button>
            </DialogTrigger>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
