# Lightweight Localization Policy

Use this reference before saving external source material into `planning/localized/`.
Localization is optional and restricted.
It is for planning evidence packages, not large data acquisition.

## Default Allowed

Allowed without additional approval when public, small, and license/terms are acceptable:
- paper PDF
- supplementary PDF, DOCX, XLSX, CSV, TSV, TXT, JSON, YAML, or small archives
- repository README, LICENSE, CITATION, environment files, config files, and script index
- small scripts from public GitHub or GitLab repositories
- Zenodo, Figshare, OSF, GEO, ArrayExpress, SRA, or EGA metadata manifests
- small tables that document sample metadata, figure data, or file indexes

## Default Blocked

Do not localize by default:
- FASTQ, BAM, CRAM, SRA, fragments, BCL, or other raw sequencing data
- raw microscopy, whole-slide imaging, or large spatial image files
- controlled-access data
- credentialed, token, cookie, login, or institution-gated data
- data with unclear license, terms, consent, or redistribution boundaries
- executable binaries or installer archives
- arbitrary repository clones when only an index is needed

## Size Limit

- Single-file default limit: 50 MB.
- Files above 50 MB require explicit user approval and should usually become `planned_only`.
- Prefer metadata, manifests, and download plans over raw data localization.

## URL Safety

Only allow public HTTP or HTTPS URLs.
Reject:
- localhost and loopback addresses
- private IP ranges
- link-local or internal network hosts
- file URLs
- shell commands embedded in URLs
- URLs requiring credentials, cookies, tokens, or interactive login

## Path Safety

- `outputDir` must be inside the allowed case planning directory.
- Do not overwrite existing files by default.
- Normalize paths before writing.
- Reject path traversal and symlink escapes.
- Record relative paths in the plan when possible.

## Required Localization Record

For every attempted localized item, record:
- source URL or source identifier
- local path
- content type when known
- size in bytes when known
- sha256 when downloaded
- download or copy status
- blocked reason when blocked
- timestamp

## Planning Status Mapping

| Condition | Status |
| --- | --- |
| Small allowed source saved | `ready` |
| Metadata available but raw file blocked | `planned_only` |
| File too large without approval | `blocked_for_localization` |
| Controlled access without authorization | `blocked_for_execution` |
| License or terms unclear | `conditional_continue` or `blocked_for_execution` |
| Unsafe URL or output path | `fatal_block` |
