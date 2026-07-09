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
  current <- normalizePath(dirname(script_path), mustWork = FALSE)
  repeat {
    if (dir.exists(file.path(current, ".git"))) {
      return(current)
    }
    parent <- dirname(current)
    if (identical(parent, current)) {
      return(normalizePath(getwd(), mustWork = FALSE))
    }
    current <- parent
  }
}

require_approved_path <- function(path) {
  roots <- unique(normalizePath(c(
    Sys.getenv("OPENBIOSCIENCE_WORKSPACE_ROOT", ""),
    Sys.getenv("OPENBIOSCIENCE_RUNTIME_ROOT", ""),
    Sys.getenv("OPENSCIENCE_RUNTIME_ROOT", ""),
    Sys.getenv("DEEPORGANISER_WORK_DIR", ""),
    repo_root()
  )[nzchar(c(
    Sys.getenv("OPENBIOSCIENCE_WORKSPACE_ROOT", ""),
    Sys.getenv("OPENBIOSCIENCE_RUNTIME_ROOT", ""),
    Sys.getenv("OPENSCIENCE_RUNTIME_ROOT", ""),
    Sys.getenv("DEEPORGANISER_WORK_DIR", ""),
    repo_root()
  ))], mustWork = FALSE))
  resolved <- normalizePath(path, mustWork = FALSE)
  is_allowed <- any(vapply(roots, function(root) startsWith(resolved, paste0(root, .Platform$file.sep)) || identical(resolved, root), logical(1)))
  if (!is_allowed) {
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
  dirs <- list(root = root, reports = file.path(root, "reports"), tables = file.path(root, "tables"), logs = file.path(root, "logs"))
  invisible(lapply(dirs, dir.create, recursive = TRUE, showWarnings = FALSE))
  dirs
}

config_path <- arg_value("--config")
output_dir <- arg_value("--output-dir", required = TRUE)
config <- read_config(config_path)
config <- workflow_config(config, "run_pseudobulk_de")
counts_path <- resolve_config_path(config$counts_path, config_path)
metadata_path <- resolve_config_path(config$metadata_path, config_path)
if (is.null(counts_path) || is.null(metadata_path)) {
  stop("run_pseudobulk_de requires counts_path and metadata_path")
}

suppressPackageStartupMessages({
  library(jsonlite)
  library(edgeR)
})

paths <- prepare_output(output_dir)
counts <- read.csv(counts_path, row.names = 1, check.names = FALSE)
metadata <- read.csv(metadata_path, row.names = 1, check.names = FALSE)
sample_key <- config$sample_key %||% "sample"
group_key <- config$group_key %||% "condition"
cell_type_key <- config$cell_type_key %||% "cell_type"

cells <- intersect(colnames(counts), rownames(metadata))
counts <- counts[, cells, drop = FALSE]
metadata <- metadata[cells, , drop = FALSE]
grouping <- interaction(metadata[[sample_key]], metadata[[cell_type_key]], drop = TRUE)
pseudobulk <- sapply(split(seq_along(cells), grouping), function(index) rowSums(counts[, index, drop = FALSE]))
pseudobulk <- as.matrix(pseudobulk)
pseudobulk_out <- file.path(paths$tables, "pseudobulk_counts.tsv")
write.table(pseudobulk, pseudobulk_out, sep = "\t", quote = FALSE, col.names = NA)

sample_meta <- unique(metadata[, c(sample_key, group_key, cell_type_key), drop = FALSE])
sample_meta$key <- paste(sample_meta[[sample_key]], sample_meta[[cell_type_key]], sep = ".")
sample_meta <- sample_meta[match(colnames(pseudobulk), sample_meta$key), , drop = FALSE]
groups <- factor(sample_meta[[group_key]])

warnings <- c()
de <- data.frame(gene = rownames(pseudobulk), logFC = NA_real_, pvalue = NA_real_, method = "effect_size_only")
if (length(levels(groups)) == 2 && min(table(groups)) >= 2) {
  y <- DGEList(counts = pseudobulk, group = groups)
  y <- calcNormFactors(y)
  y <- estimateDisp(y)
  fit <- exactTest(y)
  de <- topTags(fit, n = Inf)$table
  de$gene <- rownames(de)
  de$method <- "edgeR_exactTest"
} else {
  warnings <- c(warnings, "Too few biological replicates for edgeR exactTest; emitted mean effect-size table.")
  group_levels <- levels(groups)
  if (length(group_levels) >= 2) {
    left <- rowMeans(pseudobulk[, groups == group_levels[1], drop = FALSE])
    right <- rowMeans(pseudobulk[, groups == group_levels[2], drop = FALSE])
    de$logFC <- log2((right + 1) / (left + 1))
  }
}

de_out <- file.path(paths$tables, "pseudobulk_de.tsv")
write.table(de, de_out, sep = "\t", quote = FALSE, row.names = FALSE)
summary_out <- file.path(paths$reports, "pseudobulk_de_summary.json")
summary <- list(schema = "openbioscience.pseudobulk_de.summary.v1", nGenes = nrow(pseudobulk), nPseudobulkSamples = ncol(pseudobulk), warnings = warnings)
writeLines(jsonlite::toJSON(summary, auto_unbox = TRUE, pretty = TRUE), summary_out)
manifest <- list(schema = "openbioscience.runner_manifest.v1", workflowId = "run_pseudobulk_de", status = "completed", config = config, artifacts = c(summary_out, pseudobulk_out, de_out), warnings = warnings)
writeLines(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE), file.path(paths$root, "run_manifest.json"))
writeLines("run_pseudobulk_de completed", file.path(paths$logs, "pseudobulk_de.log"))
