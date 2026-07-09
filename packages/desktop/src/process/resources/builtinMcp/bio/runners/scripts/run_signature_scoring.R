args <- commandArgs(trailingOnly = TRUE)

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
config <- workflow_config(config, "run_signature_scoring")
counts_path <- resolve_config_path(config$counts_path, config_path)
metadata_path <- resolve_config_path(config$metadata_path, config_path)
gene_sets_path <- resolve_config_path(config$gene_sets_path, config_path)
if (is.null(counts_path) || is.null(gene_sets_path)) {
  stop("run_signature_scoring requires counts_path and gene_sets_path")
}

suppressPackageStartupMessages({
  library(jsonlite)
})

paths <- prepare_output(output_dir)
counts <- read.csv(counts_path, row.names = 1, check.names = FALSE)
metadata <- if (!is.null(metadata_path)) read.csv(metadata_path, row.names = 1, check.names = FALSE) else data.frame(row.names = colnames(counts))
gene_sets <- jsonlite::fromJSON(gene_sets_path, simplifyVector = FALSE)

score_rows <- list()
for (signature in names(gene_sets)) {
  signature_genes <- as.character(unlist(gene_sets[[signature]], use.names = FALSE))
  genes <- intersect(signature_genes, rownames(counts))
  values <- if (length(genes) > 0) colMeans(counts[genes, , drop = FALSE]) else rep(NA_real_, ncol(counts))
  score_rows[[signature]] <- data.frame(cell = colnames(counts), signature = signature, score = values, matched_genes = length(genes), row.names = NULL)
}
scores <- do.call(rbind, score_rows)
scores <- merge(scores, cbind(cell = rownames(metadata), metadata), by = "cell", all.x = TRUE)
scores_out <- file.path(paths$tables, "signature_scores.tsv")
write.table(scores, scores_out, sep = "\t", quote = FALSE, row.names = FALSE)

summary_out <- file.path(paths$reports, "signature_scoring_summary.json")
summary <- list(schema = "openbioscience.signature_scoring.summary.v1", signatures = names(gene_sets), nCells = ncol(counts))
writeLines(jsonlite::toJSON(summary, auto_unbox = TRUE, pretty = TRUE), summary_out)
manifest <- list(schema = "openbioscience.runner_manifest.v1", workflowId = "run_signature_scoring", status = "completed", config = config, artifacts = c(summary_out, scores_out), warnings = list())
writeLines(jsonlite::toJSON(manifest, auto_unbox = TRUE, pretty = TRUE), file.path(paths$root, "run_manifest.json"))
writeLines("run_signature_scoring completed", file.path(paths$logs, "signature_scoring.log"))
