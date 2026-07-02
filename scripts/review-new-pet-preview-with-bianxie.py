#!/usr/bin/env python3
"""
Ask Bianxie-hosted models to review the generated paperfold/observatory preview.

The script sends the preview image and a concise implementation summary. It
stores responses for audit and never prints the API key.
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
PREVIEW_PATH = REPO_ROOT / "output" / "pet-preview" / "pet-style-preview.png"
PREVIEW_48_PATH = REPO_ROOT / "output" / "pet-preview" / "pet-style-preview-48px.png"
OUTPUT_DIR = REPO_ROOT / "output" / "pet-review"
OUTPUT_JSON = OUTPUT_DIR / "new-pet-preview-review.json"
OUTPUT_MD = OUTPUT_DIR / "new-pet-preview-review.md"

MODEL_RUNS = [
    ("gemini-3.1-pro", "gemini-3.1-pro-preview"),
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


def messages(prompt: str) -> list[dict[str, Any]]:
    user_content: list[dict[str, Any]] = [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": image_url(PREVIEW_PATH)}},
    ]
    if PREVIEW_48_PATH.exists():
        user_content.append({"type": "image_url", "image_url": {"url": image_url(PREVIEW_48_PATH)}})
    return [
        {
            "role": "system",
            "content": (
                "你是 DeepOrganiser 桌面宠物的视觉设计审稿人。请严格评审，不要客套。"
                "关注小尺寸辨识、是否乱、是否可爱、是否和已有风格区分清楚。"
                "用中文回答，给出具体改法。"
            ),
        },
        {
            "role": "user",
            "content": user_content,
        },
    ]


def call(model: str, msgs: list[dict[str, Any]], key: str) -> str:
    payload = {
        "model": model,
        "messages": msgs,
        "temperature": 0.35,
        "max_tokens": 5000,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=220) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:1800]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    content = data.get("choices", [{}])[0].get("message", {}).get("content")
    if isinstance(content, str):
        return content.strip()
    return json.dumps(data, ensure_ascii=False, indent=2)


def main() -> None:
    load_env(ENV_PATH)
    key = os.environ.get("BIANXIE_API_KEY")
    if not key:
        raise SystemExit("BIANXIE_API_KEY is not set")
    if not PREVIEW_PATH.exists():
        raise SystemExit(f"Missing preview: {PREVIEW_PATH}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    prompt = """
这是当前生成出来的桌面宠物风格预览图，包含 Classic、DeepScientist、Paperfold、Observatory 四行。第一张是 108px 代表状态，第二张是 48px 小尺寸可读性检查。

请严格评审：
1. Paperfold 是否太像文件 icon？是否可爱？哪些状态最乱、最该简化？
2. Observatory 是否和 DeepScientist 区分足够？是否太机械、太瘦或不够可爱？
3. 这两套在 108px / 48px 预览中是否仍然可读？
4. 从“长期放在桌面不打扰”的角度，哪些颜色、线条、配件应该减少？
5. 请给出一份优先级明确的修改建议，只列真正应该改的，不要泛泛而谈。

目标：不要乱糟糟；要可爱、清楚、有特色；不要为了状态差异堆装饰。
"""

    results: list[dict[str, Any]] = []
    for display, api_model in MODEL_RUNS:
        print(f"calling {display} via {api_model}", flush=True)
        started = time.time()
        try:
            answer = call(api_model, messages(prompt), key)
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
        "# New Pet Preview Review",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Preview: `{PREVIEW_PATH}`",
        f"48px preview: `{PREVIEW_48_PATH}`",
        "",
    ]
    for item in results:
        status = "OK" if item["ok"] else "FAILED"
        lines.extend(
            [
                f"## {item['display_model']} via {item['api_model']} · {status}",
                "",
                f"Elapsed: `{item['elapsed_sec']}s`",
                "",
            ]
        )
        if item["ok"]:
            lines.extend([item["answer"], ""])
        else:
            lines.extend(["```text", str(item["error"]), "```", ""])
    OUTPUT_MD.write_text("\n".join(lines), encoding="utf-8")
    print(str(OUTPUT_JSON))
    print(str(OUTPUT_MD))


if __name__ == "__main__":
    main()
