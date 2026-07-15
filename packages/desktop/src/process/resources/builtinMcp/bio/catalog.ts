/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type BioMcpProfile =
  | 'runtime'
  | 'source'
  | 'knowledge'
  | 'plot'
  | 'reproduction'
  | 'analysis'
  | 'statistics'
  | 'environment_manager';

export type BioMcpCatalogItem = {
  id: string;
  description: string;
  environmentRefs?: string[];
  requiredFields?: string[];
  outputs?: string[];
};

export type BioMcpProfileDefinition = {
  profile: BioMcpProfile;
  serverName: string;
  toolName: string;
  description: string;
  actions: string[];
};

export const BIO_MCP_PROFILES: Record<BioMcpProfile, BioMcpProfileDefinition> = {
  runtime: {
    profile: 'runtime',
    serverName: 'openscience-bio-runtime',
    toolName: 'bio_runtime',
    description:
      'OpenBioScience scRNA-seq runtime control plane for environment resolution, object inspection, workflow planning, and safe output summaries.',
    actions: [
      'status',
      'list_environments',
      'resolve_environment',
      'probe_environment',
      'probe_environments',
      'list_workflows',
      'validate_workflow',
      'list_plot_templates',
      'validate_plot_inputs',
      'summarize_outputs',
      'record_execution',
    ],
  },
  source: {
    profile: 'source',
    serverName: 'openscience-bio-source',
    toolName: 'bio_source',
    description:
      'OpenBioScience data-source control plane for accession triage, local asset verification, download planning, and data manifests.',
    actions: [
      'status',
      'resolve_accession',
      'verify_local_assets',
      'plan_download',
      'build_data_manifest',
      'inspect_method_sources',
      'index_paper_sources',
    ],
  },
  knowledge: {
    profile: 'knowledge',
    serverName: 'openscience-bio-knowledge',
    toolName: 'bio_knowledge',
    description:
      'OpenBioScience knowledge control plane for marker, atlas, gene-set, ligand-receptor, and ortholog evidence lookup contracts.',
    actions: [
      'status',
      'search_marker',
      'search_atlas',
      'resolve_gene_set',
      'list_lr_database',
      'map_orthologs',
      'normalize_gene_symbols',
    ],
  },
  plot: {
    profile: 'plot',
    serverName: 'openscience-bio-plot',
    toolName: 'bio_plot',
    description:
      'OpenBioScience scRNA-seq plotting control plane for local plot template catalogs, input validation, and plot artifact manifests.',
    actions: ['status', 'list_plot_templates', 'validate_plot_inputs', 'render_plan', 'summarize_plot_outputs'],
  },
  reproduction: {
    profile: 'reproduction',
    serverName: 'openscience-bio-reproduction',
    toolName: 'bio_reproduction',
    description:
      'OpenBioScience omics reproduction planning control plane for source packaging, availability audit, lightweight localization planning, and script-boundary validation.',
    actions: [
      'status',
      'build_source_package',
      'localize_source_package',
      'audit_data_code_availability',
      'draft_reproduction_plan',
      'extract_method_parameters',
      'validate_method_alignment',
      'validate_paper_reproduction_map',
      'validate_reproduction_scope',
      'validate_skill_compliance',
      'preflight_execution_scripts',
      'validate_reproduction_plan',
      'prepare_execution_contract',
      'complete_execution',
    ],
  },
  analysis: {
    profile: 'analysis',
    serverName: 'openscience-bio-analysis',
    toolName: 'bio_analysis',
    description:
      'OpenBioScience human-in-the-loop private omics analysis control plane for intake, scRNA-seq baseline, reviewed episodes, and closure.',
    actions: [
      'status',
      'start_analysis',
      'prepare_intake',
      'complete_intake',
      'prepare_qc',
      'complete_qc',
      'prepare_baseline',
      'complete_baseline',
      'prepare_episode',
      'complete_episode',
      'request_checkpoint',
      'preflight_scripts',
      'prepare_closure',
      'close_analysis',
    ],
  },
  statistics: {
    profile: 'statistics',
    serverName: 'openscience-bio-statistics',
    toolName: 'bio_statistics',
    description:
      'OpenBioScience statistical contract control plane for expression semantics, replicate-aware differential-expression designs, and edgeR output validation.',
    actions: ['status', 'validate_expression_contract', 'validate_de_design', 'validate_de_outputs'],
  },
  environment_manager: {
    profile: 'environment_manager',
    serverName: 'openscience-bio-environment-manager',
    toolName: 'bio_environment_manager',
    description:
      'OpenBioScience user environment index control plane for planning, deriving, registering, and listing runtime-visible user environments.',
    actions: [
      'status',
      'create_user_environment',
      'derive_user_environment',
      'register_user_environment',
      'list_user_environments',
    ],
  },
};

export const BIO_ENVIRONMENTS: BioMcpCatalogItem[] = [
  {
    id: 'sc-r-singlecell',
    description: 'R/Seurat-centered single-cell import, QC, clustering, annotation, markers, and basic scoring.',
    environmentRefs: ['sc-r-singlecell'],
    outputs: ['sessionInfo_R.txt', 'objects/*.rds', 'tables/*.tsv', 'figures/*'],
  },
  {
    id: 'sc-py-singlecell',
    description:
      'Python/Scanpy-centered single-cell import, object inspection, integration, and scVI-compatible workflows.',
    environmentRefs: ['sc-py-singlecell'],
    outputs: ['pip-freeze.txt', 'objects/*.h5ad', 'tables/*.tsv', 'figures/*'],
  },
  {
    id: 'sc-r-plot',
    description:
      'R plotting environment for ggplot2, ComplexHeatmap, dittoSeq, palettes, publication figures, and report graphics.',
    environmentRefs: ['sc-r-plot'],
    outputs: ['plot_manifest.json', 'figures/*.pdf', 'figures/*.png', 'figures/*.svg'],
  },
  {
    id: 'sc-r-clinical',
    description:
      'R clinical/statistical comparison environment for response groups, composition tests, and survival-ready metadata audits.',
    environmentRefs: ['sc-r-clinical'],
    outputs: ['tables/clinical_audit.tsv', 'tables/comparisons.tsv', 'figures/clinical/*'],
  },
  {
    id: 'sc-cci-r',
    description: 'R ligand-receptor and cell-cell interaction environment for CellChat-style workflow execution.',
    environmentRefs: ['sc-cci-r'],
    outputs: ['tables/cci/*.tsv', 'figures/cci/*', 'reports/cci_summary.json'],
  },
  {
    id: 'sc-r-trajectory',
    description: 'R trajectory and pseudotime environment for Monocle/Slingshot-style workflows.',
    environmentRefs: ['sc-r-trajectory'],
    outputs: ['objects/trajectory.rds', 'tables/pseudotime.tsv', 'figures/trajectory/*'],
  },
  {
    id: 'sc-network-grn-r',
    description: 'R GRN and TF activity environment for SCENIC, GENIE3, decoupleR, DoRothEA, and VIPER contracts.',
    environmentRefs: ['sc-network-grn-r'],
    outputs: ['tables/grn/*.tsv', 'tables/tf_activity.tsv', 'figures/grn/*'],
  },
  {
    id: 'sc-r-tumor-cnv',
    description:
      'R tumor CNV inference environment for malignant-cell screening and reference-cell sensitivity reports.',
    environmentRefs: ['sc-r-tumor-cnv'],
    outputs: ['tables/cnv/*.tsv', 'figures/cnv/*', 'reports/cnv_summary.json'],
  },
];

export const BIO_WORKFLOWS: BioMcpCatalogItem[] = [
  {
    id: 'singlecell_import_summary',
    description: 'Inspect matrix/object semantics, metadata keys, raw-count status, and downstream claim boundaries.',
    environmentRefs: ['sc-r-singlecell', 'sc-py-singlecell'],
    requiredFields: ['input_path', 'species'],
    outputs: ['reports/import_summary.json', 'tables/input_shape.tsv', 'tables/metadata_key_completeness.tsv'],
  },
  {
    id: 'seurat_qc_preprocess',
    description: 'Run sample-aware QC, normalization, HVG selection, and preprocessing summaries.',
    environmentRefs: ['sc-r-singlecell'],
    requiredFields: ['object_path', 'sample_key'],
    outputs: ['objects/seurat_qc.rds', 'tables/qc_metrics.tsv', 'figures/qc/*'],
  },
  {
    id: 'dim_cluster_marker',
    description: 'Run dimensionality reduction, clustering across resolutions, marker ranking, and batch diagnostics.',
    environmentRefs: ['sc-r-singlecell', 'sc-py-singlecell'],
    requiredFields: ['object_path', 'sample_key'],
    outputs: ['objects/clustered.*', 'tables/cluster_markers.tsv', 'figures/umap/*'],
  },
  {
    id: 'cell_annotation_review',
    description: 'Assemble marker, atlas, and paper evidence into annotation candidates and ambiguity reports.',
    environmentRefs: ['sc-r-singlecell', 'sc-py-singlecell'],
    requiredFields: ['marker_table', 'cluster_key', 'species'],
    outputs: ['tables/annotation_candidates.tsv', 'reports/annotation_review.json'],
  },
  {
    id: 'scrna_plot_figure_set',
    description: 'Render standard scRNA-seq QC, embedding, marker, composition, signature, and report figure sets.',
    environmentRefs: ['sc-r-plot'],
    requiredFields: ['object_path', 'plot_plan'],
    outputs: ['reports/plot_manifest.json', 'figures/*.pdf', 'figures/*.png'],
  },
];

export const BIO_PLOT_TEMPLATES: BioMcpCatalogItem[] = [
  {
    id: 'scrna.embedding.umap.cluster.v1',
    description: 'UMAP/t-SNE embedding colored by cluster, annotation, sample, condition, batch, or gene feature.',
    requiredFields: ['embedding_columns', 'color_key'],
    outputs: ['figures/embedding/*.pdf', 'figures/embedding/*.png'],
  },
  {
    id: 'scrna.qc.violin.v1',
    description:
      'QC violin/ridge/histogram/scatter panels for nFeature, nCount, mitochondrial, ribosomal, doublet, and ambient metrics.',
    requiredFields: ['metadata_table', 'qc_columns'],
    outputs: ['figures/qc/*.pdf'],
  },
  {
    id: 'scrna.marker.dotplot.heatmap.v1',
    description: 'Marker dotplot, heatmap, violin, feature plot, and ranked marker summaries.',
    requiredFields: ['marker_table', 'cluster_key'],
    outputs: ['figures/markers/*.pdf', 'figures/markers/*.png'],
  },
  {
    id: 'scrna.composition.response.v1',
    description:
      'Composition stacked/grouped/alluvial plots across sample, condition, response, and annotation levels.',
    requiredFields: ['cell_metadata', 'sample_key', 'group_key'],
    outputs: ['figures/composition/*.pdf'],
  },
  {
    id: 'scrna.signature.score.v1',
    description: 'Module score heatmap, embedding overlay, and grouped distribution plots.',
    requiredFields: ['score_table', 'group_key'],
    outputs: ['figures/signatures/*.pdf'],
  },
  {
    id: 'scrna.de.volcano.ma.v1',
    description: 'Pseudobulk DE volcano, MA, coefficient heatmap, and effect-size dot plots.',
    requiredFields: ['de_table'],
    outputs: ['figures/de/*.pdf'],
  },
  {
    id: 'scrna.cci.lr.network.v1',
    description: 'Ligand-receptor dotplot, pathway heatmap, chord/circle/network views, and interaction summaries.',
    requiredFields: ['lr_table', 'source_cell_key', 'target_cell_key'],
    outputs: ['figures/cci/*.pdf'],
  },
];

export function resolveBioProfile(value?: string | null): BioMcpProfile {
  if (!value) return 'runtime';
  if (
    value === 'source' ||
    value === 'knowledge' ||
    value === 'plot' ||
    value === 'reproduction' ||
    value === 'analysis' ||
    value === 'statistics' ||
    value === 'environment_manager'
  ) {
    return value;
  }
  if (value === 'runtime') return value;
  throw new Error(`Invalid OpenBioScience bio MCP profile "${value}".`);
}
