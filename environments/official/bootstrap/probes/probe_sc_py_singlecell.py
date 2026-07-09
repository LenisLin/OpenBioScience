#!/usr/bin/env python3

import argparse
import importlib
import json
import sys
from importlib import metadata


PACKAGE_MODULES = {
    "python": None,
    "numpy": "numpy",
    "pandas": "pandas",
    "scipy": "scipy",
    "anndata": "anndata",
    "scanpy": "scanpy",
    "celltypist": "celltypist",
    "scrublet": "scrublet",
    "gseapy": "gseapy",
    "decoupler": "decoupler",
    "GEOparse": "GEOparse",
    "pysradb": "pysradb",
    "cellphonedb": "cellphonedb",
    "liana": "liana",
}


def version_for(package_name: str, module_name: str | None) -> str | None:
    if package_name == "python":
        return sys.version.split()[0]
    candidates = [package_name]
    if package_name == "GEOparse":
        candidates.append("geoparse")
    for candidate in candidates:
        try:
            return metadata.version(candidate)
        except metadata.PackageNotFoundError:
            pass
    if module_name:
        module = importlib.import_module(module_name)
        return str(getattr(module, "__version__", "unknown"))
    return None


def check_package(package_name: str, module_name: str | None) -> dict[str, str]:
    try:
        if module_name:
            importlib.import_module(module_name)
        version = version_for(package_name, module_name)
        return {"name": package_name, "status": "available", "version": version or "unknown"}
    except Exception as exc:
        return {"name": package_name, "status": "missing", "error": f"{type(exc).__name__}: {exc}"}


def smoke_anndata() -> dict[str, object]:
    import anndata as ad
    import numpy as np
    import pandas as pd

    obj = ad.AnnData(
        X=np.array([[1, 0, 3], [0, 2, 1], [4, 0, 0]], dtype="float32"),
        obs=pd.DataFrame(index=["cell_a", "cell_b", "cell_c"]),
        var=pd.DataFrame(index=["GeneA", "GeneB", "GeneC"]),
    )
    return {"status": "passed", "shape": list(obj.shape)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--environment-ref", required=True)
    parser.add_argument("--prefix", required=True)
    args = parser.parse_args()

    packages = [check_package(name, module) for name, module in PACKAGE_MODULES.items()]
    missing = [package for package in packages if package["status"] != "available"]
    smoke = None
    if not missing:
        smoke = smoke_anndata()

    result = {
        "schema": "openbioscience.env_probe.result.v1",
        "environmentRef": args.environment_ref,
        "prefix": args.prefix,
        "status": "passed" if not missing else "failed",
        "packages": packages,
        "smoke": smoke,
    }
    print(json.dumps(result, separators=(",", ":")))
    return 0 if not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
