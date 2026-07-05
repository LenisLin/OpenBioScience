import React from 'react';
import { Button, Input, Switch } from '@arco-design/web-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  CheckOne,
  CloseOne,
  LoadingFour,
  Refresh,
  Right,
  Shield,
  LinkTwo,
  Experiment,
} from '@icon-park/react';
import OpenScienceIcon from '@renderer/components/icons/OpenScienceIcon';
import { openExternalUrl } from '@renderer/utils/platform';
import PaperclipApiGuide from '@renderer/pages/settings/components/PaperclipApiGuide';
import modesComicEn from '@renderer/assets/onboarding/onboarding-modes-comic-en.png';
import modesComicZh from '@renderer/assets/onboarding/onboarding-modes-comic-zh.png';

export type OnboardingModeId = 'science' | 'medical' | 'goal' | 'deposition';

export type RuntimeCheckStatus = 'checking' | 'available' | 'needs_setup' | 'missing';

export type RuntimeCheckItem = {
  id: 'claude' | 'codex' | 'opencode';
  name: string;
  command: string;
  description: string;
  installUrl: string;
  logo?: string | null;
  status: RuntimeCheckStatus;
  detail?: string;
  actualCommand?: string;
  agentAvailable?: boolean;
  agentEnabled?: boolean;
  detectedName?: string;
  detectedSource?: string;
  healthLatencyMs?: number;
  isRealCheck?: boolean;
  lastCheckedAt?: string;
};

export type PaperclipConnectionState = 'idle' | 'testing' | 'success' | 'error';

type OnboardingLocale = 'zh-CN' | 'en-US' | string;

type LocalizedProps = {
  locale: OnboardingLocale;
};

type LanguageStepProps = LocalizedProps & {
  language: string;
  onLanguageChange: (language: string) => void;
};

type ModeGuideStepProps = LocalizedProps & {
  selectedMode: OnboardingModeId;
  onSelectMode: (mode: OnboardingModeId) => void;
};

type RuntimeCheckStepProps = LocalizedProps & {
  checking: boolean;
  items: RuntimeCheckItem[];
  onRefresh: () => void;
};

type TelemetryConsentStepProps = LocalizedProps & {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
};

type PaperclipBindingStepProps = LocalizedProps & {
  apiKey: string;
  baseUrl: string;
  connectionMessage: string;
  connectionState: PaperclipConnectionState;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onSkip: () => void;
  onTest: () => void;
};

type FinishStepProps = LocalizedProps & {
  selectedMode: OnboardingModeId;
  runtimeReady: boolean;
  telemetryEnabled: boolean;
  paperclipConfigured: boolean;
};

type ModeComicPanel = {
  id: OnboardingModeId;
  title: string;
  detail: string;
  note: string;
  noteSide: 'left' | 'right';
  noteRow: 'top' | 'bottom';
};

const isEnglishLocale = (locale: OnboardingLocale): boolean => locale.toLowerCase().startsWith('en');

const getModeCards = (locale: OnboardingLocale): Array<{
  id: OnboardingModeId;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
  examples: string[];
}> => {
  const en = isEnglishLocale(locale);
  return [
    {
      id: 'science',
      icon: <OpenScienceIcon name='modeScience' size={42} visualScale={1.08} />,
      title: en ? 'Scientific Research Mode' : '科学研究模式',
      subtitle: en ? 'Data, code, figures, and reports become one research artifact' : '数据、代码、图表和报告串成一个科研 artifact',
      description: en
        ? 'For natural science and engineering work: literature scouting, data analysis, notebooks, figures, and traceable evidence chains.'
        : '适合自然科学和工程任务：文献梳理、数据分析、图片和 notebook 输出、可追踪证据链。',
      examples: en
        ? ['Cross-species scRNA-seq integration', 'Protein structure analysis', 'Local CSV and figure reproduction']
        : ['跨物种 single-cell RNA-seq 整合', '蛋白结构与序列分析', '本地 CSV/图表复现'],
    },
    {
      id: 'medical',
      icon: <OpenScienceIcon name='modeMedicalEvidence' size={42} visualScale={1.08} />,
      title: en ? 'Medical Evidence Mode' : '医学循证模式',
      subtitle: en ? 'PICO, evidence levels, and source anchors in one report' : '围绕 PICO、证据等级和来源锚点生成报告',
      description: en
        ? 'For clinical guidelines, drug labels, trial registries, systematic reviews, and evidence-backed medical summaries.'
        : '适合临床指南、药品标签、试验注册和综述证据的检索、归纳与报告展示。',
      examples: en
        ? ['Emergency guidance', 'Drug indication checks', 'Guidelines and RCT updates']
        : ['急救处理建议', '药品适应证核查', '指南和 RCT 证据更新'],
    },
    {
      id: 'goal',
      icon: <OpenScienceIcon name='modeGoal' size={42} visualScale={1.08} />,
      title: en ? 'Goal Mode' : '目标模式',
      subtitle: en ? 'Turn a long-running objective into executable work' : '把一个长期目标拆成可执行的任务推进',
      description: en
        ? 'For writing, experiment planning, engineering work, and long-horizon projects that need progress tracking.'
        : '适合写作、实验推进、工程计划等需要持续跟踪、决策和阶段产物的任务。',
      examples: en ? ['Paper draft to submission', 'Reproduction plan', 'Long-term project execution'] : ['论文初稿到投稿', '实验复现计划', '长期项目推进'],
    },
    {
      id: 'deposition',
      icon: <OpenScienceIcon name='modeDeposition' size={42} visualScale={1.08} />,
      title: en ? 'Knowledge Deposition Mode' : '知识沉淀模式',
      subtitle: en ? 'Convert lab conversations and SOPs into reusable skills' : '把实验室对话、SOP 和经验沉淀成可复用 skill',
      description: en
        ? 'For turning team workflows into installable, editable, and continuously improved skills and protocols.'
        : '适合将团队流程变成可启用、可编辑、可持续更新的技能和 protocol。',
      examples: en ? ['Lab SOPs', 'Reusable analysis pipelines', 'Meeting notes to protocols'] : ['实验室 SOP', '复用分析流程', '会议纪要转 protocol'],
    },
  ];
};

const getStatusMeta = (
  locale: OnboardingLocale
): Record<RuntimeCheckStatus, { label: string; className: string; icon: React.ReactNode }> => {
  const en = isEnglishLocale(locale);
  return {
  checking: {
    label: en ? 'Checking' : '检测中',
    className: 'is-checking',
    icon: <LoadingFour theme='outline' size='14' />,
  },
  available: {
    label: en ? 'Ready' : '可用',
    className: 'is-available',
    icon: <CheckOne theme='outline' size='14' />,
  },
  needs_setup: {
    label: en ? 'Setup' : '需配置',
    className: 'is-warning',
    icon: <Shield theme='outline' size='14' />,
  },
  missing: {
    label: en ? 'Missing' : '未安装',
    className: 'is-missing',
    icon: <CloseOne theme='outline' size='14' />,
  },
};
};

const selectedModeTitle = (mode: OnboardingModeId, locale: OnboardingLocale): string =>
  getModeCards(locale).find((item) => item.id === mode)?.title ||
  (isEnglishLocale(locale) ? 'Scientific Research Mode' : '科学研究模式');

const getModeComicPanels = (locale: OnboardingLocale): ModeComicPanel[] => {
  const en = isEnglishLocale(locale);
  return [
    {
      id: 'science',
      title: en ? 'Ask a research question' : '提出科研问题',
      detail: en ? 'data + code + figure + artifact' : '数据 + 代码 + 图表 + artifact',
      noteSide: 'right',
      noteRow: 'top',
      note: en
        ? [
          '### Scientific Research',
          '**Use when** a research question needs data, code, figures, and a traceable artifact.',
          '',
          '- Run Python/R/shell analysis from natural language.',
          '- Keep datasets, scripts, charts, logs, and conclusions connected.',
          '- Good for scRNA-seq, structures, genomics, chemistry, and local CSV work.',
          '',
          '**Best output**: a reproducible research artifact you can reopen and defend.',
        ].join('\n')
        : [
          '### 科学研究模式',
          '**适合**：一个问题需要数据、代码、图表和可追踪 artifact 一起推进。',
          '',
          '- 用自然语言启动 Python/R/shell 分析。',
          '- 把数据、脚本、图表、日志和结论串起来。',
          '- 适合单细胞、结构、生信、化学和本地 CSV 分析。',
          '',
          '**最好产出**：几个月后还能打开、复现和答辩的科研对象。',
        ].join('\n'),
    },
    {
      id: 'medical',
      title: en ? 'Trace medical evidence' : '追踪医学证据',
      detail: en ? 'guidelines, trials, labels, anchors' : '指南、试验、标签、锚点',
      noteSide: 'left',
      noteRow: 'top',
      note: en
        ? [
          '### Medical Evidence',
          '**Use when** clinical claims need sources, certainty, and auditability.',
          '',
          '- Search PaperClip and keep evidence as E1/E2 style anchors.',
          '- Compare guidelines, trials, labels, reviews, and local notes.',
          '- Separate what is known, uncertain, and unsafe to overstate.',
          '',
          '**Best output**: a concise evidence report with clickable provenance.',
        ].join('\n')
        : [
          '### 医学循证模式',
          '**适合**：临床结论需要来源、证据强度和可审计过程。',
          '',
          '- 用 PaperClip 搜索，并保留 E1/E2 式证据锚点。',
          '- 对照指南、RCT、标签、综述和本地资料。',
          '- 区分已知、仍不确定、不能过度外推的内容。',
          '',
          '**最好产出**：带原文证据链的循证报告。',
        ].join('\n'),
    },
    {
      id: 'goal',
      title: en ? 'Break down a goal' : '拆解长期目标',
      detail: en ? 'milestones become executable work' : '里程碑变成可执行任务',
      noteSide: 'right',
      noteRow: 'bottom',
      note: en
        ? [
          '### Goal Mode',
          '**Use when** the task is vague, long, or easy to lose momentum.',
          '',
          '- Turn a goal into milestones, checks, and next actions.',
          '- Keep progress visible instead of burying it in chat history.',
          '- Useful for papers, product plans, experiments, and reading projects.',
          '',
          '**Best output**: a living plan that keeps the project moving.',
        ].join('\n')
        : [
          '### 目标模式',
          '**适合**：任务很大、很散，或者容易聊着聊着失去推进感。',
          '',
          '- 把目标拆成里程碑、检查点和下一步行动。',
          '- 让进度持续可见，而不是埋在聊天记录里。',
          '- 适合论文、产品规划、实验推进和读文献项目。',
          '',
          '**最好产出**：一个能持续推进项目的动态计划。',
        ].join('\n'),
    },
    {
      id: 'deposition',
      title: en ? 'Deposit lab knowledge' : '沉淀实验室知识',
      detail: en ? 'SOPs and notes become reusable skills' : 'SOP 与经验变成可复用 skill',
      noteSide: 'left',
      noteRow: 'bottom',
      note: en
        ? [
          '### Knowledge Deposition',
          '**Use when** a conversation contains reusable lab know-how.',
          '',
          '- Convert protocols, decisions, and habits into a skill draft.',
          '- Keep references and SOP markdown together for future agents.',
          '- Let the team reuse workflows instead of re-explaining them.',
          '',
          '**Best output**: a reviewable skill that can be enabled later.',
        ].join('\n')
        : [
          '### 知识沉淀模式',
          '**适合**：一段对话里出现了以后还会反复用到的实验室经验。',
          '',
          '- 把 protocol、判断标准和操作习惯整理成 skill 草稿。',
          '- 把 references 与 SOP markdown 放在一起保存。',
          '- 让团队复用流程，而不是每次重新解释。',
          '',
          '**最好产出**：可审阅、可修改、之后可启用的技能。',
        ].join('\n'),
    },
  ];
};

export const LanguageStep: React.FC<LanguageStepProps> = ({ language, locale, onLanguageChange }) => {
  const en = isEnglishLocale(locale);
  const languages = [
    {
      id: 'zh-CN',
      title: '中文',
      description: en ? 'Use Chinese UI, tutorial copy, and settings descriptions.' : '使用中文界面、中文教程和中文设置说明。',
    },
    {
      id: 'en-US',
      title: 'English',
      description: en ? 'Use English UI, tutorial copy, and settings labels.' : '使用英文界面、英文教程和英文设置说明。',
    },
  ];

  return (
    <div className='onboarding-step onboarding-language-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'Welcome to OpenBioScience' : '欢迎使用 OpenBioScience'}</div>
      <h1>{en ? 'Choose your language first' : '先选择你希望使用的语言'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'You can change this later in Settings. The tutorial will explain core modes, runtime setup, and PaperClip binding in your selected language.'
          : '后续可以随时在设置里切换。教程会用你选择的语言介绍核心模式、运行环境和 PaperClip 绑定。'}
      </p>
      <div className='onboarding-language-grid'>
        {languages.map((item) => (
          <button
            key={item.id}
            type='button'
            className={['onboarding-choice-card', language === item.id && 'is-selected'].filter(Boolean).join(' ')}
            onClick={() => onLanguageChange(item.id)}
          >
            <span className='onboarding-choice-card__title'>{item.title}</span>
            <span className='onboarding-choice-card__desc'>{item.description}</span>
            <span className='onboarding-choice-card__check'>
              <CheckOne theme='outline' size='16' />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const ModeGuideStep: React.FC<ModeGuideStepProps> = ({ selectedMode, locale, onSelectMode }) => {
  const en = isEnglishLocale(locale);
  const [hoveredMode, setHoveredMode] = React.useState<OnboardingModeId | null>(null);
  const comicPanels = getModeComicPanels(locale);
  const comicImage = en ? modesComicEn : modesComicZh;
  const activeNote = hoveredMode ? comicPanels.find((panel) => panel.id === hoveredMode) : null;

  return (
    <div className='onboarding-step onboarding-mode-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'Choose your workflow' : '选择合适的工作方式'}</div>
      <h1>{en ? 'Four modes for four kinds of work' : '四种模式对应四类真实任务'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'You can switch these modes from the plus button in the new-chat input. Pick the scenario you expect to use most; you can switch freely later.'
          : '新会话输入框左下角的加号里可以切换这些模式。先选一个最常用的场景，教程结束后仍然可以自由切换。'}
      </p>
      <div className='onboarding-mode-comic' aria-label={en ? 'Four OpenBioScience mode comic' : 'OpenBioScience 四模式漫画'}>
        <img src={comicImage} alt='' draggable={false} />
        <div className='onboarding-mode-comic__grid'>
          {comicPanels.map((panel) => (
            <button
              key={panel.id}
              type='button'
              className={['onboarding-mode-comic__caption', selectedMode === panel.id && 'is-selected']
                .filter(Boolean)
                .join(' ')}
              aria-label={`${panel.title}: ${panel.detail}`}
              onFocus={() => setHoveredMode(panel.id)}
              onBlur={() => setHoveredMode(null)}
              onMouseEnter={() => setHoveredMode(panel.id)}
              onMouseLeave={() => setHoveredMode(null)}
              onClick={() => onSelectMode(panel.id)}
            >
              <strong className='onboarding-mode-comic__caption-label'>{panel.title}</strong>
              <span className='onboarding-mode-comic__caption-label'>{panel.detail}</span>
            </button>
          ))}
        </div>
        {activeNote && (
          <aside
            className={['onboarding-mode-note', `is-${activeNote.noteSide}`, `is-${activeNote.noteRow}`].join(' ')}
            aria-live='polite'
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeNote.note}</ReactMarkdown>
          </aside>
        )}
      </div>
    </div>
  );
};

export const RuntimeCheckStep: React.FC<RuntimeCheckStepProps> = ({ checking, items, locale, onRefresh }) => {
  const en = isEnglishLocale(locale);
  const statusMeta = getStatusMeta(locale);
  const hasAvailableRuntime = items.some((item) => item.status === 'available');
  const quickInstallCards = [
    {
      id: 'codex',
      title: en ? 'Install Codex' : '安装 Codex',
      hint: en ? 'Fast OpenAI coding-agent setup for macOS, Linux, or WSL.' : '适用于 macOS、Linux 或 WSL 的 OpenAI 代码智能体快速安装。',
      command: 'curl -fsSL https://chatgpt.com/codex/install.sh | sh\ncodex',
      url: 'https://developers.openai.com/codex/cli',
    },
    {
      id: 'claude',
      title: en ? 'Install Claude Code' : '安装 Claude Code',
      hint: en ? 'Anthropic native installer for macOS, Linux, or WSL.' : '适用于 macOS、Linux 或 WSL 的 Anthropic 原生安装方式。',
      command: 'curl -fsSL https://claude.ai/install.sh | bash\nclaude',
      url: 'https://docs.anthropic.com/en/docs/claude-code/quickstart',
    },
  ];
  const runtimeDescriptions: Record<RuntimeCheckItem['id'], string> = {
    claude: en
      ? 'Anthropic local coding agent for long tasks, file editing, and iterative research artifacts.'
      : 'Anthropic 的本地代码智能体，适合长任务、文件读写和科研 artifact 迭代。',
    codex: en
      ? 'OpenAI coding agent for local engineering, data analysis, and reproducible task execution.'
      : 'OpenAI 的代码智能体，可以用于本地工程、数据分析和可复现任务执行。',
    opencode: en
      ? 'Open-source coding agent runtime that can serve as another local execution option.'
      : '开源代码智能体运行器，可作为 Claude Code 或 Codex 之外的本地执行选择。',
  };

  return (
    <div className='onboarding-step onboarding-runtime-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'Runtime check' : '运行环境检测'}</div>
      <h1>{en ? 'Install any one coding agent to begin' : '安装任意一种代码智能体即可开始'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'OpenBioScience uses Claude Code, Codex, or OpenCode to read and edit local files, run code, and generate artifacts. You only need one of them.'
          : 'OpenBioScience 会调用 Claude Code、Codex 或 OpenCode 来读写本地文件、运行代码和生成 artifact。系统会自动检测，不需要三者都安装。'}
      </p>
      <div className='onboarding-runtime-toolbar'>
        <span className={['onboarding-runtime-summary', hasAvailableRuntime && 'is-ready'].filter(Boolean).join(' ')}>
          {hasAvailableRuntime
            ? en
              ? 'A usable runtime was detected'
              : '已检测到可用运行器'
            : en
              ? 'No usable runtime detected yet'
              : '还没有检测到可用运行器'}
        </span>
        <Button type='outline' size='small' loading={checking} icon={<Refresh theme='outline' />} onClick={onRefresh}>
          {en ? 'Check again' : '重新检测'}
        </Button>
      </div>
      <div className='onboarding-runtime-proof'>
        <CheckOne theme='outline' size='14' />
        {en
          ? 'This uses the same backend registry and health-check endpoint as the app runtime picker.'
          : '这里使用的是和模型选择器相同的后端 registry 与健康检查接口。'}
      </div>
      {!hasAvailableRuntime && (
        <section className='onboarding-runtime-quickstart' aria-label={en ? 'Quick install commands' : '快速安装命令'}>
          <div className='onboarding-runtime-quickstart__intro'>
            <strong>{en ? 'No runtime yet? Start with one command.' : '还没安装？复制一条命令即可开始。'}</strong>
            <span>
              {en
                ? 'Install either option, finish the terminal sign-in, then return here and check again.'
                : '任选其一安装，在终端完成登录后回到这里点“重新检测”。'}
            </span>
          </div>
          <div className='onboarding-runtime-quickstart__cards'>
            {quickInstallCards.map((card) => (
              <article key={card.id} className='onboarding-runtime-quickstart__card'>
                <div>
                  <strong>{card.title}</strong>
                  <span>{card.hint}</span>
                </div>
                <pre>
                  <code>{card.command}</code>
                </pre>
                <div className='onboarding-runtime-quickstart__actions'>
                  <button
                    type='button'
                    className='onboarding-inline-link'
                    onClick={() => {
                      void navigator.clipboard?.writeText(card.command);
                    }}
                  >
                    {en ? 'Copy command' : '复制命令'}
                  </button>
                  <button
                    type='button'
                    className='onboarding-inline-link'
                    onClick={() => {
                      void openExternalUrl(card.url);
                    }}
                  >
                    {en ? 'Official guide' : '官方指南'}
                    <Right theme='outline' size='13' />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      <div className='onboarding-runtime-grid'>
        {items.map((item) => {
          const meta = statusMeta[item.status];
          return (
            <article key={item.id} className='onboarding-runtime-card'>
              <div className='onboarding-runtime-card__header'>
                <span className='onboarding-runtime-card__logo'>
                  <span className='onboarding-runtime-card__logo-fallback'>
                    <Experiment theme='outline' size='22' />
                  </span>
                  {item.logo && (
                    <img
                      src={item.logo}
                      alt=''
                      onError={(event) => {
                        event.currentTarget.hidden = true;
                      }}
                    />
                  )}
                </span>
                <span className='onboarding-runtime-card__name'>{item.name}</span>
                <span className={['onboarding-runtime-card__status', meta.className].join(' ')}>
                  {meta.icon}
                  {meta.label}
                </span>
              </div>
              <p>{runtimeDescriptions[item.id] || item.description}</p>
              <code>{item.actualCommand || item.command}</code>
              {item.detail && <span className='onboarding-runtime-card__detail'>{item.detail}</span>}
              <dl className='onboarding-runtime-facts'>
                <div>
                  <dt>{en ? 'Detected' : '检测'}</dt>
                  <dd>{item.detectedName || (item.isRealCheck ? (en ? 'Real scan' : '真实扫描') : en ? 'Pending' : '待检测')}</dd>
                </div>
                <div>
                  <dt>{en ? 'Source' : '来源'}</dt>
                  <dd>{item.detectedSource || (en ? 'Not found' : '未发现')}</dd>
                </div>
                <div>
                  <dt>{en ? 'Enabled' : '启用'}</dt>
                  <dd>
                    {item.agentEnabled === undefined
                      ? en
                        ? 'Unknown'
                        : '未知'
                      : item.agentEnabled
                        ? en
                          ? 'Yes'
                          : '是'
                        : en
                          ? 'No'
                          : '否'}
                  </dd>
                </div>
                <div>
                  <dt>{en ? 'Health' : '健康'}</dt>
                  <dd>
                    {item.healthLatencyMs !== undefined
                      ? `${Math.round(item.healthLatencyMs)} ms`
                      : item.agentAvailable
                        ? en
                          ? 'Path ready'
                          : 'PATH 可用'
                        : en
                          ? 'Unavailable'
                          : '不可用'}
                  </dd>
                </div>
              </dl>
              {item.lastCheckedAt && (
                <span className='onboarding-runtime-card__checked'>
                  {en ? 'Checked at' : '检测时间'} {item.lastCheckedAt}
                </span>
              )}
              <button
                type='button'
                className='onboarding-inline-link'
                onClick={() => {
                  void openExternalUrl(item.installUrl);
                }}
              >
                {en ? 'Install or configure' : '安装或配置指南'}
                <Right theme='outline' size='13' />
              </button>
            </article>
          );
        })}
      </div>
      {!hasAvailableRuntime && (
        <p className='onboarding-step__hint'>
          {en
            ? 'You can continue the tutorial now. Before running real tasks, install Claude Code, Codex, or OpenCode.'
            : '没有检测到也可以先继续教程；正式跑任务前，请先安装 Claude Code、Codex 或 OpenCode 任意一种。'}
        </p>
      )}
    </div>
  );
};

export const TelemetryConsentStep: React.FC<TelemetryConsentStepProps> = ({ enabled, locale, onChange }) => {
  const en = isEnglishLocale(locale);

  return (
    <div className='onboarding-step onboarding-telemetry-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'Privacy and improvement' : '隐私与改进'}</div>
      <h1>{en ? 'Allow anonymous usage and diagnostics?' : '是否允许收集匿名使用和诊断信息'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'Enabled by default. It helps us understand feature health, update status, and concentrated errors. It does not upload papers, data files, prompts, or local project files.'
          : '默认开启，用来帮助我们理解功能是否顺畅、更新是否成功和错误是否集中发生。不会上传你的论文、数据文件、prompt 内容或本地项目文件。'}
      </p>
      <div className='onboarding-consent-card'>
        <div>
          <h2>{en ? 'Anonymous product improvement' : '匿名产品改进'}</h2>
          <p>
            {en
              ? 'Includes low-risk signals such as version, platform, feature entry points, crash diagnostics, and update status. You can change it later in Settings.'
              : '包括版本、平台、功能入口、崩溃诊断和更新状态等低敏信息。你可以现在关闭，也可以之后在设置里修改。'}
          </p>
        </div>
        <Switch checked={enabled} onChange={onChange} />
      </div>
      <div className='onboarding-consent-list'>
        <span>
          <CheckOne theme='outline' size='15' />
          {en ? 'Local files and research data are not uploaded as telemetry' : '本地文件和科研数据不作为遥测内容上传'}
        </span>
        <span>
          <CheckOne theme='outline' size='15' />
          {en ? 'Used only to improve OpenBioScience stability and experience' : '只用于改进 OpenBioScience 的稳定性和体验'}
        </span>
        <span>
          <CheckOne theme='outline' size='15' />
          {en ? 'You can disable it later in Privacy and Diagnostics settings' : '可在设置的隐私与诊断区域随时关闭'}
        </span>
      </div>
    </div>
  );
};

export const PaperclipBindingStep: React.FC<PaperclipBindingStepProps> = ({
  apiKey,
  baseUrl,
  connectionMessage,
  connectionState,
  locale,
  onApiKeyChange,
  onBaseUrlChange,
  onSkip,
  onTest,
}) => {
  const en = isEnglishLocale(locale);

  return (
    <div className='onboarding-step onboarding-paperclip-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'PaperClip binding' : 'PaperClip 绑定'}</div>
      <h1>{en ? 'Connect literature and evidence search' : '连接文献和证据检索能力'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'Scientific Research Mode and Medical Evidence Mode share this PaperClip API credential. You can bind it now or skip and add it later in Settings.'
          : '科学研究模式和医学循证模式会共用这组 PaperClip API。你可以现在填写，也可以跳过后在设置里补充。'}
      </p>
      <div className='onboarding-paperclip-layout'>
        <div className='onboarding-paperclip-form'>
          <div className='onboarding-paperclip-free'>
            <strong>{en ? 'PaperClip is free to start' : 'PaperClip 可免费开始使用'}</strong>
            <span>
              {en
                ? 'Create a key in the PaperClip console, paste it here, and both research modes will use it.'
                : '在 PaperClip 控制台创建 key 后粘贴到这里，科学研究和医学循证会共用。'}
            </span>
          </div>
          <label>
            <span>PaperClip API Key</span>
            <Input.Password
              value={apiKey}
              autoComplete='off'
              placeholder='pc-...'
              onChange={onApiKeyChange}
            />
          </label>
          <label>
            <span>PaperClip Base URL</span>
            <Input value={baseUrl} placeholder='https://paperclip.gxl.ai' onChange={onBaseUrlChange} />
          </label>
          <div className='onboarding-paperclip-actions'>
            <Button
              type='primary'
              loading={connectionState === 'testing'}
              icon={<LinkTwo theme='outline' />}
              onClick={onTest}
            >
              {en ? 'Test and save' : '测试并保存连接'}
            </Button>
            <Button type='outline' onClick={onSkip}>
              {en ? 'Skip PaperClip' : '跳过 PaperClip'}
            </Button>
          </div>
          {connectionMessage && (
            <div className={['onboarding-paperclip-message', `is-${connectionState}`].join(' ')}>
              {connectionMessage}
            </div>
          )}
        </div>
        <div className='onboarding-paperclip-guide'>
          <PaperclipApiGuide baseUrl={baseUrl} className='onboarding-paperclip-guide__card' />
        </div>
      </div>
    </div>
  );
};

export const FinishStep: React.FC<FinishStepProps> = ({
  selectedMode,
  locale,
  runtimeReady,
  telemetryEnabled,
  paperclipConfigured,
}) => {
  const en = isEnglishLocale(locale);
  const checklist = [
    {
      label: en ? 'Preferred mode' : '首选工作模式',
      value: selectedModeTitle(selectedMode, locale),
      done: true,
    },
    {
      label: en ? 'Coding runtime' : '代码运行器',
      value: runtimeReady
        ? en
          ? 'Usable runtime detected'
          : '已检测到可用运行器'
        : en
          ? 'Install or configure later'
          : '稍后安装或配置',
      done: runtimeReady,
    },
    {
      label: en ? 'Anonymous telemetry' : '匿名信息收集',
      value: telemetryEnabled ? (en ? 'Enabled' : '已开启') : en ? 'Disabled' : '已关闭',
      done: true,
    },
    {
      label: 'PaperClip API',
      value: paperclipConfigured
        ? en
          ? 'Configured'
          : '已配置'
        : en
          ? 'Skipped, can bind later'
          : '已跳过，可稍后绑定',
      done: paperclipConfigured,
    },
  ];

  return (
    <div className='onboarding-step onboarding-finish-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'Ready' : '准备完成'}</div>
      <h1>{en ? 'OpenBioScience is ready for research' : 'OpenBioScience 已准备好开始研究'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'After finishing, you will enter the new-chat page. Use the plus button to choose a mode, or reopen this tutorial from Settings later.'
          : '完成后会进入新会话页面。你可以从加号选择模式，也可以在设置里重新打开教程、调整 PaperClip、技能和运行环境。'}
      </p>
      <div className='onboarding-finish-stage'>
        <div className='onboarding-finish-layer is-back' />
        <div className='onboarding-finish-layer is-mid' />
        <div className='onboarding-finish-card'>
          {checklist.map((item, index) => (
            <div
              key={item.label}
              className='onboarding-finish-row'
              style={{ '--row-index': index } as React.CSSProperties}
            >
              <span className={['onboarding-finish-row__icon', item.done && 'is-done'].filter(Boolean).join(' ')}>
                {item.done ? <CheckOne theme='outline' size='15' /> : <Shield theme='outline' size='15' />}
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.value}</small>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
