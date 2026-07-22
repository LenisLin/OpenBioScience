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
export const SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_NAME = 'bio-omics-reproduction-planning';
export const SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_PATH =
  'resources/skills/bio-omics-reproduction-planning/SKILL.md';
export const SCIENCE_BIO_OMICS_ANALYSIS_SKILL_NAME = 'bio-omics-analysis';
export const SCIENCE_BIO_OMICS_ANALYSIS_SKILL_PATH = 'resources/skills/bio-omics-analysis/SKILL.md';
export const SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_NAME = 'bio-singlecell-baseline';
export const SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_PATH = 'resources/skills/bio-singlecell-baseline/SKILL.md';
export const SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME = 'bio-environment-manager';
export const SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_PATH = 'resources/skills/bio-environment-manager/SKILL.md';
export const SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME = 'bio-analysis-script-authoring';
export const SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_PATH =
  'resources/skills/bio-analysis-script-authoring/SKILL.md';
export const SCIENCE_BIO_SCRNA_DIFFERENTIAL_EXPRESSION_SKILL_NAME = 'bio-scrna-differential-expression';
export const SCIENCE_BIO_SCRNA_DIFFERENTIAL_EXPRESSION_SKILL_PATH =
  'resources/skills/bio-scrna-differential-expression/SKILL.md';
export const SCIENCE_BIO_METHOD_PARAMETER_RECONSTRUCTION_SKILL_NAME = 'bio-method-parameter-reconstruction';
export const SCIENCE_BIO_METHOD_PARAMETER_RECONSTRUCTION_SKILL_PATH =
  'resources/skills/bio-method-parameter-reconstruction/SKILL.md';
export const SCIENCE_KDENSE_PATHWAY_ENRICHMENT_SKILL_NAME = 'kdense-pathway-enrichment';
export const SCIENCE_KDENSE_PATHWAY_ENRICHMENT_SKILL_PATH = 'resources/skills/kdense-pathway-enrichment/SKILL.md';
export const SCIENCE_KDENSE_SCANPY_SKILL_NAME = 'kdense-scanpy';
export const SCIENCE_KDENSE_SCANPY_SKILL_PATH = 'resources/skills/kdense-scanpy/SKILL.md';
export const SCIENCE_COMPUTE_SKILL_NAME = 'openscience-compute';
export const SCIENCE_COMPUTE_SKILL_PATH = 'resources/skills/compute/SKILL.md';
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
  SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_NAME,
  SCIENCE_BIO_OMICS_ANALYSIS_SKILL_NAME,
  SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_NAME,
  SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME,
  SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME,
  SCIENCE_BIO_SCRNA_DIFFERENTIAL_EXPRESSION_SKILL_NAME,
  SCIENCE_KDENSE_PATHWAY_ENRICHMENT_SKILL_NAME,
  SCIENCE_KDENSE_SCANPY_SKILL_NAME,
  SCIENCE_BIO_METHOD_PARAMETER_RECONSTRUCTION_SKILL_NAME,
  SCIENCE_COMPUTE_SKILL_NAME,
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
  const previousAnalysisAwareDefaultSet = new Set<string>(
    DEFAULT_SCIENCE_SKILL_IDS.filter(
      (id) => id !== SCIENCE_BIO_OMICS_ANALYSIS_SKILL_NAME && id !== SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_NAME
    )
  );
  const isPreviousReproductionDefault =
    skillIds.length === previousAnalysisAwareDefaultSet.size &&
    skillIds.every((id) => previousAnalysisAwareDefaultSet.has(id));
  if (isPreviousReproductionDefault) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  const previousWithoutExplorationSkillSet = new Set<string>(
    DEFAULT_SCIENCE_SKILL_IDS.filter(
      (id) =>
        id !== SCIENCE_BIO_SCRNA_DIFFERENTIAL_EXPRESSION_SKILL_NAME &&
        id !== SCIENCE_KDENSE_PATHWAY_ENRICHMENT_SKILL_NAME &&
        id !== SCIENCE_KDENSE_SCANPY_SKILL_NAME
    )
  );
  const isPreviousWithoutExplorationSkills =
    skillIds.length === previousWithoutExplorationSkillSet.size &&
    skillIds.every((id) => previousWithoutExplorationSkillSet.has(id));
  if (isPreviousWithoutExplorationSkills) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  const previousWithoutEnvironmentAndScriptOnlySet = new Set<string>(
    DEFAULT_SCIENCE_SKILL_IDS.filter(
      (id) =>
        id !== SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME && id !== SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME
    )
  );
  const isPreviousWithoutEnvironmentAndScriptOnly =
    skillIds.length === previousWithoutEnvironmentAndScriptOnlySet.size &&
    skillIds.every((id) => previousWithoutEnvironmentAndScriptOnlySet.has(id));
  if (isPreviousWithoutEnvironmentAndScriptOnly) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  const previousWithoutEnvironmentAndScriptSet = new Set<string>(
    DEFAULT_SCIENCE_SKILL_IDS.filter(
      (id) =>
        id !== SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME &&
        id !== SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME &&
        id !== SCIENCE_BIO_SCRNA_DIFFERENTIAL_EXPRESSION_SKILL_NAME &&
        id !== SCIENCE_KDENSE_PATHWAY_ENRICHMENT_SKILL_NAME &&
        id !== SCIENCE_KDENSE_SCANPY_SKILL_NAME
    )
  );
  const isPreviousWithoutEnvironmentAndScript =
    skillIds.length === previousWithoutEnvironmentAndScriptSet.size &&
    skillIds.every((id) => previousWithoutEnvironmentAndScriptSet.has(id));
  if (isPreviousWithoutEnvironmentAndScript) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  const previousCompactDefaultSet = new Set<string>(
    [...previousWithoutEnvironmentAndScriptSet].filter(
      (id) =>
        id !== SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_NAME &&
        id !== SCIENCE_BIO_SCRNA_DIFFERENTIAL_EXPRESSION_SKILL_NAME &&
        id !== SCIENCE_KDENSE_PATHWAY_ENRICHMENT_SKILL_NAME &&
        id !== SCIENCE_KDENSE_SCANPY_SKILL_NAME
    )
  );
  const isPreviousCompactDefault =
    skillIds.length === previousCompactDefaultSet.size && skillIds.every((id) => previousCompactDefaultSet.has(id));
  if (isPreviousCompactDefault) {
    return [...DEFAULT_SCIENCE_SKILL_IDS];
  }
  const previousCompactDefaultWithExplorationSkillsSet = new Set<string>(
    DEFAULT_SCIENCE_SKILL_IDS.filter(
      (id) =>
        id !== SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_NAME &&
        id !== SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME &&
        id !== SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME
    )
  );
  const isPreviousCompactDefaultWithExplorationSkills =
    skillIds.length === previousCompactDefaultWithExplorationSkillsSet.size &&
    skillIds.every((id) => previousCompactDefaultWithExplorationSkillsSet.has(id));
  if (isPreviousCompactDefaultWithExplorationSkills) {
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
  pymol?: {
    conversationId?: string;
    sessionId?: string;
    revision?: number;
    serverOnly?: boolean;
    renderPath?: string;
    renderUrl?: string;
  };
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
    | 'workflow_action_required'
    | 'analysis_artifact_snapshot_empty'
    | 'stale_version'
    | 'missing_environment'
    | 'missing_execution_log'
    | 'unopenable_artifact';
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

export type BioReceiptProducer = 'bio_source' | 'bio_runtime' | 'bio_reproduction' | 'bio_statistics' | 'bio_analysis';

export type ScienceWorkflowKind = 'omics_reproduction' | 'omics_analysis';

export type OmicsAnalysisStage = 'intake' | 'qc' | 'baseline' | 'exploration' | 'episode' | 'closing';

export type OmicsAnalysisStageStatus = 'running' | 'awaiting_user' | 'accepted' | 'needs_revision' | 'blocked';

export type OmicsAnalysisProjectStatus =
  | 'running'
  | 'awaiting_user'
  | 'accepted'
  | 'needs_revision'
  | 'blocked'
  | 'closed';

export type AnalysisCheckpointStatus =
  | 'accepted'
  | 'accepted_with_changes'
  | 'needs_revision'
  | 'deferred'
  | 'cancelled';

export interface BioNextAction {
  id: string;
  tool: BioReceiptProducer | 'science_artifact' | 'runtime';
  action: string;
  reason: string;
  payload?: Record<string, unknown>;
  actionFingerprint?: string;
  preconditionHash?: string;
  expectedMutation?: string[];
  maxAttempts?: number;
  stopWhenUnchanged?: boolean;
}

export interface BioBlocker {
  id: string;
  kind: 'credentials' | 'permissions' | 'data' | 'environment' | 'contract';
  message: string;
  moduleId?: string;
  external: boolean;
}

export interface BioControlReceipt {
  schema: 'openbioscience.bio.receipt.v1';
  receiptId: string;
  producer: BioReceiptProducer;
  action: string;
  status: string;
  projectRoot: string;
  createdAt: number;
  validationFingerprint?: string;
  details?: Record<string, unknown>;
}

export interface OmicsAnalysisReceipt extends BioControlReceipt {
  producer: 'bio_analysis';
  workflowKind: 'omics_analysis';
  analysisId: string;
  modality: string;
  stage: OmicsAnalysisStage;
  stageStatus: OmicsAnalysisStageStatus;
  projectStatus: OmicsAnalysisProjectStatus;
  directDependencyReceiptIds: string[];
  canonicalFiles: Array<{ path: string; contentHash: string }>;
  skillUses: Array<{ skillId: string; contentHash: string }>;
  nextActions: BioNextAction[];
  externalBlockers: BioBlocker[];
  privacyPolicy: {
    externalEgress: 'forbidden' | 'allowlisted';
    rawDataExport: 'forbidden';
    sampleIdentifierPolicy: 'local_only';
  };
  summary: Record<string, unknown>;
  episodeId?: string;
}

export interface AnalysisCheckpointReceipt extends OmicsAnalysisReceipt {
  action: 'request_checkpoint';
  checkpointStatus: AnalysisCheckpointStatus;
  requestId?: string;
  changeSummary?: string;
}

export type BioReceiptReference = string;

export interface BioMcpResultV2 {
  schema: 'openbioscience.bio_mcp.result.v2';
  action: string;
  status: 'ready' | 'needs_completion' | 'blocked' | 'invalid_request' | 'supported' | 'partial';
  receiptId?: BioReceiptReference;
  receiptIds?: BioReceiptReference[];
  cache: {
    hit: boolean;
    inputFingerprint: string;
  };
  nextActions: BioNextAction[];
  correctedCall?: {
    action: string;
    payload: Record<string, unknown>;
  };
}

export type PaperReproductionMode = 'exact' | 'analogous' | 'scoped_reimplementation';
export type PaperScopeStatus =
  | 'required'
  | 'ready'
  | 'conditional'
  | 'external_data_block'
  | 'capability_block'
  | 'analogous_only'
  | 'excluded_by_user'
  | 'unresolved';
export type PaperEvidenceBasis = 'explicit' | 'cross_source_inference' | 'agent_inference' | 'unresolved';

export interface PaperEvidenceLocator {
  id: string;
  sourceId: string;
  sourceHash: string;
  path?: string;
  url?: string;
  page?: number;
  lineStart?: number;
  lineEnd?: number;
  section?: string;
  excerptHash: string;
  basis: PaperEvidenceBasis;
}

export interface PaperReproductionTarget {
  id: string;
  evidenceIds: string[];
}

export interface PaperFigure extends PaperReproductionTarget {
  label: string;
  title: string;
  panelIds: string[];
}

export interface PaperPanel extends PaperReproductionTarget {
  figureId: string;
  label: string;
  claimIds: string[];
  cohortIds: string[];
  methodUnitIds: string[];
  dependencyIds: string[];
  expectedOutputIds: string[];
}

export interface PaperClaim extends PaperReproductionTarget {
  text: string;
  claimKind: 'descriptive' | 'associational' | 'inferential' | 'methodological';
}

export interface PaperMethodUnit extends PaperReproductionTarget {
  analysisFamily: string;
  lineage?: string;
  reportedMethod: string;
  parameterIds: string[];
}

export interface PaperDataDependency extends PaperReproductionTarget {
  label: string;
  cohortIds: string[];
  modality: string;
  requiredFields: string[];
  localSupport: 'available' | 'partial' | 'missing' | 'unresolved';
}

export interface PaperExpectedOutput extends PaperReproductionTarget {
  label: string;
  artifactKind: 'object' | 'table' | 'figure' | 'report' | 'statistical_result';
}

export interface PaperScopeDecision {
  id: string;
  targetIds: string[];
  reproductionMode: PaperReproductionMode;
  status: PaperScopeStatus;
  reason: string;
  userDecisionId?: string;
}

export interface PaperExtractionConflict {
  id: string;
  targetIds: string[];
  evidenceIds: string[];
  message: string;
  material: boolean;
}

export interface PaperUnresolvedItem {
  id: string;
  targetIds: string[];
  message: string;
  nextAction?: string;
}

export interface PaperReproductionMap {
  schema: 'openbioscience.paper_reproduction_map.v1';
  createdAt: string;
  sources: Array<{ id: string; kind: string; path?: string; url?: string; contentHash: string }>;
  evidence: PaperEvidenceLocator[];
  figures: PaperFigure[];
  panels: PaperPanel[];
  claims: PaperClaim[];
  cohorts: Array<{ id: string; label: string; datasetIds: string[]; evidenceIds: string[] }>;
  methodUnits: PaperMethodUnit[];
  dataDependencies: PaperDataDependency[];
  expectedOutputs: PaperExpectedOutput[];
  scopeDecisions: PaperScopeDecision[];
  conflicts: PaperExtractionConflict[];
  unresolvedItems: PaperUnresolvedItem[];
}

export interface PaperReproductionMapReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'validate_paper_reproduction_map';
  canonicalFile: { path: string; contentHash: string };
  sourceReceiptIds: string[];
  targetIds: string[];
  unresolvedTargetIds: string[];
  nextActions: BioNextAction[];
}

export interface ReproductionScopeReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'validate_reproduction_scope';
  paperMapReceiptId: string;
  canonicalFile: { path: string; contentHash: string };
  requiredTargetIds: string[];
  excludedTargetIds: string[];
  blockedTargetIds: string[];
  nextActions: BioNextAction[];
}

export interface SkillComplianceReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'validate_skill_compliance';
  skillId: string;
  skillContentHash: string;
  requirementIds: string[];
  satisfiedRequirementIds: string[];
  violations: string[];
  nextActions: BioNextAction[];
}

export interface ScriptValidationReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'preflight_execution_scripts';
  executionContractReceiptId: string;
  methodParameterReceiptId: string;
  scripts: Array<{ path: string; contentHash: string; moduleIds: string[] }>;
  skillComplianceReceiptIds: string[];
  statisticalDesignReceiptIds: string[];
  violations: string[];
  nextActions: BioNextAction[];
}

export interface ExecutionRunReceipt extends BioControlReceipt {
  producer: 'bio_runtime';
  action: 'record_execution';
  scriptValidationReceiptId: string;
  startedAt: number;
  finishedAt: number;
  scriptFiles: Array<{ path: string; contentHash: string }>;
  configFiles: Array<{ path: string; contentHash: string }>;
  logFiles: Array<{ path: string; contentHash: string }>;
  outputFiles: Array<{ path: string; contentHash: string }>;
  exitCode: number;
}

export interface ReproductionModuleReadiness {
  id: string;
  environmentRef: string;
  declaredStatus: string;
  sourceStatus: string;
  contractStatus: 'complete' | 'incomplete';
  executionStatus: 'ready' | 'conditional' | 'blocked';
  skillRoute: string[];
  mcpRoute: string[];
  expectedOutputs: string[];
  blockingReasons: string[];
}

export type MethodAlignmentLevel =
  | 'parameter_aligned'
  | 'partially_aligned'
  | 'scoped_reimplementation'
  | 'unresolved_conflict';

export type MethodSourceKind = 'paper_methods' | 'supplement' | 'author_code' | 'figure_legend';

export interface MethodParameterEvidence {
  parameterId: string;
  moduleId: string;
  name: string;
  sourceKind: MethodSourceKind;
  sourceId: string;
  locator: string;
  reportedValue: unknown;
  normalizedValue: unknown;
  contentHash: string;
}

export interface MethodModuleCoverage {
  moduleId: string;
  sourcesInspected: MethodSourceKind[];
  parameterCount: number;
  hasConflict: boolean;
  alignmentLevel: MethodAlignmentLevel;
}

export interface MethodParameterConflict {
  parameterId: string;
  moduleId: string;
  evidenceIds: string[];
  values: unknown[];
  material: boolean;
}

export interface MethodParameterReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'extract_method_parameters';
  canonicalFile: { path: string; contentHash: string };
  sourceReceiptIds: string[];
  moduleCoverage: MethodModuleCoverage[];
  conflicts: MethodParameterConflict[];
  nextActions: BioNextAction[];
}

export interface MethodAlignmentReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'validate_method_alignment';
  methodParameterReceiptId: string;
  alignmentLevel: MethodAlignmentLevel;
  executedParameterFile: { path: string; contentHash: string };
  scriptFiles: Array<{ path: string; contentHash: string }>;
  alignedParameters: string[];
  substitutedParameters: string[];
  conflicts: MethodParameterConflict[];
  eligibleClaims: string[];
  nextActions: BioNextAction[];
}

export interface ReproductionCompletionReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'validate_reproduction_plan';
  workflowKind: 'omics_reproduction';
  planningCompletion: 'complete' | 'incomplete';
  executionReadiness: 'ready' | 'partial' | 'blocked';
  canonicalFiles: Array<{ path: string; contentHash: string }>;
  sourceReceiptIds: string[];
  runtimeReceiptIds: string[];
  methodParameterReceiptId: string;
  methodModuleCoverage: MethodModuleCoverage[];
  eligibleClaims: string[];
  skillUses: Omit<ScienceSkillUse, 'runId' | 'revision'>[];
  moduleReadiness: ReproductionModuleReadiness[];
  nextActions: BioNextAction[];
  externalBlockers: BioBlocker[];
}

export type BioStatisticsContrastStatus =
  | 'tested'
  | 'blocked_insufficient_replicates'
  | 'blocked_invalid_design'
  | 'failed';

export interface BioStatisticsDesignContrast {
  id: string;
  target: string;
  reference: string;
  cellType: string;
  targetReplicates: number;
  referenceReplicates: number;
  completePairs?: number;
  status: 'ready' | 'blocked';
  warnings: string[];
}

export interface BioStatisticsDesignReceipt extends BioControlReceipt {
  producer: 'bio_statistics';
  action: 'validate_de_design';
  analysisKind: 'pseudobulk_de';
  replicateUnit: string;
  pairedBy?: string;
  formula: string;
  minimumReplicates: 3;
  contrasts: BioStatisticsDesignContrast[];
  nextActions: BioNextAction[];
}

export interface BioStatisticsCompletionReceipt extends BioControlReceipt {
  producer: 'bio_statistics';
  action: 'validate_de_outputs';
  workflowKind: 'omics_reproduction';
  workflowPhase: 'execution';
  planningReceiptId: string;
  designReceiptId: string;
  package: 'edgeR';
  packageVersion: string;
  contrasts: Array<{
    id: string;
    target: string;
    reference: string;
    coefficient: string;
    status: BioStatisticsContrastStatus;
    effectiveReplicates: Record<string, number>;
    warnings: string[];
  }>;
  canonicalFiles: Array<{ path: string; contentHash: string }>;
  skillUses: Omit<ScienceSkillUse, 'runId' | 'revision'>[];
  mcpActions: string[];
  nextActions: BioNextAction[];
  externalBlockers: BioBlocker[];
}

export type ScrnaExecutionModuleId =
  | 'data_import'
  | 'quality_control'
  | 'normalization'
  | 'clustering'
  | 'major_annotation'
  | 'minor_annotation'
  | 'cluster_markers'
  | 'composition'
  | 'condition_de'
  | 'descriptive_statistics'
  | 'figures'
  | 'disease_program';

export type ScrnaAnnotationMode = 'independent_annotation' | 'reference_review' | 'label_transfer';
export type ScrnaQcOutcome = 'filtered' | 'passed_no_removal' | 'failed';
export type ExecutionModuleStatus =
  | 'validated'
  | 'generated_unvalidated'
  | 'scientifically_limited'
  | 'externally_blocked'
  | 'incomplete'
  | 'not_requested';

export interface ScrnaExecutionContractModule {
  id: ScrnaExecutionModuleId;
  required: boolean;
  expectedOutputs: string[];
}

export interface ScrnaExecutionContract {
  schema: 'openbioscience.scrna_reproduction.execution_contract.v1';
  createdAt: string;
  objective: string;
  datasetIds: string[];
  modality: 'scrna_seq';
  annotationMode: ScrnaAnnotationMode;
  modules: ScrnaExecutionContractModule[];
}

export interface ScrnaExecutionContractModuleV2 {
  id: string;
  parentId?: string;
  required: boolean;
  panelIds: string[];
  claimIds: string[];
  cohortIds: string[];
  lineage?: string;
  analysisFamilies: string[];
  dependencyModuleIds: string[];
  scopeDecisionId: string;
  annotationMode?: ScrnaAnnotationMode;
  requiredInputs: string[];
  expectedOutputs: string[];
  validationRequirements: string[];
}

export interface ScrnaExecutionContractV2 {
  schema: 'openbioscience.scrna_reproduction.execution_contract.v2';
  createdAt: string;
  objective: string;
  datasetIds: string[];
  modality: 'scrna_seq';
  paperMapReceiptId: string;
  scopeReceiptId: string;
  modules: ScrnaExecutionContractModuleV2[];
}

export interface ExecutionContractReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'prepare_execution_contract';
  workflowKind: 'omics_reproduction';
  workflowPhase: 'execution';
  modality: 'scrna_seq';
  planningReceiptId: string;
  canonicalFile: { path: string; contentHash: string };
  annotationMode: ScrnaAnnotationMode;
  requiredModules: ScrnaExecutionModuleId[];
  nextActions: BioNextAction[];
}

export interface ExecutionContractReceiptV2 extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'prepare_execution_contract';
  workflowKind: 'omics_reproduction';
  workflowPhase: 'execution';
  modality: 'scrna_seq';
  contractVersion: 2;
  planningReceiptId: string;
  paperMapReceiptId: string;
  scopeReceiptId: string;
  canonicalFile: { path: string; contentHash: string };
  requiredModules: string[];
  nextActions: BioNextAction[];
}

export interface ExecutionModuleResult {
  id: ScrnaExecutionModuleId;
  required: boolean;
  status: ExecutionModuleStatus;
  outputFiles: Array<{ path: string; contentHash: string }>;
  validationReceiptIds: string[];
  qcOutcome?: ScrnaQcOutcome;
  annotationMode?: ScrnaAnnotationMode;
  limitations: string[];
}

export interface ReproductionExecutionReceipt extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'complete_execution';
  workflowKind: 'omics_reproduction';
  workflowPhase: 'execution';
  modality: 'scrna_seq';
  executionCompletion: 'complete' | 'incomplete';
  scientificOutcome: 'validated' | 'validated_with_limits' | 'externally_blocked';
  executionContractFile: { path: string; contentHash: string };
  executionContractReceiptId: string;
  planningReceiptId: string;
  methodAlignmentReceiptId: string;
  statisticalReceiptIds: string[];
  modules: ExecutionModuleResult[];
  canonicalFiles: Array<{ path: string; contentHash: string }>;
  skillUses: Omit<ScienceSkillUse, 'runId' | 'revision'>[];
  nextActions: BioNextAction[];
  externalBlockers: BioBlocker[];
}

export interface ExecutionModuleResultV2 {
  id: string;
  required: boolean;
  status: ExecutionModuleStatus;
  targetIds: string[];
  outputFiles: Array<{ path: string; contentHash: string }>;
  validationReceiptIds: string[];
  limitations: string[];
}

export interface ReproductionExecutionReceiptV2 extends BioControlReceipt {
  producer: 'bio_reproduction';
  action: 'complete_execution';
  workflowKind: 'omics_reproduction';
  workflowPhase: 'execution';
  modality: 'scrna_seq';
  contractVersion: 2;
  executionCompletion: 'complete' | 'incomplete';
  scientificOutcome: 'validated' | 'validated_with_limits' | 'externally_blocked';
  executionContractFile: { path: string; contentHash: string };
  executionContractReceiptId: string;
  planningReceiptId: string;
  paperMapReceiptId: string;
  scopeReceiptId: string;
  methodAlignmentReceiptId: string;
  scriptValidationReceiptId: string;
  executionRunReceiptIds: string[];
  statisticalReceiptIds: string[];
  modules: ExecutionModuleResultV2[];
  coverageItems: ScienceCoverageItem[];
  canonicalFiles: Array<{ path: string; contentHash: string }>;
  skillUses: Omit<ScienceSkillUse, 'runId' | 'revision'>[];
  nextActions: BioNextAction[];
  externalBlockers: BioBlocker[];
}

export type ScienceDeliveryState =
  | 'running'
  | 'awaiting_user'
  | 'action_required'
  | 'completed'
  | 'partial'
  | 'blocked'
  | 'failed';

export interface ScienceDeliveryStatus {
  state: ScienceDeliveryState;
  phase: 'planning' | 'execution' | 'general' | OmicsAnalysisStage;
  authoritativeLabel: string;
  reasonCodes: string[];
  publicationDisposition: 'accepted' | 'pending' | 'rejected';
}

export interface ScienceCoverageItem {
  id: string;
  targetType: 'user_objective' | 'paper_figure' | 'paper_panel' | 'paper_claim';
  targetId: string;
  moduleIds: string[];
  cohortIds: string[];
  reproductionMode: PaperReproductionMode;
  status: PaperScopeStatus | 'completed' | 'scientifically_blocked';
  reason: string;
  artifactIds: string[];
  evidenceIds: string[];
  receiptIds: string[];
}

export interface ScienceCoverageSummary {
  total: number;
  completed: number;
  exact: number;
  analogous: number;
  scoped: number;
  actionRequired: number;
  externalBlocked: number;
  excluded: number;
}

export interface ScienceFigurePanelProvenance {
  panelId: string;
  sourceCohortIds: string[];
  methodEvidenceIds: string[];
  artifactIds: string[];
  sourceTableArtifactIds: string[];
  receiptIds: string[];
}

export interface ScienceAttachmentRef {
  uri: string;
  artifactId: string;
  version: number;
  role: string;
  contentHash: string;
  sourcePath?: string;
  status: 'ready' | 'modified' | 'stale';
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
  status: 'completed' | 'partial' | 'blocked' | 'failed' | 'running' | 'awaiting_user' | 'draft';
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
  workflowKind?: ScienceWorkflowKind;
  workflowPhase?: 'planning' | 'execution' | OmicsAnalysisStage;
  planningCompletion?: 'complete' | 'incomplete';
  executionReadiness?: 'ready' | 'partial' | 'blocked';
  completionReceipt?: ReproductionCompletionReceipt;
  executionReceipt?: ReproductionExecutionReceipt | ReproductionExecutionReceiptV2;
  statisticalCompletionReceipt?: BioStatisticsCompletionReceipt;
  deliveryState?: ScienceDeliveryStatus;
  coverageSummary?: ScienceCoverageSummary;
  coverageItems?: ScienceCoverageItem[];
  figurePanelProvenance?: ScienceFigurePanelProvenance[];
  attachments?: ScienceAttachmentRef[];
  methodAlignmentReceipt?: MethodAlignmentReceipt;
  analysisReceipt?: OmicsAnalysisReceipt;
  analysisId?: string;
  analysisStage?: OmicsAnalysisStage;
  analysisCheckpointStatus?: AnalysisCheckpointStatus;
  baselineReceiptId?: string;
  nextActions?: BioNextAction[];
  externalBlockers?: BioBlocker[];
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
  | 'authorize_external_file'
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
    '- Within the authorized research project root, perform ordinary file inspection, script execution, and analysis directly through the local runtime without repeatedly asking for sandbox confirmation. Request approval only when required by the runtime boundary, especially for paths outside the project, network access, credentials, package/environment mutation, destructive operations, or external services. Never claim that a command ran on the host when the runtime actually rejected or sandboxed it.',
    '- MCP tools are control-plane tools. They record/search/read/patch/version/publish evidence and artifacts; they do not replace real analysis.',
    '- If decisive task variables are missing, pause before running irreversible or report-defining work and use the OpenScience user-input MCP tool (`user_input`). Ask at most 3 concise questions, prefer choices when possible, and include an unknown/not sure/other path when appropriate. In multi-turn work, first reuse prior user_input answers, user decisions, and artifact evidence from the same conversation/project; do not ask the same question again unless the user changes the scope or the old answer is no longer applicable.',
    projectRoot
      ? `- Authorized research project root: ${projectRoot}`
      : '- No explicit project root was provided; keep paths relative and ask before accessing new roots.',
    '',
    '## Required Control Surfaces',
    '- Use `research_evidence(action="status"|"list_tools"|"search"|"read"|"call")` for literature, PaperClip files, and scientific database retrieval. PaperClip is active only when a key is configured; `provider="bio_tools"` exposes PubMed, ChEMBL, GEO, AlphaFold, and other JimLiu science-skills database tools through the same MCP.',
    '- PaperClip and `bio_tools` are optional research_evidence providers. If either is disabled, report the specific unavailable provider capability and continue with local files, direct allowed sources, and other configured Bio MCPs. Do not imply that `bio_reproduction`, `bio_source`, `bio_runtime`, or `science_artifact` is unavailable merely because these providers are not configured.',
    '- For paper-scoped omics reproduction, derive scope from the current validated PaperReproductionMap; do not author or execute scripts before current scope, method, Skill-compliance, and script-preflight receipts are ready, and never omit a relevant panel without an explicit scope decision.',
    '- For single-cell reproduction tasks, derive required execution modules from the user objective and scoped paper target. Continue beyond import or QC when downstream analysis is requested, but do not impose an unrequested disease program, trajectory, CCI, or other optional module as a completion gate.',
    '- Resolve OpenBioScience official environments through `bio_runtime` or `OPENBIOSCIENCE_RUNTIME_ROOT`; shell PATH absence alone is not evidence that an official environment is missing.',
    '- For paper, article, or demo reproduction feasibility tasks, read and follow `bio-omics-reproduction-planning` before auditing. Complete the `bio_reproduction` planning sequence (`build_source_package`, `audit_data_code_availability`, `draft_reproduction_plan`, then `validate_reproduction_plan`) and write the canonical `case_reproduction/planning/reproduction_plan.md` plus `case_reproduction/planning/source_audit.json` before publishing a feasibility conclusion. A chat summary or an ad hoc file under `outputs/` is not a substitute for this package.',
    '- Treat reproduction MCPs as phase gates, not repeated scientific auditors. Pass receipt IDs only; never copy, trim, or construct receipt objects. Reuse cache hits. For `invalid_request`, execute its exact `correctedCall` once; stop on an unchanged fingerprint or `stopWhenUnchanged`. MCP-owned source, method, and execution control files are written atomically by the MCP and must not be rewritten by the Agent.',
    '- For scRNA-seq biological condition comparisons, load `bio-scrna-differential-expression` and use `bio_statistics`. Count independent biological replicates only after exclusions and pairing: require at least 3 per group for unpaired designs or 3 complete pairs. Block invalid raw-count contrasts without replacing them with confirmatory cell-level inference. Raw-count DE blockage does not block Scanpy/Seurat-style processed-expression exploratory feature screening; label it as non-confirmatory and keep effect sizes, detection fractions, plots, and limitations visible. Cluster marker ranking is descriptive annotation evidence and must use log-normalized, never scaled, expression.',
    '- Before authoring reproduction scripts, call `bio_source(action="inspect_method_sources")`, then call `bio_reproduction(action="extract_method_parameters")` with its `methodSourceReceiptId`. The MCP writes `case_reproduction/planning/method_parameter_contract.json` atomically. Record only parameters supported by paper, supplement, author-code, or figure-legend evidence.',
    '- A missing, malformed, or incomplete method-parameter receipt is a correctable workflow step, not a provenance limitation. Follow the returned `nextActions` until the receipt is ready; do not publish a terminal Science status, downgrade the failure to a warning, or construct a substitute receipt manually. Use only declared Science panel statuses.',
    '- Before authoring omics reproduction execution scripts, call `bio_reproduction(action="prepare_execution_contract")`, follow its `nextActions`, and execute only modules marked required in the current contract.',
    '- Before publishing an omics reproduction execution run, call `bio_reproduction(action="complete_execution")`. Pass `workflowPhase: "execution"` and only its `executionReceiptId` to `science_artifact`; planning, method, and statistical receipts are coordinator prerequisites.',
    '- If execution files were generated but the execution publication remains `running`, describe them as generated outputs with incomplete control-plane validation; do not say the reproduction execution is completed.',
    '- Pass only the final `completionReceiptId` to `science_artifact(action="publish", payload={"workflowKind":"omics_reproduction", ...})`. The publisher resolves authoritative receipt state from the project store. `planningCompletion` and `executionReadiness` remain separate.',
    '- For user-authorized local/private omics data without a paper target, use `bio_analysis`, never `bio_reproduction`. Start with `start_analysis`, keep dataset units separate, and pass only `analysisReceiptId` to `science_artifact(action="publish", payload={"workflowKind":"omics_analysis", ...})`.',
    '### Free Exploration Workflow',
    '- For free or automated omics exploration without a paper target, classify the task as `omics_analysis/free_exploration` and use `bio_analysis`, not `bio_reproduction`.',
    '- Follow this order: 1. create/update the Science artifact; 2. call `research_evidence` for live dataset/source discovery; 3. for tumor scRNA-seq, search TISCH2 or other curated cancer single-cell resources before broad GEO/ArrayExpress archive search; 4. use `bio_source` for candidate ranking, accession resolution, selected-file download planning with `prepare_public_download`, completed-file registration with `complete_public_download`, localization, and data manifest; 5. call `bio_analysis.start_analysis` and `bio_analysis.prepare_exploration`; 6. bind each `BIO_WORKFLOWS` module to `skillIds`, `mcpTools`, `environmentRef`, implementation files, and expected outputs; 7. call `bio_runtime.probe_environment` for selected environments; 8. call `bio_knowledge` for localized marker, atlas, and gene-set evidence; 9. call `bio_plot` for figure plans; 10. author modular scripts and call `bio_analysis.preflight_scripts`; 11. run real Python/R scripts; 12. call `bio_analysis.complete_exploration` with the ready `scriptPreflightReceiptId`, then publish with only its `analysisReceiptId`.',
    '- GEO, ArrayExpress, SRA, TISCH2, and similar registries remain online search/localization sources. Do not describe them as fully localized mirrors; localize only selected dataset files, exported candidate/evidence snapshots, and reusable analysis resources such as marker dictionaries or MSigDB GMTs.',
    '- Write primary deliverables only under the UI-openable canonical tree `omics_analysis/<analysisId>/exploration/`. Public raw/downloaded data are referenced from project-local `data/public/<source>/<accession>/` through `source/data_manifest.json`; raw matrices are not duplicated into artifact snapshots.',
    '- Exploration scripts are a readable package: one short entrypoint, helper modules under `scripts/modules/`, `scripts/script_manifest.json.workflowModules`, `scripts/script_manifest.json.scientificDecisions`, `logs/session_info.*`, `logs/warnings.tsv`, and no `__pycache__`.',
    '- For readable scRNA-seq matrices, the standard module sequence is import/intake -> QC -> normalization/HVG -> PCA -> neighbors -> UMAP -> Leiden/resolution sweep -> markers -> major annotation -> marker heatmap/dotplot -> composition -> processed-expression feature screening -> pathway enrichment -> report package. Modules that cannot run must be declared as blocked or not_applicable in `workflowModules` and `blocked_or_limited_contrasts`.',
    '- Report result strength as `descriptive`, `exploratory_processed_expression`, or `replicate_aware_inference` with replicate unit and method class. Raw-count DE blockage does not block processed-expression feature screening; it only limits confirmatory claims.',
    '- Optional mirrors may be mentioned only after canonical files are complete and published. In final answers, show the full project-relative path from the opened project root.',
    '- Free exploration uses the `exploration` stage and the ordered module plan above as its terminal workflow. Checkpointed local/private analysis uses the lifecycle intake -> qc -> baseline -> episode* -> closing, with `complete_intake`, `complete_qc`, `complete_baseline`, and `complete_episode` remaining `awaiting_user` until `bio_analysis(action="request_checkpoint")` records an accepted checkpoint.',
    '- For checkpointed scRNA-seq baseline packages, keep the baseline to QC/preprocessing, batch diagnostics, global clustering, markers, major assisted annotation, and descriptive figures. Route deeper subtype, DE, composition, trajectory, CCI, CNV, GRN, NMF, or clinical association work to confirmed episodes; free exploration should instead follow its declared exploration modules.',
    '- For scoped scRNA-seq reproduction, also use `bio_source` for local asset/file-semantics checks and `bio_runtime(action="probe_environment")` for each selected official `environmentRef`. Report the resolved environmentRef, probe status, executable/package checks, and versions. Do not report the default shell as the analysis environment, and do not call an environment unavailable when its runtime probe passes.',
    '- For local PDFs, probe `pdftotext` directly and use it when available. If shell PATH lookup fails after an official runtime resolves, also probe `${OPENBIOSCIENCE_RUNTIME_ROOT}/environments/official/sc-py-singlecell/bin/pdftotext` before declaring the tool unavailable. If an optional preliminary utility is missing, continue to the required extraction command or an existing Python PDF fallback. Never infer that PDF extraction is unavailable from one failed chained shell command.',
    '- Reproduction feasibility wording must separate: data-supported scope, environment-probed execution readiness, planning-only modules, and unsupported exact/figure-level claims. Use `P0` or `P1` only when the report defines those levels; never label P1 executable when only its inputs can be prepared.',
    '- When `research_evidence` returns `evidenceDrafts`, register those drafts with `science_artifact` before using the result in a claim. Assign each new evidence item a stable human-readable id in first-use order (`E1`, `E2`, `E3`, ...), unless patching an existing evidence item whose id must be preserved. If a provider is unavailable, record the gap instead of silently relying on model memory.',
    '- Use `science_artifact` as the single artifact graph control surface. Do not invent separate science_start_run, science_search, science_register_* or science_submit_panel tools.',
    '- **Mandatory artifact handoff:** unless the user explicitly requests chat-only brainstorming, call `science_artifact(action="create"|"patch")` early to create or update the task artifact, then call `science_artifact(action="publish")` before the final visible answer.',
    '- Default artifact rule: every Science Mode task that produces a user-facing answer, file, figure, table, report, notebook, viewer, dataset slice, manuscript, or reusable result should create or update a Science artifact and publish at least a concise report/run-bundle panel. Skip this only when the user explicitly asks for chat-only brainstorming.',
    '- In the report, insert important generated files at the exact section where they support the reasoning: use `artifact_embed` for key images, SVGs, HTML visualizations, PDFs, LaTeX outputs, tables, and notebooks; use `artifact_ref` only for secondary files.',
    '- Before modifying an existing artifact, page, evidence item, claim, or report, call `science_artifact(action="get")` and update with `baseRevision`.',
    '- To reuse or modify artifacts from earlier conversations in the same research project, first call `science_artifact(action="list", payload={"scope":"project"}, projectRoot=<authorized root>)`, then call `get` with the original `runId`, `id`, and `version` before patching or versioning. Do not recreate a duplicate artifact just because the current run is new.',
    '- Use `science_artifact(action="version")` for regenerated visible outputs, and `science_artifact(action="snapshot")` after meaningful file-producing steps.',
    '- Any file the user can open from the Science report, artifact Files view, Preview frame, or chat output must be declared on an artifact or included in `science_artifact(action="snapshot")` with a clear role so the file menu can show where it came from.',
    '- **Before the final visible answer**, use `science_artifact(action="publish")`. This is the handoff that lets OpenScience persist the Science report locally, reopen it from the conversation, and render the report, artifact files, provenance, and warnings in the existing Preview frame.',
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
    `- Domain routers loaded by default: ${SCIENCE_WRITING_SKILL_NAME}, ${SCIENCE_DATABASES_SKILL_NAME}, ${SCIENCE_BIOMODELS_SKILL_NAME}, ${SCIENCE_SINGLECELL_SKILL_NAME}, ${SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_NAME}, ${SCIENCE_BIO_OMICS_ANALYSIS_SKILL_NAME}, ${SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_NAME}, ${SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME}, ${SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME}, ${SCIENCE_COMPUTE_SKILL_NAME}.`,
    '- Router skills choose narrow biomedical leaf skills such as ds-*, kdense-*, nature-*, and later sciagent-* only when the task needs them. Record selected leaf skills as `skill_use` if they affect a visible result.',
    '- Vendored catalogs are migration/source indexes, not runtime evidence. Concrete outputs still need evidence, artifact, claim, provenance, and snapshot records.',
    '- Skill selection or loading is not Skill completion. Read the selected Skill, follow its mandatory stages and output contract, and treat it as `used` only when the applicable coordinator validates its requirement ids against the current Skill content hash.',
    '- `[LOAD_SKILL: <id>]` means the runtime loaded that skill. Do not search only the research workspace for `resources/skills`; use the injected skill content or the runtime skill source (commonly `/data/builtin-skills/<id>/SKILL.md` in WebUI containers) and do not report a loaded skill as missing.',
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
    `- Use ${SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_NAME}: ${SCIENCE_BIO_OMICS_REPRODUCTION_PLANNING_SKILL_PATH}.`,
    `- Use ${SCIENCE_BIO_OMICS_ANALYSIS_SKILL_NAME}: ${SCIENCE_BIO_OMICS_ANALYSIS_SKILL_PATH}.`,
    `- Use ${SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_NAME}: ${SCIENCE_BIO_SINGLECELL_BASELINE_SKILL_PATH}.`,
    `- Use ${SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_NAME}: ${SCIENCE_BIO_ENVIRONMENT_MANAGER_SKILL_PATH}.`,
    `- Use ${SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_NAME}: ${SCIENCE_BIO_ANALYSIS_SCRIPT_AUTHORING_SKILL_PATH}.`,
    `- Use ${SCIENCE_COMPUTE_SKILL_NAME}: ${SCIENCE_COMPUTE_SKILL_PATH}.`,
    `- Default Science skill pack manifest: ${SCIENCE_SKILL_PACK_MANIFEST_PATH}.`,
    `- Materialized external leaf skills remain discoverable through routers: ${SCIENCE_SKILL_PACK_COUNTS.total} total; ${SCIENCE_SKILL_PACK_COUNTS.deepscientist} DeepScientist, ${SCIENCE_SKILL_PACK_COUNTS.kdense} K-Dense biomedical skills, ${SCIENCE_SKILL_PACK_COUNTS.natureSkills} Nature Skills, and ${SCIENCE_SKILL_PACK_COUNTS.academicforge} AcademicForge Claude Science skills.`,
    `- Safety policy summary: ${SCIENCE_SKILL_PACK_COUNTS.quarantinedScripts} script-bearing skills are quarantined by default; ${SCIENCE_SKILL_PACK_COUNTS.restrictedDefault} skills require explicit authorization for restricted contexts.`,
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

const SCIENCE_PANEL_STATUSES = new Set<SciencePanelData['status']>([
  'completed',
  'partial',
  'blocked',
  'failed',
  'running',
  'awaiting_user',
  'draft',
]);

export const isRecognizedSciencePanelStatus = (value: unknown): boolean =>
  value === 'in_progress' ||
  value === 'completed_with_warnings' ||
  SCIENCE_PANEL_STATUSES.has(value as SciencePanelData['status']);

const emptySciencePanelStats = (): SciencePanelData['stats'] => ({
  searches: 0,
  artifacts: 0,
  evidence: 0,
  commands: 0,
  validations: 0,
  warnings: 0,
});

const numberOrDefault = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const stringListOrEmpty = (value: unknown): string[] => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
};

const arrayOrEmpty = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

export const normalizeSciencePanelStatus = (value: unknown): SciencePanelData['status'] => {
  if (value === 'in_progress') return 'running';
  if (value === 'completed_with_warnings') return 'completed';
  return SCIENCE_PANEL_STATUSES.has(value as SciencePanelData['status'])
    ? (value as SciencePanelData['status'])
    : 'draft';
};

const normalizeScienceReportBlocks = (section: Record<string, unknown>): ScienceReportBlock[] => {
  if (Array.isArray(section.blocks)) {
    return section.blocks.filter((block): block is ScienceReportBlock => {
      const record = toRecord(block);
      return typeof record?.type === 'string';
    });
  }
  const legacyContent = stringOrUndefined(section.content);
  return legacyContent ? [{ type: 'paragraph', text: legacyContent }] : [];
};

const normalizeScienceReportSections = (
  report: Record<string, unknown>,
  title: string
): SciencePanelData['report']['sections'] => {
  const rawSections = Array.isArray(report.sections) ? report.sections : [];
  const sections = rawSections
    .map((item, index) => {
      const section = toRecord(item);
      if (!section) return undefined;
      const heading = stringOrUndefined(section.heading) || stringOrUndefined(section.title) || `Section ${index + 1}`;
      return {
        id: stringOrUndefined(section.id) || `section-${index + 1}`,
        heading,
        blocks: normalizeScienceReportBlocks(section),
      };
    })
    .filter((section): section is SciencePanelData['report']['sections'][number] => Boolean(section));
  if (sections.length) return sections;

  const legacyContent = stringOrUndefined(report.content);
  return legacyContent
    ? [{ id: 'summary', heading: title || 'Summary', blocks: [{ type: 'paragraph', text: legacyContent }] }]
    : [];
};

const normalizeSciencePanelMethods = (value: unknown): SciencePanelData['methods'] | undefined => {
  const record = toRecord(value);
  if (!record) return undefined;
  const methods: NonNullable<SciencePanelData['methods']> = {
    queryPlan: stringListOrEmpty(record.queryPlan),
    commands: stringListOrEmpty(record.commands),
    environmentSummary: stringOrUndefined(record.environmentSummary),
    limitations: stringListOrEmpty(record.limitations),
  };
  return methods.queryPlan?.length ||
    methods.commands?.length ||
    methods.environmentSummary ||
    methods.limitations?.length
    ? methods
    : undefined;
};

export const normalizeSciencePanelData = (value: unknown): SciencePanelData | undefined => {
  const record = toRecord(value);
  if (!record || record.schema !== SCIENCE_PANEL_SCHEMA) return undefined;
  const runId = stringOrUndefined(record.runId);
  const reportRecord = toRecord(record.report);
  if (!runId || !reportRecord) return undefined;

  const evidence = arrayOrEmpty<ScienceEvidenceItem>(record.evidence);
  const artifacts = arrayOrEmpty<ScienceArtifact>(record.artifacts);
  const graphWarnings = arrayOrEmpty<ScienceGraphWarning>(record.graphWarnings);
  const statsRecord = toRecord(record.stats);
  const stats: SciencePanelData['stats'] = {
    ...emptySciencePanelStats(),
    searches: numberOrDefault(statsRecord?.searches),
    artifacts: numberOrDefault(statsRecord?.artifacts, artifacts.length),
    evidence: numberOrDefault(statsRecord?.evidence, evidence.length),
    commands: numberOrDefault(statsRecord?.commands),
    validations: numberOrDefault(statsRecord?.validations),
    warnings: numberOrDefault(statsRecord?.warnings, graphWarnings.length),
  };
  const title = stringOrUndefined(reportRecord.title) || stringOrUndefined(record.summary) || 'Science report';
  const question = stringOrUndefined(record.question) || stringOrUndefined(record.summary) || title || runId;
  const panel: SciencePanelData = {
    schema: SCIENCE_PANEL_SCHEMA,
    runId,
    question,
    generatedAt: numberOrDefault(record.generatedAt),
    status: normalizeSciencePanelStatus(record.status),
    stats,
    report: {
      title,
      sections: normalizeScienceReportSections(reportRecord, title),
    },
    evidence,
    artifacts,
    pages: arrayOrEmpty<ScienceArtifactPage>(record.pages),
    claims: arrayOrEmpty<ScienceClaim>(record.claims),
    provenance: arrayOrEmpty<ScienceProvenanceNode>(record.provenance),
    edges: arrayOrEmpty<ScienceProvenanceEdge>(record.edges),
    graphWarnings,
    usedSkills: arrayOrEmpty<ScienceSkillUse>(record.usedSkills),
  };
  const conversationId = stringOrUndefined(record.conversationId);
  const projectRoot = stringOrUndefined(record.projectRoot);
  const summary = stringOrUndefined(record.summary);
  const methods = normalizeSciencePanelMethods(record.methods);
  if (conversationId) panel.conversationId = conversationId;
  if (projectRoot) panel.projectRoot = projectRoot;
  if (summary) panel.summary = summary;
  if (methods) panel.methods = methods;
  if (record.workflowKind === 'omics_reproduction' || record.workflowKind === 'omics_analysis') {
    panel.workflowKind = record.workflowKind;
  }
  if (
    record.workflowPhase === 'planning' ||
    record.workflowPhase === 'execution' ||
    record.workflowPhase === 'intake' ||
    record.workflowPhase === 'qc' ||
    record.workflowPhase === 'baseline' ||
    record.workflowPhase === 'episode' ||
    record.workflowPhase === 'closing'
  ) {
    panel.workflowPhase = record.workflowPhase;
  }
  if (record.planningCompletion === 'complete' || record.planningCompletion === 'incomplete') {
    panel.planningCompletion = record.planningCompletion;
  }
  if (
    record.executionReadiness === 'ready' ||
    record.executionReadiness === 'partial' ||
    record.executionReadiness === 'blocked'
  ) {
    panel.executionReadiness = record.executionReadiness;
  }
  if (toRecord(record.completionReceipt)) {
    panel.completionReceipt = record.completionReceipt as unknown as ReproductionCompletionReceipt;
  }
  if (toRecord(record.executionReceipt)) {
    panel.executionReceipt = record.executionReceipt as unknown as
      | ReproductionExecutionReceipt
      | ReproductionExecutionReceiptV2;
  }
  if (toRecord(record.statisticalCompletionReceipt)) {
    panel.statisticalCompletionReceipt =
      record.statisticalCompletionReceipt as unknown as BioStatisticsCompletionReceipt;
  }
  if (toRecord(record.methodAlignmentReceipt)) {
    panel.methodAlignmentReceipt = record.methodAlignmentReceipt as unknown as MethodAlignmentReceipt;
  }
  if (toRecord(record.analysisReceipt))
    panel.analysisReceipt = record.analysisReceipt as unknown as OmicsAnalysisReceipt;
  if (stringOrUndefined(record.analysisId)) panel.analysisId = stringOrUndefined(record.analysisId);
  if (
    record.analysisStage === 'intake' ||
    record.analysisStage === 'qc' ||
    record.analysisStage === 'baseline' ||
    record.analysisStage === 'episode' ||
    record.analysisStage === 'closing'
  ) {
    panel.analysisStage = record.analysisStage;
  }
  if (
    record.analysisCheckpointStatus === 'accepted' ||
    record.analysisCheckpointStatus === 'accepted_with_changes' ||
    record.analysisCheckpointStatus === 'needs_revision' ||
    record.analysisCheckpointStatus === 'deferred' ||
    record.analysisCheckpointStatus === 'cancelled'
  ) {
    panel.analysisCheckpointStatus = record.analysisCheckpointStatus;
  }
  if (stringOrUndefined(record.baselineReceiptId))
    panel.baselineReceiptId = stringOrUndefined(record.baselineReceiptId);
  panel.nextActions = arrayOrEmpty<BioNextAction>(record.nextActions);
  panel.externalBlockers = arrayOrEmpty<BioBlocker>(record.externalBlockers);
  if (toRecord(record.deliveryState)) panel.deliveryState = record.deliveryState as unknown as ScienceDeliveryStatus;
  if (toRecord(record.coverageSummary)) {
    panel.coverageSummary = record.coverageSummary as unknown as ScienceCoverageSummary;
  }
  panel.coverageItems = arrayOrEmpty<ScienceCoverageItem>(record.coverageItems);
  panel.figurePanelProvenance = arrayOrEmpty<ScienceFigurePanelProvenance>(record.figurePanelProvenance);
  panel.attachments = arrayOrEmpty<ScienceAttachmentRef>(record.attachments);
  if (toRecord(record.git)) panel.git = record.git as ScienceArtifactGitRef;
  return panel;
};

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
  if (record.schema === SCIENCE_PANEL_SCHEMA) return normalizeSciencePanelData(value);
  if (record.schema === SCIENCE_EVENT_SCHEMA) {
    const event = value as ScienceArtifactEvent;
    const panel = normalizeSciencePanelData(event.panel);
    return panel ? { ...event, panel } : event;
  }
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
        return normalizeSciencePanelData(payload);
      }
      const event = payload as ScienceArtifactEvent;
      if (event.schema === SCIENCE_EVENT_SCHEMA && event.action === 'publish') {
        return normalizeSciencePanelData(event.panel);
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
  const artifacts = Array.isArray(panel.artifacts) ? panel.artifacts : [];
  return (
    artifacts.find(
      (artifact) => artifact.id === artifactId && (artifactVersion == null || artifact.version === artifactVersion)
    ) || artifacts.find((artifact) => artifact.id === artifactId)
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

  const panel = normalizeSciencePanelData(event.panel);
  if (!panel) return undefined;
  const pageId =
    event.target?.pageId || event.pageIds?.[0] || (event.target?.kind === 'page' ? event.target.id : undefined);
  const page = pageId ? panel.pages?.find((item) => item.id === pageId) : undefined;
  const pane = page?.panes?.find((item) => SCIENCE_PREVIEW_PANE_TYPES.has(item.type));
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
