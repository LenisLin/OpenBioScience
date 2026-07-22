import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { modalityArtifactRequirements } from '@/process/resources/builtinMcp/bio/analysis/contracts';
import { handleAnalysisAction } from '@/process/resources/builtinMcp/bio/analysis/workflow';
import { writeReceipt } from '@/process/resources/builtinMcp/bio/receipts';

type ActionResult = { receipt?: { receiptId: string }; state?: { projectStatus: string } };

const receiptId = (value: ActionResult): string => {
  if (!value.receipt?.receiptId) throw new Error('Expected a receipt.');
  return value.receipt.receiptId;
};

describe('bio analysis workflow', () => {
  let projectRoot = '';
  let previousGatewayUrl: string | undefined;
  let previousGatewayToken: string | undefined;
  let previousEnvRoot: string | undefined;
  let previousMarkerRoot: string | undefined;

  it('declares specialized VDJ and spatial artifacts without absorbing protein benchmarks', () => {
    expect(modalityArtifactRequirements('singlecell_vdj')).toEqual(
      expect.arrayContaining(['tables/paired_airr_rearrangements.tsv', 'tables/barcode_join_qc.tsv'])
    );
    expect(modalityArtifactRequirements('spatial_transcriptomics')).toEqual(
      expect.arrayContaining(['results/tables/coordinate_validation.tsv', 'results/tables/morans_i.tsv'])
    );
    expect(modalityArtifactRequirements('protein_variant_structure_mapping')).toEqual([]);
  });

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-analysis-'));
    fs.mkdirSync(path.join(projectRoot, 'private-input'), { recursive: true });
    previousGatewayUrl = process.env.DEEPORGANISER_USER_INPUT_URL;
    previousGatewayToken = process.env.DEEPORGANISER_USER_INPUT_TOKEN;
    previousEnvRoot = process.env.OPENBIOSCIENCE_ENV_ROOT;
    previousMarkerRoot = process.env.OPENBIOSCIENCE_MARKER_ROOT;
    delete process.env.DEEPORGANISER_USER_INPUT_URL;
    delete process.env.DEEPORGANISER_USER_INPUT_TOKEN;
    delete process.env.OPENBIOSCIENCE_ENV_ROOT;
    delete process.env.OPENBIOSCIENCE_MARKER_ROOT;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousGatewayUrl == null) delete process.env.DEEPORGANISER_USER_INPUT_URL;
    else process.env.DEEPORGANISER_USER_INPUT_URL = previousGatewayUrl;
    if (previousGatewayToken == null) delete process.env.DEEPORGANISER_USER_INPUT_TOKEN;
    else process.env.DEEPORGANISER_USER_INPUT_TOKEN = previousGatewayToken;
    if (previousEnvRoot == null) delete process.env.OPENBIOSCIENCE_ENV_ROOT;
    else process.env.OPENBIOSCIENCE_ENV_ROOT = previousEnvRoot;
    if (previousMarkerRoot == null) delete process.env.OPENBIOSCIENCE_MARKER_ROOT;
    else process.env.OPENBIOSCIENCE_MARKER_ROOT = previousMarkerRoot;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  const store = (result: ActionResult) => {
    if (!result.receipt) throw new Error('Expected a receipt to store.');
    writeReceipt(projectRoot, result.receipt as never);
    return result.receipt.receiptId;
  };

  const writeProbeReceipt = (environmentRef = 'sc-py-singlecell') => {
    const probeReceiptId = `bio_receipt_${crypto.createHash('sha256').update(environmentRef).digest('hex').slice(0, 20)}`;
    writeReceipt(projectRoot, {
      schema: 'openbioscience.bio.receipt.v1',
      receiptId: probeReceiptId,
      producer: 'bio_runtime',
      action: 'probe_environment',
      status: 'supported',
      projectRoot,
      createdAt: Date.now(),
      details: {
        environmentRef,
        path: path.join(projectRoot, 'runtime-root', 'environments', 'official', environmentRef),
        pathStatus: 'available',
        probe: { status: 'passed', checks: [] },
      },
    });
    return probeReceiptId;
  };

  const writeMarkerResources = () => {
    const markerRoot = path.join(projectRoot, 'resources', 'bio', 'markers');
    fs.mkdirSync(markerRoot, { recursive: true });
    fs.writeFileSync(
      path.join(markerRoot, 'scrna_atlas_markers.v1.jsonl'),
      `${JSON.stringify({
        id: 'scrna_atlas.human.fixture.t_cell',
        species: 'Homo sapiens',
        context: 'human immune atlas fixture',
        compartment: 'Immune',
        major_type: 'T cell',
        subtype: '',
        state: null,
        annotation_level: 'major',
        ontology_id: 'CL:0000084',
        source_paper: ['doi:10.1126/science.abl5197'],
        markers: { core: ['CD3D', 'TRAC'], supporting: ['CD3E'], negative: ['MS4A1'], state: [] },
        notes: 'test marker resource',
        evidence_type: 'A_exact_supplement_marker',
        confidence: 'High',
      })}\n`,
      'utf8'
    );
    fs.writeFileSync(
      path.join(markerRoot, 'scrna_atlas_markers.meta.yaml'),
      [
        'schema: openbioscience.marker_resource_meta.v1',
        'resourceId: scrna_atlas_markers.v1',
        'version: v1',
        'status: test_fixture',
        'licenseOrTerms: test-only',
      ].join('\n'),
      'utf8'
    );
    fs.writeFileSync(
      path.join(markerRoot, 'index.tsv'),
      [
        [
          'package_id',
          'resource_id',
          'version',
          'availability',
          'resource_type',
          'species',
          'scope',
          'disease',
          'modality',
          'record_count',
          'records_file',
          'sources_file',
          'aliases_file',
          'meta_file',
          'record_schema',
          'mcp_actions',
          'skill_routes',
          'keywords',
          'recommended_use',
          'license_or_terms',
          'access_date',
          'notes',
        ].join('\t'),
        [
          'scrna_atlas_markers',
          'scrna_atlas_markers.v1',
          'v1',
          'available',
          'marker_atlas_dictionary',
          'Homo sapiens;Mus musculus',
          'fixture marker-atlas dictionary',
          'any',
          'scRNA-seq',
          '1',
          'scrna_atlas_markers.v1.jsonl',
          '',
          '',
          'scrna_atlas_markers.meta.yaml',
          'marker_resource.schema.json',
          'bio_knowledge.search_marker;bio_knowledge.search_atlas',
          'bio-omics-analysis;bio-singlecell-baseline;bio-cell-annotation',
          'human;mouse;atlas;marker',
          'annotation evidence lookup',
          'test-only',
          '2026-07-19',
          'fixture',
        ].join('\t'),
        '',
      ].join('\n'),
      'utf8'
    );
    process.env.OPENBIOSCIENCE_MARKER_ROOT = markerRoot;
  };

  const writeIntakeOutputs = (analysisId: string): string[] => {
    const root = path.join(projectRoot, 'omics_analysis', analysisId, 'intake');
    const files = [
      'results/tables/input_inventory.tsv',
      'results/tables/dataset_units.tsv',
      'results/tables/metadata_profile.tsv',
      'results/output_manifest.json',
      'logs/intake.log',
    ];
    for (const relative of files) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      if (relative.startsWith('scripts/') && fs.existsSync(target)) continue;
      fs.writeFileSync(
        target,
        relative.endsWith('output_manifest.json') ? '{"schema":"openbioscience.analysis_script.outputs.v2"}\n' : '{}\n',
        'utf8'
      );
    }
    return files.map((relative) => `omics_analysis/${analysisId}/intake/${relative}`);
  };

  const writeStageOutputs = (
    analysisId: string,
    stage: 'qc' | 'baseline' | 'episode' | 'closing',
    episodeId?: string
  ) => {
    const root =
      stage === 'episode'
        ? path.join(projectRoot, 'omics_analysis', analysisId, 'episodes', episodeId || '')
        : path.join(projectRoot, 'omics_analysis', analysisId, stage === 'closing' ? 'reports' : stage);
    const files =
      stage === 'qc'
        ? [
            'results/objects/preprocessed.h5ad',
            'results/tables/qc_metrics.tsv',
            'results/figures/qc_before_after.png',
            'results/output_manifest.json',
            'logs/qc.log',
          ]
        : stage === 'baseline'
          ? [
              'results/objects/clustered.h5ad',
              'results/tables/cluster_assignments.tsv',
              'results/tables/embedding_coordinates.tsv',
              'results/tables/cluster_markers.tsv',
              'results/tables/major_annotation.tsv',
              'results/tables/annotation_evidence.tsv',
              'results/tables/descriptive_statistics.tsv',
              'results/figures/umap.png',
              'results/output_manifest.json',
              'logs/baseline.log',
            ]
          : stage === 'episode'
            ? ['results/output_manifest.json', 'logs/episode.log']
            : ['final_report.md', 'coverage_contract.json'];
    for (const relative of files) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        relative.endsWith('output_manifest.json') ? '{"schema":"openbioscience.analysis_script.outputs.v2"}\n' : '{}\n',
        'utf8'
      );
    }
    const relativeRoot =
      stage === 'episode'
        ? `omics_analysis/${analysisId}/episodes/${episodeId}`
        : `omics_analysis/${analysisId}/${stage === 'closing' ? 'reports' : stage}`;
    return files.map((relative) => `${relativeRoot}/${relative}`);
  };

  const explorationRootFor = (analysisId: string) => `omics_analysis/${analysisId}/exploration`;

  const explorationOutputManifest = (
    analysisId: string,
    overrides: Partial<Record<'reports' | 'tables' | 'figures' | 'logs' | 'scripts' | 'objects', string[]>> = {}
  ) => {
    const root = explorationRootFor(analysisId);
    return {
      schema: 'openbioscience.analysis_script.outputs.v2',
      workflowKind: 'omics_analysis',
      analysisId,
      stageOrEpisodeId: 'exploration',
      environmentRef: 'sc-py-singlecell',
      inputs: ['private-input'],
      outputs: {
        objects: [`${root}/results/objects/exploration.h5ad`, ...(overrides.objects || [])],
        tables: [
          `${root}/results/tables/input_inventory.tsv`,
          `${root}/results/tables/qc_metrics.tsv`,
          `${root}/results/tables/cluster_assignments.tsv`,
          `${root}/results/tables/embedding_coordinates.tsv`,
          `${root}/results/tables/cluster_markers.tsv`,
          `${root}/results/tables/major_annotation.tsv`,
          `${root}/results/tables/fraction_by_sample.tsv`,
          `${root}/results/tables/fraction_group_comparison.tsv`,
          `${root}/results/tables/processed_expression_feature_screening.tsv`,
          `${root}/results/tables/pathway_enrichment.tsv`,
          `${root}/results/tables/blocked_or_limited_contrasts.tsv`,
          ...(overrides.tables || []),
        ],
        figures: [
          `${root}/results/figures/embedding/umap_clusters.png`,
          `${root}/results/figures/markers/marker_dotplot.png`,
          `${root}/results/figures/markers/marker_heatmap.png`,
          `${root}/results/figures/composition/fraction_by_response.png`,
          `${root}/results/figures/differential_features/feature_heatmap.png`,
          `${root}/results/figures/differential_features/feature_dotplot.png`,
          `${root}/results/figures/pathway_enrichment/enrichment_barplot.png`,
          ...(overrides.figures || []),
        ],
        reports: [`${root}/reports/analysis_report.md`, ...(overrides.reports || [])],
        logs: [
          `${root}/logs/run_auto_explore.log`,
          `${root}/logs/session_info.json`,
          `${root}/logs/warnings.tsv`,
          ...(overrides.logs || []),
        ],
        scripts: [
          `${root}/scripts/run_auto_explore.py`,
          `${root}/scripts/script_manifest.json`,
          `${root}/scripts/modules/io_utils.py`,
          `${root}/scripts/modules/feature_screening.py`,
          ...(overrides.scripts || []),
        ],
      },
      assumptions: ['processed expression screening is exploratory'],
      warnings: [],
    };
  };

  const writeExplorationScriptPackage = (analysisId: string, planReceiptId: string): string => {
    const root = explorationRootFor(analysisId);
    const scriptPath = `${root}/scripts/run_auto_explore.py`;
    const probeReceiptId = writeProbeReceipt();
    writeMarkerResources();
    const completedModule = (
      moduleId: string,
      outputs: string[],
      extra: Partial<Record<string, unknown>> = {}
    ) => ({
      moduleId,
      status: 'completed',
      skillIds: ['bio-singlecell-baseline'],
      mcpTools: ['bio_runtime', 'bio_analysis'],
      environmentRef: 'sc-py-singlecell',
      environmentProbeReceiptId: probeReceiptId,
      implementation: ['run_auto_explore.py', 'modules/io_utils.py', 'modules/feature_screening.py'],
      outputs,
      ...extra,
    });
    const notApplicableModule = (
      moduleId: string,
      reason: string,
      skillIds: string[],
      mcpTools: string[]
    ) => ({
      moduleId,
      status: 'not_applicable',
      skillIds,
      mcpTools,
      reason,
    });
    const files: Record<string, string> = {
      [scriptPath]: [
        '# OpenBioScience-Workflow-Kind: omics_analysis',
        `# OpenBioScience-Analysis-ID: ${analysisId}`,
        '# OpenBioScience-Stage-Or-Episode-ID: exploration',
        `# OpenBioScience-Contract-Receipt-ID: ${planReceiptId}`,
        '# OpenBioScience-Annotation-Mode: descriptive_metadata_only',
        '# OpenBioScience-External-Egress-Policy: forbidden',
        '# OpenBioScience-EnvironmentRef: sc-py-singlecell',
        '# OpenBioScience-Inputs: private-input',
        `# OpenBioScience-Outputs: ${root}/results/output_manifest.json`,
        '# OpenBioScience-Run-Command: python scripts/run_auto_explore.py',
        '# OpenBioScience-Assumptions: processed expression may be descriptive only',
        '',
        'SCHEMA = "openbioscience.analysis_script.outputs.v2"',
        '',
        'def main():',
        '    # Step 1: validate inputs and metadata columns',
        '    # Step 2: run QC, clustering, annotation, and feature screening modules',
        '    # Step 3: write canonical tables, figures, logs, report, and manifest',
        '    print("ok")',
        '',
        'if __name__ == "__main__":',
        '    main()',
        '',
      ].join('\n'),
      [`${root}/scripts/modules/io_utils.py`]: [
        '"""Input/output helpers for the OpenBioScience exploration package and canonical manifest writing."""',
        '',
        'def validate_inputs(input_root):',
        '    """Inputs: project-relative input root containing the local matrix and metadata files.',
        '    Outputs: the validated input root used by the import-summary workflow module.',
        '    Assumptions: input files are immutable project data and all downstream outputs stay in the canonical exploration tree.',
        '    Scientific/Reproducibility decision: validate input identity before object construction so barcode and metadata mismatches are reported early.',
        '    """',
        '    return input_root',
        '',
      ].join('\n'),
      [`${root}/scripts/modules/feature_screening.py`]: [
        '"""Processed-expression feature screening helpers with explicit non-confirmatory semantics."""',
        '',
        'def screen_processed_expression(adata, response_column):',
        '    """Inputs: AnnData with processed-expression values and a response metadata column.',
        '    Outputs: feature-screening inputs for ranked exploratory tables and downstream differential-feature figures.',
        '    Assumptions: expression values may be non-integer processed values, so raw-count negative-binomial DE is outside this function.',
        '    Scientific/Reproducibility decision: summarize response-associated features as exploratory_processed_expression rather than confirmatory DE.',
        '    """',
        '    return adata, response_column',
        '',
      ].join('\n'),
      [`${root}/scripts/script_manifest.json`]: `${JSON.stringify(
        {
          schema: 'openbioscience.analysis_script.package.v1',
          workflowKind: 'omics_analysis',
          analysisId,
          stageOrEpisodeId: 'exploration',
          environmentRef: 'sc-py-singlecell',
          entrypoint: 'run_auto_explore.py',
          modules: [
            { path: 'modules/io_utils.py', role: 'io_and_manifest' },
            { path: 'modules/feature_screening.py', role: 'processed_expression_screening' },
          ],
          workflowModules: [
            notApplicableModule(
              'public_dataset_discovery',
              'This fixture uses project-local private input, so no public dataset search is part of the stage.',
              ['openscience-databases', 'bio-omics-analysis'],
              ['research_evidence', 'bio_source']
            ),
            notApplicableModule(
              'public_dataset_localization',
              'This fixture uses already-local private input, so no public accession localization is required.',
              ['openscience-databases', 'bio-omics-analysis'],
              ['bio_source']
            ),
            completedModule('singlecell_import_summary', ['results/tables/input_inventory.tsv']),
            completedModule('singlecell_qc_preprocess', [
              'results/tables/qc_metrics.tsv',
              'results/objects/exploration.h5ad',
            ]),
            completedModule('dim_cluster_marker', [
              'results/tables/cluster_assignments.tsv',
              'results/tables/embedding_coordinates.tsv',
              'results/tables/cluster_markers.tsv',
              'results/figures/embedding/umap_clusters.png',
              'results/figures/markers/marker_dotplot.png',
            ]),
            completedModule(
              'cell_annotation_review',
              ['results/tables/major_annotation.tsv', 'results/figures/markers/marker_heatmap.png'],
              { skillIds: ['bio-cell-annotation'], mcpTools: ['bio_knowledge', 'bio_analysis'] }
            ),
            completedModule(
              'scrna_plot_figure_set',
              ['results/figures/embedding/umap_clusters.png', 'results/figures/markers/marker_dotplot.png'],
              { mcpTools: ['bio_plot', 'bio_analysis'] }
            ),
            completedModule(
              'scrna_response_fraction_comparison',
              ['results/tables/fraction_by_sample.tsv', 'results/tables/fraction_group_comparison.tsv'],
              { skillIds: ['bio-omics-analysis'], mcpTools: ['bio_analysis', 'bio_statistics'] }
            ),
            completedModule(
              'scrna_processed_feature_screening',
              [
                'results/tables/processed_expression_feature_screening.tsv',
                'results/figures/differential_features/feature_heatmap.png',
              ],
              {
                skillIds: ['bio-scrna-differential-expression'],
                mcpTools: ['bio_analysis', 'bio_statistics'],
              }
            ),
            completedModule(
              'scrna_pathway_enrichment',
              [
                'results/tables/pathway_enrichment.tsv',
                'results/figures/pathway_enrichment/enrichment_barplot.png',
              ],
              { skillIds: ['kdense-pathway-enrichment'], mcpTools: ['bio_knowledge', 'bio_analysis'] }
            ),
            completedModule(
              'exploration_report_package',
              ['reports/analysis_report.md', 'results/output_manifest.json', 'logs/session_info.json'],
              {
                skillIds: ['bio-analysis-script-authoring'],
                mcpTools: ['bio_analysis', 'science_artifact'],
              }
            ),
          ],
          resourceProvenance: {
            markerResources: [
              {
                resourceId: 'scrna_atlas_markers.v1',
                version: 'v1',
                status: 'localized_atlas_dictionary',
                resourcePath: 'resources/bio/markers/scrna_atlas_markers.v1.jsonl',
                sourcePapers: ['doi:10.1126/science.abl5197'],
                evidenceType: 'A_exact_supplement_marker',
                confidence: 'High',
              },
            ],
            geneSetResources: [
              {
                provider: 'MSigDB',
                collection: 'h.all',
                species: 'human',
                resourcePath: 'resources/bio/gene_sets/msigdb/human/h.all.v2026.1.Hs.symbols.gmt',
              },
            ],
          },
          scientificDecisions: [
            {
              decisionId: 'decision-input-integrity',
              topic: 'Input identity and barcode matching',
              rationale:
                'The workflow validates metadata and expression barcodes before analysis so downstream tables remain traceable to the immutable local case files.',
              implementedIn: ['modules/io_utils.py'],
              outputsAffected: ['results/tables/input_inventory.tsv', 'logs/warnings.tsv'],
              limitation: 'The check establishes structural consistency only and does not prove raw-count semantics.',
            },
            {
              decisionId: 'decision-processed-expression',
              topic: 'Processed-expression feature screening boundary',
              rationale:
                'The matrix may contain processed non-integer values, so the workflow separates exploratory feature screening from raw-count confirmatory pseudobulk DE.',
              implementedIn: ['modules/feature_screening.py'],
              outputsAffected: ['results/tables/processed_expression_feature_screening.tsv'],
              limitation: 'Results are ranked exploratory signals and must not be interpreted as negative-binomial DE.',
            },
            {
              decisionId: 'decision-biological-replicates',
              topic: 'Sample-level response comparison',
              rationale:
                'Responder and non-responder comparisons are summarized by sample or patient to avoid treating cells as independent biological replicates.',
              implementedIn: ['run_auto_explore.py', 'modules/feature_screening.py'],
              outputsAffected: ['results/tables/fraction_group_comparison.tsv'],
              limitation: 'Small sample counts limit power and require bounded interpretation.',
            },
            {
              decisionId: 'decision-blocked-contrasts',
              topic: 'Blocked or limited contrasts reporting',
              rationale:
                'Contrasts without compatible matrix semantics, variable metadata, or biological replication are recorded instead of being silently omitted.',
              implementedIn: ['run_auto_explore.py'],
              outputsAffected: ['results/tables/blocked_or_limited_contrasts.tsv', 'reports/analysis_report.md'],
              limitation: 'Blocked rows document absence of support, not absence of biology.',
            },
          ],
          expectedOutputs: explorationOutputManifest(analysisId).outputs,
        },
        null,
        2
      )}\n`,
    };
    for (const [relative, content] of Object.entries(files)) {
      const target = path.join(projectRoot, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, 'utf8');
    }
    return scriptPath;
  };

  const writeExplorationOutputs = (analysisId: string): string[] => {
    const root = path.join(projectRoot, 'omics_analysis', analysisId, 'exploration');
    const files = [
      'scripts/run_auto_explore.py',
      'scripts/script_manifest.json',
      'scripts/modules/io_utils.py',
      'scripts/modules/feature_screening.py',
      'results/objects/exploration.h5ad',
      'results/tables/input_inventory.tsv',
      'results/tables/qc_metrics.tsv',
      'results/tables/cluster_assignments.tsv',
      'results/tables/embedding_coordinates.tsv',
      'results/tables/cluster_markers.tsv',
      'results/tables/major_annotation.tsv',
      'results/tables/fraction_by_sample.tsv',
      'results/tables/fraction_group_comparison.tsv',
      'results/tables/processed_expression_feature_screening.tsv',
      'results/tables/pathway_enrichment.tsv',
      'results/tables/blocked_or_limited_contrasts.tsv',
      'results/figures/embedding/umap_clusters.png',
      'results/figures/markers/marker_dotplot.png',
      'results/figures/markers/marker_heatmap.png',
      'results/figures/composition/fraction_by_response.png',
      'results/figures/differential_features/feature_heatmap.png',
      'results/figures/differential_features/feature_dotplot.png',
      'results/figures/pathway_enrichment/enrichment_barplot.png',
      'results/output_manifest.json',
      'reports/analysis_report.md',
      'logs/run_auto_explore.log',
      'logs/session_info.json',
      'logs/warnings.tsv',
    ];
    for (const relative of files) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(
        target,
        relative.endsWith('output_manifest.json')
          ? `${JSON.stringify(explorationOutputManifest(analysisId), null, 2)}\n`
          : '{}\n',
        'utf8'
      );
    }
    return files.map((relative) => `omics_analysis/${analysisId}/exploration/${relative}`);
  };

  const acceptAllCheckpoints = () => {
    process.env.DEEPORGANISER_USER_INPUT_URL = 'http://127.0.0.1:19991/input';
    process.env.DEEPORGANISER_USER_INPUT_TOKEN = 'session-only-token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              schema: 'deeporganiser.user_input.result.v1',
              requestId: 'checkpoint-accepted',
              status: 'answered',
              answers: [{ questionId: 'checkpoint_decision', selectedOptionIds: ['accept'] }],
            }),
            { status: 200 }
          )
        )
      )
    );
  };

  it('rejects an input root outside the authorized project', async () => {
    await expect(
      handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId: 'analysis-a',
        inputRoot: '../outside',
        modality: 'scrna_seq',
      })
    ).rejects.toThrow('escapes the project root');
  });

  it('holds QC until the intake checkpoint is accepted', async () => {
    const started = (await handleAnalysisAction(projectRoot, 'start_analysis', {
      analysisId: 'analysis-gate',
      inputRoot: 'private-input',
      modality: 'scrna_seq',
    })) as ActionResult;
    store(started);

    const intakePlan = (await handleAnalysisAction(projectRoot, 'prepare_intake', {
      analysisId: 'analysis-gate',
    })) as ActionResult;
    const intakePlanReceiptId = store(intakePlan);

    const intake = (await handleAnalysisAction(projectRoot, 'complete_intake', {
      analysisId: 'analysis-gate',
      stagePlanReceiptId: intakePlanReceiptId,
      canonicalFilePaths: writeIntakeOutputs('analysis-gate'),
      datasetUnits: [
        { id: 'unit-a', inputPaths: ['private-input/matrix.mtx'], modality: 'scrna_seq', mergeWithOtherUnits: false },
      ],
      supportedAnalyses: ['scrna_baseline'],
    })) as ActionResult;
    store(intake);

    await expect(handleAnalysisAction(projectRoot, 'prepare_qc', { analysisId: 'analysis-gate' })).rejects.toThrow(
      'accepted user checkpoint'
    );

    const checkpoint = (await handleAnalysisAction(projectRoot, 'request_checkpoint', {
      analysisId: 'analysis-gate',
      stage: 'intake',
    })) as ActionResult;
    expect(checkpoint.receipt).toBeDefined();
    expect(
      (
        (await handleAnalysisAction(projectRoot, 'status', { analysisId: 'analysis-gate' })) as {
          state: { projectStatus: string };
        }
      ).state.projectStatus
    ).toBe('awaiting_user');
  });

  it('allows the next stage only after a gateway-backed accepted checkpoint', async () => {
    process.env.DEEPORGANISER_USER_INPUT_URL = 'http://127.0.0.1:19991/input';
    process.env.DEEPORGANISER_USER_INPUT_TOKEN = 'session-only-token';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schema: 'deeporganiser.user_input.result.v1',
            requestId: 'checkpoint-1',
            status: 'answered',
            answers: [{ questionId: 'checkpoint_decision', selectedOptionIds: ['accept'] }],
          }),
          { status: 200 }
        )
      )
    );

    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId: 'analysis-accepted',
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_intake', {
      analysisId: 'analysis-accepted',
    })) as ActionResult;
    const completed = (await handleAnalysisAction(projectRoot, 'complete_intake', {
      analysisId: 'analysis-accepted',
      stagePlanReceiptId: store(plan),
      canonicalFilePaths: writeIntakeOutputs('analysis-accepted'),
      datasetUnits: [
        { id: 'unit-a', inputPaths: ['private-input/a.h5ad'], modality: 'scrna_seq', mergeWithOtherUnits: false },
      ],
      supportedAnalyses: ['scrna_baseline'],
    })) as ActionResult;
    store(completed);

    const checkpoint = (await handleAnalysisAction(projectRoot, 'request_checkpoint', {
      analysisId: 'analysis-accepted',
      stage: 'intake',
    })) as ActionResult;
    expect(receiptId(checkpoint)).toMatch(/^bio_receipt_/u);

    const qc = (await handleAnalysisAction(projectRoot, 'prepare_qc', {
      analysisId: 'analysis-accepted',
    })) as ActionResult;
    expect(receiptId(qc)).toMatch(/^bio_receipt_/u);
  });

  it('records multiple intake dataset units without merging them', async () => {
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId: 'analysis-units',
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_intake', {
      analysisId: 'analysis-units',
    })) as ActionResult;
    const completed = (await handleAnalysisAction(projectRoot, 'complete_intake', {
      analysisId: 'analysis-units',
      stagePlanReceiptId: store(plan),
      canonicalFilePaths: writeIntakeOutputs('analysis-units'),
      datasetUnits: [
        { id: 'unit-a', inputPaths: ['private-input/a.h5ad'], modality: 'scrna_seq', mergeWithOtherUnits: false },
        { id: 'unit-b', inputPaths: ['private-input/b.h5ad'], modality: 'scrna_seq', mergeWithOtherUnits: false },
      ],
      supportedAnalyses: ['scrna_baseline'],
    })) as ActionResult;

    const stored = completed.receipt as unknown as { summary: { automaticMerge: boolean; datasetUnits: unknown[] } };
    expect(stored.summary.automaticMerge).toBe(false);
    expect(stored.summary.datasetUnits).toHaveLength(2);
  });

  it('supports a canonical free exploration stage without baseline checkpoints', async () => {
    const analysisId = 'analysis-explore';
    const envRoot = path.join(projectRoot, 'runtime-root');
    const fakePython = path.join(envRoot, 'environments', 'official', 'sc-py-singlecell', 'bin', 'python');
    fs.mkdirSync(path.dirname(fakePython), { recursive: true });
    fs.writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
    fs.chmodSync(fakePython, 0o755);
    process.env.OPENBIOSCIENCE_ENV_ROOT = envRoot;
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );

    const schema = (await handleAnalysisAction(projectRoot, 'schema', {})) as {
      actions?: {
        prepare_exploration?: { minimumAnalysisPlan?: Array<{ moduleId?: string; required?: boolean }> };
        complete_exploration?: { outputRoot?: string };
      };
    };
    expect(schema.actions?.complete_exploration?.outputRoot).toBe('omics_analysis/<analysisId>/exploration');
    expect(schema.actions?.prepare_exploration?.minimumAnalysisPlan?.map((module) => module.moduleId)).toEqual([
      'public_dataset_discovery',
      'public_dataset_localization',
      'singlecell_import_summary',
      'singlecell_qc_preprocess',
      'dim_cluster_marker',
      'cell_annotation_review',
      'scrna_plot_figure_set',
      'scrna_response_fraction_comparison',
      'scrna_processed_feature_screening',
      'scrna_pathway_enrichment',
      'exploration_report_package',
    ]);

    const plan = (await handleAnalysisAction(projectRoot, 'prepare_exploration', { analysisId })) as ActionResult;
    const planReceiptId = store(plan);
    await expect(
      handleAnalysisAction(projectRoot, 'preflight_scripts', {
        analysisId,
        stage: 'exploration',
        contractReceiptId: planReceiptId,
        scriptPaths: [`output/${analysisId}/run_auto_explore.py`],
      })
    ).rejects.toThrow('Analysis scripts must be under');

    const scriptPath = writeExplorationScriptPackage(analysisId, planReceiptId);
    const preflight = (await handleAnalysisAction(projectRoot, 'preflight_scripts', {
      analysisId,
      stage: 'exploration',
      contractReceiptId: planReceiptId,
      scriptPaths: [scriptPath],
    })) as ActionResult & { status?: string; violations?: string[] };
    expect(preflight.status).toBe('ready');
    expect(preflight.violations).toEqual([]);
    const preflightReceiptId = store(preflight);

    await expect(
      handleAnalysisAction(projectRoot, 'complete_exploration', {
        analysisId,
        stagePlanReceiptId: planReceiptId,
        scriptPreflightReceiptId: planReceiptId,
        canonicalFilePaths: writeExplorationOutputs(analysisId),
        summary: { expressionSemantics: 'processed_log_normalized_like' },
      })
    ).rejects.toThrow('not a ready script preflight receipt');

    const completed = (await handleAnalysisAction(projectRoot, 'complete_exploration', {
      analysisId,
      stagePlanReceiptId: planReceiptId,
      scriptPreflightReceiptId: preflightReceiptId,
      canonicalFilePaths: writeExplorationOutputs(analysisId),
      summary: { expressionSemantics: 'processed_log_normalized_like' },
    })) as ActionResult;
    const receipt = completed.receipt as unknown as { stage: string; stageStatus: string; projectStatus: string };
    expect(receipt).toMatchObject({
      stage: 'exploration',
      stageStatus: 'accepted',
      projectStatus: 'accepted',
    });
  });

  it('rejects exploration script packages that only satisfy shallow comment scaffolding', async () => {
    const analysisId = 'thin-script-docs';
    const envRoot = path.join(projectRoot, 'runtime-root');
    const fakePython = path.join(envRoot, 'environments', 'official', 'sc-py-singlecell', 'bin', 'python');
    fs.mkdirSync(path.dirname(fakePython), { recursive: true });
    fs.writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
    fs.chmodSync(fakePython, 0o755);
    process.env.OPENBIOSCIENCE_ENV_ROOT = envRoot;
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_exploration', { analysisId })) as ActionResult;
    const planReceiptId = store(plan);
    const scriptPath = writeExplorationScriptPackage(analysisId, planReceiptId);
    const root = explorationRootFor(analysisId);
    fs.writeFileSync(
      path.join(projectRoot, `${root}/scripts/modules/io_utils.py`),
      '"""Input/output helpers for the OpenBioScience exploration package and canonical manifest writing."""\n\nVALUE = 1\n',
      'utf8'
    );
    fs.writeFileSync(
      path.join(projectRoot, `${root}/scripts/script_manifest.json`),
      JSON.stringify(
        {
          schema: 'openbioscience.analysis_script.package.v1',
          workflowKind: 'omics_analysis',
          analysisId,
          stageOrEpisodeId: 'exploration',
          environmentRef: 'sc-py-singlecell',
          entrypoint: 'run_auto_explore.py',
          modules: [
            { path: 'modules/io_utils.py', role: 'io_and_manifest' },
            { path: 'modules/feature_screening.py', role: 'processed_expression_screening' },
          ],
          expectedOutputs: explorationOutputManifest(analysisId).outputs,
        },
        null,
        2
      ),
      'utf8'
    );

    const preflight = (await handleAnalysisAction(projectRoot, 'preflight_scripts', {
      analysisId,
      stage: 'exploration',
      contractReceiptId: planReceiptId,
      scriptPaths: [scriptPath],
    })) as ActionResult & { status?: string; violations?: string[] };

    expect(preflight.status).toBe('needs_revision');
    expect(preflight.violations?.join('\n')).toContain('scientificDecisions');
    expect(preflight.violations?.join('\n')).toContain('workflowModules');
    expect(preflight.violations?.join('\n')).toContain('must expose at least one public helper function');
  });

  it('rejects exploration script manifests missing required workflow module bindings', async () => {
    const analysisId = 'missing-module-binding';
    const envRoot = path.join(projectRoot, 'runtime-root');
    const fakePython = path.join(envRoot, 'environments', 'official', 'sc-py-singlecell', 'bin', 'python');
    fs.mkdirSync(path.dirname(fakePython), { recursive: true });
    fs.writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
    fs.chmodSync(fakePython, 0o755);
    process.env.OPENBIOSCIENCE_ENV_ROOT = envRoot;
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_exploration', { analysisId })) as ActionResult;
    const planReceiptId = store(plan);
    const scriptPath = writeExplorationScriptPackage(analysisId, planReceiptId);
    const manifestPath = path.join(projectRoot, explorationRootFor(analysisId), 'scripts/script_manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      workflowModules?: Array<{ moduleId?: string }>;
    };
    manifest.workflowModules = manifest.workflowModules?.filter((module) => module.moduleId !== 'dim_cluster_marker');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const preflight = (await handleAnalysisAction(projectRoot, 'preflight_scripts', {
      analysisId,
      stage: 'exploration',
      contractReceiptId: planReceiptId,
      scriptPaths: [scriptPath],
    })) as ActionResult & { status?: string; violations?: string[] };

    expect(preflight.status).toBe('needs_revision');
    expect(preflight.violations?.join('\n')).toContain('workflowModules is missing required moduleId: dim_cluster_marker');
  });

  it('rejects public helper functions without function-level scientific descriptions', async () => {
    const analysisId = 'vague-function-docs';
    const envRoot = path.join(projectRoot, 'runtime-root');
    const fakePython = path.join(envRoot, 'environments', 'official', 'sc-py-singlecell', 'bin', 'python');
    fs.mkdirSync(path.dirname(fakePython), { recursive: true });
    fs.writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
    fs.chmodSync(fakePython, 0o755);
    process.env.OPENBIOSCIENCE_ENV_ROOT = envRoot;
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_exploration', { analysisId })) as ActionResult;
    const planReceiptId = store(plan);
    const scriptPath = writeExplorationScriptPackage(analysisId, planReceiptId);
    const modulePath = path.join(projectRoot, explorationRootFor(analysisId), 'scripts/modules/feature_screening.py');
    fs.writeFileSync(
      modulePath,
      [
        '"""Processed-expression feature screening helpers with explicit non-confirmatory semantics."""',
        '',
        'def screen_processed_expression(adata, response_column):',
        '    """Screen features for the analysis."""',
        '    return adata, response_column',
        '',
      ].join('\n'),
      'utf8'
    );

    const preflight = (await handleAnalysisAction(projectRoot, 'preflight_scripts', {
      analysisId,
      stage: 'exploration',
      contractReceiptId: planReceiptId,
      scriptPaths: [scriptPath],
    })) as ActionResult & { status?: string; violations?: string[] };

    expect(preflight.status).toBe('needs_revision');
    expect(preflight.violations?.join('\n')).toContain(
      'Public helper function documentation must describe inputs, outputs, assumptions, and scientific/reproducibility decision'
    );
  });

  it('rejects completed annotation modules with unregistered marker provenance', async () => {
    const analysisId = 'bad-marker-provenance';
    const envRoot = path.join(projectRoot, 'runtime-root');
    const fakePython = path.join(envRoot, 'environments', 'official', 'sc-py-singlecell', 'bin', 'python');
    fs.mkdirSync(path.dirname(fakePython), { recursive: true });
    fs.writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
    fs.chmodSync(fakePython, 0o755);
    process.env.OPENBIOSCIENCE_ENV_ROOT = envRoot;
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_exploration', { analysisId })) as ActionResult;
    const planReceiptId = store(plan);
    const scriptPath = writeExplorationScriptPackage(analysisId, planReceiptId);
    const manifestPath = path.join(projectRoot, explorationRootFor(analysisId), 'scripts/script_manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      resourceProvenance?: { markerResources?: Array<Record<string, unknown>> };
    };
    if (manifest.resourceProvenance?.markerResources?.[0]) {
      manifest.resourceProvenance.markerResources[0].resourceId = 'unregistered_marker_resource.v1';
      manifest.resourceProvenance.markerResources[0].resourcePath = 'resources/bio/markers/unregistered.v1.jsonl';
    }
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    const preflight = (await handleAnalysisAction(projectRoot, 'preflight_scripts', {
      analysisId,
      stage: 'exploration',
      contractReceiptId: planReceiptId,
      scriptPaths: [scriptPath],
    })) as ActionResult & { status?: string; violations?: string[] };

    expect(preflight.status).toBe('needs_revision');
    expect(preflight.violations?.join('\n')).toContain(
      'must reference an available local marker package from bio_knowledge.search_atlas'
    );
    expect(preflight.violations?.join('\n')).toContain('resourcePath does not resolve to a readable local marker file');
  });

  it('blocks exploration completion when the output manifest points outside the canonical stage tree', async () => {
    const analysisId = 'free-explore-bad-output';
    const envRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-env-'));
    const fakePython = path.join(envRoot, 'environments', 'official', 'sc-py-singlecell', 'bin', 'python');
    fs.mkdirSync(path.dirname(fakePython), { recursive: true });
    fs.writeFileSync(fakePython, '#!/usr/bin/env sh\nexit 0\n', 'utf8');
    fs.chmodSync(fakePython, 0o755);
    process.env.OPENBIOSCIENCE_ENV_ROOT = envRoot;
    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input',
        modality: 'scrna_seq',
      })) as ActionResult
    );
    const plan = (await handleAnalysisAction(projectRoot, 'prepare_exploration', { analysisId })) as ActionResult;
    const planReceiptId = store(plan);
    const scriptPath = writeExplorationScriptPackage(analysisId, planReceiptId);
    const preflight = (await handleAnalysisAction(projectRoot, 'preflight_scripts', {
      analysisId,
      stage: 'exploration',
      contractReceiptId: planReceiptId,
      scriptPaths: [scriptPath],
    })) as ActionResult & { status?: string; violations?: string[] };
    expect(preflight.status).toBe('ready');
    const preflightReceiptId = store(preflight);
    const canonicalFilePaths = writeExplorationOutputs(analysisId);
    fs.writeFileSync(
      path.join(projectRoot, `omics_analysis/${analysisId}/exploration/results/output_manifest.json`),
      JSON.stringify(
        {
          schema: 'openbioscience.analysis_script.outputs.v2',
          outputs: { reports: ['/workspace/openbioscience/output/free-explore-bad-output/analysis_report.md'] },
        },
        null,
        2
      ),
      'utf8'
    );

    await expect(
      handleAnalysisAction(projectRoot, 'complete_exploration', {
        analysisId,
        stagePlanReceiptId: planReceiptId,
        scriptPreflightReceiptId: preflightReceiptId,
        canonicalFilePaths,
        summary: { expressionSemantics: 'processed_log_normalized_like' },
      })
    ).rejects.toThrow('output manifest declares non-canonical outputs');
  });

  it('completes the synthetic 10x scRNA-seq lifecycle without automatic deep analysis', async () => {
    acceptAllCheckpoints();
    const analysisId = 'synthetic-10x';
    const inputRoot = path.join(projectRoot, 'private-input', 'synthetic-10x');
    fs.mkdirSync(inputRoot, { recursive: true });
    fs.writeFileSync(
      path.join(inputRoot, 'matrix.mtx'),
      '%%MatrixMarket matrix coordinate integer general\n3 2 4\n1 1 1\n2 1 3\n2 2 2\n3 2 4\n'
    );
    fs.writeFileSync(path.join(inputRoot, 'barcodes.tsv'), 'cell-a\ncell-b\n');
    fs.writeFileSync(
      path.join(inputRoot, 'features.tsv'),
      'gene-a\tGENEA\tGene Expression\ngene-b\tGENEB\tGene Expression\ngene-c\tGENEC\tGene Expression\n'
    );
    fs.writeFileSync(
      path.join(inputRoot, 'metadata.tsv'),
      'cell_id\tsample\tcondition\ncell-a\ts1\tcontrol\ncell-b\ts2\tcase\n'
    );

    store(
      (await handleAnalysisAction(projectRoot, 'start_analysis', {
        analysisId,
        inputRoot: 'private-input/synthetic-10x',
        modality: 'scrna_seq',
      })) as ActionResult
    );

    const intakePlan = (await handleAnalysisAction(projectRoot, 'prepare_intake', { analysisId })) as ActionResult;
    const intake = (await handleAnalysisAction(projectRoot, 'complete_intake', {
      analysisId,
      stagePlanReceiptId: store(intakePlan),
      canonicalFilePaths: writeIntakeOutputs(analysisId),
      datasetUnits: [
        {
          id: 'synthetic-unit',
          inputPaths: [
            'private-input/synthetic-10x/matrix.mtx',
            'private-input/synthetic-10x/barcodes.tsv',
            'private-input/synthetic-10x/features.tsv',
            'private-input/synthetic-10x/metadata.tsv',
          ],
          modality: 'scrna_seq',
          mergeWithOtherUnits: false,
        },
      ],
      supportedAnalyses: ['scrna_baseline'],
    })) as ActionResult;
    store(intake);
    store(
      (await handleAnalysisAction(projectRoot, 'request_checkpoint', { analysisId, stage: 'intake' })) as ActionResult
    );

    const qcPlan = (await handleAnalysisAction(projectRoot, 'prepare_qc', { analysisId })) as ActionResult;
    const qc = (await handleAnalysisAction(projectRoot, 'complete_qc', {
      analysisId,
      stagePlanReceiptId: store(qcPlan),
      datasetUnitId: 'synthetic-unit',
      canonicalFilePaths: writeStageOutputs(analysisId, 'qc'),
      summary: { retainedCells: 2, retainedGenes: 3 },
    })) as ActionResult;
    store(qc);
    store((await handleAnalysisAction(projectRoot, 'request_checkpoint', { analysisId, stage: 'qc' })) as ActionResult);

    const baselinePlan = (await handleAnalysisAction(projectRoot, 'prepare_baseline', { analysisId })) as ActionResult;
    const baseline = (await handleAnalysisAction(projectRoot, 'complete_baseline', {
      analysisId,
      stagePlanReceiptId: store(baselinePlan),
      datasetUnitId: 'synthetic-unit',
      annotationMode: 'assisted_prior',
      canonicalFilePaths: writeStageOutputs(analysisId, 'baseline'),
      candidateEpisodes: ['condition-differential-expression', 'composition-review', 'lineage-refinement'],
      summary: { minorSubclustering: { executed: false }, differentialExpression: { executed: false } },
    })) as ActionResult;
    const baselineReceiptId = store(baseline);
    const baselineSummary = baseline.receipt as unknown as { summary: Record<string, unknown> };
    expect(baselineSummary.summary.autoExecution).toBe(false);
    expect(baselineSummary.summary.candidateEpisodes).toHaveLength(3);
    expect(baselineSummary.summary.differentialExpression).toEqual({ executed: false });
    expect(baselineSummary.summary.minorSubclustering).toEqual({ executed: false });
    store(
      (await handleAnalysisAction(projectRoot, 'request_checkpoint', { analysisId, stage: 'baseline' })) as ActionResult
    );

    const episodePlan = (await handleAnalysisAction(projectRoot, 'prepare_episode', {
      analysisId,
      episodeId: 'synthetic-episode',
      parentReceiptId: baselineReceiptId,
      scientificQuestion: 'Is the observed composition compatible with the declared sample groups?',
      datasetUnitId: 'synthetic-unit',
      dataSubset: 'all cells',
      comparisonGroups: [],
      covariates: [],
      replicateUnit: 'sample',
      method: 'descriptive composition review',
      expectedOutputs: ['results/tables/composition.tsv'],
      stoppingConditions: ['No unreviewed result remains.'],
    })) as ActionResult;
    const episode = (await handleAnalysisAction(projectRoot, 'complete_episode', {
      analysisId,
      episodeId: 'synthetic-episode',
      stagePlanReceiptId: store(episodePlan),
      canonicalFilePaths: writeStageOutputs(analysisId, 'episode', 'synthetic-episode'),
      summary: { inference: false },
    })) as ActionResult;
    store(episode);
    store(
      (await handleAnalysisAction(projectRoot, 'request_checkpoint', {
        analysisId,
        stage: 'episode',
        episodeId: 'synthetic-episode',
      })) as ActionResult
    );

    const closure = (await handleAnalysisAction(projectRoot, 'prepare_closure', {
      analysisId,
      coverage: { datasets: true, qc: true, baseline: true, episodes: true, limitations: true },
    })) as ActionResult;
    const closed = (await handleAnalysisAction(projectRoot, 'close_analysis', {
      analysisId,
      closureReceiptId: store(closure),
      canonicalFilePaths: writeStageOutputs(analysisId, 'closing'),
      summary: { acceptedEpisodes: ['synthetic-episode'] },
    })) as ActionResult;
    expect((closed.receipt as unknown as { projectStatus: string }).projectStatus).toBe('closed');
  });
});
