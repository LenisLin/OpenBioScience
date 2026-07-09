args <- commandArgs(trailingOnly = TRUE)

arg_value <- function(flag) {
  index <- match(flag, args)
  if (is.na(index) || index == length(args)) {
    return("")
  }
  args[[index + 1]]
}

packages <- c(
  "jsonlite",
  "survival",
  "survminer",
  "rms",
  "broom",
  "forestplot",
  "tableone",
  "MatchIt",
  "gtsummary",
  "GenomicDataCommons",
  "TCGAbiolinks",
  "SummarizedExperiment"
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
  smoke <- list(status = "passed", survivalObject = as.character(survival::Surv(c(1, 2), c(1, 0))[1]))
}

result <- list(
  schema = "openbioscience.env_probe.result.v1",
  environmentRef = arg_value("--environment-ref"),
  prefix = arg_value("--prefix"),
  status = if (any(missing)) "failed" else "passed",
  packages = results,
  smoke = smoke
)

cat(jsonlite::toJSON(result, auto_unbox = TRUE, null = "null"))
if (any(missing)) {
  quit(status = 1)
}
