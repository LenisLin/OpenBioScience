# Collaboration Icon Prompts

Style anchor: thick rounded hand-drawn marker strokes, charcoal/light off-white line art, white or open interiors, muted gold accents, pure white generated source background, no text, no numbers, no logos.

| Sheet | Position | File | Concept | Detail |
|---|---|---|---|---|
| `collab-nav-01` | top-left | `collab-message` | collaboration message page | two friendly overlapping speech bubbles, one small gold signal dot near the upper corner |
| `collab-nav-01` | top-right | `collab-calendar` | collaboration calendar page | a flip calendar page with two binder rings and a tiny gold tab, no written date or numerals |
| `collab-nav-01` | bottom-left | `collab-docs` | collaboration cloud document page | three loose document sheets with one gold bookmark corner, visibly different from task cards |
| `collab-nav-01` | bottom-right | `collab-task-page` | collaboration task page | a rounded checklist board with two simple check rows and a gold status dot |
| `collab-project-01` | top-left | `collab-project` | project workspace package | a soft folder holding several small task cards, with a gold spark beside it |
| `collab-project-01` | top-right | `collab-tasklist` | Lark tasklist project | a fan of stacked horizontal task cards like ticket cards, no numbers, one gold seal dot |
| `collab-project-01` | bottom-left | `collab-agent-inbox` | agent task inbox | a small inbox tray receiving one task card with a gold arrival sparkle |
| `collab-project-01` | bottom-right | `collab-leader-agent` | project leader agent | a cute simple robot head with a tiny flag or crown-like tab, still minimal and not mascot-like |
| `collab-project-02` | top-left | `collab-sub-agent` | subordinate agent | a compact robot head connected upward by one curved line to a small task card |
| `collab-project-02` | top-right | `collab-human-member` | human collaborator | a round human profile silhouette with shoulders and a small gold badge dot |
| `collab-project-02` | bottom-left | `collab-plan-gate` | planning approval gate | a half-open little gate with a task card waiting in front and a gold check spark |
| `collab-project-02` | bottom-right | `collab-handoff` | task handoff and return flow | two small task cards passing an arrow between them, one card slightly tilted |
| `collab-task-01` | top-left | `collab-task-detail` | expanded task card | one large open task card with a header bar and two simple content lines, no text |
| `collab-task-01` | top-right | `collab-attachment` | file attachment | a chunky hand-drawn paperclip wrapped around a small document card |
| `collab-task-01` | bottom-left | `collab-image-upload` | image attachment upload | a small rounded image frame with a mountain line and a gold sun dot |
| `collab-task-01` | bottom-right | `collab-comment` | comments and feedback | a speech bubble with a small return arrow tucked underneath |
| `collab-task-02` | top-left | `collab-send-comment` | send task comment | a tiny paper plane leaving a speech bubble, with two gold motion dashes |
| `collab-task-02` | top-right | `collab-sync-feedback` | comment sync loop | two rounded circular arrows around a task card, one gold dot at the meeting point |
| `collab-task-02` | bottom-left | `collab-due-time` | task deadline | a small clock leaning against a task card, no numerals on the clock face |
| `collab-task-02` | bottom-right | `collab-created-time` | creation timestamp | a small rubber-stamp mark above a task card, no readable label or date |
| `collab-task-03` | top-left | `collab-assignee` | task owner and followers | two profile nodes connected by a short line above a small task card |
| `collab-task-03` | top-right | `collab-complete` | complete action | a bold circular checkmark with tiny gold celebration marks |
| `collab-task-03` | bottom-left | `collab-reopen` | reopen action | a circular arrow wrapping around a small task card |
| `collab-task-03` | bottom-right | `collab-open-original` | open original task link | a task card with a small arrow leaving its upper corner, no external brand mark |
| `collab-bind-01` | top-left | `collab-web-login` | web login by phone scan | a phone beside a rounded QR-like square made of abstract blocks, no scannable QR code |
| `collab-bind-01` | top-right | `collab-create-app` | create bound app | a small app cube made from simple blocks with a gold sparkle on top |
| `collab-bind-01` | bottom-left | `collab-auth` | authorize automation app | a small key entering a rounded permission card with one gold dot |
| `collab-bind-01` | bottom-right | `collab-profile-select` | choose automation profile | three identity cards fanned out, each with abstract avatar circles, no names |
| `collab-bind-02` | top-left | `collab-channel-save` | save to channel connection | a plug line connecting a task card to a small rounded channel box |
| `collab-bind-02` | top-right | `collab-connected` | successful connection | two rounded nodes connected by a thick curved line with a gold dot in the center |
| `collab-bind-02` | bottom-left | `collab-runtime` | local automation runtime | a compact terminal window with a tiny gear tucked in the corner, no command text |
| `collab-bind-02` | bottom-right | `collab-api-binding` | API binding | a cable plug docking into a small cloud-shaped port, with one gold verification dot |
| `collab-agent-01` | top-left | `collab-listener` | event listener | a small radar dish or listening bowl emitting two curved signal waves |
| `collab-agent-01` | top-right | `collab-task-automation` | automatic task flow | a task card moving along a curved track with two gold motion dashes |
| `collab-agent-01` | bottom-left | `collab-prompt-manager` | project agent prompt editor | a feather pen writing on a small scroll-like card, no text |
| `collab-agent-01` | bottom-right | `collab-sop-skill` | SOP and skills toolbox | a small toolbox with a task card and a tiny star-shaped gold tool |
| `collab-memory-01` | top-left | `collab-memory` | project memory from comments | a small brain-like loop made from simple strokes sitting on a task card, not realistic |
| `collab-memory-01` | top-right | `collab-notification` | supervisor notification | a round bell with a return-flow arrow and a gold alert dot |
| `collab-memory-01` | bottom-left | `collab-refresh-sync` | refresh and check status | two refresh arrows around a tiny status dot, compact and circular |
| `collab-memory-01` | bottom-right | `collab-secret-key` | manual app secret entry | a small key and hidden card with dotted cover marks, no actual dots forming text |

## Base Prompt Template

```text
Use case: logo-brand
Asset type: 2x2 UI icon sprite sheet for a desktop app
Primary request: Create four separate hand-drawn cartoon line icons in one 2x2 grid.
Style/medium: playful minimal line-art icon set matching handmade DeepScientist UI icon style; thick rounded marker strokes; slightly imperfect but polished; simple open interiors; cute, clear, and professional.
Scene/backdrop: perfectly flat pure white background (#ffffff), no shadows, no gradients, no texture.
Palette: light-mode uses charcoal black #171717 plus muted gold #c4a33f; dark-mode uses warm off-white #f4f0e6 plus muted gold #c4a33f.
Constraints: no text, no letters, no numbers, no labels, no watermark, no brand logos, no QR code that can scan.
```
