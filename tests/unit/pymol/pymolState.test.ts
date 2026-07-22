import { describe, expect, it } from 'vitest';
import {
  pyMolSelectionToViewerSelection,
  pyMolViewToViewerView,
  reducePyMolViewerState,
  shouldApplyPyMolState,
  shouldReplayPyMolCommand,
  viewerViewToPyMolView,
} from '@/common/types/platform/pymolState';
import { PYMOL_STATE_SCHEMA, type PyMolViewerState } from '@/common/types/platform/pymolTypes';

const state = (revision: number): PyMolViewerState => ({
  schema: PYMOL_STATE_SCHEMA,
  sessionId: 'session-1',
  conversationId: 'conversation-1',
  revision,
  status: 'ready',
  objects: [],
  selections: [],
  measurements: [],
  annotations: [],
  background: 'light',
  frame: 1,
  serverOnly: false,
  updatedAt: 1,
});

describe('PyMOL synchronized state', () => {
  it('rejects stale and duplicate revisions', () => {
    expect(shouldApplyPyMolState(4, state(3))).toBe(false);
    expect(shouldApplyPyMolState(4, state(4))).toBe(false);
    expect(shouldApplyPyMolState(4, state(5))).toBe(true);
  });

  it('replays only the first revision conflict', () => {
    expect(shouldReplayPyMolCommand(409, true)).toBe(true);
    expect(shouldReplayPyMolCommand(409, false)).toBe(false);
    expect(shouldReplayPyMolCommand(500, true)).toBe(false);
  });

  it('reduces snapshots and ignores stale render events', () => {
    const current = state(4);
    expect(reducePyMolViewerState(current, { type: 'snapshot', state: state(3) })).toBe(current);
    expect(
      reducePyMolViewerState(current, {
        type: 'renderReady',
        event: { conversationId: 'conversation-1', revision: 3, path: 'stale.png', ray: false },
      })
    ).toBe(current);
    expect(
      reducePyMolViewerState(current, {
        type: 'renderReady',
        event: { conversationId: 'conversation-1', revision: 5, path: 'fresh.png', ray: true },
      })?.renderPath
    ).toBe('fresh.png');
  });

  it('round trips the 3Dmol camera through a PyMOL view', () => {
    const viewerView = [4, -3, 2, 18, 0, 0, 0, 1];
    const pymolView = viewerViewToPyMolView(viewerView);

    expect(pymolView).toHaveLength(18);
    expect(pyMolViewToViewerView(pymolView)).toEqual(viewerView);
  });

  it('rejects malformed camera arrays', () => {
    expect(viewerViewToPyMolView([1, 2])).toEqual([]);
    expect(pyMolViewToViewerView([1, 2])).toEqual([]);
  });

  it('maps simple PyMOL selections without treating array positions as residue IDs', () => {
    expect(pyMolSelectionToViewerSelection('chain A and resi 10A and name CA')).toEqual({
      chain: 'A',
      resi: 10,
      icode: 'A',
      atom: 'CA',
    });
    expect(pyMolSelectionToViewerSelection('all')).toBeUndefined();
  });
});
