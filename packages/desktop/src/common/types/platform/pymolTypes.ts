export const PYMOL_STATE_SCHEMA = 'openbioscience.pymol.state.v1' as const;
export const PYMOL_TOOL_NAMES = [
  'pymol_session',
  'pymol_load',
  'pymol_display',
  'pymol_select',
  'pymol_align',
  'pymol_measure',
  'pymol_metrics',
  'pymol_apply_residue_table',
  'pymol_triage',
  'pymol_render',
  'pymol_export',
  'pymol_run',
] as const;

export type PyMolCommandSource = 'ui' | 'agent' | 'system';

export type PyMolRepresentation = 'cartoon' | 'stick' | 'sphere' | 'line' | 'surface';

export type PyMolCameraState = {
  pymolView: number[];
  viewerView?: number[];
};

export type PyMolObjectState = {
  name: string;
  path?: string;
  visible: boolean;
  representation?: PyMolRepresentation;
  color?: string;
};

export type PyMolSelectionState = {
  name: string;
  expression: string;
};

export type PyMolMeasurementState = {
  name: string;
  selection1: string;
  selection2: string;
  distance?: number;
};

export type PyMolViewerState = {
  schema: typeof PYMOL_STATE_SCHEMA;
  sessionId: string;
  conversationId: string;
  revision: number;
  status: 'starting' | 'ready' | 'stopped' | 'error';
  objects: PyMolObjectState[];
  selections: PyMolSelectionState[];
  measurements: PyMolMeasurementState[];
  annotations: Array<Record<string, unknown>>;
  background: 'light' | 'dark' | 'transparent';
  frame: number;
  camera?: PyMolCameraState;
  serverOnly: boolean;
  renderPath?: string;
  renderUrl?: string;
  updatedAt: number;
  error?: string;
};

export type PyMolCommandAction =
  | 'session'
  | 'load'
  | 'display'
  | 'select'
  | 'align'
  | 'measure'
  | 'metrics'
  | 'apply_residue_table'
  | 'triage'
  | 'render'
  | 'export'
  | 'run';

export type PyMolSessionCommand = {
  commandId: string;
  baseRevision: number;
  source: PyMolCommandSource;
  action: PyMolCommandAction;
  payload: Record<string, unknown>;
};

export type PyMolArtifactRef = {
  path: string;
  type: 'protein_structure' | 'figure' | 'table' | 'code' | 'run_bundle';
  mimeType?: string;
  title?: string;
};

export type PyMolSessionResult = {
  sessionId: string;
  revision: number;
  state: PyMolViewerState;
  artifacts: PyMolArtifactRef[];
  warnings: string[];
  result?: unknown;
};

export type PyMolStateChangedEvent = {
  conversationId: string;
  commandId?: string;
  source: PyMolCommandSource;
  state: PyMolViewerState;
};

export type PyMolRenderReadyEvent = {
  conversationId: string;
  revision: number;
  path: string;
  url?: string;
  ray: boolean;
};

export type PyMolSessionStatusEvent = {
  conversationId: string;
  sessionId?: string;
  status: PyMolViewerState['status'];
  message?: string;
};
