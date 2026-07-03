import React from 'react';
import { Button, Input, Switch } from '@arco-design/web-react';
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
      <div className='onboarding-step__eyebrow'>{en ? 'Welcome to OpenScience' : '欢迎使用 OpenScience'}</div>
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
  const modeCards = getModeCards(locale);

  return (
    <div className='onboarding-step onboarding-mode-step'>
      <div className='onboarding-step__eyebrow'>{en ? 'Choose your workflow' : '选择合适的工作方式'}</div>
      <h1>{en ? 'Four modes for four kinds of work' : '四种模式对应四类真实任务'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'You can switch these modes from the plus button in the new-chat input. Pick the scenario you expect to use most; you can switch freely later.'
          : '新会话输入框左下角的加号里可以切换这些模式。先选一个最常用的场景，教程结束后仍然可以自由切换。'}
      </p>
      <div className='onboarding-mode-grid'>
        {modeCards.map((item) => (
          <button
            key={item.id}
            type='button'
            className={['onboarding-mode-card', selectedMode === item.id && 'is-selected'].filter(Boolean).join(' ')}
            onClick={() => onSelectMode(item.id)}
          >
            <span className='onboarding-mode-card__icon'>{item.icon}</span>
            <span className='onboarding-mode-card__body'>
              <span className='onboarding-mode-card__title'>{item.title}</span>
              <span className='onboarding-mode-card__subtitle'>{item.subtitle}</span>
              <span className='onboarding-mode-card__desc'>{item.description}</span>
              <span className='onboarding-mode-card__examples'>
                {item.examples.map((example) => (
                  <span key={example}>{example}</span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

export const RuntimeCheckStep: React.FC<RuntimeCheckStepProps> = ({ checking, items, locale, onRefresh }) => {
  const en = isEnglishLocale(locale);
  const statusMeta = getStatusMeta(locale);
  const hasAvailableRuntime = items.some((item) => item.status === 'available');
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
          ? 'OpenScience uses Claude Code, Codex, or OpenCode to read and edit local files, run code, and generate artifacts. You only need one of them.'
          : 'OpenScience 会调用 Claude Code、Codex 或 OpenCode 来读写本地文件、运行代码和生成 artifact。系统会自动检测，不需要三者都安装。'}
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
      <div className='onboarding-runtime-grid'>
        {items.map((item) => {
          const meta = statusMeta[item.status];
          return (
            <article key={item.id} className='onboarding-runtime-card'>
              <div className='onboarding-runtime-card__header'>
                <span className='onboarding-runtime-card__logo'>
                  {item.logo ? <img src={item.logo} alt='' /> : <Experiment theme='outline' size='22' />}
                </span>
                <span className='onboarding-runtime-card__name'>{item.name}</span>
                <span className={['onboarding-runtime-card__status', meta.className].join(' ')}>
                  {meta.icon}
                  {meta.label}
                </span>
              </div>
              <p>{runtimeDescriptions[item.id] || item.description}</p>
              <code>{item.command}</code>
              {item.detail && <span className='onboarding-runtime-card__detail'>{item.detail}</span>}
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
          {en ? 'Used only to improve OpenScience stability and experience' : '只用于改进 OpenScience 的稳定性和体验'}
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
      <h1>{en ? 'OpenScience is ready for research' : 'OpenScience 已准备好开始研究'}</h1>
      <p className='onboarding-step__lead'>
        {en
          ? 'After finishing, you will enter the new-chat page. Use the plus button to choose a mode, or reopen this tutorial from Settings later.'
          : '完成后会进入新会话页面。你可以从加号选择模式，也可以在设置里重新打开教程、调整 PaperClip、技能和运行环境。'}
      </p>
      <div className='onboarding-finish-card'>
        {checklist.map((item) => (
          <div key={item.label} className='onboarding-finish-row'>
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
  );
};
