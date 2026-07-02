#!/usr/bin/env python3
"""
Ask Bianxie-hosted models to critique and refine two new desktop pet concepts.

The script stores only prompts and answers. It never prints the API key.
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
OUTPUT_JSON = OUTPUT_DIR / "new-pet-design-review.json"
OUTPUT_MD = OUTPUT_DIR / "new-pet-design-review.md"
PREVIEW_PATH = REPO_ROOT / "output" / "pet-preview" / "pet-size-comparison.png"

MODEL_RUNS = [
    ("gemini-3.1-pro", "gemini-3.1-pro-preview"),
    ("claude-opus-4.8", "claude-opus-4-8"),
]

SOURCE_FILES = [
    "packages/desktop/src/process/pet/petTypes.ts",
    "packages/desktop/src/process/pet/petStateMachine.ts",
    "packages/desktop/src/process/pet/petIdleTicker.ts",
    "packages/desktop/src/renderer/pet/petRenderer.ts",
    "packages/desktop/src/renderer/pages/settings/PetSettings.tsx",
    "scripts/generate-deepscientist-pet-states.js",
]

STATES = [
    "idle",
    "thinking",
    "working",
    "done",
    "happy",
    "error",
    "dragging",
    "attention",
    "poke-left",
    "poke-right",
    "notification",
    "random-look",
    "random-read",
    "yawning",
    "dozing",
    "sleeping",
    "waking",
    "sweeping",
    "juggling",
    "building",
    "carrying",
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
        if len(text) > 7200:
            text = text[:7200] + "\n/* truncated */"
        sections.append(f"### {rel}\n```ts\n{text}\n```")
    return "\n\n".join(sections)


def image_url(path: Path) -> str | None:
    if not path.exists():
        return None
    return "data:image/png;base64," + base64.b64encode(path.read_bytes()).decode("ascii")


def build_messages(prompt: str, image: str | None = None) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    if image:
        content.append({"type": "image_url", "image_url": {"url": image}})
    return [
        {
            "role": "system",
            "content": (
                "你是 DeepOrganiser 桌面宠物系统的联合设计顾问，擅长可爱但克制的 SVG 角色设计、"
                "微动画设计和前端可维护性。请用中文回答，具体、可执行、不要泛泛而谈。"
            ),
        },
        {"role": "user", "content": content},
    ]


def call(model: str, messages: list[dict[str, Any]], key: str) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.42,
        "max_tokens": 6000,
    }
    req = urllib.request.Request(
        f"{BIANXIE_BASE_URL}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=240) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")[:2000]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc
    message = data.get("choices", [{}])[0].get("message", {})
    content = message.get("content")
    if isinstance(content, str):
        return content.strip()
    return json.dumps(data, ensure_ascii=False, indent=2)


def main() -> None:
    load_env(ENV_PATH)
    key = os.environ.get("BIANXIE_API_KEY")
    if not key:
        raise SystemExit("BIANXIE_API_KEY is not set")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    code = source_excerpt()
    image = image_url(PREVIEW_PATH)
    state_list = ", ".join(STATES)

    base_prompt = f"""
我们要给 DeepOrganiser / DeepScientist 桌面宠物新增两种风格：

1. 折纸助手 paperfold
- 像一张折起来的小论文纸/折纸小助手，带卷角、金色书签或小夹子。
- 气质：文气、聪明、轻巧、可爱但不幼稚。
- 需要避免：太像普通文件图标、太扁、太严肃、和现有文件 icon 混淆。

2. 小观测舱 observatory
- 像一个迷你观察窗/观测舱/小仪表舱，透明圆窗里有表情核心，外侧有少量金色刻度或小天线。
- 气质：科研观察、好奇、精密但可爱。
- 需要避免：重复 DeepScientist 的圆脸 + 金色轨道、太像 logo、太复杂。

现有状态共 21 个：
{state_list}

请逐状态设计这两种宠物应该怎样展示。每个状态都要说明：
- 主造型变化
- 表情
- 金色点缀或配件
- 动画暗示
- 需要避免的误读

请最后判断这两种里哪一种更应该默认展示给用户，为什么。
"""

    implementation_prompt = f"""
下面是当前桌面宠物系统代码摘要。我们准备新增 paperfold / observatory 两套 SVG，每套 21 个状态。

请结合代码，给出实现建议：
- 资源目录、style type、设置页入口、i18n 命名
- SVG 结构如何设计，如何兼容 .idle-track / .idle-pupil 眼球跟随
- 视觉尺寸目标，和 classic / deepscientist 如何区分
- 最需要测试的地方
- 哪些地方不要改，避免扩大风险

代码如下：
{code}
"""

    synthesis_prompt = f"""
请把你自己当成要真正交付这两套宠物的设计负责人。

请给出最终可执行规格：
- paperfold 的 21 状态简表
- observatory 的 21 状态简表
- 统一的 SVG 色板、线宽、viewBox、动画命名
- 每套宠物最关键的 3 个辨识点
- 如果只能先实现一套，你会先实现哪套；如果两套都实现，怎样避免显得堆砌

请偏向可落地，不要建议位图，不要建议外部素材。
"""

    prompts = [
        ("state-design", base_prompt, image),
        ("implementation", implementation_prompt, None),
        ("synthesis", synthesis_prompt, image),
    ]

    results: list[dict[str, Any]] = []
    for display, api_model in MODEL_RUNS:
        for idx, (name, prompt, maybe_image) in enumerate(prompts, start=1):
            print(f"calling {display} via {api_model} round {idx} {name}", flush=True)
            started = time.time()
            try:
                answer = call(api_model, build_messages(prompt, maybe_image), key)
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
                    "round_name": name,
                    "ok": ok,
                    "elapsed_sec": elapsed,
                    "answer": answer,
                    "error": error,
                }
            )

    OUTPUT_JSON.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    write_markdown(results)
    print(str(OUTPUT_JSON))
    print(str(OUTPUT_MD))


def write_markdown(results: list[dict[str, Any]]) -> None:
    lines = [
        "# New Pet Design Review",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "",
        "Models: `gemini-3.1-pro` via `gemini-3.1-pro-preview`, `claude-opus-4.8` via `claude-opus-4-8`.",
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
