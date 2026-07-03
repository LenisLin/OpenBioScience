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
export const SCIENCE_ONBOARDING_SKILL_NAME = 'openscience-onboarding';
export const SCIENCE_ONBOARDING_SKILL_PATH = 'resources/skills/onboarding/SKILL.md';
export const SCIENCE_WRITING_SKILL_NAME = 'openscience-writing';
export const SCIENCE_WRITING_SKILL_PATH = 'resources/skills/writing/SKILL.md';
export const SCIENCE_DATABASES_SKILL_NAME = 'openscience-databases';
export const SCIENCE_DATABASES_SKILL_PATH = 'resources/skills/databases/SKILL.md';
export const SCIENCE_BIOMODELS_SKILL_NAME = 'openscience-biomodels';
export const SCIENCE_BIOMODELS_SKILL_PATH = 'resources/skills/biomodels/SKILL.md';
export const SCIENCE_SINGLECELL_SKILL_NAME = 'openscience-singlecell';
export const SCIENCE_SINGLECELL_SKILL_PATH = 'resources/skills/singlecell/SKILL.md';
export const SCIENCE_COMPUTE_SKILL_NAME = 'openscience-compute';
export const SCIENCE_COMPUTE_SKILL_PATH = 'resources/skills/compute/SKILL.md';
export const SCIENCE_EMPIRICAL_SKILL_NAME = 'openscience-empirical';
export const SCIENCE_EMPIRICAL_SKILL_PATH = 'resources/skills/empirical/SKILL.md';
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
  SCIENCE_ONBOARDING_SKILL_NAME,
  SCIENCE_WORKFLOW_SKILL_NAME,
  SCIENCE_WRITING_SKILL_NAME,
  SCIENCE_DATABASES_SKILL_NAME,
  SCIENCE_BIOMODELS_SKILL_NAME,
  SCIENCE_SINGLECELL_SKILL_NAME,
  SCIENCE_COMPUTE_SKILL_NAME,
  SCIENCE_EMPIRICAL_SKILL_NAME,
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
  const materializedDefaultSet = new Set<string>([
    SCIENCE_CORE_SKILL_NAME,
    SCIENCE_ARTIFACT_SKILL_NAME,
    SCIENCE_WORKFLOW_SKILL_NAME,
    ...SCIENCE_MATERIALIZED_SKILL_IDS,
  ]);
  const isPreviousMaterializedDefault =
    skillIds.length === materializedDefaultSet.size && skillIds.every((id) => materializedDefaultSet.has(id));
  if (isPreviousMaterializedDefault) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  return [...skillIds];
}

export type ScienceEvidenceSourceType =
  | 'file'
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
  artifactVersion?: number;
  nodeId?: string;
  supportingEvidenceIds?: string[];
  hash?: string;
  version?: number;
  skillUseId?: string;
  connectorId?: string;
  database?: {
    name: string;
    provider?: 'paperclip' | 'bio_tools' | string;
    domain?: string;
    tool?: string;
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
  | 'report'
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
  source: 'deepscientist' | 'k-dense' | 'auto-empirical' | 'nature-skills' | 'sciagent' | 'local' | 'custom';
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
    | 'paper_reading'
    | 'data_availability'
    | 'proposal'
    | 'patent_drafting'
    | 'presentation'
    | 'experiment_log'
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
  | {
      type: 'artifact_embed';
      artifactId: string;
      display?: 'inline' | 'wide' | 'compact';
      renderer?: 'auto' | 'image' | 'svg' | 'html' | 'pdf' | 'table' | 'notebook' | 'latex_pdf';
      caption?: string;
      evidenceIds?: string[];
      showSource?: boolean;
      maxHeight?: number;
    }
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
    '- Write Science artifact reports in the user’s request language by default; keep existing identifiers, paths, code, commands, scientific names, and evidence/artifact ids unchanged. For newly registered Science evidence, prefer compact display ids `E1`, `E2`, `E3` in first-use order.',
    '',
    '## Runtime Contract',
    '- Do real work in the normal agent runtime: shell, Python, R, LaTeX, notebooks, project pipelines, or explicitly authorized remote tools.',
    '- MCP tools are control-plane tools. They record/search/read/patch/version/publish evidence and artifacts; they do not replace real analysis.',
    '- If decisive task variables are missing, pause before running irreversible or report-defining work and use the OpenScience user-input MCP tool (`user_input`). Ask at most 3 concise questions, prefer choices when possible, and include an unknown/not sure/other path when appropriate. In multi-turn work, first reuse prior user_input answers, user decisions, and artifact evidence from the same conversation/project; do not ask the same question again unless the user changes the scope or the old answer is no longer applicable.',
    projectRoot
      ? `- Authorized research project root: ${projectRoot}`
      : '- No explicit project root was provided; keep paths relative and ask before accessing new roots.',
    '',
    '## Required Control Surfaces',
    '- Use `research_evidence(action="status"|"list_tools"|"search"|"read"|"call")` for literature, PaperClip files, and scientific database retrieval. PaperClip is active only when a key is configured; `provider="bio_tools"` exposes PubMed, ChEMBL, GEO, AlphaFold, and other JimLiu science-skills database tools through the same MCP.',
    '- When `research_evidence` returns `evidenceDrafts`, register those drafts with `science_artifact` before using the result in a claim. Assign each new evidence item a stable human-readable id in first-use order (`E1`, `E2`, `E3`, ...), unless patching an existing evidence item whose id must be preserved. If a provider is unavailable, record the gap instead of silently relying on model memory.',
    '- Use `science_artifact` as the single artifact graph control surface. Do not invent separate science_start_run, science_search, science_register_* or science_submit_panel tools.',
    '- Unless the user explicitly requests chat-only brainstorming, call `science_artifact(action="create"|"patch")` early to create or update the task artifact before the final answer.',
    '- Default artifact rule: every Science Mode task that produces a user-facing answer, file, figure, table, report, notebook, viewer, dataset slice, manuscript, or reusable result should create or update a Science artifact and publish at least a concise report/run-bundle panel. Skip this only when the user explicitly asks for chat-only brainstorming.',
    '- In the report, insert important generated files at the exact section where they support the reasoning: use `artifact_embed` for key images, SVGs, HTML visualizations, PDFs, LaTeX outputs, tables, and notebooks; use `artifact_ref` only for secondary files.',
    '- Before modifying an existing artifact, page, evidence item, claim, or report, call `science_artifact(action="get")` and update with `baseRevision`.',
    '- To reuse or modify artifacts from earlier conversations in the same research project, first call `science_artifact(action="list", payload={"scope":"project"}, projectRoot=<authorized root>)`, then call `get` with the original `runId`, `id`, and `version` before patching or versioning. Do not recreate a duplicate artifact just because the current run is new.',
    '- Use `science_artifact(action="version")` for regenerated visible outputs, and `science_artifact(action="snapshot")` after meaningful file-producing steps.',
    '- Any file the user can open from the Science report, artifact Files view, Preview frame, or chat output must be declared on an artifact or included in `science_artifact(action="snapshot")` with a clear role so the file menu can show where it came from.',
    '- Use `science_artifact(action="publish")` before the final visible answer. This is the handoff that lets OpenScience persist the Science report locally, reopen it from the conversation, and render the report, artifact files, provenance, and warnings in the existing Preview frame.',
    '',
    '## Science SOP',
    '1. Intake: restate the objective, authorized project root, expected deliverables, selected router skills, and unsafe or ambiguous assumptions.',
    '2. Clarification gate: before calling `user_input`, inspect the prior conversation, previous user_input results, registered user-decision evidence, and current artifact state. Reuse existing answers across turns. Only ask new questions if missing variables could change the analysis plan, dataset scope, organism/model/system, statistical threshold, compute/privacy boundary, artifact format, or final conclusion. If the user cannot answer or the tool times out, continue only with explicit uncertainty limits instead of guessing.',
    '3. Evidence first: search/read/call external sources or local inputs with research_evidence, then register papers, database records, datasets, code, command logs, figures, tables, environments, and user decisions as evidence before using them for claims. New evidence ids should be `E1`, `E2`, `E3` in the order the report will cite them.',
    '4. Execute: run real Python/R/shell/LaTeX/notebook/project code, then record commands, cwd, logs, inputs, outputs, packages, failures, and environment.',
    '5. Artifact by default: create or update the task Science artifact first, then ensure every user-facing figure, table, dataset, notebook, manuscript, PDF, HTML page, scientific viewer object, or run bundle has stable id, version, file paths, inputs, code/log/environment links, and evidence ids when known; embed the most important artifacts directly in the relevant report blocks.',
    '6. Snapshot: include scripts, notebooks, logs, result folders, LaTeX sources, small tables, configs, and viewer files needed to inspect or reproduce the result. Secrets are never included; large data may be recorded as pointers with hash/size/reason.',
    '7. Claims: every report statement that answers the task needs evidenceIds and claimType: computed, parsed, digitized, or hypothesis. Unverified ideas stay `hypothesis`.',
    '8. Report writing: put concise decisive conclusion phrases in Markdown bold, for example `**the candidate set is not yet defensible**`. Bold only the conclusion phrase, not whole paragraphs. Put evidence ids in structured `evidenceIds` fields, not literal `[E1]` text inside the prose; the UI renders anchors automatically.',
    '9. Display: extend the normal Preview frame. Do not create a parallel dashboard/report rail. Use evidence-report styling for report sections, inline [E#] citations, Reference Evidence, artifact rows, methods, and provenance warnings.',
    '10. Final: keep prose short, point to the published report/artifacts, and plainly mention important graphWarnings or missing provenance. Do not treat final prose as a substitute for a published Science artifact report.',
    '',
    '## Skill Routing',
    `- Core discipline: ${SCIENCE_CORE_SKILL_NAME}. Artifact protocol: ${SCIENCE_ARTIFACT_SKILL_NAME}.`,
    `- First project setup: ${SCIENCE_ONBOARDING_SKILL_NAME}; use only when no onboarding profile exists or the user explicitly asks to update it.`,
    `- Research stage routing: ${SCIENCE_WORKFLOW_SKILL_NAME}; use it to choose ds-* workflow stages without replacing artifact/evidence rules.`,
    `- Domain routers loaded by default: ${SCIENCE_WRITING_SKILL_NAME}, ${SCIENCE_DATABASES_SKILL_NAME}, ${SCIENCE_BIOMODELS_SKILL_NAME}, ${SCIENCE_SINGLECELL_SKILL_NAME}, ${SCIENCE_COMPUTE_SKILL_NAME}, ${SCIENCE_EMPIRICAL_SKILL_NAME}.`,
    '- Router skills choose narrow leaf skills such as ds-*, kdense-*, aer-*, and later sciagent-* only when the task needs them. Record selected leaf skills as `skill_use` if they affect a visible result.',
    '- Vendored catalogs are migration/source indexes, not runtime evidence. Concrete outputs still need evidence, artifact, claim, provenance, and snapshot records.',
    '',
    '## Final Answer',
    '- Keep final prose short. The structured Science panel is the main result.',
    '- If graphWarnings remain, mention the important ones plainly rather than hiding provenance gaps.',
    '',
    '## Default Skills',
    `- Use ${SCIENCE_CORE_SKILL_NAME}: ${SCIENCE_CORE_SKILL_PATH}.`,
    `- Use ${SCIENCE_ARTIFACT_SKILL_NAME}: ${SCIENCE_ARTIFACT_SKILL_PATH}.`,
    `- Use ${SCIENCE_ONBOARDING_SKILL_NAME}: ${SCIENCE_ONBOARDING_SKILL_PATH}.`,
    `- Use ${SCIENCE_WORKFLOW_SKILL_NAME}: ${SCIENCE_WORKFLOW_SKILL_PATH}.`,
    `- Use ${SCIENCE_WRITING_SKILL_NAME}: ${SCIENCE_WRITING_SKILL_PATH}.`,
    `- Use ${SCIENCE_DATABASES_SKILL_NAME}: ${SCIENCE_DATABASES_SKILL_PATH}.`,
    `- Use ${SCIENCE_BIOMODELS_SKILL_NAME}: ${SCIENCE_BIOMODELS_SKILL_PATH}.`,
    `- Use ${SCIENCE_SINGLECELL_SKILL_NAME}: ${SCIENCE_SINGLECELL_SKILL_PATH}.`,
    `- Use ${SCIENCE_COMPUTE_SKILL_NAME}: ${SCIENCE_COMPUTE_SKILL_PATH}.`,
    `- Use ${SCIENCE_EMPIRICAL_SKILL_NAME}: ${SCIENCE_EMPIRICAL_SKILL_PATH}.`,
    `- Default Science skill pack manifest: ${SCIENCE_SKILL_PACK_MANIFEST_PATH}.`,
    `- Materialized external leaf skills remain discoverable through routers: ${SCIENCE_SKILL_PACK_COUNTS.total} total; ${SCIENCE_SKILL_PACK_COUNTS.deepscientist} DeepScientist, ${SCIENCE_SKILL_PACK_COUNTS.kdense} K-Dense, ${SCIENCE_SKILL_PACK_COUNTS.autoEmpirical} Auto-Empirical Research Skills, and ${SCIENCE_SKILL_PACK_COUNTS.natureSkills} Nature Skills.`,
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

const parsePayloadCandidate = (value: unknown): SciencePayload | undefined =>
  typeof value === 'string' ? parsePayloadString(value) : findPayloadCandidate(value);

const getToolGroupOutput = (message: IMessageToolGroup): unknown[] =>
  Array.isArray(message.content)
    ? message.content
        .flatMap((tool) => {
          const result = tool.result_display;
          if (!result) return [];
          return [result];
        })
        .filter(Boolean)
    : [];

const getAcpToolOutput = (message: IMessageAcpToolCall): unknown[] => {
  const content = message.content;
  return content ? [content] : [];
};

const getToolCallOutput = (message: IMessageToolCall): unknown[] =>
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
