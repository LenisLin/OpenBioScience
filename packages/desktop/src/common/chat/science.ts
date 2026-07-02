/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageAcpToolCall, IMessageToolCall, IMessageToolGroup } from './chatLib';
import { getPromptLanguageInstruction } from './language';
import {
  SCIENCE_MATERIALIZED_SKILL_IDS,
  SCIENCE_SKILL_PACK_COUNTS,
  SCIENCE_SKILL_PACK_MANIFEST_PATH,
} from './scienceSkills.generated';

export const SCIENCE_MODE_ID = 'science';
export const SCIENCE_EVENT_SCHEMA = 'deeporganiser.science.event.v1';
export const SCIENCE_PANEL_SCHEMA = 'deeporganiser.science.panel.v1';
export const SCIENCE_CORE_SKILL_NAME = 'openscience-science';
export const SCIENCE_CORE_SKILL_PATH = 'resources/skills/science/SKILL.md';
export const SCIENCE_ARTIFACT_SKILL_NAME = 'openscience-science-artifact';
export const SCIENCE_ARTIFACT_SKILL_PATH = 'resources/skills/science-artifact/SKILL.md';
export const SCIENCE_WORKFLOW_SKILL_NAME = 'openscience-workflow';
export const SCIENCE_WORKFLOW_SKILL_PATH = 'resources/skills/workflow/SKILL.md';
export const SCIENCE_VENDOR_CATALOG_SKILL_NAME = 'openscience-science-vendor-catalog';
export const SCIENCE_VENDOR_CATALOG_SKILL_PATH = 'resources/skills/science-vendor-catalog/SKILL.md';

export const LEGACY_SCIENCE_DEFAULT_SKILL_IDS = [
  SCIENCE_CORE_SKILL_NAME,
  SCIENCE_ARTIFACT_SKILL_NAME,
  SCIENCE_VENDOR_CATALOG_SKILL_NAME,
] as const;

export const DEFAULT_SCIENCE_SKILL_IDS = [
  SCIENCE_CORE_SKILL_NAME,
  SCIENCE_ARTIFACT_SKILL_NAME,
  SCIENCE_WORKFLOW_SKILL_NAME,
  ...SCIENCE_MATERIALIZED_SKILL_IDS,
] as const;

export function normalizeScienceDefaultSkillIds(skillIds?: readonly string[]): string[] {
  if (!skillIds?.length) return [...DEFAULT_SCIENCE_SKILL_IDS];
  const isLegacyDefault =
    skillIds.length === LEGACY_SCIENCE_DEFAULT_SKILL_IDS.length &&
    LEGACY_SCIENCE_DEFAULT_SKILL_IDS.every((id) => skillIds.includes(id));
  const isLegacyCatalogOnly =
    skillIds.includes(SCIENCE_VENDOR_CATALOG_SKILL_NAME) &&
    skillIds.every((id) =>
      LEGACY_SCIENCE_DEFAULT_SKILL_IDS.includes(id as (typeof LEGACY_SCIENCE_DEFAULT_SKILL_IDS)[number])
    );
  if (isLegacyDefault || isLegacyCatalogOnly) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  return [...skillIds];
}

export type ScienceEvidenceSourceType =
  | 'paper'
  | 'database_record'
  | 'code'
  | 'command_log'
  | 'dataset'
  | 'table'
  | 'figure'
  | 'notebook'
  | 'manuscript'
  | 'package_check'
  | 'computational_run'
  | 'dataset_analysis'
  | 'parameter_sweep'
  | 'validation_result'
  | 'remote_job'
  | 'environment'
  | 'regression_output'
  | 'statistical_model'
  | 'causal_assumption'
  | 'survey_instrument'
  | 'codebook'
  | 'data_dictionary'
  | 'qualitative_code'
  | 'geospatial_layer'
  | 'replication_package'
  | 'user_input';

export type ScienceClaimType = 'computed' | 'parsed' | 'digitized' | 'hypothesis';

export interface ScienceEvidenceItem {
  id: string;
  title: string;
  sourceType: ScienceEvidenceSourceType;
  claimType?: ScienceClaimType;
  confidence: 'high' | 'moderate' | 'low' | 'blocked';
  status?: 'available' | 'missing' | 'stale' | 'needs_review';
  summary?: string;
  path?: string;
  url?: string;
  virtualPath?: string;
  command?: string;
  lineStart?: number;
  lineEnd?: number;
  cellId?: string;
  artifactId?: string;
  nodeId?: string;
  hash?: string;
  version?: number;
  skillUseId?: string;
  connectorId?: string;
  database?: {
    name: string;
    endpoint?: string;
    params?: Record<string, unknown>;
    accessDate?: string;
    returnedCount?: number;
    retrievedCount?: number;
    pagination?: string;
    identifierConversions?: string[];
    warnings?: string[];
  };
  region?: {
    filePath: string;
    page?: number;
    x: number;
    y: number;
    width: number;
    height: number;
    coordinateSystem: 'pixel' | 'normalized';
  };
  createdAt?: number;
  revision?: string;
}

export interface ScienceClaim {
  id: string;
  runId: string;
  text: string;
  claimType: ScienceClaimType;
  status: 'supported' | 'partial' | 'hypothesis' | 'blocked';
  supportingEvidenceIds: string[];
  artifactIds?: string[];
  provenanceNodeIds?: string[];
  limitations?: string[];
  createdAt: number;
  revision?: string;
}

export type ScienceArtifactType =
  | 'figure'
  | 'table'
  | 'dataset'
  | 'code'
  | 'notebook'
  | 'manuscript'
  | 'pdf'
  | 'latex'
  | 'html'
  | 'molecule'
  | 'protein_structure'
  | 'genome_track'
  | 'alignment'
  | 'regression_table'
  | 'model_diagnostic'
  | 'causal_dag'
  | 'survey_codebook'
  | 'geospatial_map'
  | 'qualitative_coding'
  | 'replication_package'
  | 'run_bundle';

export type ScienceArtifactInspectorTab =
  | 'overview'
  | 'inputs'
  | 'code'
  | 'execution_log'
  | 'messages'
  | 'environment'
  | 'history'
  | 'review';

export type ScienceStructureViewerKind = 'auto' | '3dmol' | 'molstar' | 'rcsb_molstar';
export type ScienceStructureFormat = 'pdb' | 'cif' | 'mmcif' | 'pqr' | 'sdf' | 'mol' | 'mol2' | 'xyz' | 'unknown';
export type ScienceStructureRepresentation = 'auto' | 'cartoon' | 'stick' | 'sphere' | 'line' | 'surface';
export type ScienceStructureColorBy = 'auto' | 'chain' | 'element' | 'spectrum' | 'plddt' | 'secondary_structure';
export type ScienceArtifactViewerKind =
  | ScienceStructureViewerKind
  | 'igv'
  | 'ketcher'
  | 'vitessce'
  | 'msa'
  | 'regression_table'
  | 'model_diagnostic'
  | 'causal_dag'
  | 'map'
  | 'codebook'
  | 'qualitative_coding';

export interface ScienceStructureViewerSelection {
  chain?: string;
  residueStart?: number;
  residueEnd?: number;
  residues?: number[];
  ligand?: string;
  atomIds?: number[];
}

export interface ScienceStructureViewerAnnotation extends ScienceStructureViewerSelection {
  label: string;
  evidenceIds?: string[];
  color?: string;
}

export interface ScienceStructureViewerSpec {
  kind?: ScienceStructureViewerKind;
  format?: ScienceStructureFormat;
  representation?: ScienceStructureRepresentation;
  colorBy?: ScienceStructureColorBy;
  background?: 'light' | 'dark' | 'transparent';
  focus?: ScienceStructureViewerSelection;
  annotations?: ScienceStructureViewerAnnotation[];
}

export interface ScienceArtifactViewerSpec {
  kind?: ScienceArtifactViewerKind;
  format?: string;
  representation?: ScienceStructureRepresentation;
  colorBy?: ScienceStructureColorBy;
  background?: 'light' | 'dark' | 'transparent';
  focus?: ScienceStructureViewerSelection | Record<string, unknown>;
  annotations?: Array<ScienceStructureViewerAnnotation | Record<string, unknown>>;
  configPath?: string;
  dataPath?: string;
  indexPath?: string;
  sourcePath?: string;
  tablePath?: string;
  modelPath?: string;
  logPath?: string;
  schemaPath?: string;
  codebookPath?: string;
  variableDictionaryPath?: string;
  dagPath?: string;
  mapPath?: string;
  editable?: boolean;
  savePolicy?: 'read_only' | 'new_version_required' | 'overwrite_allowed';
  tracks?: Array<Record<string, unknown>>;
  datasets?: Array<Record<string, unknown>>;
  layers?: Array<Record<string, unknown>>;
  variables?: Array<Record<string, unknown>>;
  diagnostics?: Array<Record<string, unknown>>;
  assumptions?: Array<Record<string, unknown>>;
  evidenceIds?: string[];
}

export interface ScienceArtifact {
  id: string;
  runId: string;
  type: ScienceArtifactType;
  title: string;
  version: number;
  versionGroupId?: string;
  previousArtifactId?: string;
  previousVersion?: number;
  revision?: string;
  changeSummary?: string;
  status?: 'available' | 'missing' | 'stale' | 'generating' | 'failed';
  primaryPath?: string;
  previewPath?: string;
  thumbnailPath?: string;
  sourcePaths?: string[];
  inputPaths?: string[];
  outputPaths?: string[];
  contentHash?: string;
  sizeBytes?: number;
  mimeType?: string;
  code?: {
    path?: string;
    language?: 'python' | 'r' | 'shell' | 'latex' | 'markdown';
    entrypoint?: string;
    cellIds?: string[];
  };
  execution?: {
    command?: string;
    scriptPath?: string;
    cwd?: string;
    logPath?: string;
    stdoutPreview?: string;
    stderrPreview?: string;
    startedAt?: number;
    endedAt?: number;
    exitCode?: number;
  };
  environment?: {
    kind?: 'local' | 'conda' | 'uv' | 'renv' | 'docker' | 'slurm' | 'modal' | 'ssh';
    python?: string;
    r?: string;
    packages?: Array<{ name: string; version?: string }>;
    lockfilePath?: string;
    hardware?: string;
  };
  inputs?: Array<{
    label?: string;
    role?: 'primary' | 'reference' | 'parameter' | 'metadata' | 'derived';
    path?: string;
    artifactId?: string;
    evidenceId?: string;
    contentHash?: string;
    sizeBytes?: number;
    mimeType?: string;
  }>;
  relatedMessageIds?: string[];
  relatedToolCallIds?: string[];
  defaultInspectorTab?: ScienceArtifactInspectorTab;
  availableTabs?: ScienceArtifactInspectorTab[];
  evidenceIds?: string[];
  provenanceNodeIds?: string[];
  reviewStatus?: 'not_reviewed' | 'passed' | 'warnings' | 'failed';
  viewer?: ScienceArtifactViewerSpec;
  metadata?: Record<string, unknown>;
  git?: ScienceArtifactGitRef;
  createdAt: number;
}

export interface ScienceArtifactPage {
  id: string;
  runId: string;
  title: string;
  kind:
    | 'report'
    | 'artifact_workspace'
    | 'figure'
    | 'table'
    | 'code'
    | 'log'
    | 'latex'
    | 'notebook'
    | 'pdf'
    | 'provenance'
    | 'structure'
    | 'regression_table'
    | 'model_diagnostic'
    | 'causal_dag'
    | 'codebook'
    | 'map'
    | 'qualitative_coding';
  layout: 'report_artifact_inspector' | 'single_preview' | 'split_editor_preview' | 'ledger' | 'drawer';
  panes: Array<{
    id: string;
    type:
      | 'report'
      | 'preview'
      | 'inspector'
      | 'code'
      | 'execution_log'
      | 'latex_editor'
      | 'compiled_pdf'
      | 'notebook'
      | 'evidence_ledger'
      | 'provenance_chain'
      | 'structure_viewer'
      | 'social_science_viewer'
      | 'regression_table'
      | 'model_diagnostic'
      | 'causal_dag'
      | 'map'
      | 'codebook'
      | 'qualitative_coding';
    target?: {
      artifactId?: string;
      artifactVersion?: number;
      evidenceId?: string;
      claimId?: string;
      path?: string;
    };
  }>;
  revision?: string;
}

export type ScienceProvenanceEdgeType =
  | 'derived_from'
  | 'uses_input'
  | 'uses_code'
  | 'has_log'
  | 'generated'
  | 'supports'
  | 'contradicts'
  | 'validates'
  | 'cites'
  | 'annotates'
  | 'supersedes'
  | 'selected_by_skill'
  | 'answers';

export interface ScienceProvenanceNode {
  id: string;
  type: 'input' | 'activity' | 'output' | 'environment' | 'claim' | 'skill_use' | 'review' | 'user_decision';
  label: string;
  artifactId?: string;
  evidenceIds?: string[];
  parents?: string[];
  command?: string;
  path?: string;
  contentHash?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  revision?: string;
}

export interface ScienceProvenanceEdge {
  id: string;
  runId: string;
  from:
    | { kind: 'evidence'; id: string }
    | { kind: 'artifact'; id: string; version?: number }
    | { kind: 'node'; id: string }
    | { kind: 'claim'; id: string }
    | { kind: 'skill_use'; id: string }
    | { kind: 'message'; id: string };
  to:
    | { kind: 'evidence'; id: string }
    | { kind: 'artifact'; id: string; version?: number }
    | { kind: 'node'; id: string }
    | { kind: 'claim'; id: string }
    | { kind: 'skill_use'; id: string }
    | { kind: 'message'; id: string };
  type: ScienceProvenanceEdgeType;
  label?: string;
  confidence?: 'certain' | 'inferred' | 'declared';
  createdAt: number;
}

export interface ScienceGraphWarning {
  id: string;
  runId: string;
  severity: 'info' | 'warning' | 'error';
  code:
    | 'missing_source'
    | 'missing_edge'
    | 'unopenable_evidence'
    | 'untraced_artifact'
    | 'unsupported_claim'
    | 'broken_reference'
    | 'stale_version'
    | 'missing_environment'
    | 'missing_execution_log';
  message: string;
  target?:
    | { kind: 'evidence'; id: string }
    | { kind: 'artifact'; id: string; version?: number }
    | { kind: 'claim'; id: string }
    | { kind: 'node'; id: string }
    | { kind: 'edge'; id: string };
  blocking?: boolean;
  createdAt: number;
}

export interface ScienceSkillUse {
  id: string;
  runId: string;
  skillId: string;
  skillName: string;
  source: 'deepscientist' | 'k-dense' | 'auto-empirical' | 'sciagent' | 'local' | 'custom';
  sourceUrl?: string;
  version?: string;
  purpose:
    | 'routing'
    | 'database_lookup'
    | 'package_workflow'
    | 'pipeline'
    | 'visualization'
    | 'writing'
    | 'review'
    | 'empirical_design'
    | 'causal_inference'
    | 'replication'
    | 'citation_audit'
    | 'codebook'
    | 'qualitative_analysis';
  status: 'selected' | 'used' | 'blocked' | 'unavailable';
  triggeredBy: string;
  selectedBecause?: string;
  limitations?: string[];
  evidenceIds?: string[];
  artifactIds?: string[];
  createdAt: number;
  revision?: string;
}

export type ScienceReportBlock =
  | { type: 'paragraph'; text: string; evidenceIds?: string[] }
  | { type: 'bullet_list'; items: Array<{ text: string; evidenceIds?: string[]; confidence?: string }> }
  | { type: 'checklist'; items: Array<{ label: string; detail?: string; status?: string; evidenceIds?: string[] }> }
  | { type: 'figure_ref'; artifactId: string }
  | { type: 'table_ref'; artifactId: string }
  | { type: 'artifact_ref'; artifactId: string }
  | { type: 'code_ref'; artifactId: string }
  | { type: 'card_ref'; cardId: string };

export interface SciencePanelData {
  schema: typeof SCIENCE_PANEL_SCHEMA;
  runId: string;
  conversationId?: string;
  projectRoot?: string;
  question: string;
  generatedAt: number;
  summary?: string;
  status: 'completed' | 'partial' | 'blocked' | 'failed' | 'running' | 'draft';
  stats: {
    searches: number;
    artifacts: number;
    evidence: number;
    commands: number;
    validations: number;
    warnings: number;
  };
  report: {
    title: string;
    sections: Array<{
      id: string;
      heading: string;
      blocks: ScienceReportBlock[];
    }>;
  };
  evidence: ScienceEvidenceItem[];
  artifacts: ScienceArtifact[];
  pages?: ScienceArtifactPage[];
  claims?: ScienceClaim[];
  provenance: ScienceProvenanceNode[];
  edges?: ScienceProvenanceEdge[];
  graphWarnings?: ScienceGraphWarning[];
  usedSkills?: ScienceSkillUse[];
  methods?: {
    queryPlan?: string[];
    commands?: string[];
    environmentSummary?: string;
    limitations?: string[];
  };
  git?: ScienceArtifactGitRef;
}

export type ScienceArtifactAction =
  | 'status'
  | 'reserve_id'
  | 'get'
  | 'list'
  | 'create'
  | 'patch'
  | 'replace'
  | 'append'
  | 'version'
  | 'snapshot'
  | 'publish'
  | 'annotate'
  | 'focus_page';

export type ScienceArtifactResourceKind =
  | 'run'
  | 'report'
  | 'artifact'
  | 'page'
  | 'evidence'
  | 'claim'
  | 'provenance'
  | 'skill_use'
  | 'annotation';

export interface ScienceArtifactEvent {
  schema: typeof SCIENCE_EVENT_SCHEMA;
  eventId: string;
  runId: string;
  action: ScienceArtifactAction;
  timestamp: number;
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  target?: {
    kind?: ScienceArtifactResourceKind;
    id?: string;
    version?: number;
    pageId?: string;
  };
  baseRevision?: string;
  resultingRevision?: string;
  artifactIds?: string[];
  pageIds?: string[];
  evidenceIds?: string[];
  claimIds?: string[];
  provenanceNodeIds?: string[];
  panel?: SciencePanelData;
  edges?: ScienceProvenanceEdge[];
  warnings?: ScienceGraphWarning[];
  git?: ScienceArtifactGitRef;
  displayIntent?: 'background' | 'open' | 'focus';
  snapshot?: {
    includePaths?: ScienceArtifactSnapshotIncludePath[];
    files?: ScienceArtifactGitFile[];
  };
}

export interface ScienceArtifactSnapshotIncludePath {
  path: string;
  role?:
    | 'primary'
    | 'preview'
    | 'thumbnail'
    | 'input'
    | 'source'
    | 'output'
    | 'code'
    | 'log'
    | 'environment'
    | 'reference'
    | 'other';
  artifactId?: string;
  artifactVersion?: number;
  recursive?: boolean;
  snapshotId?: string;
}

export interface ScienceArtifactGitFile {
  path: string;
  relativePath?: string;
  role?: ScienceArtifactSnapshotIncludePath['role'];
  artifactId?: string;
  artifactVersion?: number;
  mode: 'copied' | 'pointer' | 'missing' | 'ignored';
  storedPath?: string;
  sha256?: string;
  sizeBytes?: number;
  reason?: string;
}

export interface ScienceArtifactGitRef {
  projectId?: string;
  repoPath?: string;
  commit?: string;
  shortCommit?: string;
  snapshotPath?: string;
  runPath?: string;
  status?: 'committed' | 'unchanged' | 'unavailable';
  files?: ScienceArtifactGitFile[];
  changedFiles?: string[];
  error?: string;
  warning?: string;
}

export interface ScienceArtifactFileProvenanceRecord {
  projectId?: string;
  projectRoot?: string;
  runId: string;
  conversationId?: string;
  messageId?: string;
  toolCallId?: string;
  eventId?: string;
  action?: ScienceArtifactAction;
  timestamp: number;
  path: string;
  relativePath?: string;
  role?: ScienceArtifactSnapshotIncludePath['role'];
  artifactId?: string;
  artifactVersion?: number;
  artifactTitle?: string;
  artifactType?: ScienceArtifactType;
  evidenceIds?: string[];
  provenanceNodeIds?: string[];
  mode: ScienceArtifactGitFile['mode'];
  storedPath?: string;
  sha256?: string;
  sizeBytes?: number;
  reason?: string;
  commit?: string;
  shortCommit?: string;
  snapshotPath?: string;
  status?: 'tracked' | 'modified' | 'missing' | 'pointer' | 'ignored' | 'untracked' | 'unknown';
}

export interface ScienceArtifactFileProvenanceHistoryItem {
  commit?: string;
  shortCommit?: string;
  timestamp: number;
  action?: ScienceArtifactAction;
  role?: ScienceArtifactSnapshotIncludePath['role'];
  artifactId?: string;
  artifactVersion?: number;
  mode?: ScienceArtifactGitFile['mode'];
}

export interface ScienceArtifactFileProvenanceResult {
  ok: boolean;
  status: 'tracked' | 'modified' | 'missing' | 'pointer' | 'ignored' | 'untracked' | 'unknown';
  filePath: string;
  relativePath?: string;
  projectId?: string;
  projectRoot?: string;
  record?: ScienceArtifactFileProvenanceRecord;
  history?: ScienceArtifactFileProvenanceHistoryItem[];
  error?: string;
}

export type SciencePayload = ScienceArtifactEvent | SciencePanelData;

export interface ScienceConversationExtra {
  enabled: true;
  mode: typeof SCIENCE_MODE_ID;
  projectRoot?: string;
  sopVersion: 1;
  report: {
    enabled: true;
    render: 'inline_structured';
    artifacts: true;
    provenance: true;
    figures: true;
    artifactInspector: true;
  };
  evidence: {
    searchTool: 'research_evidence';
    sharedWithMedicalEvidence: true;
  };
  provenance: {
    evidenceIds: true;
    claimTypes: true;
    contentHash: true;
    environment: true;
    graphWarnings: true;
  };
  skills: {
    rootDiscipline: typeof SCIENCE_CORE_SKILL_NAME;
    artifactSkill: typeof SCIENCE_ARTIFACT_SKILL_NAME;
    materializedSkillPackManifestPath: typeof SCIENCE_SKILL_PACK_MANIFEST_PATH;
    vendorCatalogSkill?: typeof SCIENCE_VENDOR_CATALOG_SKILL_NAME;
    enabledSkillIds: string[];
  };
}

export const buildScienceConversationExtra = (projectRoot?: string): ScienceConversationExtra => ({
  enabled: true,
  mode: SCIENCE_MODE_ID,
  projectRoot,
  sopVersion: 1,
  report: {
    enabled: true,
    render: 'inline_structured',
    artifacts: true,
    provenance: true,
    figures: true,
    artifactInspector: true,
  },
  evidence: {
    searchTool: 'research_evidence',
    sharedWithMedicalEvidence: true,
  },
  provenance: {
    evidenceIds: true,
    claimTypes: true,
    contentHash: true,
    environment: true,
    graphWarnings: true,
  },
  skills: {
    rootDiscipline: SCIENCE_CORE_SKILL_NAME,
    artifactSkill: SCIENCE_ARTIFACT_SKILL_NAME,
    materializedSkillPackManifestPath: SCIENCE_SKILL_PACK_MANIFEST_PATH,
    enabledSkillIds: [...DEFAULT_SCIENCE_SKILL_IDS],
  },
});

export const buildScienceModePrompt = (projectRoot?: string, preferredLocale?: string): string =>
  [
    '# OpenScience Science Mode',
    '',
    'You are running inside OpenScience Science Mode. This is the default research-project mode for natural science, engineering, data analysis, computational experiments, and manuscript-producing work.',
    getPromptLanguageInstruction(preferredLocale),
    '',
    '## Runtime Boundary',
    '- Use the normal agent runtime, shell, Python, R, LaTeX, notebook, or existing remote tools to do real work.',
    '- The MCP tools do not run analyses for you. They record, read, patch, version, publish, and display the artifact graph.',
    '- If decisive task variables are missing, call openscience-user-input and ask at most 3 concise questions.',
    projectRoot
      ? `- Authorized research project root: ${projectRoot}`
      : '- No explicit project root was provided; keep paths relative and ask before accessing new roots.',
    '',
    '## Required Tools',
    '- Use research_evidence(action="search"|"read") for literature or database retrieval. Do not rely only on model memory when external evidence is needed.',
    '- Use science_artifact as the single artifact graph control surface. Do not invent separate science_start_run, science_search, science_register_* or science_submit_panel tools.',
    '- Use science_artifact(action="snapshot") when a run produces or modifies files that must be reproducible, especially before publish/export or after figure/manuscript/notebook iteration.',
    '- Any file that the user can open from the Science report, Project shelf, or chat output must be declared on an artifact or included in science_artifact(action="snapshot") so the Preview menu can show where it came from.',
    '- Use science_artifact(action="publish") before the final visible answer so the UI can render the Science Report and Artifact Ledger.',
    '- Use the default materialized Science skill pack as first-class skills. Prefer ds-*, kdense-*, and aer-* skill ids over browsing vendor directories. The vendored catalog is only a migration/source index.',
    '- Use openscience-workflow when the next research-process stage is unclear or when routing among DeepScientist workflow skills. It manages ds-* stage selection separately from the core Science evidence/artifact contract.',
    '- Auto-Empirical Research Skills are included for social-science and empirical workflows. Start with the aer-auto-empirical-research-skills router when the exact method skill is unclear, then record the selected child skill as skill_use before relying on it.',
    '- Use artifact.viewer metadata for native scientific viewers only when it improves inspection, editing, annotation, or reproducibility: 3dmol/molstar for structures, igv for indexed genome tracks, ketcher for molecules/reactions, vitessce for prepared single-cell/spatial configs, msa for alignments, and regression_table/causal_dag/map/codebook/qualitative_coding for empirical social-science artifacts.',
    '- Do not store transient local asset URLs in prompts, reports, or evidence. Record durable project-relative paths, hashes, indexes, config files, conversion commands, logs, and evidence ids; the renderer may create short-lived URLs later.',
    '',
    '## Science SOP',
    '1. Intake: restate the research objective, authorized project root, expected deliverables, relevant skills, and missing assumptions. Ask concise user questions only when the next action would otherwise be unsafe or scientifically ambiguous.',
    '2. Evidence first: search/read external sources or local inputs with research_evidence, then register evidence nodes before using them to support claims. Treat papers, database records, datasets, code, command logs, figures, tables, environments, and user decisions as first-class evidence.',
    '3. Execute real work: run Python, R, shell, LaTeX, notebooks, or existing project pipelines through the normal runtime. Record commands, cwd, logs, inputs, output paths, package/runtime details, and any failures.',
    '4. Publish artifacts: create or update each user-facing figure, table, dataset, notebook, manuscript, PDF, HTML page, regression table, diagnostic plot, causal DAG, codebook, map, qualitative coding ledger, replication package, or run bundle with science_artifact. Every artifact needs a stable id, version, paths, inputs, code/log/environment links, and evidence ids when known.',
    '5. Snapshot reproducibility: after a meaningful file-producing step, call science_artifact(action="snapshot") with includePaths for extra files/folders the artifact needs but did not already declare. Include scripts, notebooks, logs, result folders, LaTeX sources, small tables, and configuration needed to defend the result. Do not include secrets; large files may be stored as pointers.',
    '6. File provenance: before finalizing, verify that each visible output file has a primary/preview/input/source/code/log role, a durable path, and a snapshot record. If a file cannot be snapshotted, record a pointer with hash/size/reason instead of leaving it invisible to provenance.',
    '7. Write claims carefully: every result statement in the report must be backed by evidenceIds and claimType. Use hypothesis for unverified ideas, partial for incomplete support, and blocked when required provenance is missing.',
    '8. Render the report: use science_artifact(action="publish") to expose a Science report in the existing Preview frame. The report should use evidence-report styling: narrative sections, inline [E#] citations, Reference Evidence, artifact rows, methods, and provenance warnings.',
    '9. Iterate safely: before modifying an existing artifact, evidence node, claim, or page, call science_artifact(action="get") and patch/version with baseRevision. Preserve older versions unless the user explicitly asks to close or remove them.',
    '10. Final response: keep prose short and point the user to the published report/artifacts. Mention important graphWarnings plainly and never hide unresolved provenance gaps.',
    '',
    '## Artifact Discipline',
    '- Every user-facing output file should become a Science artifact with a stable id, type, version, status, path, inputs, code, execution log, messages, environment, and evidence ids when known.',
    '- Reserve ids with science_artifact(action="reserve_id") when you need to reference an artifact before the file exists.',
    '- Before modifying an existing artifact/page/evidence/claim, call science_artifact(action="get") and pass baseRevision to patch/replace/version. Do not blindly overwrite.',
    '- Regenerated figures, tables, PDFs, notebooks, and manuscripts should use science_artifact(action="version") rather than overwriting v1.',
    '- If you create supporting files that are not listed on the artifact, call science_artifact(action="snapshot", payload={includePaths:[...]}) to add them to the project-level artifact git ledger. For folders, set recursive=true unless you intentionally only want a pointer.',
    '- When snapshotting includePaths, assign roles deliberately: primary, preview, input, source, code, log, output, environment, or reference. The UI uses these roles to explain where each opened file came from.',
    '- The same research project reuses one OpenScience artifact git ledger under .openscience/artifact-repo; do not create parallel ledgers for the same project.',
    '- LaTeX, notebooks, and PDFs are artifacts too: record source paths, compiled preview paths, compile commands, logs, and environment.',
    '- Native scientific objects are artifacts too: structures, genome tracks, molecules, single-cell/spatial workspaces, and alignments need source evidence, durable paths, validation evidence, and optional viewer metadata.',
    '- For structure viewer metadata, use artifact.viewer={kind:"3dmol"|"molstar"|"rcsb_molstar"|"auto", format:"pdb"|"cif"|"sdf"|..., representation:"cartoon"|"stick"|"surface"|"auto", colorBy:"chain"|"element"|"plddt"|"auto", focus:{chain,residueStart,residueEnd,ligand}, annotations:[{label,evidenceIds,...}]} when it helps the user inspect the result.',
    '- For genome viewer metadata, use type="genome_track" and artifact.viewer={kind:"igv", genome, reference, locus, tracks:[{name,type,format,path,indexPath,evidenceId,...}]}. BAM/CRAM/VCF.GZ tracks require indexes and reference/QC evidence before claims.',
    '- For chemical editor metadata, use type="molecule" and artifact.viewer={kind:"ketcher", format, editable, service:"standalone", savePolicy:"new_version_required", exportFormats:[...]}. User edits must create a new artifact version.',
    '- For Vitessce metadata, use type="dataset" or "run_bundle" and artifact.viewer={kind:"vitessce", configPath, datasets, requiredConversions:[...]}. Prepare compatible data/config and record conversion/validation evidence before rendering.',
    '- For alignment metadata, use type="alignment" and artifact.viewer={kind:"msa", format, path, focus, colorScheme}. Register parser/format validation and sequence statistics as evidence.',
    '',
    '## Evidence and Claim Discipline',
    '- Each answer-bearing claim must have evidenceIds and a claimType: computed, parsed, digitized, or hypothesis.',
    '- computed means real execution happened in this project and is linked to input, code, command/log, output, and environment when possible.',
    '- parsed means read from supplied data, database records, papers, or metadata.',
    '- digitized means extracted from an image/PDF/figure region and must include region/method details.',
    '- hypothesis means plausible but not verified; never present it as a completed result.',
    '',
    '## Page and Display Discipline',
    '- You may create or update artifact pages with science_artifact. Pages describe what the existing Preview frame should show: report, preview, inspector, native science viewer, LaTeX editor/PDF split, notebook, log, evidence ledger, or provenance chain.',
    '- For native viewer outputs, create a preview/science_viewer pane targeting the artifact plus an inspector pane for inputs, code, logs, environment, evidence, and provenance. Focus the page only when the user should inspect the result now.',
    '- For PDB/mmCIF/PQR/SDF/MOL/MOL2/XYZ outputs, use a preview or structure_viewer pane and focus the corresponding artifact page rather than pasting coordinates into chat.',
    '- For BAM/CRAM/VCF/BED/BigWig/GFF/GTF outputs, use an igv viewer only after declaring genome/reference, tracks, indexes, and QC evidence.',
    '- For Ketcher/Vitessce pages, prefer read-only inspection until edits or conversions are registered as new artifact versions or evidence records.',
    '- For empirical social-science outputs, use regression_table, model_diagnostic, causal_dag, survey_codebook, geospatial_map, qualitative_coding, or replication_package artifact types when they better describe the object than a generic table/figure/dataset. Register estimation code, formula/specification, sample definition, diagnostics, assumptions, and robustness outputs as linked evidence.',
    '- For regression tables, use artifact.viewer={kind:"regression_table", tablePath, modelPath, codebookPath, diagnostics:[...], evidenceIds:[...]}; for causal DAGs use {kind:"causal_dag", dagPath, assumptions:[...]}; for maps use {kind:"map", mapPath, layers:[...]}; for survey/codebook objects use {kind:"codebook", codebookPath, variableDictionaryPath}; for qualitative coding use {kind:"qualitative_coding", schemaPath, dataPath}.',
    '- Do not create a separate dashboard or report rail. Science UI should extend the normal file preview surface and reuse the evidence-report visual style for reports, reference evidence, artifact rows, methods, and warnings.',
    '- Prefer displayIntent="background" for routine updates. Use displayIntent="open" or "focus" only when the user should inspect a result now.',
    '- Do not close user-opened pages unless the user explicitly asked; userAuthorizedClose must be true for close-like behavior.',
    '',
    '## Final Answer',
    '- Keep final prose short. The structured Science panel is the main result.',
    '- If graphWarnings remain, mention the important ones plainly rather than hiding provenance gaps.',
    '',
    '## Default Skills',
    `- Use ${SCIENCE_CORE_SKILL_NAME}: ${SCIENCE_CORE_SKILL_PATH}.`,
    `- Use ${SCIENCE_ARTIFACT_SKILL_NAME}: ${SCIENCE_ARTIFACT_SKILL_PATH}.`,
    `- Use ${SCIENCE_WORKFLOW_SKILL_NAME}: ${SCIENCE_WORKFLOW_SKILL_PATH}.`,
    `- Default Science skill pack manifest: ${SCIENCE_SKILL_PACK_MANIFEST_PATH}.`,
    `- Materialized external skills: ${SCIENCE_SKILL_PACK_COUNTS.total} total; ${SCIENCE_SKILL_PACK_COUNTS.deepscientist} DeepScientist, ${SCIENCE_SKILL_PACK_COUNTS.kdense} K-Dense, and ${SCIENCE_SKILL_PACK_COUNTS.autoEmpirical} Auto-Empirical Research Skills.`,
    `- Safety policy summary: ${SCIENCE_SKILL_PACK_COUNTS.quarantinedScripts} script-bearing skills are quarantined by default; ${SCIENCE_SKILL_PACK_COUNTS.restrictedDefault} skills require explicit authorization for restricted contexts.`,
    `- Migration-only catalog, when provenance debugging is needed: ${SCIENCE_VENDOR_CATALOG_SKILL_NAME}: ${SCIENCE_VENDOR_CATALOG_SKILL_PATH}.`,
  ].join('\n');

export const isScienceConversationExtra = (extra: unknown): extra is { science: ScienceConversationExtra } => {
  if (!extra || typeof extra !== 'object' || Array.isArray(extra)) return false;
  const science = (extra as Record<string, unknown>).science;
  if (!science || typeof science !== 'object' || Array.isArray(science)) return false;
  const record = science as Partial<ScienceConversationExtra> & Record<string, unknown>;
  return record.enabled === true && (record.mode === SCIENCE_MODE_ID || record.report !== undefined);
};

const toRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const stripFence = (value: string): string => {
  const trimmed = value.trim();
  const opening = trimmed.match(/^```(?:json)?\s*/u);
  if (!opening) return trimmed;
  return trimmed
    .slice(opening[0].length)
    .replace(/\s*```\s*$/u, '')
    .trim();
};

function parsePayloadString(text: string, depth = 0): SciencePayload | undefined {
  if (depth > 6 || !text.includes('deeporganiser.science.')) return undefined;
  const candidates = [stripFence(text)];
  const schemaIndex = text.indexOf('deeporganiser.science.');
  if (schemaIndex >= 0) {
    const start = text.lastIndexOf('{', schemaIndex);
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      candidates.push(text.slice(start, end + 1));
    }
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const payload = findPayloadCandidate(parsed, depth + 1);
      if (payload) return payload;
    } catch {
      // Continue with the next candidate.
    }
  }
  return undefined;
}

function findPayloadCandidate(value: unknown, depth = 0): SciencePayload | undefined {
  if (depth > 6) return undefined;
  if (typeof value === 'string') return parsePayloadString(value, depth + 1);
  if (Array.isArray(value)) {
    for (const item of value) {
      const payload = findPayloadCandidate(item, depth + 1);
      if (payload) return payload;
    }
    return undefined;
  }
  const record = toRecord(value);
  if (!record) return undefined;
  if (record.schema === SCIENCE_PANEL_SCHEMA) return value as SciencePanelData;
  if (record.schema === SCIENCE_EVENT_SCHEMA) return value as ScienceArtifactEvent;
  for (const nested of Object.values(record)) {
    const payload = findPayloadCandidate(nested, depth + 1);
    if (payload) return payload;
  }
  return undefined;
}

const parsePayloadCandidate = (text: string): SciencePayload | undefined => parsePayloadString(text);

const getToolGroupOutput = (message: IMessageToolGroup): string[] =>
  Array.isArray(message.content)
    ? message.content
        .flatMap((tool) => {
          const result = tool.result_display;
          if (!result) return [];
          if (typeof result === 'string') return [result];
          if ('output' in result && typeof result.output === 'string') return [result.output];
          if ('result' in result && typeof result.result === 'string') return [result.result];
          if ('text' in result && typeof result.text === 'string') return [result.text];
          return [];
        })
        .filter(Boolean)
    : [];

const getAcpToolOutput = (message: IMessageAcpToolCall): string[] => {
  const update = message.content?.update;
  const textParts =
    update?.content
      ?.map((item) => (item.type === 'content' ? item.content?.text : undefined))
      .filter((item): item is string => Boolean(item)) ?? [];
  const rawOutput = update?.rawOutput || update?.raw_output;
  return [...textParts, ...(rawOutput ? [JSON.stringify(rawOutput)] : [])];
};

const getToolCallOutput = (message: IMessageToolCall): string[] =>
  [message.content.output, message.content.error].filter((item): item is string => Boolean(item));

export const extractSciencePayloadsFromTools = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): SciencePayload[] =>
  messages.flatMap((message) => {
    const outputs =
      message.type === 'tool_group'
        ? getToolGroupOutput(message)
        : message.type === 'acp_tool_call'
          ? getAcpToolOutput(message)
          : getToolCallOutput(message);
    return outputs.map(parsePayloadCandidate).filter((payload): payload is SciencePayload => Boolean(payload));
  });

export const latestSciencePanel = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): SciencePanelData | undefined => {
  const panels = extractSciencePayloadsFromTools(messages)
    .map((payload) => {
      if ((payload as SciencePanelData).schema === SCIENCE_PANEL_SCHEMA) {
        return payload as SciencePanelData;
      }
      const event = payload as ScienceArtifactEvent;
      if (event.schema === SCIENCE_EVENT_SCHEMA && event.action === 'publish') {
        return event.panel;
      }
      return undefined;
    })
    .filter((panel): panel is SciencePanelData => Boolean(panel));
  return panels.at(-1);
};

export const getScienceArtifactPreviewPath = (artifact?: ScienceArtifact): string | undefined =>
  artifact?.previewPath ||
  artifact?.primaryPath ||
  artifact?.thumbnailPath ||
  artifact?.outputPaths?.[0] ||
  artifact?.code?.path;

export const findSciencePanelArtifact = (
  panel: SciencePanelData,
  artifactId?: string,
  artifactVersion?: number
): ScienceArtifact | undefined => {
  if (!artifactId) return undefined;
  return (
    panel.artifacts.find(
      (artifact) => artifact.id === artifactId && (artifactVersion == null || artifact.version === artifactVersion)
    ) || panel.artifacts.find((artifact) => artifact.id === artifactId)
  );
};

export type ScienceDisplayTarget =
  | {
      kind: 'report';
      intent: 'open' | 'focus';
      panel: SciencePanelData;
      eventId: string;
      pageId?: string;
    }
  | {
      kind: 'artifact';
      intent: 'open' | 'focus';
      panel: SciencePanelData;
      eventId: string;
      artifact: ScienceArtifact;
      path: string;
      pageId?: string;
    };

const SCIENCE_PREVIEW_PANE_TYPES = new Set([
  'preview',
  'structure_viewer',
  'science_viewer',
  'latex_editor',
  'compiled_pdf',
  'notebook',
  'regression_table',
  'model_diagnostic',
  'causal_dag',
  'map',
  'codebook',
  'qualitative_coding',
]);

export const resolveScienceDisplayTarget = (payload: SciencePayload): ScienceDisplayTarget | undefined => {
  const event = payload as ScienceArtifactEvent;
  if (event.schema !== SCIENCE_EVENT_SCHEMA) return undefined;
  const intent = event.displayIntent === 'open' || event.displayIntent === 'focus' ? event.displayIntent : undefined;
  if (!intent || !event.panel) return undefined;

  const panel = event.panel;
  const pageId =
    event.target?.pageId || event.pageIds?.[0] || (event.target?.kind === 'page' ? event.target.id : undefined);
  const page = pageId ? panel.pages?.find((item) => item.id === pageId) : undefined;
  const pane = page?.panes.find((item) => SCIENCE_PREVIEW_PANE_TYPES.has(item.type));
  const paneArtifact = findSciencePanelArtifact(panel, pane?.target?.artifactId, pane?.target?.artifactVersion);
  const panePath = pane?.target?.path || getScienceArtifactPreviewPath(paneArtifact);
  if (paneArtifact && panePath) {
    return { kind: 'artifact', intent, panel, eventId: event.eventId, pageId, artifact: paneArtifact, path: panePath };
  }

  const targetArtifact = findSciencePanelArtifact(
    panel,
    event.target?.kind === 'artifact' ? event.target.id : event.artifactIds?.[0],
    event.target?.kind === 'artifact' ? event.target.version : undefined
  );
  const targetPath = getScienceArtifactPreviewPath(targetArtifact);
  if (targetArtifact && targetPath) {
    return {
      kind: 'artifact',
      intent,
      panel,
      eventId: event.eventId,
      pageId,
      artifact: targetArtifact,
      path: targetPath,
    };
  }

  return { kind: 'report', intent, panel, eventId: event.eventId, pageId };
};

export type ScienceTraceKind = 'run' | 'search' | 'artifact' | 'evidence' | 'claim' | 'page' | 'publish';

export interface ScienceTraceItem {
  id: string;
  kind: ScienceTraceKind;
  label: string;
  detail?: string;
  count?: number;
  timestamp?: number;
}

export interface ScienceRuntimeSummary {
  stats: SciencePanelData['stats'];
  trace: ScienceTraceItem[];
  hasPanel: boolean;
  processEventCount: number;
  stageKeys: ScienceTraceKind[];
}

const traceFromPayload = (payload: SciencePayload, index: number): ScienceTraceItem | undefined => {
  if ((payload as SciencePanelData).schema === SCIENCE_PANEL_SCHEMA) return undefined;
  const event = payload as ScienceArtifactEvent;
  if (event.schema !== SCIENCE_EVENT_SCHEMA) return undefined;
  const kind: ScienceTraceKind =
    event.action === 'publish'
      ? 'publish'
      : event.target?.kind === 'artifact'
        ? 'artifact'
        : event.target?.kind === 'evidence'
          ? 'evidence'
          : event.target?.kind === 'claim'
            ? 'claim'
            : event.target?.kind === 'page'
              ? 'page'
              : event.target?.kind === 'run'
                ? 'run'
                : 'artifact';
  return {
    id: `science-${event.runId}-${event.eventId || index}`,
    kind,
    label: event.action,
    detail: event.target?.id || event.target?.kind,
    count:
      (event.artifactIds?.length || 0) +
      (event.evidenceIds?.length || 0) +
      (event.claimIds?.length || 0) +
      (event.pageIds?.length || 0),
    timestamp: event.timestamp,
  };
};

export const summarizeScienceRuntime = (
  messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageToolCall>
): ScienceRuntimeSummary | undefined => {
  const payloads = extractSciencePayloadsFromTools(messages);
  if (!payloads.length) return undefined;
  const panel = latestSciencePanel(messages);
  const trace = payloads.map(traceFromPayload).filter((item): item is ScienceTraceItem => Boolean(item));
  const processEvents = payloads.filter(
    (payload): payload is ScienceArtifactEvent =>
      (payload as ScienceArtifactEvent).schema === SCIENCE_EVENT_SCHEMA &&
      (payload as ScienceArtifactEvent).action !== 'publish'
  );
  const stageKeys = Array.from(new Set(trace.map((item) => item.kind)));
  if (panel) {
    return {
      stats: panel.stats,
      trace,
      hasPanel: true,
      processEventCount: processEvents.length,
      stageKeys,
    };
  }
  return {
    stats: {
      searches: 0,
      artifacts: processEvents.filter((event) => event.target?.kind === 'artifact').length,
      evidence: processEvents.filter((event) => event.target?.kind === 'evidence').length,
      commands: 0,
      validations: 0,
      warnings: processEvents.reduce((sum, event) => sum + (event.warnings?.length || 0), 0),
    },
    trace,
    hasPanel: false,
    processEventCount: processEvents.length,
    stageKeys,
  };
};
