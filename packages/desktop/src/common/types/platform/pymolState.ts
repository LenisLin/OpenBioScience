import type { PyMolRenderReadyEvent, PyMolViewerState } from './pymolTypes';

export type PyMolViewerStateAction =
  | { type: 'snapshot'; state: PyMolViewerState; force?: boolean }
  | { type: 'renderReady'; event: PyMolRenderReadyEvent };

export const reducePyMolViewerState = (
  current: PyMolViewerState | null,
  action: PyMolViewerStateAction
): PyMolViewerState | null => {
  if (action.type === 'snapshot') {
    if (!action.force && current && action.state.revision <= current.revision) return current;
    return action.state;
  }
  if (!current || action.event.revision < current.revision) return current;
  return {
    ...current,
    revision: action.event.revision,
    renderPath: action.event.path,
    renderUrl: action.event.url,
  };
};

const quaternionToMatrix = ([x, y, z, w]: number[]): number[] => [
  1 - 2 * (y * y + z * z),
  2 * (x * y - z * w),
  2 * (x * z + y * w),
  2 * (x * y + z * w),
  1 - 2 * (x * x + z * z),
  2 * (y * z - x * w),
  2 * (x * z - y * w),
  2 * (y * z + x * w),
  1 - 2 * (x * x + y * y),
];

const matrixToQuaternion = (matrix: number[]): number[] => {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = matrix;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const scale = Math.sqrt(trace + 1) * 2;
    return [(m21 - m12) / scale, (m02 - m20) / scale, (m10 - m01) / scale, scale / 4];
  }
  if (m00 > m11 && m00 > m22) {
    const scale = Math.sqrt(1 + m00 - m11 - m22) * 2;
    return [scale / 4, (m01 + m10) / scale, (m02 + m20) / scale, (m21 - m12) / scale];
  }
  if (m11 > m22) {
    const scale = Math.sqrt(1 + m11 - m00 - m22) * 2;
    return [(m01 + m10) / scale, scale / 4, (m12 + m21) / scale, (m02 - m20) / scale];
  }
  const scale = Math.sqrt(1 + m22 - m00 - m11) * 2;
  return [(m02 + m20) / scale, (m12 + m21) / scale, scale / 4, (m10 - m01) / scale];
};

export const viewerViewToPyMolView = (view: number[]): number[] => {
  if (view.length !== 8) return [];
  const [x, y, z, zoom, qx, qy, qz, qw] = view;
  return [...quaternionToMatrix([qx, qy, qz, qw]), 0, 0, zoom, -x, -y, -z, -100, 100, 0];
};

export const pyMolViewToViewerView = (view: number[]): number[] => {
  if (view.length !== 18) return [];
  const quaternion = matrixToQuaternion(view.slice(0, 9));
  return [-view[12], -view[13], -view[14], view[11], ...quaternion];
};

export const shouldApplyPyMolState = (currentRevision: number, incoming: PyMolViewerState): boolean =>
  incoming.revision > currentRevision;

export const shouldReplayPyMolCommand = (status: number, replayAvailable: boolean): boolean =>
  status === 409 && replayAvailable;

export const pyMolSelectionToViewerSelection = (expression: string): Record<string, string | number> | undefined => {
  const selection: Record<string, string | number> = {};
  const chain = /(?:^|\s)chain\s+([A-Za-z0-9_.-]+)/iu.exec(expression)?.[1];
  const residue = /(?:^|\s)resi\s+(-?\d+)([A-Za-z]?)/iu.exec(expression);
  const atom = /(?:^|\s)name\s+([A-Za-z0-9*'+-]+)/iu.exec(expression)?.[1];
  if (chain) selection.chain = chain;
  if (residue) {
    selection.resi = Number(residue[1]);
    if (residue[2]) selection.icode = residue[2];
  }
  if (atom) selection.atom = atom;
  return Object.keys(selection).length ? selection : undefined;
};
