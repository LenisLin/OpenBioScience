#!/usr/bin/env python3
"""
Ask Bianxie-hosted models for a final Paperfold micro-expression sanity check.
"""

from __future__ import annotations

import base64
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = Path("/Users/yixuan/files/safe_deepscientist/.env")
BIANXIE_BASE_URL = "https://api.bianxie.ai/v1"
OUTPUT_DIR = REPO_ROOT / "output" / "pet-review"
OUTPUT_JSON = OUTPUT_DIR / "paperfold-microexpressions-verify.json"
OUTPUT_MD = OUTPUT_DIR / "paperfold-microexpressions-verify.md"
PREVIEW_PATH = REPO_ROOT / "output" / "pet-preview" / "pet-style-preview.png"
PREVIEW_48_PATH = REPO_ROOT / "output" / "pet-preview" / "paperfold-rework-48px.png"

MODEL_RUNS = [
    ("gemini-3.1-pro", "gemini-3.1-pro-preview"),
    ("gemini-3.5-flash", "gemini-3.5-flash"),
    ("claude-opus-4.8", "claude-opus-4-8"),
]


def load_env(path: Path) -> None:
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def image_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def messages() -> list[dict[str, Any]]:
    prompt = """
这是更新后的 Paperfold 微表情版本。第一张是 108px 状态矩阵，第二张是 48px 检查。

请只做最终验收，不要展开泛泛设计理论：
1. Paperfold 的微表情在 48px 是否比上一版更清楚？
2. 哪 1-3 个状态仍然必须修改？如果没有必须修改，请明确说“可以进入实现”。
3. 如果要改，请给非常小的 SVG/JS 片段建议，不要整体重写。

目标仍然是：折纸小灵、清爽、长期桌面陪伴、不圆、不像文件图标。
"""
    return [
        {
            "role": "system",
            "content": "你是严格但克制的 DeepOrganiser SVG 桌面宠物验收评审。用中文回答，优先给可执行结论。",
        },
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": image_url(PREVIEW_PATH)}},
                {"type": "image_url", "image_url": {"url": image_url(PREVIEW_48_PATH)}},
            ],
        },
    ]


def call(model: str, api_key: str) -> str:
    payload = {
        "model": model,
        "messages": messages(),
        "temperature": 0.25,
        "max_tokens": 3000,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=220) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:1800]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    return str(data.get("choices", [{}])[0].get("message", {}).get("content") or "").strip()


def main() -> None:
    load_env(ENV_PATH)
    key = os.environ.get("BIANXIE_API_KEY")
    if not key:
        raise SystemExit("BIANXIE_API_KEY is not set")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    results: list[dict[str, Any]] = []
    for display, api_model in MODEL_RUNS:
        print(f"calling {display} via {api_model}", flush=True)
        started = time.time()
        try:
            answer = call(api_model, key)
            ok = bool(answer)
            error = None if ok else "empty response"
        except Exception as exc:  # noqa: BLE001
            answer = ""
            ok = False
            error = str(exc)
        elapsed = round(time.time() - started, 2)
        print(f"done {display}: ok={ok} elapsed={elapsed}s", flush=True)
        results.append(
            {
                "display_model": display,
                "api_model": api_model,
                "ok": ok,
                "elapsed_sec": elapsed,
                "answer": answer,
                "error": error,
            }
        )

    OUTPUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# Paperfold Micro-Expressions Verify",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
    ]
    for item in results:
        status = "OK" if item["ok"] else "FAILED"
        lines.extend([f"## {item['display_model']} via {item['api_model']} · {status}", "", f"Elapsed: `{item['elapsed_sec']}s`", ""])
        if item["ok"]:
            lines.extend([item["answer"], ""])
        else:
            lines.extend(["```text", str(item["error"]), "```", ""])
    OUTPUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(str(OUTPUT_JSON))
    print(str(OUTPUT_MD))


if __name__ == "__main__":
    main()
