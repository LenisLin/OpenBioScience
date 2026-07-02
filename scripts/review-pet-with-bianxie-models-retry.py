#!/usr/bin/env python3
"""
Retry the pet review with Bianxie model aliases that are actually routable.

The exact user-requested names `gemini-3.1-pro` and `claude-opus-4.8` are kept
as display names in the report, while API aliases are recorded explicitly.
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
OUTPUT_JSON = OUTPUT_DIR / "external-model-review-retry.json"
OUTPUT_MD = OUTPUT_DIR / "external-model-review-retry.md"
PREVIEW_PATH = REPO_ROOT / "output" / "pet-preview" / "deepscientist-pet-states.png"

MODEL_RUNS = [
    ("gemini-3.1-pro", "gemini-3.1-pro-preview"),
    ("gemini-3.5-flash", "gemini-3.5-flash"),
    ("claude-opus-4.8", "claude-opus-4-8"),
]

SOURCE_FILES = [
    "packages/desktop/src/process/pet/petTypes.ts",
    "packages/desktop/src/process/pet/petStateMachine.ts",
    "packages/desktop/src/process/pet/petIdleTicker.ts",
    "packages/desktop/src/process/pet/petEventBridge.ts",
    "packages/desktop/src/renderer/pet/petRenderer.ts",
    "packages/desktop/src/renderer/pet/petHitRenderer.ts",
    "packages/desktop/src/renderer/pages/settings/PetSettings.tsx",
]


def load_env(path: Path) -> None:
    for raw in path.read_text(errors="ignore").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def source_excerpt() -> str:
    sections: list[str] = []
    for rel in SOURCE_FILES:
        text = (REPO_ROOT / rel).read_text(errors="ignore")
        if len(text) > 6000:
            text = text[:6000] + "\n/* truncated */"
        sections.append(f"### {rel}\n```ts\n{text}\n```")
    return "\n\n".join(sections)


def data_url(path: Path) -> str:
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def messages(prompt: str, image: str | None = None) -> list[dict[str, Any]]:
    user_content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    if image:
        user_content.append({"type": "image_url", "image_url": {"url": image}})
    return [
        {
            "role": "system",
            "content": (
                "你是 DeepOrganiser 桌面宠物系统的设计和工程评审专家。"
                "用中文回答，具体、克制、可执行，按优先级组织。"
            ),
        },
        {"role": "user", "content": user_content},
    ]


def call(model: str, msgs: list[dict[str, Any]], key: str) -> str:
    payload = {
        "model": model,
        "messages": msgs,
        "temperature": 0.35,
        "max_tokens": 1800,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode(),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"HTTP {exc.code}: {exc.read().decode(errors='ignore')[:1600]}") from exc
    message = data.get("choices", [{}])[0].get("message", {})
    return str(message.get("content") or "").strip()


def main() -> None:
    load_env(ENV_PATH)
    key = os.environ.get("BIANXIE_API_KEY")
    if not key:
        raise SystemExit("BIANXIE_API_KEY is not set")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    image = data_url(PREVIEW_PATH)
    code = source_excerpt()
    prompts = [
        (
            "visual",
            "请只评审这张 DeepScientist 桌面宠物 SVG 状态预览图。目标是可爱、简洁、品牌化、长期放在桌面不吵。"
            "请列出：1) 最值得保留的视觉资产；2) 最应该重画/微调的状态；3) 如何让它更像宠物而不是状态图标；"
            "4) 深色/浅色壁纸上的风险。请给 P0/P1/P2 建议。",
            image,
        ),
        (
            "system",
            "请评审下面宠物系统代码。重点：状态机优先级、idle 行为、SVG 加载 fallback、眼球跟随、鼠标命中/拖拽安全、"
            "设置页风格选择。请指出还能怎样让它更有生命感但不打扰用户，并标明实现文件。\n\n" + code,
            None,
        ),
        (
            "roadmap",
            "基于下面代码摘要，请给一个 1-2 天可完成的改进路线图：只要 8 条以内，每条包含用户感知、实现位置、风险。"
            "不要重复泛泛的 UI 原则。\n\n" + code[:12_000],
            None,
        ),
    ]

    results: list[dict[str, Any]] = []
    for display, api_model in MODEL_RUNS:
        for idx, (round_name, prompt, image_url) in enumerate(prompts, start=1):
            print(f"calling {display} via {api_model} round {idx} {round_name}", flush=True)
            started = time.time()
            try:
                answer = call(api_model, messages(prompt, image_url), key)
                ok = bool(answer)
                error = None if ok else "empty response"
            except Exception as exc:  # noqa: BLE001
                answer = ""
                ok = False
                error = str(exc)
            elapsed = round(time.time() - started, 2)
            print(f"done {display} round {idx}: ok={ok} elapsed={elapsed}s", flush=True)
            results.append(
                {
                    "display_model": display,
                    "api_model": api_model,
                    "round": idx,
                    "round_name": round_name,
                    "ok": ok,
                    "elapsed_sec": elapsed,
                    "answer": answer,
                    "error": error,
                }
            )

    OUTPUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    write_md(results)
    print(str(OUTPUT_JSON))
    print(str(OUTPUT_MD))


def write_md(results: list[dict[str, Any]]) -> None:
    lines = [
        "# DeepScientist Pet External Model Review Retry",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "Note: `gemini-3.1-pro` was routed through `gemini-3.1-pro-preview`; "
        "`claude-opus-4.8` was routed through `claude-opus-4-8`, because the exact requested names returned `model_not_found` from Bianxie.",
        "",
    ]
    for item in results:
        status = "OK" if item["ok"] else "FAILED"
        lines.extend(
            [
                f"## {item['display_model']} via {item['api_model']} · Round {item['round']} · {item['round_name']} · {status}",
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


if __name__ == "__main__":
    main()
