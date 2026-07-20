/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

export type BioPlotObjective =
  | 'embedding'
  | 'expression'
  | 'composition'
  | 'differential'
  | 'trajectory'
  | 'communication'
  | 'cnv';

export type BioPlotBackend = 'ggplot_patchwork' | 'complexheatmap_grid' | 'circlize_device';

export type BioPlotRecipeStatus = 'mvp' | 'second_phase' | 'experimental';

export type BioPlotRecipe = {
  id: string;
  objective: BioPlotObjective;
  label: string;
  status: BioPlotRecipeStatus;
  packageName: 'SCpubr' | 'SCP' | 'scRNAtoolVis' | 'plot1cell';
  sourceFunction: string;
  backend: BioPlotBackend;
  environmentRef: string;
  requiredInputs: string[];
  optionalParameters: string[];
  capabilities: string[];
  outputs: string[];
  limitations: string[];
  sourceUrl: string;
};

export type BioPlotSpecValidation = {
  status: 'ready' | 'conditional' | 'blocked';
  recipe?: BioPlotRecipe;
  missingFields: string[];
  warnings: string[];
};

export type BioPlotRenderPlan = {
  recipeId: string;
  objective: BioPlotObjective;
  plotBackend: BioPlotBackend;
  environmentRef: string;
  executeNow: false;
  adapter: {
    packageName: string;
    sourceFunction: string;
    deviceStrategy: 'ggsave_or_patchwork' | 'grid_device_draw' | 'managed_graphics_device';
  };
  requiredOutputs: string[];
  manifestSchema: 'openbioscience.scrna_plot.manifest.v1';
  requiredManifestFields: string[];
  safety: {
    readsOnlyInputObject: true;
    arbitraryRCodeAllowed: false;
    modifiesInputObjectInPlace: false;
  };
};

export const BIO_PLOT_OBJECTIVES: Array<{
  id: BioPlotObjective;
  label: string;
  description: string;
  preferredMvpRecipes: string[];
}> = [
  {
    id: 'embedding',
    label: 'Dimensional reduction and population structure',
    description: 'UMAP, t-SNE, PCA, density overlays, cluster labels, statistic insets, corner axes, and circular layouts.',
    preferredMvpRecipes: ['scp_embedding_stat_inset', 'scrnatoolvis_corner_axes'],
  },
  {
    id: 'expression',
    label: 'Marker and grouped expression',
    description: 'Grouped heatmaps, annotated dotplots, average-expression heatmaps, marker heatmaps, and expression tiles.',
    preferredMvpRecipes: ['scp_group_heatmap', 'scrnatoolvis_annotated_dotplot', 'scrnatoolvis_average_heatmap'],
  },
  {
    id: 'composition',
    label: 'Composition and classification flow',
    description: 'Waffle proportions, alluvial category flows, and group/category composition panels.',
    preferredMvpRecipes: ['scpubr_waffle', 'scpubr_alluvial'],
  },
  {
    id: 'differential',
    label: 'Differential expression visualization',
    description: 'Volcano plots and marker volcano plots from precomputed DE or marker ranking tables.',
    preferredMvpRecipes: ['scpubr_volcano', 'scrnatoolvis_marker_volcano'],
  },
  {
    id: 'trajectory',
    label: 'Trajectory and dynamic expression',
    description: 'Slingshot lineage curves and pseudotime dynamic-expression heatmaps from precomputed trajectory results.',
    preferredMvpRecipes: [],
  },
  {
    id: 'communication',
    label: 'Cell-cell communication',
    description: 'Ligand-receptor dotplots and chord diagrams from precomputed LIANA-style interaction tables.',
    preferredMvpRecipes: [],
  },
  {
    id: 'cnv',
    label: 'Copy-number visualization',
    description: 'inferCNV heatmaps with chromosome/chromosome-arm summaries from precomputed inferCNV outputs.',
    preferredMvpRecipes: [],
  },
];

export const BIO_PLOT_BACKENDS: Array<{
  id: BioPlotBackend;
  label: string;
  exportStrategy: BioPlotRenderPlan['adapter']['deviceStrategy'];
  notes: string[];
}> = [
  {
    id: 'ggplot_patchwork',
    label: 'ggplot/patchwork',
    exportStrategy: 'ggsave_or_patchwork',
    notes: ['Use for ggplot-compatible objects where theme, labels, legends, and patchwork composition remain editable.'],
  },
  {
    id: 'complexheatmap_grid',
    label: 'ComplexHeatmap/grid',
    exportStrategy: 'grid_device_draw',
    notes: ['Open the device explicitly and call grid/ComplexHeatmap draw logic; do not assume ggsave compatibility.'],
  },
  {
    id: 'circlize_device',
    label: 'circlize/device-driven graphics',
    exportStrategy: 'managed_graphics_device',
    notes: ['The export layer owns graphics device lifecycle before layered circular or chord plots are drawn.'],
  },
];

export const BIO_PLOT_RECIPES: BioPlotRecipe[] = [
  {
    id: 'scpubr_volcano',
    objective: 'differential',
    label: 'SCpubr volcano plot',
    status: 'mvp',
    packageName: 'SCpubr',
    sourceFunction: 'SCpubr::do_VolcanoPlot',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['de_table', 'logfc_column', 'pvalue_column'],
    optionalParameters: ['fc_threshold', 'pvalue_threshold', 'label_top_n', 'label_by', 'threshold_lines'],
    capabilities: ['up_down_labels', 'fc_or_significance_label_ranking', 'geom_text_or_label', 'threshold_line_control'],
    outputs: ['figures/differential/*.png', 'figures/differential/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Requires a precomputed DE or marker table; it does not run DE.'],
    sourceUrl: 'https://enblacar.github.io/SCpubr-book/05_downstream_analyses/07_volcanoplot.html',
  },
  {
    id: 'scpubr_waffle',
    objective: 'composition',
    label: 'SCpubr waffle proportion plot',
    status: 'mvp',
    packageName: 'SCpubr',
    sourceFunction: 'SCpubr::do_WafflePlot',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'category_column'],
    optionalParameters: ['fill_by', 'flip', 'tile_size', 'palette', 'category_order'],
    capabilities: ['10x10_percentage_grid', 'direction_flip', 'fixed_named_palette'],
    outputs: ['figures/composition/*.png', 'figures/composition/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Best for a small number of categories; use bar/alluvial when categories are numerous.'],
    sourceUrl: 'https://enblacar.github.io/SCpubr-book/03_proportions/02_waffleplot.html',
  },
  {
    id: 'scpubr_alluvial',
    objective: 'composition',
    label: 'SCpubr alluvial flow plot',
    status: 'mvp',
    packageName: 'SCpubr',
    sourceFunction: 'SCpubr::do_AlluvialPlot',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'start_column', 'end_column'],
    optionalParameters: ['middle_columns', 'fill_by', 'stratum_style', 'flow_mode', 'curve_type', 'label'],
    capabilities: ['multi_level_flow', 'start_or_end_coloring', 'flow_or_alluvium_mode', 'stratum_label_control'],
    outputs: ['figures/composition/*.png', 'figures/composition/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Requires categorical metadata with interpretable levels and manageable level counts.'],
    sourceUrl: 'https://enblacar.github.io/SCpubr-book/03_proportions/03_alluvialplot.html',
  },
  {
    id: 'scp_group_heatmap',
    objective: 'expression',
    label: 'SCP grouped expression heatmap',
    status: 'mvp',
    packageName: 'SCP',
    sourceFunction: 'SCP::GroupHeatmap',
    backend: 'complexheatmap_grid',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'features', 'group_by'],
    optionalParameters: ['split_by', 'scale_mode', 'feature_cluster', 'feature_split', 'annotation_tracks', 'go_annotation'],
    capabilities: ['zscore_raw_or_fc_modes', 'hclust_kmeans_mfuzz', 'feature_split', 'dot_violin_reticle_layers'],
    outputs: ['figures/markers/*.png', 'figures/markers/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['ComplexHeatmap/grid export requires explicit device handling.'],
    sourceUrl: 'https://zhanghao-njmu.github.io/SCP/reference/GroupHeatmap.html',
  },
  {
    id: 'scrnatoolvis_annotated_dotplot',
    objective: 'expression',
    label: 'scRNAtoolVis annotated dotplot',
    status: 'mvp',
    packageName: 'scRNAtoolVis',
    sourceFunction: 'scRNAtoolVis::jjDotPlot',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'features', 'group_by'],
    optionalParameters: ['marker_table', 'split_by', 'gene_tree', 'group_tree', 'tile_mode', 'manual_order'],
    capabilities: ['gene_tree', 'cell_group_tree', 'marker_category_annotation', 'tile_mode', 'split_by'],
    outputs: ['figures/markers/*.png', 'figures/markers/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['scRNAtoolVis license status should be confirmed before redistributing templates beyond API calls.'],
    sourceUrl: 'https://github.com/junjunlab/scRNAtoolVis/wiki/scRNAtoolVis-Version-0.0.4-documentation',
  },
  {
    id: 'scp_embedding_stat_inset',
    objective: 'embedding',
    label: 'SCP embedding with density/stat inset',
    status: 'mvp',
    packageName: 'SCP',
    sourceFunction: 'SCP::CellDimPlot',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'reduction', 'group_by'],
    optionalParameters: ['stat_by', 'stat_plot_type', 'highlight', 'density', 'hexbin', 'trajectory_layer', 'rasterize'],
    capabilities: ['density_layer', 'cluster_pie_ring_bar', 'hexbin', 'highlight', 'paga_velocity_placeholders'],
    outputs: ['figures/embedding/*.png', 'figures/embedding/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Trajectory, PAGA, and velocity layers require precomputed upstream results.'],
    sourceUrl: 'https://zhanghao-njmu.github.io/SCP/reference/CellDimPlot.html',
  },
  {
    id: 'scrnatoolvis_corner_axes',
    objective: 'embedding',
    label: 'scRNAtoolVis corner-axis embedding',
    status: 'mvp',
    packageName: 'scRNAtoolVis',
    sourceFunction: 'scRNAtoolVis::clusterCornerAxes',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'reduction', 'group_by'],
    optionalParameters: ['feature', 'facet_mode', 'shared_axes', 'cluster_circle', 'short_axis_arrows'],
    capabilities: ['corner_axes', 'feature_corner_axes', 'facet_independent_axes', 'cluster_circles'],
    outputs: ['figures/embedding/*.png', 'figures/embedding/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Use for presentation-style embeddings after source reductions and groups are verified.'],
    sourceUrl: 'https://github.com/junjunlab/scRNAtoolVis/wiki/scRNAtoolVis-documentation.',
  },
  {
    id: 'scrnatoolvis_average_heatmap',
    objective: 'expression',
    label: 'scRNAtoolVis average-expression heatmap',
    status: 'mvp',
    packageName: 'scRNAtoolVis',
    sourceFunction: 'scRNAtoolVis::AverageHeatmap',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'features', 'group_by'],
    optionalParameters: ['scale_mode', 'cluster_rows', 'cluster_columns', 'annotation_tracks'],
    capabilities: ['average_expression_heatmap', 'group_order_control', 'annotation_tracks'],
    outputs: ['figures/markers/*.png', 'figures/markers/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Requires verified feature names and expression layer semantics.'],
    sourceUrl: 'https://github.com/junjunlab/scRNAtoolVis/wiki/scRNAtoolVis-documentation.',
  },
  {
    id: 'scrnatoolvis_marker_volcano',
    objective: 'differential',
    label: 'scRNAtoolVis marker volcano',
    status: 'mvp',
    packageName: 'scRNAtoolVis',
    sourceFunction: 'scRNAtoolVis::markerVocalno',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['marker_table', 'cluster_column', 'logfc_column', 'pvalue_column'],
    optionalParameters: ['label_top_n', 'cluster_facets', 'threshold_lines'],
    capabilities: ['cluster_marker_volcano', 'cluster_facets', 'marker_label_control'],
    outputs: ['figures/differential/*.png', 'figures/differential/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Requires precomputed cluster marker statistics.'],
    sourceUrl: 'https://github.com/junjunlab/scRNAtoolVis/wiki/scRNAtoolVis-documentation.',
  },
  {
    id: 'scp_lineage',
    objective: 'trajectory',
    label: 'SCP lineage plot',
    status: 'second_phase',
    packageName: 'SCP',
    sourceFunction: 'SCP::LineagePlot',
    backend: 'ggplot_patchwork',
    environmentRef: 'sc-r-trajectory',
    requiredInputs: ['object_path', 'lineage_result', 'reduction'],
    optionalParameters: ['lineage_ids', 'loess_smoothing', 'trim', 'arrow', 'white_outline', 'whiskers'],
    capabilities: ['multi_lineage', 'loess_smoothing', 'trim_start_end', 'arrows', 'white_outline', 'whiskers'],
    outputs: ['figures/trajectory/*.png', 'figures/trajectory/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Requires precomputed Slingshot lineage or compatible pseudotime object.'],
    sourceUrl: 'https://zhanghao-njmu.github.io/SCP/reference/LineagePlot.html',
  },
  {
    id: 'scp_dynamic_heatmap',
    objective: 'trajectory',
    label: 'SCP dynamic-expression heatmap',
    status: 'second_phase',
    packageName: 'SCP',
    sourceFunction: 'SCP::DynamicHeatmap',
    backend: 'complexheatmap_grid',
    environmentRef: 'sc-r-trajectory',
    requiredInputs: ['object_path', 'dynamic_features', 'pseudotime_column'],
    optionalParameters: ['pseudotime_bins', 'feature_order', 'feature_cluster', 'lineage_intersection', 'go_annotation'],
    capabilities: ['peak_or_valley_ordering', 'pseudotime_bins', 'feature_clustering', 'cell_gene_annotations'],
    outputs: ['figures/trajectory/*.png', 'figures/trajectory/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Requires RunSlingshot/RunDynamicFeatures-style upstream results.'],
    sourceUrl: 'https://zhanghao-njmu.github.io/SCP/reference/DynamicHeatmap.html',
  },
  {
    id: 'scpubr_ligand_receptor',
    objective: 'communication',
    label: 'SCpubr ligand-receptor plot',
    status: 'experimental',
    packageName: 'SCpubr',
    sourceFunction: 'SCpubr::do_LigandReceptorPlot',
    backend: 'circlize_device',
    environmentRef: 'sc-cci-r',
    requiredInputs: ['lr_table', 'sender_column', 'receiver_column'],
    optionalParameters: ['interaction_metric', 'filter_senders', 'filter_receivers', 'rank_by', 'facet_by', 'chord_diagram'],
    capabilities: ['interaction_count', 'sender_receiver_filtering', 'magnitude_specificity_sorting', 'dotplot_or_chord'],
    outputs: ['figures/cci/*.png', 'figures/cci/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Accepts precomputed LIANA-like results only; does not run communication inference.'],
    sourceUrl: 'https://enblacar.github.io/SCpubr-book/05_downstream_analyses/09_ligandreceptorplot.html',
  },
  {
    id: 'scpubr_cnv_heatmap',
    objective: 'cnv',
    label: 'SCpubr CNV heatmap',
    status: 'experimental',
    packageName: 'SCpubr',
    sourceFunction: 'SCpubr::do_CNVHeatmap',
    backend: 'complexheatmap_grid',
    environmentRef: 'sc-r-tumor-cnv',
    requiredInputs: ['object_path', 'infercnv_output', 'chromosome_position_table'],
    optionalParameters: ['chromosome_arm_summary', 'metacell_mapping', 'numeric_annotation', 'threshold_filter'],
    capabilities: ['chromosome_summary', 'chromosome_arm_summary', 'metacell_mapping', 'numeric_annotation'],
    outputs: ['figures/cnv/*.png', 'figures/cnv/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Accepts precomputed inferCNV results only; recipe remains experimental while upstream examples are incomplete.'],
    sourceUrl: 'https://enblacar.github.io/SCpubr-book/05_downstream_analyses/08_cnvheatmap.html',
  },
  {
    id: 'plot1cell_circular',
    objective: 'embedding',
    label: 'plot1cell circular layout',
    status: 'second_phase',
    packageName: 'plot1cell',
    sourceFunction: 'plot1cell::plot_circlize',
    backend: 'circlize_device',
    environmentRef: 'sc-r-plot',
    requiredInputs: ['object_path', 'prepared_circlize_data', 'metadata_tracks'],
    optionalParameters: ['density_contour', 'cluster_labels', 'track_order', 'track_palette'],
    capabilities: ['circular_embedding', 'metadata_tracks', 'density_contours', 'cluster_labels'],
    outputs: ['figures/embedding/*.png', 'figures/embedding/*.pdf', 'tables/figure_panel_manifest.tsv'],
    limitations: ['Do not call Install.example; use user-provided final objects or precomputed circular data only.'],
    sourceUrl: 'https://github.com/TheHumphreysLab/plot1cell',
  },
];

const fieldValue = (payload: Record<string, unknown>, field: string): unknown => {
  const direct = payload[field];
  if (direct !== undefined && direct !== null && direct !== '') return direct;
  const input = payload.input;
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const value = (input as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  const mapping = payload.mapping;
  if (mapping && typeof mapping === 'object' && !Array.isArray(mapping)) {
    const value = (mapping as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  const data = payload.data;
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const value = (data as Record<string, unknown>)[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

export const findPlotRecipe = (recipeId?: string): BioPlotRecipe | undefined =>
  BIO_PLOT_RECIPES.find((recipe) => recipe.id === recipeId);

export const listPlotRecipes = (filters: {
  objective?: string;
  status?: string;
  backend?: string;
  packageName?: string;
} = {}): BioPlotRecipe[] =>
  BIO_PLOT_RECIPES.filter((recipe) => {
    if (filters.objective && recipe.objective !== filters.objective) return false;
    if (filters.status && recipe.status !== filters.status) return false;
    if (filters.backend && recipe.backend !== filters.backend) return false;
    if (filters.packageName && recipe.packageName.toLowerCase() !== filters.packageName.toLowerCase()) return false;
    return true;
  });

export const selectPlotRecipe = (request: {
  objective?: string;
  intent?: string;
  preferredStatus?: string;
  availableInputs?: string[];
}): { selected?: BioPlotRecipe; alternatives: BioPlotRecipe[]; warnings: string[] } => {
  const normalizedIntent = (request.intent || '').toLowerCase();
  const availableInputs = new Set((request.availableInputs || []).map((item) => item.trim()).filter(Boolean));
  let candidates = listPlotRecipes({
    objective: request.objective,
    status: request.preferredStatus,
  });
  if (!candidates.length && request.objective) candidates = listPlotRecipes({ objective: request.objective });
  if (!candidates.length && normalizedIntent) {
    candidates = BIO_PLOT_RECIPES.filter((recipe) =>
      [recipe.id, recipe.label, recipe.objective, recipe.packageName, recipe.sourceFunction, ...recipe.capabilities]
        .join(' ')
        .toLowerCase()
        .includes(normalizedIntent)
    );
  }
  const scored = candidates
    .map((recipe) => {
      const availableRequired = recipe.requiredInputs.filter((field) => availableInputs.has(field)).length;
      const statusScore = recipe.status === 'mvp' ? 30 : recipe.status === 'second_phase' ? 10 : 0;
      const intentScore = normalizedIntent && recipe.label.toLowerCase().includes(normalizedIntent) ? 20 : 0;
      return { recipe, score: availableRequired * 5 + statusScore + intentScore };
    })
    .sort((left, right) => right.score - left.score || left.recipe.id.localeCompare(right.recipe.id));
  const selected = scored[0]?.recipe;
  return {
    selected,
    alternatives: scored.slice(1, 4).map((item) => item.recipe),
    warnings: selected ? [] : [`No plot recipe matched objective "${request.objective || '<missing>'}".`],
  };
};

export const validatePlotSpec = (spec: Record<string, unknown>): BioPlotSpecValidation => {
  const recipeId =
    typeof spec.recipe === 'string'
      ? spec.recipe
      : typeof spec.recipeId === 'string'
        ? spec.recipeId
        : typeof spec.templateId === 'string'
          ? spec.templateId
          : '';
  const recipe = findPlotRecipe(recipeId) || selectPlotRecipe({ objective: String(spec.objective || '') }).selected;
  if (!recipe) {
    return {
      status: 'blocked',
      missingFields: ['recipe'],
      warnings: [`Unknown recipe "${recipeId || '<missing>'}".`],
    };
  }
  const missingFields = recipe.requiredInputs.filter((field) => fieldValue(spec, field) === undefined);
  const warnings: string[] = [];
  const formats = fieldValue(spec, 'formats');
  if (!formats && !spec.export) warnings.push('No export formats were declared; default bundle should include png and pdf.');
  if (recipe.status !== 'mvp') warnings.push(`${recipe.id} is ${recipe.status}; require explicit user-facing limitation text.`);
  return {
    status: missingFields.length ? 'conditional' : 'ready',
    recipe,
    missingFields,
    warnings,
  };
};

const deviceStrategyForBackend = (backend: BioPlotBackend): BioPlotRenderPlan['adapter']['deviceStrategy'] => {
  const backendSpec = BIO_PLOT_BACKENDS.find((item) => item.id === backend);
  return backendSpec?.exportStrategy || 'ggsave_or_patchwork';
};

export const renderPlanForSpec = (spec: Record<string, unknown>): {
  validation: BioPlotSpecValidation;
  renderPlan?: BioPlotRenderPlan;
} => {
  const validation = validatePlotSpec(spec);
  const recipe = validation.recipe;
  if (!recipe) return { validation };
  return {
    validation,
    renderPlan: {
      recipeId: recipe.id,
      objective: recipe.objective,
      plotBackend: recipe.backend,
      environmentRef: recipe.environmentRef,
      executeNow: false,
      adapter: {
        packageName: recipe.packageName,
        sourceFunction: recipe.sourceFunction,
        deviceStrategy: deviceStrategyForBackend(recipe.backend),
      },
      requiredOutputs: recipe.outputs,
      manifestSchema: 'openbioscience.scrna_plot.manifest.v1',
      requiredManifestFields: [
        'inputObjectSummary',
        'recipe',
        'actualRFunction',
        'parameters',
        'packageVersions',
        'rVersion',
        'seed',
        'warnings',
        'outputFiles',
        'sampling',
        'dataModified',
      ],
      safety: {
        readsOnlyInputObject: true,
        arbitraryRCodeAllowed: false,
        modifiesInputObjectInPlace: false,
      },
    },
  };
};
