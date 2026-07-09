args <- commandArgs(trailingOnly = TRUE)

arg_value <- function(flag) {
  index <- match(flag, args)
  if (is.na(index) || index == length(args)) {
    return("")
  }
  args[[index + 1]]
}

environment_ref <- arg_value("--environment-ref")
prefix <- arg_value("--prefix")

packages <- c(
  "jsonlite",
  "Seurat",
  "SeuratObject",
  "SingleCellExperiment",
  "SummarizedExperiment",
  "scater",
  "scran",
  "scuttle",
  "DropletUtils",
  "zellkonverter",
  "SingleR",
  "celldex",
  "DESeq2",
  "edgeR",
  "limma",
  "MAST",
  "clusterProfiler",
  "enrichplot",
  "fgsea",
  "GSVA",
  "msigdbr",
  "UCell",
  "GO.db",
  "org.Hs.eg.db",
  "org.Mm.eg.db"
)

probe_package <- function(package) {
  if (!requireNamespace(package, quietly = TRUE)) {
    return(list(name = package, status = "missing"))
  }
  list(name = package, status = "available", version = as.character(utils::packageVersion(package)))
}

results <- lapply(packages, probe_package)
missing <- vapply(results, function(item) item$status != "available", logical(1))

smoke <- NULL
if (!any(missing)) {
  counts <- matrix(c(1, 0, 3, 0, 2, 1, 4, 0, 0), nrow = 3)
  rownames(counts) <- c("GeneA", "GeneB", "GeneC")
  colnames(counts) <- c("cell_a", "cell_b", "cell_c")
  sce <- SingleCellExperiment::SingleCellExperiment(list(counts = counts))
  smoke <- list(status = "passed", shape = dim(sce))
}

result <- list(
  schema = "openbioscience.env_probe.result.v1",
  environmentRef = environment_ref,
  prefix = prefix,
  status = if (any(missing)) "failed" else "passed",
  packages = results,
  smoke = smoke
)

cat(jsonlite::toJSON(result, auto_unbox = TRUE, null = "null"))
if (any(missing)) {
  quit(status = 1)
}
