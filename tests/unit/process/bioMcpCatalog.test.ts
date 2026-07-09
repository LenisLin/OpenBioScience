import { describe, expect, it } from 'vitest';

import {
  BIO_ENVIRONMENTS,
  BIO_MCP_PROFILES,
  BIO_PLOT_TEMPLATES,
  BIO_WORKFLOWS,
  resolveBioProfile,
} from '@/process/resources/builtinMcp/bio/catalog';

describe('OpenBioScience bio MCP catalog', () => {
  it('defines independent control-plane profiles for runtime, source, knowledge, and plot', () => {
    expect(Object.keys(BIO_MCP_PROFILES).sort()).toEqual(['knowledge', 'plot', 'runtime', 'source']);
    expect(BIO_MCP_PROFILES.runtime.toolName).toBe('bio_runtime');
    expect(BIO_MCP_PROFILES.source.toolName).toBe('bio_source');
    expect(BIO_MCP_PROFILES.knowledge.toolName).toBe('bio_knowledge');
    expect(BIO_MCP_PROFILES.plot.toolName).toBe('bio_plot');
  });

  it('uses environmentRef catalog entries without hardcoded development NAS paths', () => {
    expect(BIO_ENVIRONMENTS.map((environment) => environment.id)).toEqual(
      expect.arrayContaining([
        'sc-r-singlecell',
        'sc-py-singlecell',
        'sc-r-plot',
        'sc-r-clinical',
        'sc-cci-r',
        'sc-r-trajectory',
        'sc-network-grn-r',
        'sc-r-tumor-cnv',
      ])
    );
    expect(JSON.stringify(BIO_ENVIRONMENTS)).not.toContain('NAS_21T');
    expect(JSON.stringify(BIO_ENVIRONMENTS)).not.toContain('ProjectData');
  });

  it('keeps workflow and plot contracts separate', () => {
    expect(BIO_WORKFLOWS.map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining([
        'singlecell_import_summary',
        'seurat_qc_preprocess',
        'scrna_plot_figure_set',
        'inspect_input',
        'run_scanpy_core',
        'run_seurat_core',
        'run_pseudobulk_de',
        'run_signature_scoring',
        'run_liana',
      ])
    );
    expect(BIO_PLOT_TEMPLATES.map((template) => template.id)).toEqual(
      expect.arrayContaining(['scrna.embedding.umap.cluster.v1', 'scrna.marker.dotplot.heatmap.v1'])
    );
  });

  it('maps P0 runner workflows to explicit environment refs and scripts', () => {
    const runnerWorkflows = BIO_WORKFLOWS.filter((workflow) => workflow.runner);

    expect(BIO_MCP_PROFILES.runtime.actions).toContain('run_workflow');
    expect(runnerWorkflows.map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining(['inspect_input', 'run_scanpy_core', 'run_seurat_core', 'run_pseudobulk_de'])
    );
    expect(runnerWorkflows.every((workflow) => workflow.runner?.environmentRef)).toBe(true);
    expect(runnerWorkflows.every((workflow) => workflow.runner?.script.startsWith('scripts/'))).toBe(true);
    expect(JSON.stringify(runnerWorkflows)).not.toContain('NAS_21T');
    expect(JSON.stringify(runnerWorkflows)).not.toContain('ProjectData');
  });

  it('defaults missing profile to runtime but rejects invalid non-empty profiles', () => {
    expect(resolveBioProfile(undefined)).toBe('runtime');
    expect(resolveBioProfile('')).toBe('runtime');
    expect(resolveBioProfile('source')).toBe('source');
    expect(() => resolveBioProfile('typo')).toThrow('Invalid OpenBioScience bio MCP profile');
  });
});
