#!/usr/bin/env python3
"""
Ask Bianxie-hosted models to review and improve Paperfold micro-expressions.

The script sends current preview images plus the Paperfold generator excerpt.
It stores model output for audit and never prints the API key.
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
OUTPUT_JSON = OUTPUT_DIR / "paperfold-microexpressions-review.json"
OUTPUT_MD = OUTPUT_DIR / "paperfold-microexpressions-review.md"

PREVIEW_PATH = REPO_ROOT / "output" / "pet-preview" / "pet-style-preview.png"
PREVIEW_48_PATH = REPO_ROOT / "output" / "pet-preview" / "paperfold-rework-48px.png"
GENERATOR_PATH = REPO_ROOT / "scripts" / "generate-new-pet-states.js"

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


def generator_excerpt() -> str:
    text = GENERATOR_PATH.read_text(encoding="utf-8")
    start = text.index("const paperConfigs")
    end = text.index("function obsMark")
    return text[start:end].strip()


def build_messages(prompt: str) -> list[dict[str, Any]]:
    return [
        {
            "role": "system",
            "content": (
                "你是 DeepOrganiser 桌面宠物的 SVG 动效和微表情设计顾问。"
                "请非常具体，避免泛泛审美词。优先考虑 48px 可读性、长期桌面陪伴、不吵、不乱。"
                "可以给 SVG 或 JS 生成器片段，但必须保持简洁。请用中文回答，代码标识保持英文。"
            ),
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


def call(model: str, messages: list[dict[str, Any]], api_key: str) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.35,
        "max_tokens": 9000,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=260) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:2000]
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
    if not PREVIEW_PATH.exists() or not PREVIEW_48_PATH.exists():
        raise SystemExit("Preview images are missing")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    excerpt = generator_excerpt()
    prompt = f"""
这是当前 DeepOrganiser 的 Paperfold 桌面宠物。图片 1 是四种宠物的 108px 状态矩阵，图片 2 是 Paperfold/Observatory/Classic 的 48px 小尺寸检查。

目标：继续修 Paperfold 的微表情，不大改整体轮廓。它应该是“折纸小灵”，不是圆形宠物，也不是文件图标。请重点帮我优化：
1. 每个状态的眼睛、嘴、眉/折线是否有辨识度；
2. 48px 下哪些表情会糊，应该怎样改；
3. 哪些外部装饰应该删除，哪些可以保留；
4. 请给出一套可直接落地的 JS/SVG 片段，尤其是 `paperConfigs`、`paperEyes(...)`、`paperMouth(...)` 或 `paperMark(...)` 的建议。

约束：
- 不要把它改圆；
- 不要增加复杂外部物件；
- 不要让状态靠一堆小配件表达；
- 线条要粗、少、清楚；
- 可以新增 Paperfold 专属 `paperEyes` / `paperMouth`，但不要破坏 Observatory 现有共用 `eyes` / `mouth`。

当前相关生成器代码如下：

```js
{excerpt}
```
"""

    results: list[dict[str, Any]] = []
    for display, api_model in MODEL_RUNS:
        print(f"calling {display} via {api_model}", flush=True)
        started = time.time()
        try:
            answer = call(api_model, build_messages(prompt), key)
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
        "# Paperfold Micro-Expressions Review",
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
