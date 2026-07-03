const platformIds = {
  macOS: "macOSAssets",
  Windows: "WindowsAssets",
  Linux: "LinuxAssets",
};

const platformPriority = {
  macOS: ["DMG", "ZIP"],
  Windows: ["Installer", "MSI", "ZIP"],
  Linux: ["DEB", "RPM", "AppImage"],
};

const channelLabels = {
  "latest-arm64-mac.yml": "macOS Apple Silicon",
  "latest-mac.yml": "macOS Intel",
  "latest.yml": "Windows x64",
  "latest-win-arm64.yml": "Windows ARM64",
  "latest-linux.yml": "Linux x64",
  "latest-linux-arm64.yml": "Linux ARM64",
};

const iconBase = "icons/openscience-site";

const platformIcons = {
  macOS: "download-macos",
  Windows: "download-windows",
  Linux: "download-linux",
  Universal: "download-macos",
};

const capabilityIconRows = [
  ["source-search", "citation-anchor", "local-data", "code-run", "figure-output", "literature-synthesis", "medical-evidence-report", "reviewer-response"],
  ["medical-evidence-mode", "pico-framework", "review-check", "citation-anchor", "project-record", "review-check", "artifact-history", "team-handoff"],
];

const locales = {
  "zh-CN": "zh-CN",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
  es: "es-ES",
  ar: "ar",
};

const sourceWorks = [
  {
    repo: "ResearAI/OpenScience",
    url: "https://github.com/ResearAI/OpenScience",
    badge: "★ 10K",
    mark: "O",
    featured: true,
  },
  {
    repo: "ResearAI/DeepScientist",
    url: "https://github.com/ResearAI/DeepScientist",
    badge: "Research OS",
    mark: "D",
  },
  {
    repo: "ResearAI/AutoFigure",
    url: "https://github.com/ResearAI/AutoFigure",
    badge: "Figures",
    mark: "A",
  },
  {
    repo: "ResearAI/DeepReview",
    url: "https://github.com/ResearAI/DeepReview",
    badge: "Review",
    mark: "R",
  },
  {
    repo: "ResearAI/AutoFigure-Edit",
    url: "https://github.com/ResearAI/AutoFigure-Edit",
    badge: "Edit",
    mark: "E",
  },
];

const translations = {
  "zh-CN": {
    meta: { title: "OpenScience 下载" },
    nav: { download: "下载", evidence: "证据", videos: "视频", projects: "项目", preview: "客户端预览", updates: "更新源", language: "语言" },
    source: {
      panelKicker: "ResearAI Works",
      panelTitle: "ResearAI 的公开工作",
      panelSubtitle: "OpenScience 是当前项目，也可以继续查看 DeepScientist、AutoFigure、DeepReview 等工作。",
      featured: "当前项目",
      descriptions: [
        "用自然语言启动科研工作，并把结果沉淀为可追溯、可复现、可审查的 artifact。",
        "自动化科研循环：文献、实验、写作和发布工作流的核心系统。",
        "面向论文和报告的科学图表生成、布局与重绘工具。",
        "面向科研结果的审查、复核和评议流程，让结论更容易被检验。",
        "围绕 AutoFigure 的图表编辑与局部修改工作流。",
      ],
    },
    status: {
      loading: "正在读取版本",
      checking: "检查更新源中",
      detecting: "正在识别系统",
      detected: "已识别 {{platform}}",
      version: "最新版本 v{{version}}",
      none: "暂无正式发布版本",
      updated: "更新于 {{date}}",
      feedUnavailable: "更新源暂不可用",
      dateFallback: "等待发布",
    },
    hero: {
      kicker: "OPENSCIENCE DESKTOP",
      kickerLeft: "一句话启动研究",
      kickerRight: "全过程可追溯",
      titleA: "你的科研工作台",
      subtitle: "OpenScience 会检索证据、运行分析，并把数据、代码、图表和手稿整理成可复现记录。",
      runningPrefix: "安装后，它会在本地",
      primary: "下载 OpenScience",
      primaryPlatform: "下载 {{platform}} 版",
      secondary: "查看研究示例",
      verbs: ["检索证据...", "运行分析...", "生成图表...", "整理手稿...", "记录过程..."],
    },
    cinema: {
      stepA: {
        kicker: "本地研究",
        title: "研究从你的电脑开始。",
        text: "读取文件、运行分析、生成图表，同时保留可检查的过程。",
      },
      stepB: {
        kicker: "开源免费",
        title: "自由选择模型和环境。",
        text: "OpenScience 面向全球科研人员开放，适合接入自己的数据和模型。",
      },
      stepC: {
        kicker: "科学模式",
        title: "覆盖多学科研究。",
        text: "350+ 科研能力覆盖生命科学、化学、工程计算、数据科学与因果推断。",
      },
      stepD: {
        kicker: "可复查成果",
        title: "结果可以被团队复查。",
        text: "报告、图表、Notebook 和手稿会保留证据、代码和关键决定。",
      },
    },
    metrics: {
      kicker: "证据覆盖",
      title: "先有证据，再有结论。",
      text: "文献、监管材料、临床试验和摘要进入同一个研究环境。",
      papers: "论文",
      regulatory: "监管文档",
      trials: "临床试验",
      abstracts: "科研摘要",
      caption: "可搜索、可读取、可引用、可追溯",
    },
    story: {
      kicker: "EVIDENCE-BACKED SCIENCE",
      title: "不是一次回答，而是一套研究记录。",
      subtitle: "每个图表、表格、Notebook 和手稿片段，都保留生成它的证据、代码和上下文。",
    },
    videos: {
      kicker: "视频演示",
      title: "看看 OpenScience 如何动起来。",
      subtitle: "一个随滚动展开的短镜头：研究材料如何变成可检查的工作台。",
      clipA: {
        title: "连接科学 web",
        text: "在研究开始前配置来源、连接和集成。",
      },
      clipB: {
        title: "科研工作台",
        text: "预览分析、笔记、图表和输出如何保留在同一个项目空间。",
      },
    },
    scienceMode: {
      kicker: "SCIENCE MODE",
      title: "一个工作台，贯通从分子到手稿、从基因组到因果推断的科研全过程。",
      subtitle: "覆盖 10+ 学科方向、350+ 默认科研 skills：从生命科学、药物发现到社会科学与因果推断，OpenScience 让每个结果都能运行、追踪、复现。",
      statA: "10+ 学科方向",
      statB: "350+ 默认 skills",
      statC: "可追踪 artifact",
      life: { title: "生命科学", text: "基因组 · 单细胞 · 多组学" },
      drug: { title: "化学与药物发现", text: "分子 · 蛋白结构 · 循证材料" },
      engineering: { title: "工程计算", text: "材料 · 物理 · 仿真" },
      data: { title: "数据科学", text: "统计 · 计量经济学 · 因果推断" },
      social: { title: "政策与社会科学", text: "调查 · 质性研究 · 政策评估" },
      artifact: { title: "科研资产沉淀", text: "运行 · 追踪 · 复现" },
    },
    motion: {
      kicker: "研究工作流",
      title: "从数据整理到论文输出，步骤连在一起。",
      subtitle: "一个请求可以变成项目、分析、图表、报告和后续审查。",
      rowA: ["证据检索", "来源定位", "本地数据", "真实代码", "图表生成", "Notebook", "PDF", "Manuscript"],
      rowB: ["医学循证", "PICO", "GRADE", "引用锚点", "项目记录", "审查备注", "可复现", "协作交付"],
    },
    flow: {
      kicker: "研究流",
      title: "结果可以被打开、检查和继续修改。",
      subtitle: "问题、证据、分析、引用和审查备注都在同一条链路里。",
      keywordA: "答案",
      keywordB: "证据",
      keywordC: "引用",
      keywordD: "审查",
      nodePrompt: "任务",
      nodeEvidence: "证据",
      nodeAnalysis: "分析",
      nodeArtifact: "成果",
      nodeReview: "审查",
    },
    report: {
      chrome: "医学循证报告",
      synced: "证据已同步",
      mode: "医学循证",
      railA: "答案",
      railB: "PICO",
      railC: "证据",
      railD: "审查",
      badge: "循证模式",
      title: "过敏性休克：肾上腺素、二线治疗与观察时间",
      lead: "主线很短：先给肾上腺素，不等二线药物起效。",
      sectionA: "关键处理路径",
      pointA: "气道、呼吸、循环、给氧、静脉通路和补液并行处理。",
      pointB: "抗组胺药和糖皮质激素是辅助治疗，不能替代肾上腺素。",
      pointC: "观察时间取决于严重程度、合并症和复发风险。",
      sectionB: "证据备注",
      notes: "剂量、流程和边界条件保留在报告中，便于临床核查来源。",
    },
    features: {
      evidence: {
        title: "连接科研证据",
        text: "搜索来源，定位段落，绑定结论。",
        keywords: ["文献检索", "证据锚点", "来源可查"],
      },
      analysis: {
        title: "运行真实分析",
        text: "读文件，跑代码，出图表。",
        keywords: ["读取本地数据", "运行代码", "生成图表"],
      },
      trace: {
        title: "保留生成历史",
        text: "数据、代码、证据和版本跟着结果走。",
        keywords: ["过程记录", "版本追踪", "可复现"],
      },
      project: {
        title: "组织成研究项目",
        text: "会话、文件、证据和批注放在同一项目里。",
        keywords: ["项目上下文", "协作交付", "审稿回应"],
      },
      rigor: {
        title: "面向审查而设计",
        text: "检查引用、数字来源和结论边界。",
        keywords: ["引用检查", "数字来源", "结论边界"],
      },
    },
    systems: {
      evidence: {
        title: "把证据带进工作区。",
        text: "来源段落、本地文件、代码单元和图表输出保持连接。",
        keywords: ["证据检索", "本地文件", "代码分析"],
      },
      memory: {
        title: "每个成果都带着历史。",
        text: "数据、代码、环境备注、对话和修改记录会跟随 artifact 保存。",
        keywords: ["Artifact 历史", "环境记录", "可复现"],
      },
      review: {
        title: "交付之前先过一遍科学审查。",
        text: "引用、数字、图表步骤和结论边界都可以回到来源核查。",
        keywords: ["引用检查", "数字核对", "边界说明"],
      },
    },
    modes: {
      kicker: "科研模式",
      title: "选择入口，然后进入项目。",
      subtitle: "不同模式服务不同研究场景，最终都沉淀为可追溯 artifact。",
      science: {
        title: "科学研究模式",
        text: "适合文献、数据、图表和手稿。",
        keywords: "文献 · 数据 · 代码",
      },
      medical: {
        title: "医学循证模式",
        text: "适合临床问题、证据分级和谨慎结论。",
        keywords: "PICO · GRADE · 来源",
      },
      goal: {
        title: "目标模式",
        text: "适合计划、检查点和持续推进。",
        keywords: "计划 · 执行 · 续跑",
      },
      knowledge: {
        title: "知识沉淀模式",
        text: "适合方法、SOP、技能和实验室记忆。",
        keywords: "SOP · Skill · Memory",
      },
      screenStatus: "Artifact 工作区",
      screenA: "证据",
      screenB: "分析",
      screenC: "成果",
      screenItemA: "结论绑定来源段落",
      screenItemB: "图表绑定代码和数据",
      screenItemC: "报告进入审查",
    },
    projects: {
      kicker: "PROJECT EXAMPLES",
      title: "像研究项目一样工作，而不是像聊天记录一样结束。",
      subtitle: "证据、代码、图表、手稿和审查意见都会留下来。",
    },
    capabilitySwap: {
      kicker: "能力堆栈",
      title: "四种研究方式，都留下可审查的结果。",
      subtitle: "从新会话、医学循证到科学研究和知识沉淀，OpenScience 把任务、证据、代码、图表和报告放进同一个可复现记录。",
      cards: [
        {
          label: "新会话",
          title: "从一句任务开始",
          text: "把问题、文件和数据放进同一个工作区。",
          keywords: ["自然语言", "项目", "本地"],
          image: "assets/showcase/openscience-new-session.png",
          tone: "paper",
        },
        {
          label: "医学循证",
          title: "回答带着证据",
          text: "结论绑定来源编号，关键建议可复查。",
          keywords: ["PICO", "来源", "审查"],
          image: "assets/showcase/openscience-medical-evidence.png",
          tone: "green",
        },
        {
          label: "科学研究",
          title: "图表和报告一起生成",
          text: "结构、代码、图表和解释并排保留。",
          keywords: ["结构", "图表", "代码"],
          image: "assets/showcase/openscience-science-artifact.png",
          tone: "blue",
        },
        {
          label: "研究记录",
          title: "Artifact 可追溯",
          text: "文件、修改、报告和证据进入同一记录。",
          keywords: ["文件", "版本", "复现"],
          image: "assets/showcase/openscience-research-run.png",
          tone: "gold",
        },
      ],
    },
    client: {
      sidebarTask: "科研任务",
      sidebarArtifacts: "Artifact",
      sidebarReview: "复现审查",
      promptLabel: "自然语言任务",
      prompt: "分析这批实验数据，生成可复现实验报告。",
      saved: "已保存到本地工作区",
      reviewTitle: "复现检查",
      runtime: "本地运行",
      statusA: "正在算数据...",
      statusB: "正在写报告...",
      artifactStatus: "已记录",
      artifacts: [
        ["01", "研究计划", "protocol.md"],
        ["02", "证据数据", "evidence.json"],
        ["03", "分析代码", "analysis.py"],
        ["04", "图表输出", "figure.svg"],
        ["05", "研究报告", "report.docx"],
      ],
      reviews: ["来源记录", "参数固定", "版本可追踪", "审查意见"],
    },
    homePreview: {
      eyebrow: "NEW RESEARCH SESSION",
      title: "从一句研究任务开始",
      subtitle: "把问题、文件和数据放进同一个工作区，后续结果自动保留来源。",
      navNew: "新会话",
      navSearch: "搜索",
      navSchedule: "定时任务",
      collaboration: "协作功能",
      navMessages: "消息页面",
      navCalendar: "日历页面",
      navDocs: "云文档",
      navTasks: "任务页面",
      groupProjects: "科研项目",
      projectA: "过敏性休克循证",
      projectB: "肾上腺素观察方案",
      promptLabel: "自然语言任务",
      prompt: "分析这批实验数据，生成图表和一份可审查的研究报告。",
      projectHint: "Work in a project",
      send: "启动",
      artifactA: "实验数据",
      artifactB: "分析代码",
      artifactC: "研究报告",
      taskABadge: "医学循证模式",
      taskAStatus: "证据已整理",
      taskATitle: "过敏性休克：肾上腺素、二线治疗与观察时间",
      taskAText: "OpenScience 把问题拆成可核查结论，引用指南、药品标签和临床证据，并保留每条结论的来源。",
      taskAFindingA: "立即处理",
      taskAFindingAText: "疑似或确诊时优先肌注肾上腺素。",
      taskAFindingB: "二线治疗",
      taskAFindingBText: "抗组胺药和激素不能延误急救。",
      taskAFindingC: "观察时间",
      taskAFindingCText: "按严重程度、复发风险和气道风险分层。",
      taskBBadge: "方案复核",
      taskBStatus: "等待人工确认",
      taskBTitle: "肾上腺素给药、随访和出院说明",
      taskBText: "系统把剂量、禁忌、复发风险和出院教育放进同一份可复查记录，便于后续修改或交给团队。",
      taskBStepA: "识别风险人群",
      taskBStepB: "核对剂量和途径",
      taskBStepC: "生成随访清单",
      taskBNoteTitle: "Review note",
      taskBNoteText: "每个建议都能回到对应来源，方便医生、研究者或合作者继续审查。",
      traceA: "本地执行",
      traceB: "Artifact 留痕",
      traceC: "项目继续推进",
    },
    downloads: {
      kicker: "DOWNLOAD",
      title: "安装在你的研究电脑上",
      subtitle: "选择系统版本。后续更新会通过桌面端自动检查。",
      mac: "Apple Silicon 与 Intel Mac",
      windows: "x64 与 ARM64 安装包",
      linux: "DEB / RPM / AppImage",
      pending: "等待发布包上传",
      open: "下载",
    },
    trust: {
      localTitle: "在已有环境里工作",
      localText: "桌面端负责读取文件、运行分析和整理输出，适合接入你的本地项目。",
      artifactTitle: "成果自动留痕",
      artifactText: "数据、代码、图表和报告会作为 artifact 保存，后续可以继续编辑和审查。",
      updateTitle: "自动更新",
      updateText: "客户端读取匹配的 metadata，发布新版本后自动发现更新。",
    },
    channels: {
      kicker: "UPDATE FEED",
      title: "自动更新源",
      subtitle: "客户端用这些 metadata 检查版本。",
      available: "可用",
      preparing: "准备中",
    },
  },
  en: {
    meta: { title: "OpenScience Download" },
    nav: { download: "Download", evidence: "Evidence", videos: "Videos", projects: "Projects", preview: "Client Preview", updates: "Update Feed", language: "Language" },
    source: {
      panelKicker: "ResearAI Works",
      panelTitle: "Public work from ResearAI",
      panelSubtitle: "OpenScience first, plus DeepScientist, AutoFigure, and DeepReview.",
      featured: "Current",
      descriptions: [
        "Start research work in natural language and turn results into traceable, reproducible, reviewable artifacts.",
        "Autonomous research loop for literature, experiments, writing, and publishing workflows.",
        "Scientific figure generation, layout, and redrawing for papers and reports.",
        "Review, checking, and critique workflows that make research results easier to inspect.",
        "Figure editing and local revision workflow around AutoFigure.",
      ],
    },
    status: {
      loading: "Reading version",
      checking: "Checking update feed",
      detecting: "Detecting platform",
      detected: "{{platform}} detected",
      version: "Latest v{{version}}",
      none: "No public release yet",
      updated: "Updated {{date}}",
      feedUnavailable: "Update feed unavailable",
      dateFallback: "Waiting for release",
    },
    hero: {
      kicker: "OPENSCIENCE DESKTOP",
      kickerLeft: "Start with language",
      kickerRight: "Keep every step",
      titleA: "Your research workbench",
      subtitle: "OpenScience searches evidence, runs analyses, and turns data, code, figures, and manuscripts into reproducible records.",
      runningPrefix: "After installation, it works locally on",
      primary: "Download OpenScience",
      primaryPlatform: "Download for {{platform}}",
      secondary: "Explore research examples",
      verbs: ["searching evidence...", "running analyses...", "making figures...", "drafting manuscripts...", "recording history..."],
    },
    cinema: {
      stepA: {
        kicker: "LOCAL RESEARCH",
        title: "Research starts on your computer.",
        text: "Read files, run analyses, and generate figures while the process stays inspectable.",
      },
      stepB: {
        kicker: "OPEN AND FREE",
        title: "Use your own models and environment.",
        text: "OpenScience is free for researchers and built to work with your data.",
      },
      stepC: {
        kicker: "SCIENCE MODE",
        title: "Built for many sciences.",
        text: "350+ research skills span life science, chemistry, engineering, data science, and causal inference.",
      },
      stepD: {
        kicker: "REVIEWABLE OUTPUT",
        title: "Results your team can inspect.",
        text: "Reports, figures, notebooks, and manuscripts keep the evidence and decisions behind them.",
      },
    },
    metrics: {
      kicker: "EVIDENCE COVERAGE",
      title: "Evidence first. Claims second.",
      text: "Papers, regulatory documents, clinical trials, and abstracts live in one research environment.",
      papers: "papers",
      regulatory: "regulatory documents",
      trials: "clinical trials",
      abstracts: "research abstracts",
      caption: "searchable, readable, citable, traceable",
    },
    story: {
      kicker: "EVIDENCE-BACKED SCIENCE",
      title: "Not a reply. A research record.",
      subtitle: "Figures, tables, notebooks, and manuscript drafts keep the evidence, code, and context that produced them.",
    },
    videos: {
      kicker: "VIDEOS",
      title: "See OpenScience in motion",
      subtitle: "A short scroll-controlled view of how research material becomes an inspectable workspace.",
      clipA: {
        title: "Connect the scientific web",
        text: "Configure research sources and integrations before the workspace begins.",
      },
      clipB: {
        title: "Research workspace",
        text: "Preview the artifact-first workspace where analysis, notes, and visual outputs stay together.",
      },
    },
    scienceMode: {
      kicker: "SCIENCE MODE",
      title: "One workspace for all sciences: from molecules to manuscripts, from genomes to causal inference.",
      subtitle: "10+ research domains and 350+ default skills across life sciences, drug discovery, engineering computation, data science, and social research.",
      statA: "10+ domains",
      statB: "350+ skills",
      statC: "reproducible artifacts",
      life: { title: "Life sciences", text: "Genomics · single-cell · multi-omics" },
      drug: { title: "Chemistry & drug discovery", text: "Molecules · proteins · evidence" },
      engineering: { title: "Engineering computation", text: "Materials · physics · simulations" },
      data: { title: "Data science", text: "Statistics · econometrics · causal inference" },
      social: { title: "Policy & social research", text: "Surveys · qualitative study · reports" },
      artifact: { title: "Artifact record", text: "Run · trace · reproduce" },
    },
    motion: {
      kicker: "RESEARCH WORKFLOW",
      title: "From data wrangling to publication, the steps stay connected.",
      subtitle: "One request can become a project, analysis, figure, report, and review trail.",
      rowA: ["Evidence search", "Source passages", "Local data", "Real code", "Figure output", "Notebook", "PDF", "Manuscript"],
      rowB: ["Medical evidence", "PICO", "GRADE", "Citation anchors", "Project record", "Review notes", "Reproducible", "Team handoff"],
    },
    flow: {
      kicker: "RESEARCH FLOW",
      title: "Open the result. Inspect the path. Continue the work.",
      subtitle: "Question, evidence, analysis, citations, and review notes stay in the same chain.",
      keywordA: "Answer",
      keywordB: "Evidence",
      keywordC: "Citations",
      keywordD: "Review",
      nodePrompt: "Prompt",
      nodeEvidence: "Evidence",
      nodeAnalysis: "Analysis",
      nodeArtifact: "Artifact",
      nodeReview: "Review",
    },
    report: {
      chrome: "Medical evidence report",
      synced: "Evidence synced",
      mode: "Medical Evidence",
      railA: "Answer",
      railB: "PICO",
      railC: "Evidence",
      railD: "Review",
      badge: "Evidence mode",
      title: "Anaphylaxis: epinephrine, second-line therapy, and observation time",
      lead: "The main path is short: give epinephrine promptly. Do not wait for second-line drugs.",
      sectionA: "Treatment path",
      pointA: "Airway, breathing, circulation, oxygen, IV access, and fluids are handled in parallel.",
      pointB: "Antihistamines and steroids are supportive; they do not replace epinephrine.",
      pointC: "Observation time depends on severity, comorbidity, and recurrence risk.",
      sectionB: "Evidence notes",
      notes: "Dose, workflow, and boundary conditions remain visible for source checking.",
    },
    features: {
      evidence: {
        title: "Connect scientific evidence",
        text: "Search sources. Locate passages. Bind claims.",
        keywords: ["Literature search", "Citation anchors", "Traceable sources"],
      },
      analysis: {
        title: "Run real analysis",
        text: "Read files. Run code. Generate figures.",
        keywords: ["Local data", "Code execution", "Figure output"],
      },
      trace: {
        title: "Keep the history",
        text: "Data, code, evidence, and versions travel with the result.",
        keywords: ["Run history", "Version trace", "Reproducible"],
      },
      project: {
        title: "Work as a project",
        text: "Chats, files, evidence, and notes live in one project.",
        keywords: ["Project context", "Collaboration", "Review response"],
      },
      rigor: {
        title: "Designed for review",
        text: "Check citations, numbers, figure steps, and claim boundaries.",
        keywords: ["Citation checks", "Number sources", "Claim bounds"],
      },
    },
    systems: {
      evidence: {
        title: "Bring evidence into the workspace.",
        text: "Source passages, local files, code cells, and figure outputs stay connected.",
        keywords: ["Evidence search", "Local files", "Code analysis"],
      },
      memory: {
        title: "Every artifact carries its history.",
        text: "Data, code, environment notes, conversation, and edits stay with the artifact.",
        keywords: ["Artifact history", "Environment notes", "Reproducible"],
      },
      review: {
        title: "Review the science before it ships.",
        text: "Citations, numbers, figure steps, and claim boundaries can be checked against their sources.",
        keywords: ["Citation checks", "Number checks", "Claim bounds"],
      },
    },
    modes: {
      kicker: "RESEARCH MODES",
      title: "Choose the entry point. Keep the project.",
      subtitle: "Each mode fits a research situation; every output remains traceable.",
      science: {
        title: "Scientific research",
        text: "For literature, data, figures, and manuscripts.",
        keywords: "Literature · Data · Code",
      },
      medical: {
        title: "Medical evidence",
        text: "For clinical questions, grading, and cautious conclusions.",
        keywords: "PICO · GRADE · Sources",
      },
      goal: {
        title: "Goal mode",
        text: "For plans, checkpoints, and continued progress.",
        keywords: "Plan · Execute · Continue",
      },
      knowledge: {
        title: "Knowledge deposition",
        text: "For methods, SOPs, skills, and lab memory.",
        keywords: "SOP · Skill · Memory",
      },
      screenStatus: "artifact-first workspace",
      screenA: "Evidence",
      screenB: "Analysis",
      screenC: "Artifacts",
      screenItemA: "claim linked to source paragraph",
      screenItemB: "figure linked to code and data",
      screenItemC: "report ready for review",
    },
    projects: {
      kicker: "PROJECT EXAMPLES",
      title: "Work like a research project, not a chat transcript.",
      subtitle: "Evidence, code, figures, manuscripts, and review notes remain in the record.",
    },
    capabilitySwap: {
      kicker: "CAPABILITY STACK",
      title: "Four research modes. One reviewable record.",
      subtitle: "From a new task to evidence review, scientific analysis, and reusable knowledge, OpenScience keeps evidence, code, figures, and reports together.",
      cards: [
        {
          label: "New task",
          title: "Start from one research request",
          text: "Bring the question, files, and data into one workspace.",
          keywords: ["Natural language", "Project", "Local"],
          image: "assets/showcase/openscience-new-session.png",
          tone: "paper",
        },
        {
          label: "Evidence",
          title: "Answers carry sources",
          text: "Claims stay tied to references and review points.",
          keywords: ["PICO", "Sources", "Review"],
          image: "assets/showcase/openscience-medical-evidence.png",
          tone: "green",
        },
        {
          label: "Science",
          title: "Figures and reports ship together",
          text: "Structure, code, figures, and explanation remain side by side.",
          keywords: ["Structure", "Figures", "Code"],
          image: "assets/showcase/openscience-science-artifact.png",
          tone: "blue",
        },
        {
          label: "Record",
          title: "Artifacts keep their path",
          text: "Files, edits, reports, and evidence form a reusable record.",
          keywords: ["Files", "Versions", "Reproduce"],
          image: "assets/showcase/openscience-research-run.png",
          tone: "gold",
        },
      ],
    },
    client: {
      sidebarTask: "Research",
      sidebarArtifacts: "Artifacts",
      sidebarReview: "Review",
      promptLabel: "Natural language task",
      prompt: "Analyze this experiment dataset and generate a reproducible report.",
      saved: "Saved to local workspace",
      reviewTitle: "Review check",
      runtime: "local runtime",
      statusA: "Analyzing data...",
      statusB: "Writing report...",
      artifactStatus: "recorded",
      artifacts: [
        ["01", "Protocol", "protocol.md"],
        ["02", "Evidence data", "evidence.json"],
        ["03", "Analysis code", "analysis.py"],
        ["04", "Figure output", "figure.svg"],
        ["05", "Research report", "report.docx"],
      ],
      reviews: ["Sources logged", "Parameters fixed", "Versions tracked", "Review notes"],
    },
    homePreview: {
      eyebrow: "NEW RESEARCH SESSION",
      title: "Start from a research task",
      subtitle: "Bring the question, files, and data into one workspace. Outputs keep their sources.",
      navNew: "New Chat",
      navSearch: "Search",
      navSchedule: "Scheduled Tasks",
      collaboration: "Collaboration",
      navMessages: "Messages",
      navCalendar: "Calendar",
      navDocs: "Docs",
      navTasks: "Tasks",
      groupProjects: "Research projects",
      projectA: "Anaphylaxis evidence",
      projectB: "Epinephrine observation plan",
      promptLabel: "Natural language task",
      prompt: "Analyze this experiment dataset, create figures, and draft a reviewable report.",
      projectHint: "Work in a project",
      send: "Start",
      artifactA: "Dataset",
      artifactB: "Analysis code",
      artifactC: "Research report",
      taskABadge: "Medical Evidence Mode",
      taskAStatus: "Evidence organized",
      taskATitle: "Anaphylaxis: epinephrine, second-line therapy, and observation time",
      taskAText: "OpenScience turns the question into checkable conclusions, cites guidelines, labels, and clinical evidence, and keeps the source behind each claim.",
      taskAFindingA: "First response",
      taskAFindingAText: "Use IM epinephrine promptly when anaphylaxis is suspected or diagnosed.",
      taskAFindingB: "Second-line therapy",
      taskAFindingBText: "Antihistamines and steroids must not delay acute rescue.",
      taskAFindingC: "Observation",
      taskAFindingCText: "Stratify by severity, recurrence risk, and airway risk.",
      taskBBadge: "Plan review",
      taskBStatus: "Awaiting review",
      taskBTitle: "Epinephrine dosing, follow-up, and discharge notes",
      taskBText: "Dose, cautions, recurrence risk, and discharge education stay in one reviewable record for later edits or team handoff.",
      taskBStepA: "Identify high-risk groups",
      taskBStepB: "Check dose and route",
      taskBStepC: "Create follow-up checklist",
      taskBNoteTitle: "Review note",
      taskBNoteText: "Every recommendation can return to its source so clinicians, researchers, or collaborators can review it.",
      traceA: "Local execution",
      traceB: "Artifact trace",
      traceC: "Project continuity",
    },
    downloads: {
      kicker: "DOWNLOAD",
      title: "Install where your research happens",
      subtitle: "Choose your system. The desktop app checks for updates automatically.",
      mac: "Apple Silicon and Intel Mac",
      windows: "x64 and ARM64 installers",
      linux: "DEB / RPM / AppImage",
      pending: "Release package pending",
      open: "Download",
    },
    trust: {
      localTitle: "Works in your environment",
      localText: "The desktop app reads files, runs analyses, and organizes outputs in your local project.",
      artifactTitle: "Artifacts keep context",
      artifactText: "Data, code, figures, and reports are saved with enough context to edit and review later.",
      updateTitle: "Auto updates",
      updateText: "The client reads matching metadata and finds new releases automatically.",
    },
    channels: {
      kicker: "UPDATE FEED",
      title: "Update channels",
      subtitle: "The client reads these metadata files for updates.",
      available: "Ready",
      preparing: "Pending",
    },
  },
  ja: {
    meta: { title: "OpenScience ダウンロード" },
    nav: { download: "ダウンロード", preview: "プレビュー", updates: "更新フィード", language: "言語" },
    source: {
      panelKicker: "ResearAI Works",
      panelTitle: "ResearAI の公開プロジェクト",
      panelSubtitle: "OpenScience を先頭に、DeepScientist、AutoFigure、DeepReview などを確認できます。",
      featured: "現在の項目",
      descriptions: [
        "自然言語で研究作業を始め、結果を追跡・再現・レビュー可能な artifact にします。",
        "文献、実験、執筆、公開ワークフローのための自律研究ループ。",
        "論文とレポート向けの科学図表生成、レイアウト、再描画ツール。",
        "研究結果を検証しやすくするレビュー、確認、批評ワークフロー。",
        "AutoFigure を中心にした図表編集と局所修正ワークフロー。",
      ],
    },
    status: {
      loading: "バージョン取得中",
      checking: "更新フィード確認中",
      detecting: "OS を検出中",
      detected: "{{platform}} を検出",
      version: "最新 v{{version}}",
      none: "公開リリースはまだありません",
      updated: "{{date}} 更新",
      feedUnavailable: "更新フィードを取得できません",
      dateFallback: "リリース待ち",
    },
    hero: {
      kicker: "OPENSCIENCE DESKTOP",
      titleA: "研究のためのワークベンチ",
      subtitle: "証拠を探し、解析を実行し、データ・コード・図・原稿を再現可能な記録として残します。",
      runningPrefix: "インストール後、ローカルで",
      primary: "OpenScience をダウンロード",
      primaryPlatform: "{{platform}} 版をダウンロード",
      secondary: "すべての版を見る",
      verbs: ["データを計算...", "文献を確認...", "レポートを執筆...", "実験を再現...", "Artifact を整理..."],
    },
    motion: {
      kicker: "WORKSPACE MOTION",
      title: "証拠、分析、成果物が一緒に進む。",
      subtitle: "1つの依頼が、解析、図、レポート、レビューへつながります。",
      rowA: ["証拠検索", "出典箇所", "ローカルデータ", "実行コード", "図表生成", "Notebook", "PDF", "Manuscript"],
      rowB: ["医学的証拠", "PICO", "GRADE", "引用アンカー", "プロジェクト記録", "レビュー注記", "再現可能", "共同作業"],
    },
    scienceMode: {
      kicker: "SCIENCE MODE",
      title: "分子から原稿まで、ゲノムから因果推論まで、一つの研究ワークスペースで。",
      subtitle: "10以上の研究領域と350以上の既定スキルで、結果を実行・追跡・再現できます。",
      statA: "10+ 領域",
      statB: "350+ スキル",
      statC: "再現可能な artifact",
      life: { title: "生命科学", text: "ゲノム · シングルセル · マルチオミクス" },
      drug: { title: "化学と創薬", text: "分子 · タンパク質 · 証拠" },
      engineering: { title: "工学計算", text: "材料 · 物理 · シミュレーション" },
      data: { title: "データ科学", text: "統計 · 計量経済 · 因果推論" },
      social: { title: "政策・社会研究", text: "調査 · 質的研究 · レポート" },
      artifact: { title: "Artifact 記録", text: "実行 · 追跡 · 再現" },
    },
    systems: {
      evidence: {
        title: "証拠を探し、そのまま分析へ。",
        text: "出典箇所、ローカルファイル、コード実行、図表出力を一つのプロジェクトでつなぎます。",
        keywords: ["証拠検索", "ローカルデータ", "実分析"],
      },
      memory: {
        title: "答えだけでなく、プロジェクト記録を残す。",
        text: "データ、証拠、コード、図表、注記、原稿草稿を一緒に保存し、後で続けられます。",
        keywords: ["Artifact 履歴", "プロジェクト文脈", "継続"],
      },
      review: {
        title: "共有前に主張を確認。",
        text: "引用、数値、図表手順、結論の境界を見える状態に保ちます。",
        keywords: ["引用確認", "数値の出所", "結論境界"],
      },
    },
    client: {
      sidebarTask: "研究タスク",
      sidebarArtifacts: "Artifact",
      sidebarReview: "再現チェック",
      promptLabel: "自然言語タスク",
      prompt: "この実験データを分析し、再現可能なレポートを作成。",
      saved: "ローカル作業領域に保存",
      reviewTitle: "再現チェック",
      runtime: "ローカル実行",
      statusA: "データを計算中...",
      statusB: "レポートを執筆中...",
      artifactStatus: "記録済み",
      artifacts: [["01", "研究計画", "protocol.md"], ["02", "証拠データ", "evidence.json"], ["03", "分析コード", "analysis.py"], ["04", "図の出力", "figure.svg"], ["05", "研究報告", "report.docx"]],
      reviews: ["出典記録", "パラメータ固定", "版を追跡", "レビュー意見"],
    },
    homePreview: {
      eyebrow: "NEW RESEARCH SESSION",
      title: "自然言語で研究作業を開始",
      subtitle: "質問、ファイル、データを渡すだけ。結果は追跡できます。",
      navNew: "新規会話",
      navSearch: "検索",
      navSchedule: "定期タスク",
      collaboration: "連携機能",
      navMessages: "メッセージ",
      navCalendar: "カレンダー",
      navDocs: "ドキュメント",
      navTasks: "タスク",
      groupProjects: "研究プロジェクト",
      projectA: "アナフィラキシー根拠",
      projectB: "エピネフリン観察計画",
      promptLabel: "自然言語タスク",
      prompt: "この実験データを分析し、再現・レビュー・継続できる研究レポートを生成。",
      projectHint: "プロジェクトで作業",
      send: "開始",
      artifactA: "実験データ",
      artifactB: "分析コード",
      artifactC: "研究報告",
      taskABadge: "医学エビデンスモード",
      taskAStatus: "証拠整理済み",
      taskATitle: "アナフィラキシー：エピネフリン、二次治療、観察時間",
      taskAText: "OpenScience は問いを検証可能な結論に分解し、ガイドライン、添付文書、臨床証拠を結びつけます。",
      taskAFindingA: "初期対応",
      taskAFindingAText: "疑いまたは診断時は速やかに筋注エピネフリンを優先します。",
      taskAFindingB: "二次治療",
      taskAFindingBText: "抗ヒスタミン薬やステロイドで救急処置を遅らせません。",
      taskAFindingC: "観察時間",
      taskAFindingCText: "重症度、再発リスク、気道リスクで層別します。",
      taskBBadge: "計画レビュー",
      taskBStatus: "確認待ち",
      taskBTitle: "エピネフリン投与、フォローアップ、退院説明",
      taskBText: "用量、注意点、再発リスク、退院教育を一つの確認可能な記録にまとめます。",
      taskBStepA: "高リスク群を特定",
      taskBStepB: "用量と投与経路を確認",
      taskBStepC: "フォローアップ一覧を作成",
      taskBNoteTitle: "レビュー記録",
      taskBNoteText: "各提案は出典に戻れるため、医師、研究者、共同作業者が確認できます。",
      traceA: "ローカル実行",
      traceB: "Artifact 記録",
      traceC: "プロジェクト継続",
    },
    cinema: {
      stepA: {
        kicker: "ローカル研究",
        title: "研究は自分のPCから始まります。",
        text: "ファイルを読み、分析を実行し、図を作成しながら、過程を確認できる形で残します。",
      },
      stepB: {
        kicker: "オープンで無料",
        title: "モデルと環境を自由に選べます。",
        text: "OpenScience は研究者のための無料デスクトップ環境です。",
      },
      stepC: {
        kicker: "サイエンスモード",
        title: "多くの分野に対応。",
        text: "350+ の研究スキルが生命科学、化学、工学計算、データ科学、因果推論を支えます。",
      },
      stepD: {
        kicker: "確認できる成果",
        title: "チームで結果を確認できます。",
        text: "レポート、図、Notebook、原稿には根拠と判断の流れが残ります。",
      },
    },
    downloads: {
      kicker: "DOWNLOAD",
      title: "システムを選択",
      subtitle: "OS 別パッケージを明確に表示し、すばやく入手して、その後は自動更新できます。",
      mac: "Apple Silicon と Intel Mac",
      windows: "x64 と ARM64 インストーラー",
      linux: "DEB / RPM / AppImage",
      pending: "リリースパッケージ待ち",
      open: "Download",
    },
    trust: {
      localTitle: "ローカル実行",
      localText: "デスクトップアプリが実行、ファイル生成、作業領域整理を担当します。",
      artifactTitle: "自動保存",
      artifactText: "データ、コード、図、レポートを後で編集・同期・レビューできる artifact として保存します。",
      updateTitle: "自動更新",
      updateText: "クライアントは OS に合う metadata を読み、新しい版を取得できます。",
    },
    channels: { kicker: "UPDATE FEED", title: "更新チャンネル", subtitle: "更新用 metadata を読み込みます。", available: "利用可", preparing: "準備中" },
  },
  ko: {
    meta: { title: "OpenScience 다운로드" },
    nav: { download: "다운로드", preview: "클라이언트 미리보기", updates: "업데이트", language: "언어" },
    source: {
      panelKicker: "ResearAI Works",
      panelTitle: "ResearAI 공개 작업",
      panelSubtitle: "OpenScience가 첫 번째이며 DeepScientist, AutoFigure, DeepReview도 볼 수 있습니다.",
      featured: "현재 프로젝트",
      descriptions: [
        "자연어로 연구 작업을 시작하고 결과를 추적, 재현, 검토 가능한 artifact로 만듭니다.",
        "문헌, 실험, 작성, 출판 워크플로를 위한 자율 연구 루프입니다.",
        "논문과 보고서를 위한 과학 그림 생성, 레이아웃, 재작성 도구입니다.",
        "연구 결과를 더 쉽게 검토할 수 있게 하는 리뷰, 점검, 비평 워크플로입니다.",
        "AutoFigure 기반 그림 편집 및 부분 수정 워크플로입니다.",
      ],
    },
    status: {
      loading: "버전 확인 중",
      checking: "업데이트 피드 확인 중",
      detecting: "시스템 확인 중",
      detected: "{{platform}} 확인됨",
      version: "최신 v{{version}}",
      none: "공개 릴리스 없음",
      updated: "{{date}} 업데이트",
      feedUnavailable: "업데이트 피드 사용 불가",
      dateFallback: "릴리스 대기",
    },
    hero: {
      kicker: "OPENSCIENCE DESKTOP",
      titleA: "연구를 위한 워크벤치",
      subtitle: "증거를 찾고 분석을 실행하며 데이터, 코드, 그림, 원고를 재현 가능한 기록으로 남깁니다.",
      runningPrefix: "설치 후 로컬에서",
      primary: "OpenScience 다운로드",
      primaryPlatform: "{{platform}}용 다운로드",
      secondary: "모든 버전 보기",
      verbs: ["데이터 계산...", "문헌 확인...", "보고서 작성...", "실험 재현...", "Artifact 정리..."],
    },
    motion: {
      kicker: "WORKSPACE MOTION",
      title: "증거, 분석, 산출물이 함께 움직입니다.",
      subtitle: "하나의 요청이 분석, 그림, 보고서, 검토로 이어집니다.",
      rowA: ["증거 검색", "출처 문단", "로컬 데이터", "실제 코드", "그림 생성", "Notebook", "PDF", "Manuscript"],
      rowB: ["의학 근거", "PICO", "GRADE", "인용 앵커", "프로젝트 기록", "검토 메모", "재현 가능", "협업 전달"],
    },
    scienceMode: {
      kicker: "SCIENCE MODE",
      title: "분자에서 원고까지, 게놈에서 인과 추론까지 하나의 연구 작업공간에서.",
      subtitle: "10개 이상 분야와 350개 이상 기본 스킬로 결과를 실행, 추적, 재현합니다.",
      statA: "10+ 분야",
      statB: "350+ 스킬",
      statC: "재현 가능한 artifact",
      life: { title: "생명과학", text: "유전체 · 단일세포 · 멀티오믹스" },
      drug: { title: "화학과 신약 발견", text: "분자 · 단백질 · 근거" },
      engineering: { title: "공학 계산", text: "재료 · 물리 · 시뮬레이션" },
      data: { title: "데이터 과학", text: "통계 · 계량경제 · 인과 추론" },
      social: { title: "정책과 사회 연구", text: "설문 · 질적 연구 · 보고서" },
      artifact: { title: "Artifact 기록", text: "실행 · 추적 · 재현" },
    },
    systems: {
      evidence: {
        title: "증거를 찾고 바로 분석합니다.",
        text: "출처 문단, 로컬 파일, 코드 실행, 그림 출력을 하나의 프로젝트 안에 연결합니다.",
        keywords: ["증거 검색", "로컬 데이터", "실제 분석"],
      },
      memory: {
        title: "답변이 아니라 프로젝트 기록을 남깁니다.",
        text: "데이터, 증거, 코드, 그림, 메모, 원고 초안을 함께 보관해 나중에 이어갈 수 있습니다.",
        keywords: ["Artifact 이력", "프로젝트 맥락", "지속성"],
      },
      review: {
        title: "전달 전에 주장을 검토합니다.",
        text: "인용, 숫자 출처, 그림 생성 단계, 결론 범위를 계속 확인할 수 있게 둡니다.",
        keywords: ["인용 점검", "숫자 출처", "결론 범위"],
      },
    },
    client: {
      sidebarTask: "연구 작업",
      sidebarArtifacts: "Artifact",
      sidebarReview: "재현 검토",
      promptLabel: "자연어 작업",
      prompt: "이 실험 데이터를 분석하고 재현 가능한 보고서를 생성.",
      saved: "로컬 작업공간에 저장됨",
      reviewTitle: "재현 확인",
      runtime: "로컬 실행",
      statusA: "데이터 계산 중...",
      statusB: "보고서 작성 중...",
      artifactStatus: "기록됨",
      artifacts: [["01", "연구 계획", "protocol.md"], ["02", "증거 데이터", "evidence.json"], ["03", "분석 코드", "analysis.py"], ["04", "그림 출력", "figure.svg"], ["05", "연구 보고서", "report.docx"]],
      reviews: ["출처 기록", "매개변수 고정", "버전 추적", "검토 의견"],
    },
    homePreview: {
      eyebrow: "NEW RESEARCH SESSION",
      title: "자연어로 연구 작업 시작",
      subtitle: "질문, 파일, 데이터를 주면 결과가 추적됩니다.",
      navNew: "새 대화",
      navSearch: "검색",
      navSchedule: "예약 작업",
      collaboration: "협업 기능",
      navMessages: "메시지",
      navCalendar: "캘린더",
      navDocs: "문서",
      navTasks: "작업",
      groupProjects: "연구 프로젝트",
      projectA: "아나필락시스 근거",
      projectB: "에피네프린 관찰 계획",
      promptLabel: "자연어 작업",
      prompt: "이 실험 데이터를 분석하고 재현, 검토, 이어서 진행할 수 있는 연구 보고서를 생성.",
      projectHint: "프로젝트에서 작업",
      send: "시작",
      artifactA: "실험 데이터",
      artifactB: "분석 코드",
      artifactC: "연구 보고서",
      taskABadge: "의학 근거 모드",
      taskAStatus: "근거 정리됨",
      taskATitle: "아나필락시스: 에피네프린, 이차 치료, 관찰 시간",
      taskAText: "OpenScience는 질문을 확인 가능한 결론으로 나누고 가이드라인, 라벨, 임상 근거를 연결합니다.",
      taskAFindingA: "초기 대응",
      taskAFindingAText: "의심되거나 진단되면 근육주사 에피네프린을 우선합니다.",
      taskAFindingB: "이차 치료",
      taskAFindingBText: "항히스타민제와 스테로이드가 구조 처치를 늦추면 안 됩니다.",
      taskAFindingC: "관찰 시간",
      taskAFindingCText: "중증도, 재발 위험, 기도 위험에 따라 나눕니다.",
      taskBBadge: "계획 검토",
      taskBStatus: "확인 대기",
      taskBTitle: "에피네프린 투여, 추적 관찰, 퇴원 안내",
      taskBText: "용량, 주의점, 재발 위험, 퇴원 교육을 하나의 검토 가능한 기록으로 유지합니다.",
      taskBStepA: "고위험군 식별",
      taskBStepB: "용량과 경로 확인",
      taskBStepC: "추적 관찰 목록 작성",
      taskBNoteTitle: "검토 메모",
      taskBNoteText: "각 권고는 출처로 돌아갈 수 있어 임상의와 연구자가 계속 확인할 수 있습니다.",
      traceA: "로컬 실행",
      traceB: "Artifact 기록",
      traceC: "프로젝트 지속",
    },
    cinema: {
      stepA: {
        kicker: "로컬 연구",
        title: "연구는 내 컴퓨터에서 시작됩니다.",
        text: "파일을 읽고 분석을 실행하며 그림을 만들고, 과정을 확인 가능한 기록으로 남깁니다.",
      },
      stepB: {
        kicker: "오픈소스 무료",
        title: "모델과 환경을 자유롭게 선택하세요.",
        text: "OpenScience는 연구자를 위한 무료 데스크톱 작업공간입니다.",
      },
      stepC: {
        kicker: "사이언스 모드",
        title: "여러 학문 분야를 지원합니다.",
        text: "350개 이상의 연구 기술이 생명과학, 화학, 공학 계산, 데이터 과학, 인과 추론을 지원합니다.",
      },
      stepD: {
        kicker: "검토 가능한 결과",
        title: "팀이 결과를 확인할 수 있습니다.",
        text: "보고서, 그림, 노트북, 원고에는 근거와 결정 과정이 남습니다.",
      },
    },
    downloads: {
      kicker: "DOWNLOAD",
      title: "시스템 선택",
      subtitle: "플랫폼별 패키지를 명확히 보여주고 빠르게 다운로드한 뒤 자동 업데이트를 이어갑니다.",
      mac: "Apple Silicon 및 Intel Mac",
      windows: "x64 및 ARM64 설치 파일",
      linux: "DEB / RPM / AppImage",
      pending: "릴리스 패키지 대기",
      open: "다운로드",
    },
    trust: {
      localTitle: "로컬 실행",
      localText: "데스크톱 앱이 실행, 파일 생성, 작업공간 정리를 담당합니다.",
      artifactTitle: "자동 Artifact",
      artifactText: "데이터, 코드, 그림, 보고서를 이후 편집, 동기화, 검토 가능한 artifact로 저장합니다.",
      updateTitle: "자동 업데이트",
      updateText: "클라이언트는 시스템에 맞는 metadata를 읽고 새 릴리스를 받을 수 있습니다.",
    },
    channels: { kicker: "UPDATE FEED", title: "업데이트 채널", subtitle: "업데이트 metadata를 읽습니다.", available: "사용 가능", preparing: "준비 중" },
  },
  es: {
    meta: { title: "Descargar OpenScience" },
    nav: { download: "Descargar", preview: "Vista previa", updates: "Actualizaciones", language: "Idioma" },
    source: {
      panelKicker: "ResearAI Works",
      panelTitle: "Trabajo público de ResearAI",
      panelSubtitle: "OpenScience primero, con DeepScientist, AutoFigure y DeepReview.",
      featured: "Actual",
      descriptions: [
        "Inicia investigación con lenguaje natural y convierte resultados en artifacts trazables, reproducibles y revisables.",
        "Bucle autónomo para literatura, experimentos, redacción y publicación científica.",
        "Generación, maquetación y redibujo de figuras científicas para artículos e informes.",
        "Flujos de revisión, comprobación y crítica para inspeccionar mejor resultados científicos.",
        "Flujo de edición y revisión local de figuras alrededor de AutoFigure.",
      ],
    },
    status: {
      loading: "Leyendo versión",
      checking: "Revisando actualizaciones",
      detecting: "Detectando sistema",
      detected: "{{platform}} detectado",
      version: "Última v{{version}}",
      none: "Sin versión pública todavía",
      updated: "Actualizado {{date}}",
      feedUnavailable: "Feed no disponible",
      dateFallback: "Esperando lanzamiento",
    },
    hero: {
      kicker: "OPENSCIENCE DESKTOP",
      titleA: "Tu mesa de trabajo científica",
      subtitle: "Busca evidencia, ejecuta análisis y conserva datos, código, figuras y manuscritos como registros reproducibles.",
      runningPrefix: "Después de instalar, trabaja localmente en",
      primary: "Descargar OpenScience",
      primaryPlatform: "Descargar para {{platform}}",
      secondary: "Ver versiones",
      verbs: ["calculando datos...", "leyendo papers...", "escribiendo informes...", "reproduciendo experimentos...", "ordenando artifacts..."],
    },
    motion: {
      kicker: "WORKSPACE MOTION",
      title: "Evidencia, análisis y artifacts avanzan juntos.",
      subtitle: "Una petición se convierte en análisis, figuras, informe y revisión.",
      rowA: ["Buscar evidencia", "Pasajes fuente", "Datos locales", "Código real", "Figuras", "Notebook", "PDF", "Manuscript"],
      rowB: ["Evidencia médica", "PICO", "GRADE", "Citas ancladas", "Registro", "Notas de revisión", "Reproducible", "Entrega al equipo"],
    },
    scienceMode: {
      kicker: "SCIENCE MODE",
      title: "Un espacio para todas las ciencias: de moléculas a manuscritos, de genomas a inferencia causal.",
      subtitle: "Más de 10 dominios y 350 skills por defecto para ejecutar, rastrear y reproducir resultados.",
      statA: "10+ dominios",
      statB: "350+ skills",
      statC: "artifacts reproducibles",
      life: { title: "Ciencias de la vida", text: "Genómica · célula única · multiómica" },
      drug: { title: "Química y fármacos", text: "Moléculas · proteínas · evidencia" },
      engineering: { title: "Cómputo de ingeniería", text: "Materiales · física · simulación" },
      data: { title: "Ciencia de datos", text: "Estadística · econometría · causalidad" },
      social: { title: "Política y ciencias sociales", text: "Encuestas · cualitativo · informes" },
      artifact: { title: "Registro artifact", text: "Ejecutar · rastrear · reproducir" },
    },
    systems: {
      evidence: {
        title: "Busca evidencia y ejecuta el análisis.",
        text: "Fuentes, archivos, código y figuras quedan conectados.",
        keywords: ["Evidencia", "Datos locales", "Análisis real"],
      },
      memory: {
        title: "Guarda el proyecto, no solo la respuesta.",
        text: "Datos, código, figuras y notas quedan juntos.",
        keywords: ["Historial", "Contexto", "Continuidad"],
      },
      review: {
        title: "Revisa la afirmación antes de entregar.",
        text: "Citas, números y límites quedan visibles.",
        keywords: ["Citas", "Números", "Límites"],
      },
    },
    client: {
      sidebarTask: "Investigación",
      sidebarArtifacts: "Artifacts",
      sidebarReview: "Revisión",
      promptLabel: "Tarea en lenguaje natural",
      prompt: "Analiza este dataset experimental y genera un informe reproducible.",
      saved: "Guardado en el espacio local",
      reviewTitle: "Comprobación",
      runtime: "ejecución local",
      statusA: "Calculando datos...",
      statusB: "Escribiendo informe...",
      artifactStatus: "registrado",
      artifacts: [["01", "Protocolo", "protocol.md"], ["02", "Datos", "evidence.json"], ["03", "Código", "analysis.py"], ["04", "Figura", "figure.svg"], ["05", "Informe", "report.docx"]],
      reviews: ["Fuentes registradas", "Parámetros fijados", "Versiones trazadas", "Notas de revisión"],
    },
    homePreview: {
      eyebrow: "NEW RESEARCH SESSION",
      title: "Inicia investigación con lenguaje natural",
      subtitle: "Entrega pregunta, archivos y datos. Los resultados quedan trazables.",
      navNew: "Nueva conversación",
      navSearch: "Buscar",
      navSchedule: "Tareas programadas",
      collaboration: "Colaboración",
      navMessages: "Mensajes",
      navCalendar: "Calendario",
      navDocs: "Docs",
      navTasks: "Tareas",
      groupProjects: "Proyectos",
      projectA: "Evidencia de anafilaxia",
      projectB: "Plan de observación",
      promptLabel: "Tarea en lenguaje natural",
      prompt: "Analiza este dataset experimental y genera un informe reproducible, revisable y continuable.",
      projectHint: "Trabajar en un proyecto",
      send: "Iniciar",
      artifactA: "Datos",
      artifactB: "Código",
      artifactC: "Informe",
      taskABadge: "Modo de evidencia médica",
      taskAStatus: "Evidencia organizada",
      taskATitle: "Anafilaxia: epinefrina, segunda línea y observación",
      taskAText: "OpenScience convierte la pregunta en conclusiones verificables y conserva la fuente de cada afirmación.",
      taskAFindingA: "Primera respuesta",
      taskAFindingAText: "Usar epinefrina IM pronto cuando se sospecha o confirma anafilaxia.",
      taskAFindingB: "Segunda línea",
      taskAFindingBText: "Antihistamínicos y esteroides no deben retrasar el rescate.",
      taskAFindingC: "Observación",
      taskAFindingCText: "Estratificar por gravedad, recurrencia y riesgo de vía aérea.",
      taskBBadge: "Revisión del plan",
      taskBStatus: "Pendiente de revisión",
      taskBTitle: "Dosis de epinefrina, seguimiento y alta",
      taskBText: "Dosis, alertas, recurrencia y educación al alta quedan en un registro revisable.",
      taskBStepA: "Identificar alto riesgo",
      taskBStepB: "Comprobar dosis y vía",
      taskBStepC: "Crear seguimiento",
      taskBNoteTitle: "Nota de revisión",
      taskBNoteText: "Cada recomendación vuelve a su fuente para que el equipo pueda revisarla.",
      traceA: "Ejecución local",
      traceB: "Rastro artifact",
      traceC: "Continuidad del proyecto",
    },
    cinema: {
      stepA: {
        kicker: "INVESTIGACION LOCAL",
        title: "La investigacion empieza en tu ordenador.",
        text: "Lee archivos, ejecuta analisis y crea figuras con un proceso que puedes revisar.",
      },
      stepB: {
        kicker: "ABIERTO Y GRATIS",
        title: "Elige tus modelos y tu entorno.",
        text: "OpenScience es un espacio de escritorio gratuito para investigadores.",
      },
      stepC: {
        kicker: "SCIENCE MODE",
        title: "Hecho para muchas ciencias.",
        text: "350+ skills cubren ciencias de la vida, quimica, ingenieria, datos e inferencia causal.",
      },
      stepD: {
        kicker: "RESULTADOS REVISABLES",
        title: "Resultados que tu equipo puede revisar.",
        text: "Informes, figuras, notebooks y manuscritos conservan la evidencia y las decisiones.",
      },
    },
    downloads: {
      kicker: "DOWNLOAD",
      title: "Elige tu sistema",
      subtitle: "Elige sistema y recibe actualizaciones.",
      mac: "Apple Silicon e Intel Mac",
      windows: "Instaladores x64 y ARM64",
      linux: "DEB / RPM / AppImage",
      pending: "Paquete pendiente",
      open: "Descargar",
    },
    trust: {
      localTitle: "Ejecución local",
      localText: "La app de escritorio ejecuta tareas, genera archivos y organiza el espacio de trabajo.",
      artifactTitle: "Artifacts automáticos",
      artifactText: "Datos, código, figuras e informes se guardan para edición, sincronización y revisión posterior.",
      updateTitle: "Actualización automática",
      updateText: "El cliente lee metadata compatible con tu sistema y puede recibir nuevas versiones.",
    },
    channels: { kicker: "UPDATE FEED", title: "Canales de actualización", subtitle: "Metadata para buscar nuevas versiones.", available: "Listo", preparing: "Pendiente" },
  },
  ar: {
    meta: { title: "تنزيل OpenScience" },
    nav: { download: "تنزيل", preview: "معاينة العميل", updates: "التحديثات", language: "اللغة" },
    source: {
      panelKicker: "ResearAI Works",
      panelTitle: "أعمال ResearAI العامة",
      panelSubtitle: "OpenScience أولا، ثم DeepScientist و AutoFigure و DeepReview.",
      featured: "المشروع الحالي",
      descriptions: [
        "ابدأ البحث باللغة الطبيعية وحول النتائج إلى artifacts قابلة للتتبع والإعادة والمراجعة.",
        "حلقة بحث مستقلة للأدبيات والتجارب والكتابة والنشر.",
        "إنشاء وتنسيق وإعادة رسم الأشكال العلمية للأوراق والتقارير.",
        "مسارات مراجعة وتحقق ونقد تجعل نتائج البحث أسهل للفحص.",
        "مسار تحرير وتعديل موضعي للأشكال حول AutoFigure.",
      ],
    },
    status: {
      loading: "قراءة الإصدار",
      checking: "فحص قناة التحديث",
      detecting: "اكتشاف النظام",
      detected: "تم اكتشاف {{platform}}",
      version: "الأحدث v{{version}}",
      none: "لا يوجد إصدار عام بعد",
      updated: "تم التحديث {{date}}",
      feedUnavailable: "قناة التحديث غير متاحة",
      dateFallback: "بانتظار الإصدار",
    },
    hero: {
      kicker: "OPENSCIENCE DESKTOP",
      titleA: "مساحة عمل للبحث العلمي",
      subtitle: "يبحث OpenScience عن الأدلة، يشغّل التحليل، ويحفظ البيانات والكود والأشكال والمخطوطات كسجل قابل للإعادة.",
      runningPrefix: "بعد التثبيت يعمل محليا على",
      primary: "تنزيل OpenScience",
      primaryPlatform: "تنزيل لـ {{platform}}",
      secondary: "كل الإصدارات",
      verbs: ["يحلل البيانات...", "يقرأ الأوراق...", "يكتب التقارير...", "يعيد التجارب...", "ينظم artifacts..."],
    },
    motion: {
      kicker: "WORKSPACE MOTION",
      title: "الأدلة والتحليل والنتائج تتحرك معا.",
      subtitle: "طلب واحد يتحول إلى تحليل وأشكال وتقرير ومسار مراجعة.",
      rowA: ["بحث الأدلة", "مقاطع المصدر", "بيانات محلية", "كود حقيقي", "إخراج الأشكال", "Notebook", "PDF", "Manuscript"],
      rowB: ["دليل طبي", "PICO", "GRADE", "روابط الاقتباس", "سجل المشروع", "ملاحظات مراجعة", "قابل للإعادة", "تسليم الفريق"],
    },
    scienceMode: {
      kicker: "SCIENCE MODE",
      title: "مساحة واحدة لكل العلوم: من الجزيئات إلى المخطوطات، ومن الجينومات إلى الاستدلال السببي.",
      subtitle: "أكثر من 10 مجالات و350 مهارة افتراضية لتشغيل النتائج وتتبعها وإعادتها.",
      statA: "10+ مجالات",
      statB: "350+ مهارة",
      statC: "Artifacts قابلة للإعادة",
      life: { title: "علوم الحياة", text: "جينومات · خلية واحدة · أوميكس متعددة" },
      drug: { title: "الكيمياء واكتشاف الدواء", text: "جزيئات · بروتينات · أدلة" },
      engineering: { title: "حوسبة هندسية", text: "مواد · فيزياء · محاكاة" },
      data: { title: "علم البيانات", text: "إحصاء · اقتصاد قياسي · سببية" },
      social: { title: "سياسات وعلوم اجتماعية", text: "استبيانات · نوعي · تقارير" },
      artifact: { title: "سجل Artifact", text: "تشغيل · تتبع · إعادة" },
    },
    systems: {
      evidence: {
        title: "ابحث عن الأدلة ثم شغل التحليل.",
        text: "المصادر والملفات والكود والأشكال تبقى متصلة.",
        keywords: ["بحث الأدلة", "بيانات محلية", "تحليل حقيقي"],
      },
      memory: {
        title: "احتفظ بسجل المشروع، لا بالإجابة فقط.",
        text: "تبقى البيانات والأدلة والكود والأشكال والملاحظات ومسودات البحث معا للمتابعة لاحقا.",
        keywords: ["تاريخ Artifact", "سياق المشروع", "استمرارية"],
      },
      review: {
        title: "راجع الادعاء قبل التسليم.",
        text: "تبقى الاقتباسات والأرقام وخطوات الأشكال وحدود الاستنتاج مرئية للفحص والدفاع.",
        keywords: ["فحص الاقتباس", "مصادر الأرقام", "حدود الاستنتاج"],
      },
    },
    client: {
      sidebarTask: "بحث",
      sidebarArtifacts: "Artifacts",
      sidebarReview: "مراجعة",
      promptLabel: "مهمة باللغة الطبيعية",
      prompt: "حلل بيانات التجربة وأنشئ تقريرا قابلا للإعادة.",
      saved: "تم الحفظ في مساحة العمل المحلية",
      reviewTitle: "فحص الإعادة",
      runtime: "تشغيل محلي",
      statusA: "يحلل البيانات...",
      statusB: "يكتب التقرير...",
      artifactStatus: "مسجل",
      artifacts: [["01", "الخطة", "protocol.md"], ["02", "البيانات", "evidence.json"], ["03", "الكود", "analysis.py"], ["04", "الشكل", "figure.svg"], ["05", "التقرير", "report.docx"]],
      reviews: ["المصادر مسجلة", "المعاملات ثابتة", "الإصدارات متتبعة", "ملاحظات المراجعة"],
    },
    homePreview: {
      eyebrow: "NEW RESEARCH SESSION",
      title: "ابدأ البحث باللغة الطبيعية",
      subtitle: "قدّم السؤال والملفات والبيانات. تبقى النتائج قابلة للتتبع.",
      navNew: "محادثة جديدة",
      navSearch: "بحث",
      navSchedule: "مهام مجدولة",
      collaboration: "التعاون",
      navMessages: "الرسائل",
      navCalendar: "التقويم",
      navDocs: "المستندات",
      navTasks: "المهام",
      groupProjects: "مشاريع بحثية",
      projectA: "دليل التأق",
      projectB: "خطة مراقبة الإبينفرين",
      promptLabel: "مهمة باللغة الطبيعية",
      prompt: "حلل بيانات التجربة وأنشئ تقريرا قابلا للإعادة والمراجعة والمتابعة.",
      projectHint: "العمل داخل مشروع",
      send: "ابدأ",
      artifactA: "بيانات التجربة",
      artifactB: "كود التحليل",
      artifactC: "تقرير البحث",
      taskABadge: "وضع الدليل الطبي",
      taskAStatus: "تم تنظيم الأدلة",
      taskATitle: "التأق: الإبينفرين والعلاج الثاني ووقت المراقبة",
      taskAText: "يحوّل OpenScience السؤال إلى استنتاجات قابلة للفحص ويربط كل ادعاء بمصدره.",
      taskAFindingA: "الاستجابة الأولى",
      taskAFindingAText: "استخدم الإبينفرين العضلي مبكرا عند الاشتباه أو التشخيص.",
      taskAFindingB: "العلاج الثاني",
      taskAFindingBText: "لا ينبغي أن تؤخر مضادات الهيستامين أو الستيرويدات الإنقاذ.",
      taskAFindingC: "المراقبة",
      taskAFindingCText: "قسّم حسب الشدة وخطر النكس وخطر مجرى الهواء.",
      taskBBadge: "مراجعة الخطة",
      taskBStatus: "بانتظار المراجعة",
      taskBTitle: "جرعة الإبينفرين والمتابعة وتعليمات الخروج",
      taskBText: "تبقى الجرعة والتنبيهات وخطر النكس وتعليمات الخروج في سجل قابل للمراجعة.",
      taskBStepA: "تحديد الفئات عالية الخطر",
      taskBStepB: "فحص الجرعة والطريق",
      taskBStepC: "إنشاء قائمة متابعة",
      taskBNoteTitle: "ملاحظة مراجعة",
      taskBNoteText: "يمكن الرجوع بمصدر كل توصية كي يراجعها الفريق لاحقا.",
      traceA: "تشغيل محلي",
      traceB: "أثر Artifact",
      traceC: "استمرار المشروع",
    },
    cinema: {
      stepA: {
        kicker: "بحث محلي",
        title: "يبدأ البحث من حاسوبك.",
        text: "اقرأ الملفات وشغل التحليل وأنشئ الأشكال مع بقاء العملية قابلة للفحص.",
      },
      stepB: {
        kicker: "مفتوح ومجاني",
        title: "اختر النماذج والبيئة التي تريدها.",
        text: "OpenScience مساحة عمل مكتبية مجانية للباحثين.",
      },
      stepC: {
        kicker: "وضع العلم",
        title: "مصمم لعلوم متعددة.",
        text: "أكثر من 350 مهارة بحثية تغطي علوم الحياة والكيمياء والحوسبة الهندسية وعلوم البيانات والاستدلال السببي.",
      },
      stepD: {
        kicker: "نتائج قابلة للمراجعة",
        title: "نتائج يستطيع الفريق فحصها.",
        text: "تحتفظ التقارير والأشكال والدفاتر والمخطوطات بالأدلة والقرارات خلفها.",
      },
    },
    downloads: {
      kicker: "DOWNLOAD",
      title: "اختر نظامك",
      subtitle: "حزم واضحة لكل منصة، تنزيل سريع، وتحديثات تلقائية لاحقة.",
      mac: "Apple Silicon و Intel Mac",
      windows: "مثبتات x64 و ARM64",
      linux: "DEB / RPM / AppImage",
      pending: "حزمة الإصدار قيد التحضير",
      open: "تنزيل",
    },
    trust: {
      localTitle: "تشغيل محلي",
      localText: "يتولى تطبيق سطح المكتب التنفيذ وتوليد الملفات وتنظيم مساحة العمل محليا.",
      artifactTitle: "Artifacts تلقائية",
      artifactText: "تحفظ البيانات والكود والأشكال والتقارير للتحرير والمزامنة والمراجعة لاحقا.",
      updateTitle: "تحديث تلقائي",
      updateText: "يقرأ العميل metadata المناسبة لنظامك ليستقبل الإصدارات الجديدة.",
    },
    channels: { kicker: "UPDATE FEED", title: "قنوات التحديث", subtitle: "ملفات metadata لفحص الإصدارات.", available: "متاح", preparing: "قيد التحضير" },
  },
};

const state = {
  language: resolveInitialLanguage(),
  status: null,
  platform: detectPlatform(),
  verbIndex: 0,
  capabilitySwapIndex: 0,
  capabilitySwapTimer: null,
  capabilitySwapPaused: true,
  capabilitySwapVisible: false,
};

function resolveInitialLanguage() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get("lang") || localStorage.getItem("openscience-language");
  if (requested && translations[requested]) return requested;
  return "en";
}

function t(path, params = {}) {
  const fallback = translations.en;
  const table = translations[state.language] || fallback;
  const value = path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), table);
  const fallbackValue = path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), fallback);
  const resolved = value === undefined ? fallbackValue : value;
  if (typeof resolved !== "string") return resolved;
  return resolved.replace(/\{\{(\w+)\}\}/g, (_, key) => params[key] ?? "");
}

function iconSrc(name) {
  return `${iconBase}/${name}.png`;
}

function platformIcon(platform) {
  return platformIcons[platform] || platformIcons.Universal;
}

function detectPlatform() {
  const agent = `${navigator.platform || ""} ${navigator.userAgent || ""}`.toLowerCase();
  if (agent.includes("mac")) return "macOS";
  if (agent.includes("win")) return "Windows";
  if (agent.includes("linux")) return "Linux";
  return "Universal";
}

function formatDate(value) {
  if (!value) return t("status.dateFallback");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("status.dateFallback");
  return new Intl.DateTimeFormat(locales[state.language] || "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.documentElement.dir = state.language === "ar" ? "rtl" : "ltr";
  document.title = t("meta.title");
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const value = t(node.dataset.i18n);
    if (typeof value === "string") node.textContent = value;
  });
  renderSourceWorks();
  renderFeatureKeywords();
  renderCapabilityMarquee();
  renderCapabilitySwap();
  renderArtifacts();
  renderReviews();
  renderStatus();
  renderDownloads();
  renderChannels();
  prepareSplitReveal();
  prepareCinemaCopy();
  updateVerb(true);
  moveNavGlider(document.querySelector(".nav-link.is-active") || document.querySelector("[data-nav-link]"));
}

function renderSourceWorks() {
  const list = document.getElementById("sourceWorkList");
  if (!list) return;
  list.innerHTML = "";
  sourceWorks.forEach((work) => {
    const link = document.createElement("a");
    link.className = "source-work-card";
    link.href = work.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `
      <strong>${escapeHtml(work.repo)}</strong>
    `;
    list.appendChild(link);
  });
}

function renderArtifacts() {
  const list = document.getElementById("artifactList");
  if (!list) return;
  const artifacts = t("client.artifacts") || [];
  list.innerHTML = "";
  artifacts.forEach(([number, title, file]) => {
    const row = document.createElement("div");
    row.className = "artifact-row";
    row.innerHTML = `
      <span class="artifact-row__icon">${escapeHtml(number)}</span>
      <span>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(file)}</span>
      </span>
      <em class="artifact-row__state">${escapeHtml(t("client.artifactStatus"))}</em>
    `;
    list.appendChild(row);
  });
}

function renderFeatureKeywords() {
  document.querySelectorAll("[data-keywords]").forEach((node) => {
    const keywords = t(node.dataset.keywords) || [];
    node.innerHTML = "";
    if (!Array.isArray(keywords)) return;
    keywords.forEach((keyword) => {
      const chip = document.createElement("span");
      chip.textContent = keyword;
      node.appendChild(chip);
    });
  });
}

function renderCapabilityMarquee() {
  [
    ["capabilityRowA", t("motion.rowA") || []],
    ["capabilityRowB", t("motion.rowB") || []],
  ].forEach(([id, items], rowIndex) => {
    const row = document.getElementById(id);
    if (!row) return;
    row.innerHTML = "";
    if (!Array.isArray(items) || !items.length) return;
    const repeated = [...items, ...items, ...items];
    repeated.forEach((label, index) => {
      const pill = document.createElement("span");
      pill.className = "capability-pill";
      const iconName = capabilityIconRows[rowIndex]?.[index % items.length] || "artifact-history";
      pill.innerHTML = `<img src="${iconSrc(iconName)}" alt="" loading="lazy" decoding="async" /><span>${escapeHtml(label)}</span>`;
      pill.setAttribute("aria-hidden", index >= items.length ? "true" : "false");
      row.appendChild(pill);
    });
    row.style.setProperty("--marquee-offset", rowIndex === 0 ? "0px" : "-120px");
  });
}

function capabilitySwapCards() {
  const cards = t("capabilitySwap.cards");
  return Array.isArray(cards) && cards.length ? cards : translations.en.capabilitySwap.cards;
}

function renderCapabilitySwap() {
  const cardRoot = document.getElementById("capabilitySwapCards");
  const dotRoot = document.getElementById("capabilitySwapDots");
  if (!cardRoot || !dotRoot) return;
  const cards = capabilitySwapCards();
  const activeIndex = Math.min(state.capabilitySwapIndex, Math.max(0, cards.length - 1));

  cardRoot.innerHTML = "";
  dotRoot.innerHTML = "";
  cards.forEach((card, index) => {
    const article = document.createElement("article");
    article.className = "capability-swap-card";
    article.dataset.index = String(index);
    article.dataset.visual = card.tone || ["paper", "green", "blue", "gold"][index % 4];
    article.innerHTML = `
      <div class="capability-swap-card__head">
        <img src="${iconSrc(capabilitySwapIcon(index))}" alt="" loading="lazy" decoding="async" />
        <span>${escapeHtml(card.label)}</span>
      </div>
      <div>
        <h3>${escapeHtml(card.title)}</h3>
        <p>${escapeHtml(card.text)}</p>
      </div>
      ${capabilitySwapVisual(index, card)}
    `;
    cardRoot.appendChild(article);

    const dot = document.createElement("button");
    dot.className = "capability-swap-dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `${index + 1}. ${card.label}`);
    dot.addEventListener("click", () => {
      setCapabilitySwapIndex(index);
      restartCapabilitySwap();
    });
    dotRoot.appendChild(dot);
  });

  setCapabilitySwapIndex(activeIndex);
}

function capabilitySwapIcon(index) {
  return ["project-record", "medical-evidence-mode", "scientific-research-mode", "artifact-history"][index % 4];
}

function capabilitySwapVisual(index, card) {
  const keywords = Array.isArray(card.keywords) ? card.keywords : [];
  const image = card.image || "assets/showcase/openscience-new-session.png";
  const chips = keywords
    .map((keyword) => `<span>${escapeHtml(keyword)}</span>`)
    .join("");
  return `
    <div class="capability-screenshot-board capability-screenshot-board--${escapeHtml(card.tone || "paper")}">
      <div class="capability-screenshot-frame">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(card.title)}" loading="lazy" decoding="async" />
      </div>
      <div class="capability-screenshot-meta">
        <div class="capability-keywords">${chips}</div>
      </div>
    </div>
  `;
}

function setCapabilitySwapIndex(index) {
  const cards = [...document.querySelectorAll(".capability-swap-card")];
  if (!cards.length) return;
  const data = capabilitySwapCards();
  state.capabilitySwapIndex = ((index % cards.length) + cards.length) % cards.length;
  cards.forEach((card, cardIndex) => {
    const position = (cardIndex - state.capabilitySwapIndex + cards.length) % cards.length;
    card.dataset.position = String(position);
    card.classList.toggle("is-active", position === 0);
  });

  document.querySelectorAll(".capability-swap-dot").forEach((dot, dotIndex) => {
    const active = dotIndex === state.capabilitySwapIndex;
    dot.classList.toggle("is-active", active);
    dot.setAttribute("aria-current", active ? "true" : "false");
  });

  const indexLabel = document.getElementById("capabilitySwapIndex");
  const cardLabel = document.getElementById("capabilitySwapLabel");
  if (indexLabel) indexLabel.textContent = String(state.capabilitySwapIndex + 1).padStart(2, "0");
  if (cardLabel) cardLabel.textContent = data[state.capabilitySwapIndex]?.label || "";
}

function startCapabilitySwap() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  state.capabilitySwapPaused = false;
  if (state.capabilitySwapTimer) return;
  state.capabilitySwapTimer = window.setInterval(() => {
    if (!state.capabilitySwapPaused && state.capabilitySwapVisible) {
      setCapabilitySwapIndex(state.capabilitySwapIndex + 1);
    }
  }, 2800);
}

function stopCapabilitySwap() {
  state.capabilitySwapPaused = true;
  if (state.capabilitySwapTimer) {
    window.clearInterval(state.capabilitySwapTimer);
    state.capabilitySwapTimer = null;
  }
}

function restartCapabilitySwap() {
  stopCapabilitySwap();
  if (state.capabilitySwapVisible) startCapabilitySwap();
}

function setupCapabilitySwap() {
  const stage = document.getElementById("capabilitySwap");
  if (!stage) return;
  stage.addEventListener("mouseenter", stopCapabilitySwap);
  stage.addEventListener("mouseleave", () => {
    if (state.capabilitySwapVisible) startCapabilitySwap();
  });
  stage.addEventListener("focusin", stopCapabilitySwap);
  stage.addEventListener("focusout", () => {
    if (state.capabilitySwapVisible) startCapabilitySwap();
  });

  if (!("IntersectionObserver" in window)) {
    state.capabilitySwapVisible = true;
    startCapabilitySwap();
    return;
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      state.capabilitySwapVisible = Boolean(entry?.isIntersecting);
      if (state.capabilitySwapVisible) startCapabilitySwap();
      else stopCapabilitySwap();
    },
    { threshold: [0.32, 0.62] },
  );
  observer.observe(stage);
}

function renderReviews() {
  const list = document.getElementById("reviewList");
  if (!list) return;
  list.innerHTML = "";
  (t("client.reviews") || []).forEach((item) => {
    const row = document.createElement("div");
    row.className = "review-item";
    row.textContent = item;
    list.appendChild(row);
  });
}

function renderStatus() {
  const latestVersion = document.getElementById("latestVersion");
  const updatedAt = document.getElementById("updatedAt");
  const detectedPlatform = document.getElementById("detectedPlatform");
  const clientRuntime = document.getElementById("clientRuntime");
  const status = state.status;

  if (detectedPlatform) {
    detectedPlatform.textContent = t("status.detected", { platform: state.platform });
  }
  if (clientRuntime) {
    clientRuntime.textContent = status?.latestVersion
      ? `${t("client.runtime")} · v${status.latestVersion}`
      : t("client.runtime");
  }
  if (!status) {
    if (latestVersion) latestVersion.textContent = t("status.loading");
    if (updatedAt) updatedAt.textContent = t("status.checking");
    return;
  }
  if (latestVersion) {
    latestVersion.textContent = status.latestVersion
      ? t("status.version", { version: status.latestVersion })
      : t("status.none");
  }
  if (updatedAt) {
    updatedAt.textContent = status.updatedAt
      ? t("status.updated", { date: formatDate(status.updatedAt) })
      : t("status.feedUnavailable");
  }
}

function collectDownloads() {
  const result = { macOS: [], Windows: [], Linux: [] };
  const downloads = state.status?.downloads || {};
  Object.keys(result).forEach((platform) => {
    const items = Array.isArray(downloads[platform]) ? downloads[platform] : [];
    result[platform] = items.slice();
  });
  if (state.status?.assets?.length) {
    state.status.assets.forEach((asset) => {
      if (!result[asset.platform]) return;
      const exists = result[asset.platform].some((item) => item.url === asset.url || item.name === asset.name);
      if (!exists) result[asset.platform].push(asset);
    });
  }
  Object.keys(result).forEach((platform) => {
    const priority = platformPriority[platform] || [];
    result[platform].sort((a, b) => {
      const ai = priority.indexOf(a.kind);
      const bi = priority.indexOf(b.kind);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || String(a.arch).localeCompare(String(b.arch));
    });
  });
  return result;
}

function renderDownloads() {
  const grouped = collectDownloads();
  Object.entries(platformIds).forEach(([platform, id]) => {
    const container = document.getElementById(id);
    if (!container) return;
    const items = grouped[platform] || [];
    container.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("span");
      empty.className = "empty";
      empty.innerHTML = `<img class="empty__icon" src="${iconSrc("status-pending")}" alt="" loading="lazy" decoding="async" /><span>${escapeHtml(t("downloads.pending"))}</span>`;
      container.appendChild(empty);
      return;
    }
    items.forEach((asset) => {
      const link = document.createElement("a");
      link.className = "asset-button";
      link.href = asset.url;
      link.setAttribute("download", "");
      link.innerHTML = `
        <span class="asset-button__body">
          <img class="asset-button__icon" src="${iconSrc(platformIcon(platform))}" alt="" loading="lazy" decoding="async" />
          <span class="asset-button__text">
          <strong>${escapeHtml(asset.name || asset.kind || platform)}</strong>
          <span>${escapeHtml([asset.kind, asset.arch, asset.sizeLabel].filter(Boolean).join(" · "))}</span>
          </span>
        </span>
        <em><img class="channel-state__icon" src="${iconSrc("external-link")}" alt="" loading="lazy" decoding="async" />${escapeHtml(t("downloads.open"))}</em>
      `;
      container.appendChild(link);
    });
  });
  updatePrimaryDownload(grouped);
}

function updatePrimaryDownload(grouped = collectDownloads()) {
  const primary = document.getElementById("primaryDownload");
  const label = document.getElementById("primaryDownloadLabel");
  if (!primary || !label) return;
  const platform = grouped[state.platform] ? state.platform : "macOS";
  const asset = grouped[platform]?.[0];
  const icon = primary.querySelector(".button-icon");
  if (icon) icon.setAttribute("src", iconSrc(platformIcon(platform)));
  label.textContent = asset
    ? t("hero.primaryPlatform", { platform })
    : t("hero.primary");
  if (asset) {
    primary.href = asset.url;
    primary.setAttribute("download", "");
  } else {
    primary.href = "#downloads";
    primary.removeAttribute("download");
  }
}

function renderChannels() {
  const list = document.getElementById("channelList");
  if (!list) return;
  const channels = state.status?.channels || {};
  list.innerHTML = "";
  Object.entries(channelLabels).forEach(([file, label]) => {
    const channel = channels[file] || { present: false, url: "#", updatedAt: null };
    const card = document.createElement(channel.present ? "a" : "div");
    card.className = "channel-card";
    if (channel.present) {
      card.href = channel.url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    card.innerHTML = `
      <span>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(channel.updatedAt ? formatDate(channel.updatedAt) : t("status.dateFallback"))}</span>
      </span>
      <em class="channel-state ${channel.present ? "is-ready" : "is-pending"}">
        <img class="channel-state__icon" src="${iconSrc(channel.present ? "status-ready" : "status-pending")}" alt="" loading="lazy" decoding="async" />
        ${escapeHtml(channel.present ? t("channels.available") : t("channels.preparing"))}
      </em>
    `;
    list.appendChild(card);
  });
}

async function loadStatus() {
  try {
    const response = await fetch(new URL("api/status", window.location.href), { cache: "no-store" });
    if (!response.ok) throw new Error(`status ${response.status}`);
    state.status = await response.json();
  } catch (error) {
    state.status = { ok: false, error: String(error), downloads: {}, channels: {} };
  }
  renderStatus();
  renderDownloads();
  renderChannels();
}

function setupLanguageSelect() {
  const select = document.getElementById("languageSelect");
  if (!select) return;
  select.value = state.language;
  select.addEventListener("change", () => {
    state.language = select.value;
    localStorage.setItem("openscience-language", state.language);
    applyTranslations();
  });
}

function setupSourceMenu() {
  const button = document.getElementById("sourceButton");
  const panel = document.getElementById("sourcePanel");
  if (!button || !panel) return;

  const close = () => {
    button.setAttribute("aria-expanded", "false");
    panel.hidden = true;
  };
  const toggle = () => {
    const nextOpen = button.getAttribute("aria-expanded") !== "true";
    button.setAttribute("aria-expanded", String(nextOpen));
    panel.hidden = !nextOpen;
  };

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    toggle();
  });
  panel.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("click", close);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close();
  });
}

function setupReveal() {
  const nodes = [...document.querySelectorAll("[data-reveal]")];
  if (!nodes.length) return;
  let ticking = false;
  const revealVisible = () => {
    ticking = false;
    const trigger = window.innerHeight * 0.86;
    nodes.forEach((node) => {
      if (node.classList.contains("is-visible")) return;
      const rect = node.getBoundingClientRect();
      if (rect.top < trigger && rect.bottom > 0) {
        node.classList.add("is-visible");
      }
    });
  };
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(revealVisible);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  revealVisible();
}

function prepareSplitReveal() {
  document.querySelectorAll("[data-split-reveal]").forEach((node) => {
    const text = node.textContent?.trim() || "";
    if (!text) return;
    const splitByWord = /\s/u.test(text);
    const parts = splitByWord ? text.split(/(\s+)/u) : [...text];
    node.innerHTML = parts
      .map((part) => {
        if (!part) return "";
        if (/^\s+$/u.test(part)) return part;
        const className = splitByWord ? "split-word" : "split-char";
        return `<span class="${className}">${escapeHtml(part)}</span>`;
      })
      .join("");
  });
}

function setupSpotlightCards() {
  document.querySelectorAll("[data-spotlight-card]").forEach((card) => {
    const hasGlow = Array.from(card.children).some((child) => child.classList?.contains("spotlight-glow"));
    if (!hasGlow) {
      const glow = document.createElement("span");
      glow.className = "spotlight-glow";
      glow.setAttribute("aria-hidden", "true");
      card.appendChild(glow);
    }
    card.addEventListener("pointermove", (event) => {
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
      card.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
    });
  });
}

function prepareCinemaCopy() {
  document.querySelectorAll(".cinema-copy h2, .cinema-copy > span").forEach((node) => {
    const text = node.textContent?.trim() || "";
    if (!text) return;
    const splitByWord = /\s/u.test(text);
    const parts = splitByWord ? text.split(/(\s+)/u) : [...text];
    node.innerHTML = parts
      .map((part) => {
        if (!part) return "";
        if (/^\s+$/u.test(part)) return part;
        return `<span class="cinema-word">${escapeHtml(part)}</span>`;
      })
      .join("");
  });
}

function setupHeroCinemaBridge() {
  const hero = document.querySelector(".hero-section");
  const motionLayer = document.getElementById("heroMotionLayer");
  const bridge = document.getElementById("heroCinemaBridge");
  const previewVideo = document.getElementById("heroCinemaPreview");
  const cinema = document.querySelector(".scroll-cinema");
  if (!hero || !motionLayer) return;

  let ticking = false;
  const motionScale = 1.8;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (previewVideo) {
    previewVideo.muted = true;
    previewVideo.playsInline = true;
    previewVideo.loop = true;
    previewVideo.preload = "metadata";
    previewVideo.playbackRate = 1 / motionScale;
  }
  const smooth = (value) => {
    const clamped = Math.min(1, Math.max(0, value));
    return clamped * clamped * (3 - 2 * clamped);
  };

  const update = () => {
    ticking = false;
    const viewport = window.innerHeight || 1;
    const heroRect = hero.getBoundingClientRect();
    const cinemaTop = cinema?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
    const travel = Math.max(0, -heroRect.top);
    const prelude = smooth((travel - viewport * 0.34) / Math.max(1, viewport * 0.58 * motionScale));
    const lift = smooth((travel - viewport * 0.64) / Math.max(1, viewport * 0.54 * motionScale));
    const handoff = smooth((viewport * 0.54 - cinemaTop) / Math.max(1, viewport * 0.52 * motionScale));
    const compact = window.innerWidth <= 760;

    motionLayer.style.setProperty("--hero-motion-opacity", (0.28 + prelude * 0.34 - handoff * 0.36).toFixed(3));
    motionLayer.style.setProperty("--hero-motion-y", `${(prelude * (compact ? 150 : 210) - lift * (compact ? 70 : 110) - handoff * 80).toFixed(1)}px`);
    motionLayer.style.setProperty("--hero-motion-scale", (1 + prelude * 0.075).toFixed(4));
    motionLayer.style.setProperty("--hero-motion-radius", `${(18 + prelude * 18).toFixed(1)}px`);
    motionLayer.style.setProperty("--hero-motion-veil", (1 - prelude * 0.5).toFixed(3));
    motionLayer.style.setProperty("--hero-motion-z", prelude > 0.18 && handoff < 0.94 ? "1" : "0");
    motionLayer.style.setProperty("--hero-motion-shadow", prelude > 0.2 ? "0 34px 120px rgba(24, 21, 18, 0.16)" : "none");
    motionLayer.style.setProperty("--hero-motion-mask", prelude > 0.44 ? "linear-gradient(180deg, #000 0%, #000 100%)" : "linear-gradient(180deg, transparent 0%, #000 16%, #000 78%, transparent 100%)");

    if (!bridge) return;
    const bridgeReveal = smooth((travel - viewport * 0.62) / Math.max(1, viewport * 0.48 * motionScale));
    const bridgeOpacity = Math.min(0.98, bridgeReveal * 1.12) * (1 - handoff * 0.9);
    bridge.style.setProperty("--hero-cinema-opacity", bridgeOpacity.toFixed(3));
    bridge.style.setProperty("--hero-cinema-y", `${((compact ? 270 : 210) - bridgeReveal * (compact ? 150 : 175) - handoff * 90).toFixed(1)}px`);
    bridge.style.setProperty("--hero-cinema-scale", (0.88 + bridgeReveal * 0.12).toFixed(4));
    bridge.style.setProperty("--hero-cinema-radius", `${(44 - bridgeReveal * 18).toFixed(1)}px`);
    bridge.style.setProperty("--hero-cinema-z", bridgeReveal > 0.12 && handoff < 0.95 ? "1" : "0");
    bridge.style.setProperty("--hero-cinema-shade", (0.78 - bridgeReveal * 0.36).toFixed(3));

    if (previewVideo && !reduceMotion) {
      const shouldPlay = bridgeOpacity > 0.36 && handoff < 0.82;
      if (shouldPlay && previewVideo.paused) {
        previewVideo.playbackRate = 1 / motionScale;
        previewVideo.play().catch(() => {});
      } else if (!shouldPlay && !previewVideo.paused) {
        previewVideo.pause();
      }
      if (bridgeReveal < 0.08 || handoff > 0.9) {
        try {
          previewVideo.currentTime = 0;
        } catch {
          // Metadata can arrive after the first scroll event.
        }
      }
    }
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
}

function setupScrollCinema() {
  const section = document.querySelector(".scroll-cinema");
  const video = document.getElementById("researchCinema");
  const steps = [...document.querySelectorAll("[data-cinema-step]")];
  const progressBar = document.getElementById("cinemaProgress");
  if (!section || !video || !steps.length) return;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let ticking = false;
  let raf = 0;
  let started = false;
  let completed = false;
  let fallbackStart = 0;
  let fallbackRunning = false;
  let lastScrollY = window.scrollY;
  let scrollDirection = 1;
  const speedScale = 1.8;
  const fallbackDuration = 5.2 * speedScale;
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  video.playbackRate = 1 / speedScale;

  const smooth = (value) => {
    const clamped = Math.min(1, Math.max(0, value));
    return clamped * clamped * (3 - 2 * clamped);
  };

  const updateStep = (step, progress, forceVisible = false) => {
    const start = Number(step.dataset.start || "0");
    const end = Number(step.dataset.end || "1");
    const local = (progress - start) / Math.max(0.001, end - start);
    const enter = smooth(local / 0.22);
    const exit = 1 - smooth((local - 0.76) / 0.28);
    const visible = forceVisible ? 1 : Math.min(1, Math.max(0, enter * exit));
    const direction = step.classList.contains("cinema-copy--right") ? 1 : -1;
    step.style.opacity = visible.toFixed(3);
    step.style.filter = `blur(${((1 - visible) * 4).toFixed(2)}px)`;
    step.style.transform = `translate3d(${(direction * (1 - visible) * 24).toFixed(1)}px, ${((1 - visible) * 14).toFixed(1)}px, 0)`;
    step.toggleAttribute("data-active", visible > 0.08);

    [...step.querySelectorAll(".cinema-word")].forEach((word, index) => {
      const dense = step.querySelectorAll(".cinema-word").length > 9;
      const wordProgress = smooth((local - (dense ? 0.02 : 0.045) - index * (dense ? 0.006 : 0.013)) / (dense ? 0.22 : 0.3));
      word.style.setProperty("--word-visible", (visible * wordProgress).toFixed(3));
    });
  };

  const paintProgress = (progress) => {
    const clamped = Math.min(1, Math.max(0, progress));
    section.style.setProperty("--cinema-progress", clamped.toFixed(4));
    if (progressBar) progressBar.style.width = `${(clamped * 100).toFixed(2)}%`;
    steps.forEach((step) => updateStep(step, clamped));
    section.dataset.cinemaProgress = clamped.toFixed(3);
  };

  const getDuration = () => (
    Number.isFinite(video.duration) && video.duration > 0 ? video.duration : fallbackDuration
  );

  const finish = () => {
    completed = true;
    started = false;
    fallbackRunning = false;
    section.classList.remove("is-playing");
    section.classList.add("is-complete", "has-video-frame");
    section.dataset.cinemaState = "complete";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    paintProgress(1);
    steps.forEach((step) => updateStep(step, 0.92, step.dataset.cinemaStep === "final"));
  };

  const tick = () => {
    if (!started) return;
    const progress = fallbackRunning
      ? (performance.now() - fallbackStart) / (fallbackDuration * 1000)
      : video.currentTime / getDuration();
    paintProgress(progress);
    if (progress >= 0.995 || video.ended) {
      finish();
      return;
    }
    raf = requestAnimationFrame(tick);
  };

  const start = async () => {
    if (started || completed || reduceMotion) return;
    started = true;
    fallbackRunning = false;
    section.classList.add("is-playing");
    section.classList.remove("is-complete");
    section.dataset.cinemaState = "playing";
    paintProgress(0.001);

    try {
      video.currentTime = 0;
      video.playbackRate = 1 / speedScale;
      await video.play();
    } catch {
      fallbackStart = performance.now();
      fallbackRunning = true;
      section.dataset.cinemaState = "fallback";
    }

    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };

  const reset = () => {
    if (!started && !completed) return;
    started = false;
    completed = false;
    fallbackRunning = false;
    section.classList.remove("is-playing", "is-complete", "has-video-frame");
    section.dataset.cinemaState = "idle";
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    video.pause();
    try {
      video.currentTime = 0;
    } catch {
      // Ignore metadata timing differences across browsers.
    }
    paintProgress(0);
  };

  const updateEntry = () => {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const viewport = window.innerHeight || 1;
    const entryOpacity = smooth((viewport * 0.9 - rect.top) / Math.max(1, viewport * 0.62));
    section.style.setProperty("--cinema-entry-opacity", entryOpacity.toFixed(3));

    if (reduceMotion) {
      section.classList.add("is-complete");
      section.dataset.cinemaState = "reduced-motion";
      paintProgress(1);
      return;
    }

    if (scrollDirection < 0 && rect.top > viewport * 0.72) {
      reset();
      return;
    }

    const inPlayZone = rect.top <= viewport * 0.82 && rect.bottom >= viewport * 0.22;
    if (inPlayZone) start();
  };

  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateEntry);
  };

  video.addEventListener("loadeddata", () => section.classList.add("has-video-frame"));
  video.addEventListener("loadedmetadata", () => {
    video.playbackRate = 1 / speedScale;
  });
  video.addEventListener("canplay", () => {
    if (started || completed) section.classList.add("has-video-frame");
  });
  video.addEventListener("playing", () => {
    section.classList.add("has-video-frame");
    section.dataset.cinemaState = "playing";
  });
  video.addEventListener("timeupdate", () => {
    if (video.currentTime > 0.04) section.classList.add("has-video-frame");
  });
  video.addEventListener("ended", finish);
  section.dataset.cinemaState = "idle";
  video.load();
  paintProgress(0);
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  window.addEventListener("wheel", (event) => {
    scrollDirection = event.deltaY >= 0 ? 1 : -1;
  }, { passive: true });
  window.addEventListener("scroll", () => {
    const nextScrollY = window.scrollY;
    if (nextScrollY !== lastScrollY) {
      scrollDirection = nextScrollY > lastScrollY ? 1 : -1;
      lastScrollY = nextScrollY;
    }
  }, { passive: true });
  updateEntry();
}

function setupScrollTone() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.documentElement.style.setProperty("--warm-page-opacity", "0.42");
    return;
  }
  let ticking = false;
  const update = () => {
    ticking = false;
    const start = window.innerHeight * 0.18;
    const distance = window.innerHeight * 1.7;
    const progress = Math.min(1, Math.max(0, (window.scrollY - start) / distance));
    document.documentElement.style.setProperty("--warm-page-opacity", progress.toFixed(3));
  };
  const schedule = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  update();
}

function setupNav() {
  const links = [...document.querySelectorAll("[data-nav-link]")];
  const sectionIds = links
    .map((link) => link.getAttribute("href") || "")
    .filter((href) => href.startsWith("#"))
    .map((href) => href.slice(1));
  let ticking = false;

  const updateActiveFromScroll = () => {
    ticking = false;
    const anchorY = window.scrollY + Math.min(window.innerHeight * 0.34, 360);
    let activeId = sectionIds[0];
    sectionIds.forEach((id) => {
      const section = document.getElementById(id);
      if (section && section.offsetTop <= anchorY) activeId = id;
    });
    const activeLink = document.querySelector(`[data-nav-link][href="#${activeId}"]`);
    if (activeLink) setActiveNav(activeLink);
  };

  const scheduleScrollSpy = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(updateActiveFromScroll);
  };

  links.forEach((link) => {
    link.addEventListener("mouseenter", () => moveNavGlider(link));
    link.addEventListener("focus", () => moveNavGlider(link));
    link.addEventListener("click", () => setActiveNav(link));
  });
  document.querySelector(".nav-cluster")?.addEventListener("mouseleave", () => {
    moveNavGlider(document.querySelector(".nav-link.is-active") || links[0]);
  });
  window.addEventListener("resize", () => {
    scheduleScrollSpy();
    moveNavGlider(document.querySelector(".nav-link.is-active") || links[0]);
  });
  window.addEventListener("scroll", scheduleScrollSpy, { passive: true });

  requestAnimationFrame(() => {
    updateActiveFromScroll();
    moveNavGlider(document.querySelector(".nav-link.is-active") || links[0]);
  });
}

function setActiveNav(link) {
  document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("is-active", item === link));
  moveNavGlider(link);
}

function moveNavGlider(link) {
  const glider = document.getElementById("navGlider");
  const cluster = document.querySelector(".nav-cluster");
  if (!glider || !cluster || !link) return;
  const clusterRect = cluster.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  glider.style.width = `${Math.max(28, linkRect.width)}px`;
  glider.style.transform = `translateX(${linkRect.left - clusterRect.left}px)`;
}

function setupHomePreviewDemo() {
  const root = document.querySelector("[data-preview-root]");
  if (!root) return;

  const panels = [...root.querySelectorAll("[data-preview-panel]")];
  const navItems = [...document.querySelectorAll("[data-preview-nav]")];
  const cursor = root.querySelector(".os-preview-cursor");
  const validNames = new Set(panels.map((panel) => panel.dataset.previewPanel));
  const sequence = ["new", "taskA", "taskB"];
  let activeName = "";
  let autoIndex = 0;
  let autoTimer = 0;
  let pauseUntil = 0;

  const pulseCursor = (name) => {
    if (!cursor) return;
    const escapedName = window.CSS?.escape ? CSS.escape(name) : name;
    const target = document.querySelector(`[data-preview-nav="${escapedName}"]`);
    const host = root.closest(".os-main-preview__window") || root;
    if (target && host) {
      const hostRect = host.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      cursor.style.setProperty("--cursor-x", `${(targetRect.left - hostRect.left + targetRect.width * 0.18).toFixed(1)}px`);
      cursor.style.setProperty("--cursor-y", `${(targetRect.top - hostRect.top + targetRect.height * 0.52).toFixed(1)}px`);
    }
    root.dataset.previewCursor = name;
    cursor.classList.remove("is-clicking");
    void cursor.offsetWidth;
    cursor.classList.add("is-clicking");
  };

  const activate = (name, options = {}) => {
    if (!validNames.has(name)) return;
    const isSame = name === activeName;
    if (options.cursor) pulseCursor(name);
    if (isSame && !options.force) return;
    activeName = name;
    root.dataset.activePreview = name;
    root.dataset.previewCursor = name;

    panels.forEach((panel) => {
      const isActive = panel.dataset.previewPanel === name;
      panel.classList.toggle("is-active", isActive);
      panel.hidden = !isActive;
    });

    navItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.previewNav === name);
      item.setAttribute("aria-current", item.dataset.previewNav === name ? "page" : "false");
    });
  };

  const scheduleAuto = (delay = 0) => {
    window.clearTimeout(autoTimer);
    autoTimer = window.setTimeout(() => {
      if (Date.now() < pauseUntil) {
        scheduleAuto(Math.max(600, pauseUntil - Date.now()));
        return;
      }
      const name = sequence[autoIndex % sequence.length];
      activate(name, { cursor: true, force: true });
      autoIndex += 1;
      scheduleAuto(name === "new" ? 3200 : 4300);
    }, delay);
  };

  navItems.forEach((item) => {
    const name = item.dataset.previewNav;
    item.setAttribute("role", "button");
    item.tabIndex = 0;
    const activateFromUser = () => {
      pauseUntil = Date.now() + 6500;
      activate(name, { cursor: true });
      scheduleAuto(6500);
    };
    item.addEventListener("click", activateFromUser);
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activateFromUser();
      }
    });
  });

  activate("new", { force: true });
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scheduleAuto(650);
  }
}

function updateVerb(force = false) {
  const verbs = t("hero.verbs") || [];
  if (!verbs.length) return;
  const ticker = document.getElementById("verbTicker");
  const statusA = document.getElementById("floatStatusA");
  const statusB = document.getElementById("floatStatusB");
  const current = verbs[state.verbIndex % verbs.length];
  const next = verbs[(state.verbIndex + 2) % verbs.length];
  if (ticker) {
    ticker.classList.remove("is-changing");
    if (!force) void ticker.offsetWidth;
    ticker.textContent = current;
    ticker.classList.add("is-changing");
  }
  if (statusA) statusA.textContent = current;
  if (statusB) statusB.textContent = next;
}

function setupVerbTicker() {
  updateVerb(true);
  window.setInterval(() => {
    state.verbIndex += 1;
    updateVerb();
  }, 2400);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

setupLanguageSelect();
setupSourceMenu();
setupReveal();
setupNav();
setupHomePreviewDemo();
setupVerbTicker();
setupSpotlightCards();
setupScrollTone();
applyTranslations();
setupCapabilitySwap();
setupHeroCinemaBridge();
setupScrollCinema();
loadStatus();
