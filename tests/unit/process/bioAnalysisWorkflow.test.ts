import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'openbioscience-analysis-'));
    fs.mkdirSync(path.join(projectRoot, 'private-input'), { recursive: true });
    previousGatewayUrl = process.env.DEEPORGANISER_USER_INPUT_URL;
    previousGatewayToken = process.env.DEEPORGANISER_USER_INPUT_TOKEN;
    delete process.env.DEEPORGANISER_USER_INPUT_URL;
    delete process.env.DEEPORGANISER_USER_INPUT_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (previousGatewayUrl == null) delete process.env.DEEPORGANISER_USER_INPUT_URL;
    else process.env.DEEPORGANISER_USER_INPUT_URL = previousGatewayUrl;
    if (previousGatewayToken == null) delete process.env.DEEPORGANISER_USER_INPUT_TOKEN;
    else process.env.DEEPORGANISER_USER_INPUT_TOKEN = previousGatewayToken;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  const store = (result: ActionResult) => {
    if (!result.receipt) throw new Error('Expected a receipt to store.');
    writeReceipt(projectRoot, result.receipt as never);
    return result.receipt.receiptId;
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
