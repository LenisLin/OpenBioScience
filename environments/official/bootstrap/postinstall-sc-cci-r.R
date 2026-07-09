required <- c("remotes", "jsonlite")
missing_required <- required[!vapply(required, requireNamespace, logical(1), quietly = TRUE)]
if (length(missing_required) > 0) {
  stop("Missing bootstrap packages: ", paste(missing_required, collapse = ", "))
}

cran_repo <- Sys.getenv("OPENBIOSCIENCE_CRAN_REPO", "https://cloud.r-project.org")
options(repos = c(CRAN = cran_repo))

`%||%` <- function(left, right) {
  if (is.null(left) || length(left) == 0) {
    return(right)
  }
  if (is.atomic(left) && length(left) == 1 && (is.na(left) || !nzchar(as.character(left)))) {
    return(right)
  }
  left
}

script_path <- function() {
  file_arg <- grep("^--file=", commandArgs(FALSE), value = TRUE)
  if (length(file_arg) > 0) {
    return(normalizePath(sub("^--file=", "", file_arg[[1]]), mustWork = FALSE))
  }
  ""
}

default_lock_path <- function() {
  current_script <- script_path()
  if (!nzchar(current_script)) {
    return("")
  }
  official_root <- dirname(dirname(current_script))
  platform <- Sys.getenv("OPENBIOSCIENCE_LOCK_PLATFORM", "linux-64")
  file.path(official_root, "locks", platform, "sc-cci-r.postinstall-lock.json")
}

read_postinstall_lock <- function() {
  configured <- Sys.getenv("OPENBIOSCIENCE_POSTINSTALL_LOCK", default_lock_path())
  if (!nzchar(configured) || !file.exists(configured)) {
    return(list(path = configured, packages = list()))
  }
  payload <- jsonlite::fromJSON(configured, simplifyVector = FALSE)
  list(path = configured, packages = payload$packages %||% list())
}

postinstall_lock <- read_postinstall_lock()

lock_for_package <- function(package) {
  for (item in postinstall_lock$packages) {
    if (identical(item$package, package)) {
      return(item)
    }
  }
  list()
}

github_cache_root <- function() {
  configured <- Sys.getenv("OPENBIOSCIENCE_R_GITHUB_CACHE", "")
  if (nzchar(configured)) {
    return(configured)
  }
  runtime_root <- Sys.getenv("OPENBIOSCIENCE_RUNTIME_ROOT", "")
  if (nzchar(runtime_root)) {
    return(file.path(runtime_root, "cache", "r-github"))
  }
  ""
}

local_tarball_for_repo <- function(repo, ref = "") {
  cache_root <- github_cache_root()
  if (!nzchar(cache_root)) {
    return("")
  }
  base_name <- gsub("/", "_", repo, fixed = TRUE)
  candidates <- character()
  if (nzchar(ref)) {
    candidates <- c(candidates, file.path(cache_root, paste0(base_name, "_", substr(ref, 1, 12), ".tar.gz")))
  }
  candidates <- c(candidates, file.path(cache_root, paste0(base_name, ".tar.gz")))
  for (candidate in candidates) {
    if (file.exists(candidate)) {
      return(candidate)
    }
  }
  candidates[[1]]
}

install_attempt <- function(label, expression) {
  error <- tryCatch(
    {
      force(expression)
      NULL
    },
    error = function(condition) conditionMessage(condition)
  )
  list(label = label, status = if (is.null(error)) "passed" else "failed", error = error)
}

install_from_git_clone <- function(package, repo, git_url, ref = "") {
  destination <- tempfile(pattern = paste0(gsub("[^A-Za-z0-9]+", "_", repo), "_"))
  on.exit(unlink(destination, recursive = TRUE, force = TRUE), add = TRUE)

  clone_args <- c("clone", "--depth", "1", "--filter=blob:none", "--no-hardlinks", git_url, destination)
  clone_output <- suppressWarnings(system2("git", clone_args, stdout = TRUE, stderr = TRUE))
  clone_status <- attr(clone_output, "status")
  if (is.null(clone_status)) {
    clone_status <- 0
  }
  if (!identical(clone_status, 0L) && !identical(clone_status, 0)) {
    stop("git clone failed for ", repo, ":\n", paste(clone_output, collapse = "\n"))
  }
  if (!file.exists(file.path(destination, "DESCRIPTION"))) {
    stop("git clone for ", repo, " did not produce an R package DESCRIPTION.")
  }
  if (nzchar(ref)) {
    checkout_output <- suppressWarnings(system2("git", c("-C", destination, "checkout", "--detach", ref), stdout = TRUE, stderr = TRUE))
    checkout_status <- attr(checkout_output, "status")
    if (is.null(checkout_status)) {
      checkout_status <- 0
    }
    if (!identical(checkout_status, 0L) && !identical(checkout_status, 0)) {
      stop("git checkout failed for ", repo, "@", ref, ":\n", paste(checkout_output, collapse = "\n"))
    }
  }
  remotes::install_local(destination, upgrade = "never", dependencies = c("Depends", "Imports", "LinkingTo"))
}

ensure_cran_package_min <- function(package, version) {
  package_lock <- lock_for_package(package)
  locked_version <- package_lock$version %||% ""
  target_version <- if (nzchar(locked_version)) locked_version else version

  if (requireNamespace(package, quietly = TRUE) &&
    utils::compareVersion(as.character(utils::packageVersion(package)), target_version) >= 0) {
    message("[OpenBioScience] ", package, " already satisfies >= ", target_version)
    return(list(package = package, status = "available", installed = FALSE, error = NULL))
  }

  message("[OpenBioScience] installing ", package, " >= ", target_version, " from CRAN ", cran_repo)
  if (nzchar(locked_version)) {
    attempt <- install_attempt(
      paste0("cran_archive_", package),
      remotes::install_version(package, version = locked_version, repos = cran_repo, upgrade = "never", dependencies = c("Depends", "Imports", "LinkingTo"))
    )
  } else {
    attempt <- install_attempt(
      paste0("cran_", package),
      utils::install.packages(package, dependencies = c("Depends", "Imports", "LinkingTo"))
    )
  }

  if (!requireNamespace(package, quietly = TRUE) ||
    utils::compareVersion(as.character(utils::packageVersion(package)), target_version) < 0) {
    error <- if (is.null(attempt$error)) {
      paste0(package, " did not satisfy >= ", target_version, " after CRAN installation.")
    } else {
      attempt$error
    }
    return(list(package = package, status = "failed", installed = FALSE, attempt = attempt, error = error))
  }

  list(package = package, status = "installed", installed = TRUE, attempt = attempt, error = NULL)
}

install_github_if_missing <- function(package, repo) {
  if (requireNamespace(package, quietly = TRUE)) {
    message("[OpenBioScience] ", package, " already installed")
    return(list(package = package, repo = repo, status = "available", installed = FALSE, attempts = list(), error = NULL))
  }
  package_lock <- lock_for_package(package)
  source_repo <- package_lock$repo %||% repo
  ref <- package_lock$remoteSha %||% package_lock$githubSHA1 %||% package_lock$sourceTarball$archiveRef %||% package_lock$remoteRef %||% ""
  tarball <- local_tarball_for_repo(source_repo, ref)
  expected_tarball_sha256 <- package_lock$sourceTarball$sha256 %||% ""

  attempts <- list()
  if (nzchar(tarball) && file.exists(tarball)) {
    if (nzchar(expected_tarball_sha256)) {
      actual_tarball_sha256 <- as.character(tools::sha256sum(tarball))
      if (!identical(actual_tarball_sha256, expected_tarball_sha256)) {
        stop(
          "Cached tarball checksum mismatch for ", package, ": ", tarball,
          "\nexpected: ", expected_tarball_sha256,
          "\nactual:   ", actual_tarball_sha256
        )
      }
    }
    message("[OpenBioScience] installing ", package, " from cached tarball ", tarball)
    attempts[["local_tarball"]] <- install_attempt(
      "local_tarball",
      remotes::install_local(tarball, upgrade = "never", dependencies = c("Depends", "Imports", "LinkingTo"))
    )
  }

  if (!requireNamespace(package, quietly = TRUE)) {
    label <- if (nzchar(ref)) paste0(source_repo, "@", ref) else source_repo
    message("[OpenBioScience] installing ", package, " from GitHub tarball ", label)
    attempts[["github_tarball"]] <- install_attempt(
      "github_tarball",
      remotes::install_github(source_repo, ref = if (nzchar(ref)) ref else "HEAD", upgrade = "never", dependencies = c("Depends", "Imports", "LinkingTo"))
    )
  }

  if (!requireNamespace(package, quietly = TRUE)) {
    git_url <- paste0("https://github.com/", source_repo, ".git")
    message("[OpenBioScience] installing ", package, " from git clone ", git_url)
    attempts[["git_clone"]] <- install_attempt(
      "git_clone",
      install_from_git_clone(package, source_repo, git_url, ref)
    )
  }

  if (!requireNamespace(package, quietly = TRUE)) {
    errors <- vapply(attempts, function(attempt) {
      if (is.null(attempt$error)) {
        return("")
      }
      paste0(attempt$label, ": ", attempt$error)
    }, character(1))
    errors <- errors[nzchar(errors)]
    error <- if (length(errors) > 0) {
      paste(errors, collapse = " | ")
    } else {
      "Package did not load after installation."
    }
    return(list(package = package, repo = repo, status = "failed", installed = FALSE, attempts = attempts, error = error))
  }
  list(package = package, repo = source_repo, ref = if (nzchar(ref)) ref else NULL, status = "installed", installed = TRUE, attempts = attempts, error = NULL)
}

bootstrap <- list(
  NMF = ensure_cran_package_min("NMF", "0.23.0")
)

installed <- list(
  CellChat = install_github_if_missing("CellChat", "jinworks/CellChat"),
  nichenetr = install_github_if_missing("nichenetr", "saeyslab/nichenetr")
)

cat(jsonlite::toJSON(list(schema = "openbioscience.postinstall.sc_cci_r.v1", postinstallLock = postinstall_lock$path, bootstrap = bootstrap, installed = installed), auto_unbox = TRUE))
if (any(vapply(c(bootstrap, installed), function(item) item$status == "failed", logical(1)))) {
  quit(status = 1)
}
