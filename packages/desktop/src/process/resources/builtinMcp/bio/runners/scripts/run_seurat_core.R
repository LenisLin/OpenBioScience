args <- commandArgs(trailingOnly = TRUE)

`%||%` <- function(left, right) {
  if (is.null(left) || length(left) == 0 || !nzchar(as.character(left)[1])) {
    return(right)
  }
  left
}

arg_value <- function(flag, required = FALSE) {
  index <- match(flag, args)
  if (is.na(index) || index == length(args)) {
    if (required) {
      stop("Missing required argument: ", flag)
    }
    return(NULL)
  }
  args[[index + 1]]
}

script_path <- sub("^--file=", "", grep("^--file=", commandArgs(FALSE), value = TRUE)[1])

repo_root <- function() {
  candidates <- c(getwd(), dirname(normalizePath(script_path, mustWork = FALSE)))
  for (start in candidates) {
    current <- normalizePath(start, mustWork = FALSE)
    repeat {
      if (dir.exists(file.path(current, ".git"))) {
        return(current)
      }
      parent <- dirname(current)
      if (identical(parent, current)) {
        break
      }
      current <- parent
    }
  }
  normalizePath(getwd(), mustWork = FALSE)
}

is_under <- function(path, root) {
  path <- normalizePath(path, mustWork = FALSE)
  root <- normalizePath(root, mustWork = FALSE)
  startsWith(path, paste0(root, .Platform$file.sep)) || identical(path, root)
}

approved_roots <- function() {
  roots <- c(
    Sys.getenv("OPENBIOSCIENCE_WORKSPACE_ROOT", ""),
    Sys.getenv("OPENBIOSCIENCE_RUNTIME_ROOT", ""),
    Sys.getenv("OPENSCIENCE_RUNTIME_ROOT", ""),
    Sys.getenv("DEEPORGANISER_WORK_DIR", ""),
    repo_root()
  )
  unique(normalizePath(roots[nzchar(roots)], mustWork = FALSE))
}

require_approved_path <- function(path) {
  resolved <- normalizePath(path, mustWork = FALSE)
  if (!any(vapply(approved_roots(), function(root) is_under(resolved, root), logical(1)))) {
    stop("Path is outside approved OpenBioScience roots: ", resolved)
  }
  resolved
}

read_config <- function(path) {
  if (is.null(path)) {
    return(list())
  }
  if (grepl("\\.json$", path, ignore.case = TRUE)) {
    return(jsonlite::fromJSON(path, simplifyVector = FALSE))
  }
  yaml::read_yaml(path)
}

workflow_config <- function(config, workflow_id) {
  if (is.null(config$workflows) || is.null(config$workflows[[workflow_id]])) {
    return(config)
  }
  base <- config[names(config) != "workflows"]
  utils::modifyList(base, config$workflows[[workflow_id]])
}

resolve_config_path <- function(value, config_path = NULL) {
  if (is.null(value) || !nzchar(value)) {
    return(NULL)
  }
  if (grepl("^([A-Za-z]:)?[\\/]", value)) {
    return(require_approved_path(value))
  }
  if (!is.null(config_path)) {
    by_config <- file.path(dirname(config_path), value)
    if (file.exists(by_config)) {
      return(require_approved_path(by_config))
    }
  }
  require_approved_path(file.path(repo_root(), value))
}

prepare_output <- function(output_dir) {
  root <- require_approved_path(output_dir)
  dirs <- list(
    root = root,
    reports = file.path(root, "reports"),
    tables = file.path(root, "tables"),
    figures = file.path(root, "figures"),
    logs = file.path(root, "logs"),
    objects = file.path(root, "objects")
  )
  invisible(lapply(dirs, dir.create, recursive = TRUE, showWarnings = FALSE))
  dirs
}

write_manifest <- function(paths, workflow_id, config, artifacts, warnings = list()) {
  manifest <- list(
    schema = "openbioscience.runner_manifest.v1",
    workflowId = workflow_id,
    status = "completed",
    config = config,
    artifacts = artifacts,
    warnings = warnings
  )
  writeLines(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE), file.path(paths$root, "run_manifest.json"))
}

config_path <- arg_value("--config")
output_dir <- arg_value("--output-dir", required = TRUE)
config <- read_config(config_path)
config <- workflow_config(config, "run_seurat_core")
counts_path <- resolve_config_path(config$counts_path, config_path)
metadata_path <- resolve_config_path(config$metadata_path, config_path)
if (is.null(counts_path)) {
  stop("run_seurat_core requires counts_path")
}

suppressPackageStartupMessages({
  library(Seurat)
  library(jsonlite)
  library(ggplot2)
})

paths <- prepare_output(output_dir)
counts <- read.csv(counts_path, row.names = 1, check.names = FALSE)
obj <- CreateSeuratObject(counts = as.matrix(counts), project = "openbioscience_smoke")

if (!is.null(metadata_path)) {
  metadata <- read.csv(metadata_path, row.names = 1, check.names = FALSE)
  obj <- AddMetaData(obj, metadata = metadata[colnames(obj), , drop = FALSE])
}

obj <- NormalizeData(obj, verbose = FALSE)
obj <- FindVariableFeatures(obj, nfeatures = min(2000, nrow(obj)), verbose = FALSE)
obj <- ScaleData(obj, features = rownames(obj), verbose = FALSE)
npcs <- max(1, min(2, ncol(obj) - 1, nrow(obj) - 1))
obj <- RunPCA(obj, npcs = npcs, verbose = FALSE)
obj <- FindNeighbors(obj, dims = seq_len(npcs), verbose = FALSE)
obj <- FindClusters(obj, resolution = as.numeric(config$cluster_resolution %||% 0.4), verbose = FALSE)
obj <- tryCatch(RunUMAP(obj, dims = seq_len(npcs), verbose = FALSE), error = function(error) obj)

metadata_out <- file.path(paths$tables, "seurat_metadata.tsv")
write.table(obj@meta.data, metadata_out, sep = "\t", quote = FALSE, col.names = NA)

cluster_key <- "seurat_clusters"
avg <- AverageExpression(obj, assays = DefaultAssay(obj), group.by = cluster_key, verbose = FALSE)[[DefaultAssay(obj)]]
if (is.null(dim(avg))) {
  avg <- matrix(avg, ncol = 1, dimnames = list(names(avg), "all_cells"))
}
if (ncol(avg) == 0) {
  expression <- GetAssayData(obj, assay = DefaultAssay(obj), layer = "data")
  avg <- matrix(
    Matrix::rowMeans(expression),
    ncol = 1,
    dimnames = list(rownames(expression), "all_cells")
  )
}
if (is.null(colnames(avg)) || any(!nzchar(colnames(avg)))) {
  cluster_labels <- sort(unique(as.character(obj@meta.data[[cluster_key]])))
  colnames(avg) <- if (ncol(avg) == length(cluster_labels)) cluster_labels else paste0("cluster_", seq_len(ncol(avg)))
}
marker_table <- data.frame(
  gene = rownames(avg),
  cluster = apply(avg, 1, function(values) colnames(avg)[which.max(values)]),
  max_average_expression = apply(avg, 1, max),
  row.names = NULL
)
markers_out <- file.path(paths$tables, "cluster_markers.tsv")
write.table(marker_table, markers_out, sep = "\t", quote = FALSE, row.names = FALSE)

figure_out <- NULL
if ("umap" %in% names(obj@reductions)) {
  umap <- as.data.frame(Embeddings(obj, "umap"))
  umap$cluster <- obj@meta.data[[cluster_key]]
  figure_out <- file.path(paths$figures, "seurat_umap_clusters.png")
  png(figure_out, width = 900, height = 700, res = 150)
  print(ggplot(umap, aes(UMAP_1, UMAP_2, color = cluster)) + geom_point(size = 2) + theme_classic())
  dev.off()
}

object_out <- file.path(paths$objects, "seurat_core.rds")
saveRDS(obj, object_out)
summary_out <- file.path(paths$reports, "seurat_core_summary.json")
summary <- list(
  schema = "openbioscience.seurat_core.summary.v1",
  nCells = ncol(obj),
  nGenes = nrow(obj),
  clusters = sort(unique(as.character(obj@meta.data[[cluster_key]])))
)
writeLines(jsonlite::toJSON(summary, auto_unbox = TRUE, pretty = TRUE), summary_out)
artifacts <- c(summary_out, metadata_out, markers_out, object_out, figure_out)
write_manifest(paths, "run_seurat_core", config, artifacts[!is.na(artifacts) & nzchar(artifacts)])
writeLines("run_seurat_core completed", file.path(paths$logs, "seurat_core.log"))
