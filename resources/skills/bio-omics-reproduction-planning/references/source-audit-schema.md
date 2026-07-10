# Source Audit Schema

Use this reference when drafting or checking `planning/source_audit.json`.
The audit records availability and provenance for planning.
It does not certify reproducibility.

## Top-Level Shape

```json
{
  "schema": "openbioscience.omics_reproduction.source_audit.v1",
  "caseId": "",
  "createdAt": "",
  "paper": {},
  "data": [],
  "code": [],
  "referenceResources": [],
  "localized": [],
  "plannedOnly": [],
  "warnings": []
}
```

## Status Values

Use these values consistently:

| Status | Meaning |
| --- | --- |
| `ready` | Available and usable for the planned unit |
| `partial_ready` | Some required pieces are usable |
| `conditional_continue` | Planning can continue with explicit caveats |
| `planned_only` | Not localized or executable now, but can be described |
| `blocked_for_localization` | Cannot be safely or automatically localized |
| `blocked_for_execution` | Cannot enter execution with current inputs/capability |
| `unresolved` | Insufficient information to classify |
| `fatal_block` | Stop planning for safety, permissions, or missing core context |

## Paper Object

```json
{
  "title": "",
  "doi": "",
  "pmid": "",
  "preprint": "",
  "sourceUrl": "",
  "localPath": "",
  "supplements": [],
  "methodsLocated": false,
  "dataAvailabilityLocated": false,
  "codeAvailabilityLocated": false,
  "status": "conditional_continue"
}
```

## Data Item

```json
{
  "id": "",
  "kind": "raw_counts|processed_expression|object_file|metadata|raw_sequencing|figure_data|image|other|unknown",
  "modality": "scrna|bulk_rnaseq|spatial|scatac|multiome|proteomics|other|unknown",
  "source": "",
  "accession": "",
  "url": "",
  "localPath": "",
  "sizeBytes": null,
  "access": "public|controlled|credentialed|unknown",
  "licenseOrTerms": "",
  "status": "unresolved",
  "supports": [],
  "blocks": [],
  "notes": ""
}
```

## Code Item

```json
{
  "id": "",
  "repository": "",
  "commitOrRelease": "",
  "license": "",
  "environmentFiles": [],
  "scriptIndex": [],
  "notebooks": [],
  "runnableAsIs": false,
  "status": "unresolved",
  "notes": ""
}
```

## Reference Resource

Reference resources include genomes, annotations, GTF/GFF files, marker databases, gene signatures, ligand-receptor databases, atlases, pretrained models, reference embeddings, and spatial image assets.

```json
{
  "id": "",
  "kind": "genome|annotation|gene_set|marker_database|ligand_receptor|atlas|model|image_resource|other",
  "name": "",
  "version": "",
  "source": "",
  "url": "",
  "localPath": "",
  "status": "unresolved",
  "requiredBy": [],
  "notes": ""
}
```

## Localized Item

```json
{
  "source": "",
  "localPath": "",
  "contentType": "",
  "sizeBytes": 0,
  "sha256": "",
  "localizedAt": "",
  "status": "ready",
  "blockedReason": ""
}
```

## Planned-Only Item

```json
{
  "id": "",
  "reason": "large_file|controlled_access|credential_required|license_unclear|unsafe_url|unsupported_modality|missing_downstream_skill|other",
  "affectedModules": [],
  "affectedClaims": [],
  "requiredAction": ""
}
```

## Warning Item

```json
{
  "severity": "info|warning|error",
  "scope": "",
  "message": "",
  "affectedItems": []
}
```

## Validation Notes

- Every figure, panel, claim, or module in the plan should map to at least one data, code, or reference resource item, or to a planned-only reason.
- Accessibility is not the same as reproducibility.
- Code availability is not the same as runnable code.
- Processed expression cannot support raw-count-dependent claims unless the plan states a justified downgrade.
- Controlled-access resources require explicit user authorization before execution planning can mark them ready.
