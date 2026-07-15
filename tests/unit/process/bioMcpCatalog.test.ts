import { describe, expect, it } from 'vitest';

import {
  BIO_ENVIRONMENTS,
  BIO_MCP_PROFILES,
  BIO_PLOT_TEMPLATES,
  BIO_WORKFLOWS,
  resolveBioProfile,
} from '@/process/resources/builtinMcp/bio/catalog';

describe('OpenBioScience bio MCP catalog', () => {
  it('defines independent control-plane profiles including statistical validation', () => {
    expect(Object.keys(BIO_MCP_PROFILES).toSorted()).toEqual([
      'analysis',
      'environment_manager',
      'knowledge',
      'plot',
      'reproduction',
      'runtime',
      'source',
      'statistics',
    ]);
    expect(BIO_MCP_PROFILES.runtime.toolName).toBe('bio_runtime');
    expect(BIO_MCP_PROFILES.source.toolName).toBe('bio_source');
    expect(BIO_MCP_PROFILES.source.actions).toContain('index_paper_sources');
    expect(BIO_MCP_PROFILES.runtime.actions).toContain('record_execution');
    expect(BIO_MCP_PROFILES.knowledge.toolName).toBe('bio_knowledge');
    expect(BIO_MCP_PROFILES.plot.toolName).toBe('bio_plot');
    expect(BIO_MCP_PROFILES.reproduction.toolName).toBe('bio_reproduction');
    expect(BIO_MCP_PROFILES.analysis).toMatchObject({
      serverName: 'openscience-bio-analysis',
      toolName: 'bio_analysis',
    });
    expect(BIO_MCP_PROFILES.analysis.actions).toEqual([
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
    ]);
    expect(BIO_MCP_PROFILES.statistics.toolName).toBe('bio_statistics');
    expect(BIO_MCP_PROFILES.statistics.actions).toEqual([
      'status',
      'validate_expression_contract',
      'validate_de_design',
      'validate_de_outputs',
    ]);
    expect(BIO_MCP_PROFILES.environment_manager.toolName).toBe('bio_environment_manager');
    expect(BIO_MCP_PROFILES.environment_manager.serverName).toBe('openscience-bio-environment-manager');
    expect(BIO_MCP_PROFILES.environment_manager.actions).toEqual([
      'status',
      'create_user_environment',
      'derive_user_environment',
      'register_user_environment',
      'list_user_environments',
    ]);
    expect(BIO_MCP_PROFILES.reproduction.serverName).toBe('openscience-bio-reproduction');
    expect(BIO_MCP_PROFILES.reproduction.actions).toEqual([
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
    ]);
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
    expect(JSON.stringify(BIO_ENVIRONMENTS)).not.toContain('/mnt/NAS');
  });

  it('keeps workflow and plot contracts separate', () => {
    expect(BIO_WORKFLOWS.map((workflow) => workflow.id)).toEqual(
      expect.arrayContaining(['singlecell_import_summary', 'seurat_qc_preprocess', 'scrna_plot_figure_set'])
    );
    expect(BIO_PLOT_TEMPLATES.map((template) => template.id)).toEqual(
      expect.arrayContaining(['scrna.embedding.umap.cluster.v1', 'scrna.marker.dotplot.heatmap.v1'])
    );
  });

  it('defaults missing profile to runtime but rejects invalid non-empty profiles', () => {
    expect(resolveBioProfile(undefined)).toBe('runtime');
    expect(resolveBioProfile('')).toBe('runtime');
    expect(resolveBioProfile('source')).toBe('source');
    expect(resolveBioProfile('reproduction')).toBe('reproduction');
    expect(resolveBioProfile('analysis')).toBe('analysis');
    expect(resolveBioProfile('statistics')).toBe('statistics');
    expect(resolveBioProfile('environment_manager')).toBe('environment_manager');
    expect(() => resolveBioProfile('typo')).toThrow('Invalid OpenBioScience bio MCP profile');
  });
});
