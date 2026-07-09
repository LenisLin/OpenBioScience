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
  "ggplot2",
  "ggpubr",
  "patchwork",
  "cowplot",
  "ComplexHeatmap",
  "circlize",
  "pheatmap",
  "EnhancedVolcano",
  "dittoSeq",
  "ggsci",
  "RColorBrewer",
  "viridis",
  "svglite",
  "ragg",
  "Cairo"
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
  smoke <- tryCatch(
    {
      plot_path <- tempfile(fileext = ".svg")
      svglite::svglite(plot_path, width = 2, height = 2)
      print(ggplot2::ggplot(data.frame(x = 1:3, y = c(1, 3, 2)), ggplot2::aes(x, y)) + ggplot2::geom_point())
      grDevices::dev.off()
      file_info <- file.info(plot_path)
      unlink(plot_path, force = TRUE)
      list(status = "passed", contract = "minimal_svg_render", bytes = unname(file_info$size))
    },
    error = function(condition) list(status = "failed", error = conditionMessage(condition))
  )
}

result <- list(
  schema = "openbioscience.env_probe.result.v1",
  environmentRef = arg_value("--environment-ref"),
  prefix = arg_value("--prefix"),
  status = if (any(missing) || identical(smoke$status, "failed")) "failed" else "passed",
  packages = results,
  smoke = smoke
)

cat(jsonlite::toJSON(result, auto_unbox = TRUE, null = "null"))
if (any(missing) || identical(smoke$status, "failed")) {
  quit(status = 1)
}
