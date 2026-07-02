#!/usr/bin/env python3
"""
Ask multiple Bianxie chat models to review the DeepScientist desktop pet.

The script intentionally stores only prompts/answers and never prints the API
key. It sends the generated pet preview PNG to visual-review rounds and includes
focused source excerpts for system-review rounds.
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
OUTPUT_JSON = OUTPUT_DIR / "external-model-review.json"
OUTPUT_MD = OUTPUT_DIR / "external-model-review.md"

MODELS = ["gemini-3.1-pro", "gemini-3.5-flash", "claude-opus-4.8"]
PREVIEW_PATH = REPO_ROOT / "output" / "pet-preview" / "deepscientist-pet-states.png"

SOURCE_FILES = [
    "packages/desktop/src/process/pet/petTypes.ts",
    "packages/desktop/src/process/pet/petStateMachine.ts",
    "packages/desktop/src/process/pet/petIdleTicker.ts",
    "packages/desktop/src/process/pet/petEventBridge.ts",
    "packages/desktop/src/process/pet/petManager.ts",
    "packages/desktop/src/renderer/pet/petRenderer.ts",
    "packages/desktop/src/renderer/pet/petHitRenderer.ts",
    "packages/desktop/src/renderer/pages/settings/PetSettings.tsx",
    "scripts/generate-deepscientist-pet-states.js",
]


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def read_source_bundle() -> str:
    sections: list[str] = []
    for rel in SOURCE_FILES:
        path = REPO_ROOT / rel
        text = path.read_text(errors="ignore")
        if len(text) > 11_000:
            text = text[:11_000] + "\n/* ... truncated for review prompt ... */\n"
        sections.append(f"### {rel}\n```ts\n{text}\n```")
    return "\n\n".join(sections)


def image_data_url(path: Path) -> str:
    raw = path.read_bytes()
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def request_chat(model: str, messages: list[dict[str, Any]], api_key: str) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.45,
        "max_tokens": 2600,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:1600]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc

    choice = data.get("choices", [{}])[0]
    message = choice.get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text", "")))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_messages(round_name: str, prompt: str, image_url: str | None = None) -> list[dict[str, Any]]:
    system = (
        "You are a senior product-design and frontend-systems reviewer. "
        "Review with taste, be concrete, and prioritize what should actually change in DeepOrganiser. "
        "Answer in Chinese, but keep code identifiers in English."
    )
    if image_url:
        content: list[dict[str, Any]] = [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": image_url}},
        ]
    else:
        content = [{"type": "text", "text": prompt}]
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": content},
    ]


def main() -> None:
    load_env(ENV_PATH)
    api_key = os.environ.get("BIANXIE_API_KEY")
    if not api_key:
        raise SystemExit("BIANXIE_API_KEY is not set")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_bundle = read_source_bundle()
    preview_url = image_data_url(PREVIEW_PATH)

    rounds = [
        (
            "visual",
            "请评审这组 DeepScientist 桌面宠物 SVG 状态图。目标是：简洁、可爱、品牌化、能在桌面上长期陪伴但不吵。"
            "请重点看：造型是否统一但不单调、每个状态是否可辨识、是否太像普通图标而不像宠物、深浅背景风险、"
            "哪些状态应该重画或微调。请给出优先级明确的建议。",
            preview_url,
        ),
        (
            "system",
            "请阅读下面的桌面宠物系统源代码摘要，评审功能设计和工程实现。重点看：状态机优先级、空闲行为、"
            "鼠标命中/拖拽安全、SVG 加载和 fallback、设置页风格切换、可测试性、可维护性。请指出可以继续完善的地方，"
            "尤其是哪些改动能让宠物更有生命感但不打扰用户。\n\n"
            + source_bundle,
            None,
        ),
        (
            "synthesis",
            "下面同时给你 SVG 预览图和核心源代码摘要。请把自己当成 DeepOrganiser 的设计/工程顾问："
            "提出一个 1-2 天内可实施的改进路线图，以及一个更长期的宠物系统演进方向。"
            "要求：不要泛泛而谈；每条建议都说明用户感知、实现位置、风险。\n\n"
            + source_bundle,
            preview_url,
        ),
    ]

    results: list[dict[str, Any]] = []
    for model in MODELS:
        for idx, (round_name, prompt, maybe_image) in enumerate(rounds, start=1):
            label = f"{model} / round {idx} / {round_name}"
            print(f"calling {label}", flush=True)
            started = time.time()
            try:
                answer = request_chat(model, build_messages(round_name, prompt, maybe_image), api_key)
                ok = True
                error = None
            except Exception as exc:  # noqa: BLE001 - capture external API failure in report
                answer = ""
                ok = False
                error = str(exc)
            elapsed = round(time.time() - started, 2)
            results.append(
                {
                    "model": model,
                    "round": idx,
                    "round_name": round_name,
                    "ok": ok,
                    "elapsed_sec": elapsed,
                    "answer": answer,
                    "error": error,
                }
            )
            print(f"done {label}: ok={ok} elapsed={elapsed}s", flush=True)

    OUTPUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(results)
    print(str(OUTPUT_JSON))
    print(str(OUTPUT_MD))


def write_markdown(results: list[dict[str, Any]]) -> None:
    lines = [
        "# DeepScientist Pet External Model Review",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "Models: `gemini-3.1-pro`, `gemini-3.5-flash`, `claude-opus-4.8`.",
        "Rounds per model: visual review, source/system review, synthesis roadmap.",
        "",
    ]
    for item in results:
        status = "OK" if item["ok"] else "FAILED"
        lines.extend(
            [
                f"## {item['model']} · Round {item['round']} · {item['round_name']} · {status}",
                "",
                f"Elapsed: `{item['elapsed_sec']}s`",
                "",
            ]
        )
        if item["ok"]:
            lines.extend([item["answer"].strip(), ""])
        else:
            lines.extend(["```text", str(item["error"]), "```", ""])
    OUTPUT_MD.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    main()
