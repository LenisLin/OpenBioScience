/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type BioMcpProfile = 'runtime' | 'source' | 'knowledge' | 'plot';

export type BioMcpCatalogItem = {
  id: string;
  description: string;
  environmentRefs?: string[];
  requiredFields?: string[];
  outputs?: string[];
  runner?: {
    kind: 'python' | 'rscript';
    script: string;
    environmentRef: string;
  };
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
      'list_workflows',
      'validate_workflow',
      'run_workflow',
      'list_plot_templates',
      'validate_plot_inputs',
      'summarize_outputs',
    ],
  },
  source: {
    profile: 'source',
    serverName: 'openscience-bio-source',
    toolName: 'bio_source',
    description:
      'OpenBioScience data-source control plane for accession triage, local asset verification, download planning, and data manifests.',
    actions: ['status', 'resolve_accession', 'verify_local_assets', 'plan_download', 'build_data_manifest'],
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
      'Python/Scanpy-centered single-cell import, object inspection, integration, and CCI smoke workflows.',
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
    id: 'inspect_input',
    description: 'Allowlisted runner smoke for local input format and table/object semantics inspection.',
    environmentRefs: ['sc-py-singlecell'],
    requiredFields: ['input_path'],
    outputs: ['reports/import_summary.json', 'run_manifest.json', 'logs/inspect_input.log'],
    runner: {
      kind: 'python',
      script: 'scripts/inspect_input.py',
      environmentRef: 'sc-py-singlecell',
    },
  },
  {
    id: 'run_scanpy_core',
    description: 'Allowlisted Scanpy smoke runner for QC metrics, PCA/neighbors/UMAP, Leiden clusters, and marker table.',
    environmentRefs: ['sc-py-singlecell'],
    requiredFields: ['counts_path', 'metadata_path'],
    outputs: ['reports/scanpy_core_summary.json', 'tables/qc_metrics.tsv', 'tables/cluster_markers.tsv', 'figures/umap_clusters.png', 'run_manifest.json'],
    runner: {
      kind: 'python',
      script: 'scripts/run_scanpy_core.py',
      environmentRef: 'sc-py-singlecell',
    },
  },
  {
    id: 'run_seurat_core',
    description: 'Allowlisted Seurat smoke runner for normalization, PCA/neighbors/clusters, marker table, and RDS output.',
    environmentRefs: ['sc-r-singlecell'],
    requiredFields: ['counts_path', 'metadata_path'],
    outputs: ['reports/seurat_core_summary.json', 'tables/seurat_metadata.tsv', 'tables/cluster_markers.tsv', 'objects/seurat_core.rds', 'run_manifest.json'],
    runner: {
      kind: 'rscript',
      script: 'scripts/run_seurat_core.R',
      environmentRef: 'sc-r-singlecell',
    },
  },
  {
    id: 'run_pseudobulk_de',
    description: 'Allowlisted pseudobulk DE smoke runner using sample x cell-type aggregation and edgeR when replication permits.',
    environmentRefs: ['sc-r-singlecell'],
    requiredFields: ['counts_path', 'metadata_path', 'sample_key', 'group_key', 'cell_type_key'],
    outputs: ['reports/pseudobulk_de_summary.json', 'tables/pseudobulk_counts.tsv', 'tables/pseudobulk_de.tsv', 'run_manifest.json'],
    runner: {
      kind: 'rscript',
      script: 'scripts/run_pseudobulk_de.R',
      environmentRef: 'sc-r-singlecell',
    },
  },
  {
    id: 'run_signature_scoring',
    description: 'Allowlisted signature scoring smoke runner for small gene-set score tables.',
    environmentRefs: ['sc-r-singlecell'],
    requiredFields: ['counts_path', 'gene_sets_path'],
    outputs: ['reports/signature_scoring_summary.json', 'tables/signature_scores.tsv', 'run_manifest.json'],
    runner: {
      kind: 'rscript',
      script: 'scripts/run_signature_scoring.R',
      environmentRef: 'sc-r-singlecell',
    },
  },
  {
    id: 'run_liana',
    description: 'Allowlisted ligand-receptor smoke runner for LIANA-compatible CCI score contracts.',
    environmentRefs: ['sc-py-singlecell'],
    requiredFields: ['counts_path', 'metadata_path', 'lr_pairs_path', 'cell_type_key'],
    outputs: ['reports/liana_summary.json', 'tables/liana_lr_scores.tsv', 'run_manifest.json'],
    runner: {
      kind: 'python',
      script: 'scripts/run_liana.py',
      environmentRef: 'sc-py-singlecell',
    },
  },
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
  if (value === 'source' || value === 'knowledge' || value === 'plot') return value;
  if (value === 'runtime') return value;
  throw new Error(`Invalid OpenBioScience bio MCP profile "${value}".`);
}
