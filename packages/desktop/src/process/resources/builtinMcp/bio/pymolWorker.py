"""Headless PyMOL JSONL worker for the OpenBioScience MCP bridge.

The transport intentionally uses only the Python standard library. PyMOL's
embedded interpreter does not ship the MCP SDK, so the Node parent owns MCP
and this process owns one isolated PyMOL session.
"""

from __future__ import annotations

import contextlib
import csv
import io
import json
import os
import re
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import pymol

pymol.finish_launching(["pymol", "-cq"])
from pymol import cmd  # noqa: E402


SESSION_ID = os.environ.get("OPENBIOSCIENCE_PYMOL_SESSION_ID", "default")
CONVERSATION_ID = os.environ.get("OPENSCIENCE_CONVERSATION_ID", "default")
WORK_DIR = Path(os.environ.get("OPENBIOSCIENCE_PYMOL_WORK_DIR", os.getcwd())).resolve()
WORK_DIR.mkdir(parents=True, exist_ok=True)
AUDIT_PATH = WORK_DIR / "pymol-run-audit.jsonl"
SESSION_AUDIT_PATH = WORK_DIR / "pymol-session-audit.jsonl"

revision = 0
object_meta: dict[str, dict[str, Any]] = {}
selection_meta: dict[str, str] = {}
measurement_meta: dict[str, dict[str, Any]] = {}
background = "light"
server_only = False
last_render_path: str | None = None


def now_ms() -> int:
    return int(time.time() * 1000)


def safe_name(value: str, fallback: str = "object") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_.")
    return cleaned or fallback


def audit_command(action: str, payload: dict[str, Any], ok: bool, next_revision: int, error: str = "") -> None:
    with SESSION_AUDIT_PATH.open("a", encoding="utf-8") as handle:
        handle.write(
            json.dumps(
                {
                    "timestamp": now_ms(),
                    "sessionId": SESSION_ID,
                    "conversationId": CONVERSATION_ID,
                    "action": action,
                    "payload": payload,
                    "ok": ok,
                    "revision": next_revision,
                    "error": error,
                },
                ensure_ascii=False,
            )
            + "\n"
        )


def resolve_output(value: str, suffix: str) -> Path:
    name = safe_name(Path(value).name if value else f"pymol-{revision}{suffix}")
    if not name.lower().endswith(suffix):
        name += suffix
    target = (WORK_DIR / name).resolve()
    if WORK_DIR not in target.parents:
        raise ValueError("Output path must stay inside the PyMOL session directory")
    return target


def write_json_artifact(name: str, value: Any) -> dict[str, Any]:
    target = resolve_output(name, ".json")
    target.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "path": str(target),
        "type": "table",
        "mimeType": "application/json",
        "title": target.stem,
    }


def atom_residue_key(atom: Any) -> tuple[str, str, str]:
    return (str(atom.chain or ""), str(atom.resi or ""), str(atom.resn or ""))


def extract_metrics(selection: str) -> dict[str, Any]:
    model = cmd.get_model(f"({selection}) and name CA")
    residues: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for atom in model.atom:
        key = atom_residue_key(atom)
        if key in seen:
            continue
        seen.add(key)
        match = re.match(r"^(-?\d+)([A-Za-z]?)$", key[1])
        residue_number = int(match.group(1)) if match else None
        insertion_code = match.group(2) if match else ""
        residues.append(
            {
                "chain": key[0],
                "residueNumber": residue_number,
                "insertionCode": insertion_code,
                "residueId": key[1],
                "residueName": key[2],
                "plddt": float(atom.b),
            }
        )

    values = [item["plddt"] for item in residues]
    is_plddt = bool(values) and min(values) >= 0 and max(values) <= 100
    result: dict[str, Any] = {
        "selection": selection,
        "chains": sorted({item["chain"] for item in residues}),
        "residueCount": len(residues),
        "residues": residues,
    }
    if is_plddt:
        result["meanPlddt"] = sum(values) / len(values)
        result["veryHighPercent"] = sum(value >= 90 for value in values) / len(values) * 100
        result["veryLowPercent"] = sum(value < 50 for value in values) / len(values) * 100
    return result


def low_confidence_regions(selection: str, threshold: float) -> list[dict[str, Any]]:
    residues = extract_metrics(selection)["residues"]
    regions: list[dict[str, Any]] = []
    active: list[dict[str, Any]] = []

    def flush() -> None:
        if not active:
            return
        regions.append(
            {
                "chain": active[0]["chain"],
                "start": active[0]["residueId"],
                "end": active[-1]["residueId"],
                "length": len(active),
                "meanPlddt": sum(item["plddt"] for item in active) / len(active),
                "residues": [
                    {
                        "chain": item["chain"],
                        "residueId": item["residueId"],
                        "insertionCode": item["insertionCode"],
                    }
                    for item in active
                ],
            }
        )
        active.clear()

    previous_chain: str | None = None
    for residue in residues:
        if residue["chain"] != previous_chain:
            flush()
        if residue["plddt"] < threshold:
            active.append(residue)
        else:
            flush()
        previous_chain = residue["chain"]
    flush()
    return regions


def sibling_confidence(path_value: str | None) -> dict[str, Any]:
    if not path_value:
        return {}
    path = Path(path_value)
    stem = path.stem
    candidates = [
        path.with_name(f"{stem}_summary_confidences.json"),
        path.with_name(f"{stem}_confidences.json"),
        path.with_name(f"{stem}_full_data_0.json"),
        path.with_name(f"{stem}_pae.json"),
    ]
    af3 = re.match(r"(.+)_model_(\d+)$", stem)
    if af3:
        base, index = af3.groups()
        candidates[0:0] = [
            path.with_name(f"{base}_summary_confidences_{index}.json"),
            path.with_name(f"{base}_full_data_{index}.json"),
        ]

    result: dict[str, Any] = {}
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            data = json.loads(candidate.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        container = data[0] if isinstance(data, list) and data and isinstance(data[0], dict) else data
        if not isinstance(container, dict):
            continue
        for source, target in (
            ("iptm", "iptm"),
            ("ptm", "ptm"),
            ("ranking_score", "rankingScore"),
        ):
            value = container.get(source)
            if isinstance(value, (int, float)):
                result[target] = float(value)
        pae = container.get("pae", container.get("predicted_aligned_error"))
        if isinstance(pae, list) and pae:
            flat = [float(value) for row in pae if isinstance(row, list) for value in row if isinstance(value, (int, float))]
            if flat:
                result["meanPae"] = sum(flat) / len(flat)
                result["paePath"] = str(candidate)
    return result


def state_snapshot() -> dict[str, Any]:
    names = cmd.get_object_list()
    objects = []
    for name in names:
        meta = object_meta.get(name, {})
        objects.append(
            {
                "name": name,
                "path": meta.get("path"),
                "visible": bool(cmd.count_atoms(f"visible and model {name}")),
                "representation": meta.get("representation", "cartoon"),
                "color": meta.get("color"),
            }
        )
    return {
        "schema": "openbioscience.pymol.state.v1",
        "sessionId": SESSION_ID,
        "conversationId": CONVERSATION_ID,
        "revision": revision,
        "status": "ready",
        "objects": objects,
        "selections": [
            {"name": name, "expression": expression}
            for name, expression in sorted(selection_meta.items())
        ],
        "measurements": list(measurement_meta.values()),
        "annotations": [],
        "background": background,
        "frame": int(cmd.get_state()),
        "camera": {"pymolView": [float(value) for value in cmd.get_view()]},
        "serverOnly": server_only,
        "renderPath": last_render_path,
        "updatedAt": now_ms(),
    }


def color_by_plddt(selection: str) -> None:
    cmd.set_color("openscience_plddt_very_high", [0.0, 0.325, 0.839])
    cmd.set_color("openscience_plddt_confident", [0.396, 0.796, 0.953])
    cmd.set_color("openscience_plddt_low", [1.0, 0.859, 0.075])
    cmd.set_color("openscience_plddt_very_low", [1.0, 0.49, 0.271])
    cmd.color("openscience_plddt_very_low", f"({selection}) and b < 50")
    cmd.color("openscience_plddt_low", f"({selection}) and b >= 50 and b < 70")
    cmd.color("openscience_plddt_confident", f"({selection}) and b >= 70 and b < 90")
    cmd.color("openscience_plddt_very_high", f"({selection}) and b >= 90")


def read_residue_rows(payload: dict[str, Any]) -> list[dict[str, Any]]:
    inline_rows = payload.get("rows")
    if isinstance(inline_rows, list) and inline_rows:
        return [row for row in inline_rows if isinstance(row, dict)]

    table_path = payload.get("tablePath")
    if not table_path:
        raise ValueError("Either rows or tablePath is required")
    path = Path(str(table_path)).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(str(path))
    if path.suffix.lower() == ".json":
        loaded = json.loads(path.read_text(encoding="utf-8"))
        rows = loaded.get("rows") if isinstance(loaded, dict) else loaded
        if not isinstance(rows, list):
            raise ValueError("Residue JSON table must be a list or an object with rows")
        return [row for row in rows if isinstance(row, dict)]

    delimiter = "\t" if path.suffix.lower() in (".tsv", ".tab") else ","
    with path.open("r", encoding="utf-8", newline="") as handle:
        return [dict(row) for row in csv.DictReader(handle, delimiter=delimiter)]


def residue_value(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return value
    return None


def residue_expression(row: dict[str, Any]) -> tuple[str, str, str]:
    chain = str(residue_value(row, "chain", "chain_id", "Chain") or "").strip()
    residue_id = residue_value(row, "residueId", "residue_id", "resi", "residue")
    if residue_id is None:
        number = residue_value(row, "residueNumber", "residue_number", "position", "pos")
        insertion_code = str(residue_value(row, "insertionCode", "insertion_code", "icode") or "").strip()
        residue_id = f"{number}{insertion_code}" if number not in (None, "") else ""
    residue_id = str(residue_id).strip()
    if not residue_id or not re.match(r"^-?\d+[A-Za-z]?$", residue_id):
        raise ValueError(f"Invalid residue ID for residue-table row: {row}")
    if chain and not re.match(r"^[A-Za-z0-9_.-]+$", chain):
        raise ValueError(f"Invalid chain ID for residue-table row: {row}")
    parts = [f"resi {residue_id}"]
    if chain:
        parts.insert(0, f"chain {chain}")
    return " and ".join(parts), chain, residue_id


def interpolate(left: tuple[float, float, float], right: tuple[float, float, float], fraction: float) -> list[float]:
    return [left[index] + (right[index] - left[index]) * fraction for index in range(3)]


def score_rgb(score: float, low: float, high: float, color_map: str) -> list[float]:
    if color_map == "plddt":
        if score >= 90:
            return [0.0, 0.325, 0.839]
        if score >= 70:
            return [0.396, 0.796, 0.953]
        if score >= 50:
            return [1.0, 0.859, 0.075]
        return [1.0, 0.49, 0.271]

    denominator = high - low
    fraction = 0.5 if denominator == 0 else max(0.0, min(1.0, (score - low) / denominator))
    if color_map == "red_white_blue":
        low_rgb, mid_rgb, high_rgb = (0.75, 0.05, 0.05), (1.0, 1.0, 1.0), (0.05, 0.2, 0.75)
    else:
        low_rgb, mid_rgb, high_rgb = (0.05, 0.2, 0.75), (1.0, 1.0, 1.0), (0.75, 0.05, 0.05)
    if fraction <= 0.5:
        return interpolate(low_rgb, mid_rgb, fraction * 2)
    return interpolate(mid_rgb, high_rgb, (fraction - 0.5) * 2)


def handle(action: str, payload: dict[str, Any]) -> tuple[Any, list[dict[str, Any]], list[str]]:
    global background, last_render_path, server_only
    artifacts: list[dict[str, Any]] = []
    warnings: list[str] = []

    if action == "session":
        operation = str(payload.get("operation", "status"))
        if operation == "reset":
            cmd.reinitialize()
            object_meta.clear()
            selection_meta.clear()
            measurement_meta.clear()
            server_only = False
        elif operation == "close":
            artifacts.append(
                {
                    "path": str(SESSION_AUDIT_PATH),
                    "type": "code",
                    "mimeType": "application/x-ndjson",
                    "title": "PyMOL session audit",
                }
            )
            return {"closing": True}, artifacts, warnings
        return {"version": cmd.get_version(), "operation": operation}, artifacts, warnings

    if action == "load":
        loaded = []
        for index, raw_path in enumerate(payload.get("paths", [])):
            path = Path(str(raw_path)).expanduser().resolve()
            if not path.is_file():
                raise FileNotFoundError(str(path))
            requested_names = payload.get("names") or []
            name = safe_name(str(requested_names[index]) if index < len(requested_names) else path.stem)
            cmd.load(str(path), name)
            cmd.show("cartoon", name)
            object_meta[name] = {"path": str(path), "representation": "cartoon"}
            loaded.append(name)
            artifacts.append(
                {
                    "path": str(path),
                    "type": "protein_structure",
                    "mimeType": "chemical/x-pdb" if path.suffix.lower() in (".pdb", ".ent") else "chemical/x-mmcif",
                    "title": name,
                }
            )
        cmd.orient("all")
        return {"loaded": loaded}, artifacts, warnings

    if action == "display":
        selection = str(payload.get("selection", "all"))
        representation = payload.get("representation")
        if representation:
            cmd.hide("everything", selection)
            cmd.show(str(representation), selection)
            for name in cmd.get_object_list(selection):
                object_meta.setdefault(name, {})["representation"] = representation
        visible = payload.get("visible")
        if visible is True:
            cmd.enable(selection)
        elif visible is False:
            cmd.disable(selection)
        color = payload.get("color")
        if payload.get("colorBy") == "plddt":
            color_by_plddt(selection)
        elif color:
            cmd.color(str(color), selection)
            for name in cmd.get_object_list(selection):
                object_meta.setdefault(name, {})["color"] = str(color)
        requested_background = payload.get("background")
        if requested_background in ("light", "dark", "transparent"):
            background = str(requested_background)
            cmd.bg_color("black" if background == "dark" else "white")
        camera = payload.get("camera")
        if isinstance(camera, dict) and isinstance(camera.get("pymolView"), list) and len(camera["pymolView"]) == 18:
            cmd.set_view(camera["pymolView"])
        return {"selection": selection}, artifacts, warnings

    if action == "select":
        name = safe_name(str(payload.get("name", "selection")), "selection")
        expression = str(payload.get("expression", "none"))
        cmd.select(name, expression)
        selection_meta[name] = expression
        return {"name": name, "count": int(cmd.count_atoms(name))}, artifacts, warnings

    if action == "align":
        mobile = str(payload["mobile"])
        target = str(payload["target"])
        values = cmd.align(mobile, target)
        return {"mobile": mobile, "target": target, "rmsd": float(values[0]), "atoms": int(values[1])}, artifacts, warnings

    if action == "measure":
        name = safe_name(str(payload.get("name", "distance")), "distance")
        selection1 = str(payload["selection1"])
        selection2 = str(payload["selection2"])
        distance = float(cmd.distance(name, selection1, selection2))
        item = {"name": name, "selection1": selection1, "selection2": selection2, "distance": distance}
        measurement_meta[name] = item
        return item, artifacts, warnings

    if action == "metrics":
        selection = str(payload.get("selection", payload.get("name", "all")))
        metrics = extract_metrics(selection)
        path_value = payload.get("path")
        inferred_path = object_meta.get(selection, {}).get("path")
        if not inferred_path and len(object_meta) == 1:
            inferred_path = next(iter(object_meta.values())).get("path")
        metrics.update(sibling_confidence(str(path_value) if path_value else inferred_path))
        threshold = float(payload.get("threshold", 70))
        metrics["lowConfidenceRegions"] = low_confidence_regions(selection, threshold)
        artifacts.append(write_json_artifact(f"metrics-{safe_name(selection)}-{revision + 1}", metrics))
        return metrics, artifacts, warnings

    if action == "apply_residue_table":
        rows = read_residue_rows(payload)
        if not rows:
            raise ValueError("Residue table contains no usable rows")
        selection_name = safe_name(str(payload.get("selectionName", "residue_table")), "residue_table")
        color_map = str(payload.get("colorMap", "blue_white_red"))
        numeric_scores = []
        for row in rows:
            score = residue_value(row, "score", "value", "effect", "metric")
            if isinstance(score, (int, float)):
                numeric_scores.append(float(score))
            elif isinstance(score, str) and score.strip():
                try:
                    numeric_scores.append(float(score))
                except ValueError:
                    pass
        min_score = float(payload.get("minScore")) if payload.get("minScore") is not None else min(numeric_scores, default=0.0)
        max_score = float(payload.get("maxScore")) if payload.get("maxScore") is not None else max(numeric_scores, default=1.0)

        cmd.select(selection_name, "none")
        applied = []
        unmatched = []
        for index, row in enumerate(rows):
            expression, chain, residue_id = residue_expression(row)
            count = int(cmd.count_atoms(expression))
            explicit_color = str(residue_value(row, "color", "pymolColor", "pymol_color") or "").strip()
            score_value = residue_value(row, "score", "value", "effect", "metric")
            color_name = ""
            if explicit_color:
                if not re.match(r"^[A-Za-z][A-Za-z0-9_]*$", explicit_color):
                    raise ValueError(f"Invalid PyMOL color name for residue-table row: {row}")
                color_name = explicit_color
            elif score_value not in (None, ""):
                score = float(score_value)
                color_name = f"openscience_residue_score_{revision + 1}_{index}"
                cmd.set_color(color_name, score_rgb(score, min_score, max_score, color_map))
            if color_name and count:
                cmd.color(color_name, expression)
            if count:
                cmd.select(selection_name, f"{selection_name} or ({expression})")
                applied.append(
                    {
                        "chain": chain,
                        "residueId": residue_id,
                        "selection": expression,
                        "score": float(score_value) if score_value not in (None, "") else None,
                        "color": color_name or None,
                        "atomCount": count,
                        "label": residue_value(row, "label", "variant", "mutation"),
                    }
                )
            else:
                unmatched.append({"chain": chain, "residueId": residue_id, "selection": expression})
        result = {
            "selectionName": selection_name,
            "colorMap": color_map,
            "minScore": min_score,
            "maxScore": max_score,
            "inputRows": len(rows),
            "appliedRows": len(applied),
            "unmatchedRows": len(unmatched),
            "applied": applied,
            "unmatched": unmatched,
        }
        if unmatched:
            warnings.append("Some residue-table rows did not match atoms in the current PyMOL session.")
        artifacts.append(write_json_artifact(f"residue-table-{selection_name}-{revision + 1}", result))
        return result, artifacts, warnings

    if action == "triage":
        directory = Path(str(payload["path"])).expanduser().resolve()
        if not directory.is_dir():
            raise NotADirectoryError(str(directory))
        extensions = {".pdb", ".ent", ".cif", ".mmcif"}
        records = []
        for path in sorted(item for item in directory.iterdir() if item.is_file() and item.suffix.lower() in extensions):
            name = safe_name(path.stem)
            cmd.load(str(path), name)
            object_meta[name] = {"path": str(path), "representation": "cartoon"}
            metrics = extract_metrics(name)
            metrics.update(sibling_confidence(str(path)))
            metrics["name"] = name
            metrics["path"] = str(path)
            records.append(metrics)
        records.sort(key=lambda item: item.get("meanPlddt", float("-inf")), reverse=True)
        result = {"records": records}
        artifacts.append(write_json_artifact(f"triage-{revision + 1}", result))
        return result, artifacts, warnings

    if action == "render":
        width = max(64, min(int(payload.get("width", 800)), 4096))
        height = max(64, min(int(payload.get("height", 600)), 4096))
        ray = bool(payload.get("ray", True))
        target = resolve_output(str(payload.get("outputPath", "")), ".png")
        cmd.png(str(target), width=width, height=height, ray=1 if ray else 0, quiet=1)
        last_render_path = str(target)
        artifact = {"path": str(target), "type": "figure", "mimeType": "image/png", "title": target.stem}
        artifacts.append(artifact)
        return {"path": str(target), "width": width, "height": height, "ray": ray}, artifacts, warnings

    if action == "export":
        export_format = str(payload.get("format", "pse")).lower()
        suffix = ".pse" if export_format == "pse" else f".{export_format}"
        target = resolve_output(str(payload.get("outputPath", "")), suffix)
        if export_format == "pse":
            cmd.save(str(target))
            artifact_type = "run_bundle"
            mime_type = "application/octet-stream"
        else:
            cmd.save(str(target), str(payload.get("selection", "all")))
            artifact_type = "protein_structure"
            mime_type = "chemical/x-pdb" if export_format == "pdb" else "chemical/x-mmcif"
        artifact = {"path": str(target), "type": artifact_type, "mimeType": mime_type, "title": target.stem}
        artifacts.append(artifact)
        return {"path": str(target), "format": export_format}, artifacts, warnings

    if action == "run":
        code = str(payload.get("code", ""))
        if not code.strip():
            raise ValueError("code is required")
        stdout = io.StringIO()
        error_text = ""
        succeeded = True
        server_only = True
        try:
            with contextlib.redirect_stdout(stdout):
                exec(code, {"cmd": cmd})
        except Exception:
            error_text = traceback.format_exc()
            succeeded = False
        finally:
            with AUDIT_PATH.open("a", encoding="utf-8") as handle:
                handle.write(
                    json.dumps(
                        {
                            "timestamp": now_ms(),
                            "sessionId": SESSION_ID,
                            "conversationId": CONVERSATION_ID,
                            "code": code,
                            "stdout": stdout.getvalue(),
                            "error": error_text,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
        warnings.append("Arbitrary Python can create PyMOL-only state; use the server render for visual fidelity.")
        if error_text:
            warnings.append("The Python operation raised an exception after possible partial state changes; inspect result.error.")
        artifacts.append({"path": str(AUDIT_PATH), "type": "code", "mimeType": "application/x-ndjson"})
        return {
            "ok": succeeded,
            "stdout": stdout.getvalue() or ("" if error_text else "OK"),
            "error": error_text or None,
            "auditPath": str(AUDIT_PATH),
        }, artifacts, warnings

    raise ValueError(f"Unsupported action: {action}")


def respond(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


for raw_line in sys.stdin:
    line = raw_line.strip()
    if not line:
        continue
    request_id: Any = None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        action = str(request.get("action", ""))
        payload = request.get("payload") or {}
        if not isinstance(payload, dict):
            raise TypeError("payload must be an object")
        result, artifacts, warnings = handle(action, payload)
        audit_command(action, payload, True, revision + 1)
        revision += 1
        snapshot = state_snapshot()
        respond(
            {
                "id": request_id,
                "ok": True,
                "sessionId": SESSION_ID,
                "revision": revision,
                "state": snapshot,
                "artifacts": artifacts,
                "warnings": warnings,
                "result": result,
            }
        )
        if action == "session" and payload.get("operation") == "close":
            break
    except Exception as error:
        audit_command(action if "action" in locals() else "", payload if "payload" in locals() else {}, False, revision, str(error))
        respond(
            {
                "id": request_id,
                "ok": False,
                "error": str(error),
                "traceback": traceback.format_exc(),
            }
        )

cmd.quit()
