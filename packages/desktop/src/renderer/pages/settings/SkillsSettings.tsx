/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { LAB_SKILL_DEPOSITION_SKILL_NAME } from '@/common/chat/labSkillDeposition';
import { LOOP_GOAL_SKILL_NAME } from '@/common/chat/loopGoal';
import { DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS } from '@/common/chat/medicalEvidence';
import { DEFAULT_SCIENCE_SKILL_IDS } from '@/common/chat/science';
import { SCIENCE_MATERIALIZED_SKILL_IDS } from '@/common/chat/scienceSkills.generated';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import { Button, Empty, Input, Message, Spin, Tag } from '@arco-design/web-react';
import { CheckOne, Download, Edit, FolderOpen, PreviewOpen, Refresh, Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSearchParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import './SkillsSettings.css';

type SkillSource = 'builtin' | 'custom' | 'extension' | 'builtin-auto';
type SkillModeTag = 'science-default' | 'science-leaf' | 'medical-evidence' | 'loop-goal' | 'skill-deposition';

type SkillInfo = {
  name: string;
  description: string;
  location: string;
  display_location?: string;
  relative_location?: string;
  is_custom: boolean;
  source: SkillSource;
  id: string;
  isBuiltinAuto?: boolean;
  isCatalogFallback?: boolean;
  modeTags: SkillModeTag[];
};

type SkillPaths = {
  user_skills_dir: string;
  builtin_skills_dir: string;
};

type SkillTreeNode = {
  name: string;
  fullPath: string;
  relativePath?: string;
  isDir?: boolean;
  isFile?: boolean;
  children?: SkillTreeNode[];
};

type SkillZipFile = {
  name: string;
  source_path?: string;
  content?: string | Uint8Array;
};

type ApiSkillInfo = {
  name: string;
  description: string;
  location: string;
  display_location?: string;
  relative_location?: string;
  is_custom: boolean;
  source: 'builtin' | 'custom' | 'extension';
};

const REMARK_PLUGINS = [remarkGfm];
type SettingsT = TFunction<'settings'>;

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/u, '');

const isAbsolutePath = (value: string): boolean => value.startsWith('/') || /^[a-z]:\//iu.test(normalizePath(value));

const joinPath = (directory: string, file_name: string): string => {
  const base = normalizePath(directory);
  return base ? `${base}/${file_name}` : file_name;
};

const resolveSkillLocation = (source: SkillSource, location: string, paths?: SkillPaths): string => {
  const normalized = normalizePath(location || '');
  if (!normalized || isAbsolutePath(normalized) || !paths) return normalized;
  const root = source === 'custom' ? paths.user_skills_dir : paths.builtin_skills_dir;
  return joinPath(root, normalized);
};

const dirname = (value: string): string => {
  const normalized = normalizePath(value);
  const slashIndex = normalized.lastIndexOf('/');
  return slashIndex > 0 ? normalized.slice(0, slashIndex) : normalized;
};

const getSkillMarkdownPath = (skill: SkillInfo): string => {
  const location = normalizePath(skill.location || '');
  if (!location) return '';
  return /\/?SKILL\.md$/iu.test(location) ? location : joinPath(location, 'SKILL.md');
};

const getSkillRootPath = (skill: SkillInfo): string => {
  const location = normalizePath(skill.location || '');
  if (!location) return '';
  return /\/?SKILL\.md$/iu.test(location) ? dirname(location) : location;
};

const getSkillDisplayPath = (skill: SkillInfo): string =>
  skill.display_location || skill.relative_location || getSkillMarkdownPath(skill) || skill.location;

const sanitizeFileName = (value: string): string =>
  Array.from(value, (char) => {
    const codePoint = char.codePointAt(0) ?? 0;
    return codePoint < 32 ? '-' : char;
  })
    .join('')
    .replace(/[<>:"/\\|?*]/gu, '-')
    .replace(/\s+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 110) || 'skill';

const stripMarkdownFrontmatter = (markdown: string): string => {
  const normalized = markdown.replace(/^\uFEFF/u, '');
  const match = normalized.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/u);
  return match ? normalized.slice(match[0].length).trimStart() : markdown;
};

const SCIENCE_DEFAULT_SKILL_SET = new Set<string>(DEFAULT_SCIENCE_SKILL_IDS);
const SCIENCE_LEAF_SKILL_SET = new Set<string>(SCIENCE_MATERIALIZED_SKILL_IDS);
const MEDICAL_EVIDENCE_SKILL_SET = new Set<string>(DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS);

const getSkillModeTags = (name: string): SkillModeTag[] => {
  const tags: SkillModeTag[] = [];
  if (SCIENCE_DEFAULT_SKILL_SET.has(name)) tags.push('science-default');
  if (SCIENCE_LEAF_SKILL_SET.has(name)) tags.push('science-leaf');
  if (MEDICAL_EVIDENCE_SKILL_SET.has(name)) tags.push('medical-evidence');
  if (name === LOOP_GOAL_SKILL_NAME) tags.push('loop-goal');
  if (name === LAB_SKILL_DEPOSITION_SKILL_NAME) tags.push('skill-deposition');
  return tags;
};

const MODE_TAG_LABELS: Record<SkillModeTag, { defaultValue: string; key: string }> = {
  'science-default': { key: 'skills.modeTags.scienceDefault', defaultValue: 'Science default' },
  'science-leaf': { key: 'skills.modeTags.scienceSkill', defaultValue: 'Science skill' },
  'medical-evidence': { key: 'skills.modeTags.medicalEvidence', defaultValue: 'Medical evidence' },
  'loop-goal': { key: 'skills.modeTags.loopGoal', defaultValue: 'Goal mode' },
  'skill-deposition': { key: 'skills.modeTags.skillDeposition', defaultValue: 'Knowledge deposition' },
};

const modeTagLabel = (tag: SkillModeTag, t?: SettingsT): string => {
  const label = MODE_TAG_LABELS[tag];
  return t ? t(label.key, { defaultValue: label.defaultValue }) : label.defaultValue;
};

const modeTagClassName = (tag: SkillModeTag): string => `skills-settings__modeTag skills-settings__modeTag--${tag}`;

const getSkillIconName = (skill: Pick<SkillInfo, 'name' | 'modeTags' | 'source' | 'is_custom' | 'description' | 'location'>) => {
  if (skill.modeTags.includes('skill-deposition')) return 'modeDeposition';
  if (skill.modeTags.includes('loop-goal')) return 'modeGoal';
  if (skill.modeTags.includes('medical-evidence')) return 'modeMedicalEvidence';
  if (skill.modeTags.includes('science-default') || skill.modeTags.includes('science-leaf')) return 'modeScience';
  if (isDepositedSkill(skill as SkillInfo)) return 'depositionSkill';
  return 'settingsSkills';
};

const isDepositedSkill = (skill: SkillInfo): boolean => {
  if (skill.name === LAB_SKILL_DEPOSITION_SKILL_NAME) return false;
  if (skill.source === 'custom' || skill.is_custom) return true;
  const haystack = `${skill.name} ${skill.description} ${skill.location} ${skill.relative_location || ''}`;
  return /知识沉淀|deposition|lab[-_ ]?skill|protocol/iu.test(haystack);
};

const getSkillRank = (skill: SkillInfo): number => {
  if (skill.modeTags.includes('skill-deposition')) return 0;
  if (skill.modeTags.includes('loop-goal')) return 1;
  if (skill.modeTags.includes('science-default')) return 2;
  if (skill.modeTags.includes('medical-evidence')) return 3;
  if (isDepositedSkill(skill)) return 0;
  if (skill.source === 'custom') return 4;
  if (skill.modeTags.includes('science-leaf')) return 5;
  if (skill.source === 'extension') return 6;
  if (skill.source === 'builtin-auto') return 7;
  return 8;
};

const sourceLabel = (skill: SkillInfo, t?: SettingsT): string => {
  if (skill.modeTags.includes('skill-deposition')) return modeTagLabel('skill-deposition', t);
  if (skill.modeTags.includes('loop-goal')) return modeTagLabel('loop-goal', t);
  if (skill.modeTags.includes('medical-evidence')) return modeTagLabel('medical-evidence', t);
  if (skill.modeTags.includes('science-default')) return modeTagLabel('science-default', t);
  if (skill.modeTags.includes('science-leaf')) return modeTagLabel('science-leaf', t);
  if (isDepositedSkill(skill)) return t ? t('skills.sources.deposited', { defaultValue: 'Knowledge deposition' }) : 'Knowledge deposition';
  if (skill.source === 'extension') return t ? t('skills.sources.extension', { defaultValue: 'Extension' }) : 'Extension';
  if (skill.source === 'builtin-auto') return t ? t('skills.sources.builtinAuto', { defaultValue: 'Auto-injected' }) : 'Auto-injected';
  if (skill.source === 'builtin') return t ? t('skills.sources.builtin', { defaultValue: 'Built-in' }) : 'Built-in';
  return t ? t('skills.sources.custom', { defaultValue: 'Custom' }) : 'Custom';
};

const isEditableSkill = (skill: SkillInfo): boolean =>
  !skill.isCatalogFallback && (isDepositedSkill(skill) || skill.source === 'custom');

const buildSkillId = (source: SkillSource, name: string, location: string, index: number): string =>
  `${source}:${name}:${location || index}`;

const buildCatalogFallbackSkills = (paths?: SkillPaths): SkillInfo[] => {
  const builtinRoot = paths?.builtin_skills_dir || '';
  const fallbackNames = Array.from(
    new Set<string>([
      ...DEFAULT_SCIENCE_SKILL_IDS,
      ...SCIENCE_MATERIALIZED_SKILL_IDS,
      ...DEFAULT_MEDICAL_EVIDENCE_SKILL_IDS,
      LOOP_GOAL_SKILL_NAME,
      LAB_SKILL_DEPOSITION_SKILL_NAME,
    ])
  );

  return fallbackNames.map((name, index) => {
    const location = builtinRoot ? joinPath(builtinRoot, `${name}/SKILL.md`) : `${name}/SKILL.md`;
    const modeTags = getSkillModeTags(name);
    const description =
      name === LOOP_GOAL_SKILL_NAME
        ? 'Persistent target mode skill for iterative work toward a user-defined goal.'
        : name === LAB_SKILL_DEPOSITION_SKILL_NAME
          ? 'Knowledge deposition mode skill for turning conversations, artifacts, and lab notes into reusable SOPs.'
          : modeTags.includes('science-default')
            ? 'Default OpenBioScience Science Mode router skill.'
            : modeTags.includes('medical-evidence')
              ? 'Default medical evidence mode skill.'
              : 'Materialized OpenBioScience Science skill from the bundled scientific skill pack.';
    return {
      name,
      description,
      location,
      display_location: `${name}/SKILL.md`,
      relative_location: `${name}/SKILL.md`,
      is_custom: false,
      source: 'builtin' as const,
      id: buildSkillId('builtin', name, location, index),
      isCatalogFallback: true,
      modeTags,
    };
  });
};

const buildSkills = (
  availableSkills: ApiSkillInfo[],
  autoSkills: Array<{ name: string; description: string; location: string }>,
  paths?: SkillPaths
): SkillInfo[] => {
  const items: SkillInfo[] = [
    ...availableSkills.map((skill, index) => {
      const location = resolveSkillLocation(skill.source, skill.location, paths);
      const displayLocation = !isAbsolutePath(skill.location || '') ? skill.location : skill.relative_location;
      return {
        ...skill,
        location,
        display_location: displayLocation,
        id: buildSkillId(skill.source, skill.name, location, index),
        modeTags: getSkillModeTags(skill.name),
      };
    }),
    ...autoSkills.map((skill, index) => {
      const location = resolveSkillLocation('builtin-auto', skill.location, paths);
      return {
        ...skill,
        id: buildSkillId('builtin-auto', skill.name, location, index),
        location,
        display_location: !isAbsolutePath(skill.location || '') ? skill.location : undefined,
        is_custom: false,
        source: 'builtin-auto' as const,
        isBuiltinAuto: true,
        modeTags: getSkillModeTags(skill.name),
      };
    }),
    ...buildCatalogFallbackSkills(paths),
  ];

  const byName = new Map<string, SkillInfo>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing || (existing.isCatalogFallback && !item.isCatalogFallback)) {
      byName.set(key, item);
    }
  }

  return [...byName.values()]
    .toSorted((left, right) => {
      const rankDiff = getSkillRank(left) - getSkillRank(right);
      if (rankDiff !== 0) return rankDiff;
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    });
};

const readSkillContent = async (skill: SkillInfo, t: SettingsT): Promise<string> => {
  const candidates = Array.from(
    new Set([getSkillMarkdownPath(skill), normalizePath(skill.location || '')].filter(Boolean))
  );
  const results = await Promise.allSettled(candidates.map((path) => ipcBridge.fs.readFile.invoke({ path })));
  for (const result of results) {
    if (result.status === 'fulfilled' && typeof result.value === 'string') return result.value;
  }
  if (skill.isCatalogFallback) return buildCatalogFallbackMarkdown(skill, t);
  throw new Error('Skill content is not readable');
};

const buildCatalogFallbackMarkdown = (skill: SkillInfo, t: SettingsT): string =>
  [
    `# ${skill.name}`,
    '',
    skill.description ||
      t('skills.catalogFallbackDescription', {
        defaultValue:
          'This skill is listed in the OpenBioScience built-in skill catalog, but the current runtime has not returned the full SKILL.md content yet.',
      }),
    '',
    '## Runtime Status',
    '',
    '- This row is shown from the OpenBioScience mode skill catalog.',
    '- If the full source preview is unavailable, restart OpenBioScience/WebUI so `resources/skills` is synced into the runtime `builtin-skills` directory.',
    `- Expected runtime path: \`${getSkillMarkdownPath(skill) || skill.location}\``,
    '',
    skill.modeTags.length ? '## Mode Tags' : undefined,
    skill.modeTags.length ? skill.modeTags.map((tag) => `- ${modeTagLabel(tag, t)}`).join('\n') : undefined,
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n');

const collectSkillZipFiles = async (skill: SkillInfo, rootName: string): Promise<SkillZipFile[]> => {
  const rootPath = getSkillRootPath(skill);
  try {
    const tree = (await ipcBridge.fs.getFilesByDir.invoke({ dir: rootPath, root: rootPath })) as SkillTreeNode[];
    const files: SkillZipFile[] = [];
    const walk = (node: SkillTreeNode) => {
      if (node.isFile) {
        const relativePath = normalizePath(node.relativePath || node.name);
        files.push({ name: joinPath(rootName, relativePath), source_path: node.fullPath });
        return;
      }
      node.children?.forEach(walk);
    };
    tree.forEach(walk);
    if (files.length > 0) return files;
  } catch {
    // Fall back to the primary markdown file when a backend cannot enumerate the folder.
  }

  const markdownPath = getSkillMarkdownPath(skill);
  return [{ name: joinPath(rootName, 'SKILL.md'), source_path: markdownPath || skill.location }];
};

const SkillMarkdownPreview: React.FC<{ emptyText: string; markdown: string }> = ({ emptyText, markdown }) => (
  <div className='skills-md'>
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      components={{
        strong({ children }) {
          return <strong className='skills-md__emphasis'>{children}</strong>;
        },
        a({ href, children }) {
          return (
            <a href={href} target='_blank' rel='noreferrer'>
              {children}
            </a>
          );
        },
        code({ className, children, ...props }) {
          return (
            <code className={classNames(className, 'skills-md__code')} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {stripMarkdownFrontmatter(markdown) || emptyText}
    </ReactMarkdown>
  </div>
);

const SkillsSettings: React.FC = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const highlightName = searchParams.get('highlight');
  const [loading, setLoading] = useState(false);
  const [contentLoading, setContentLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const [editMode, setEditMode] = useState(false);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedSkillId) || skills[0] || null,
    [selectedSkillId, skills]
  );

  const filteredSkills = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return skills;
    return skills.filter((skill) => {
      const haystack =
        `${skill.name} ${skill.description} ${sourceLabel(skill, t)} ${skill.modeTags.map((tag) => modeTagLabel(tag, t)).join(' ')} ${skill.location}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, skills, t]);

  const stats = useMemo(() => {
    const science = skills.filter((skill) =>
      skill.modeTags.some((tag) => tag === 'science-default' || tag === 'science-leaf')
    ).length;
    const mode = skills.filter((skill) =>
      skill.modeTags.some((tag) => tag === 'medical-evidence' || tag === 'loop-goal' || tag === 'skill-deposition')
    ).length;
    const deposited = skills.filter(isDepositedSkill).length;
    const editable = skills.filter(isEditableSkill).length;
    return { total: skills.length, science, mode, deposited, editable };
  }, [skills]);

  const fetchSkills = useCallback(async () => {
    setLoading(true);
    try {
      const [availableSkills, autoSkills, skillPaths] = await Promise.all([
        ipcBridge.fs.listAvailableSkills.invoke(),
        ipcBridge.fs.listBuiltinAutoSkills.invoke(),
        ipcBridge.fs.getSkillPaths.invoke(),
      ]);
      const nextSkills = buildSkills(availableSkills, autoSkills, skillPaths);
      setSkills(nextSkills);
      const highlighted = highlightName ? nextSkills.find((skill) => skill.name === highlightName) : undefined;
      setSelectedSkillId((current) => {
        if (highlighted) return highlighted.id;
        if (current && nextSkills.some((skill) => skill.id === current)) return current;
        return nextSkills[0]?.id || null;
      });
    } catch (error) {
      console.error('[SkillsSettings] Failed to fetch skills:', error);
      Message.error(t('settings.skills.fetchError', { defaultValue: 'Failed to fetch skills' }));
    } finally {
      setLoading(false);
    }
  }, [highlightName, t]);

  useEffect(() => {
    void fetchSkills();
  }, [fetchSkills]);

  useEffect(() => {
    if (!selectedSkill) {
      setContent('');
      setDraftContent('');
      setEditMode(false);
      return;
    }

    let cancelled = false;
    setContentLoading(true);
    setEditMode(false);
    void readSkillContent(selectedSkill, t)
      .then((nextContent) => {
        if (cancelled) return;
        setContent(nextContent);
        setDraftContent(nextContent);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[SkillsSettings] Failed to read skill content:', error);
        setContent(
          `# ${selectedSkill.name}\n\n${
            selectedSkill.description ||
            t('settings.skills.unreadableMarkdown', { defaultValue: 'This skill does not have a readable SKILL.md file.' })
          }`
        );
        setDraftContent('');
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSkill, t]);

  const handleSave = useCallback(async () => {
    if (!selectedSkill || !isEditableSkill(selectedSkill)) return;
    const markdownPath = getSkillMarkdownPath(selectedSkill);
    if (!markdownPath) {
      Message.error(t('settings.skills.missingWritablePath', { defaultValue: 'Missing writable SKILL.md path' }));
      return;
    }
    setSaving(true);
    try {
      const ok = await ipcBridge.fs.writeFile.invoke({ path: markdownPath, data: draftContent });
      if (!ok) throw new Error('writeFile returned false');
      setContent(draftContent);
      setEditMode(false);
      Message.success(t('settings.skills.saveSuccess', { defaultValue: 'Skill saved' }));
      void fetchSkills();
    } catch (error) {
      console.error('[SkillsSettings] Failed to save skill:', error);
      Message.error(t('settings.skills.saveFailed', { defaultValue: 'Failed to save skill' }));
    } finally {
      setSaving(false);
    }
  }, [draftContent, fetchSkills, selectedSkill, t]);

  const handleDownload = useCallback(async () => {
    if (!selectedSkill || !selectedSkill.location) return;
    setDownloading(true);
    const request_id = `skill-export-${Date.now()}`;
    try {
      const downloadsDir = await ipcBridge.application.getPath.invoke({ name: 'downloads' });
      const fileName = `${sanitizeFileName(selectedSkill.name)}.zip`;
      const targetPath = joinPath(downloadsDir || '', fileName);
      const rootName = sanitizeFileName(selectedSkill.name);
      const files = await collectSkillZipFiles(selectedSkill, rootName);
      const ok = await ipcBridge.fs.createZip.invoke({
        path: targetPath,
        request_id,
        files,
      });
      if (!ok) throw new Error('createZip returned false');
      Message.success(t('settings.skills.downloadSuccess', { defaultValue: 'Skill downloaded to {{path}}', path: targetPath }));
    } catch (error) {
      console.error('[SkillsSettings] Failed to download skill:', error);
      void ipcBridge.fs.cancelZip.invoke({ request_id });
      Message.error(t('settings.skills.downloadFailed', { defaultValue: 'Failed to download skill' }));
    } finally {
      setDownloading(false);
    }
  }, [selectedSkill, t]);

  const handleReveal = useCallback(() => {
    if (!selectedSkill) return;
    const markdownPath = getSkillMarkdownPath(selectedSkill);
    void ipcBridge.shell.showItemInFolder.invoke(markdownPath || selectedSkill.location);
  }, [selectedSkill]);

  return (
    <SettingsPageWrapper className='skills-settings-page' contentClassName='skills-settings-content'>
      <div className='skills-settings'>
        <header className='skills-settings__hero'>
          <div className='skills-settings__titleBlock'>
            <span className='skills-settings__kicker'>
              <OpenScienceIcon name='settingsSkills' size={18} />
              Skills
            </span>
            <h1>{t('settings.skills.title', { defaultValue: 'Skills' })}</h1>
            <p>{t('settings.skills.description')}</p>
          </div>
          <div className='skills-settings__stats'>
            <span>
              <b>{stats.total}</b>
              {t('settings.skills.statsAll')}
            </span>
            <span>
              <b>{stats.science}</b>
              Science
            </span>
            <span>
              <b>{stats.mode}</b>
              {t('settings.skills.statsModes')}
            </span>
            <span>
              <b>{stats.editable}</b>
              {t('settings.skills.statsEditable')}
            </span>
          </div>
        </header>

        <div className='skills-settings__grid'>
          <aside className='skills-settings__listPane'>
            <div className='skills-settings__listToolbar'>
              <Input
                allowClear
                prefix={<Search size={15} />}
                placeholder={t('settings.skills.searchPlaceholder')}
                value={searchQuery}
                onChange={setSearchQuery}
              />
              <Button icon={<Refresh />} loading={loading} onClick={() => void fetchSkills()}>
                {t('common.refresh', { defaultValue: 'Refresh' })}
              </Button>
            </div>

            <Spin loading={loading} className='skills-settings__listSpin'>
              <div className='skills-settings__list'>
                {filteredSkills.length ? (
                  filteredSkills.map((skill) => {
                    const active = selectedSkill?.id === skill.id;
                    return (
                      <button
                        key={skill.id}
                        type='button'
                        className={classNames('skills-settings__item', active && 'skills-settings__item--active')}
                        onClick={() => setSelectedSkillId(skill.id)}
                      >
                        <span className='skills-settings__itemIcon'>
                          <OpenScienceIcon name={getSkillIconName(skill)} size={22} />
                        </span>
                        <span className='skills-settings__itemBody'>
                          <span className='skills-settings__itemTopline'>
                            <strong>{skill.name}</strong>
                            <span
                              className={classNames(
                                'skills-settings__sourceBadge',
                                isDepositedSkill(skill) && 'skills-settings__sourceBadge--deposited'
                              )}
                            >
                              {sourceLabel(skill, t)}
                            </span>
                          </span>
                          <span className='skills-settings__itemDesc'>
                            {skill.description || t('settings.skills.noDescription')}
                          </span>
                          {skill.modeTags.length ? (
                            <span className='skills-settings__modeTags'>
                              {skill.modeTags.slice(0, 3).map((tag) => (
                                <span key={tag} className={modeTagClassName(tag)}>
                                  {modeTagLabel(tag, t)}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <Empty description={t('settings.skills.noSearchResults')} />
                )}
              </div>
            </Spin>
          </aside>

          <main className='skills-settings__detail'>
            {selectedSkill ? (
              <>
                <div className='skills-settings__detailHeader'>
                  <div className='skills-settings__detailTitleRow'>
                    <div className='skills-settings__detailIdentity'>
                      <h2 title={selectedSkill.description || selectedSkill.name}>
                        <OpenScienceIcon name={getSkillIconName(selectedSkill)} size={22} />
                        {selectedSkill.name}
                      </h2>
                      <div className='skills-settings__meta'>
                        <Tag size='small' color={isDepositedSkill(selectedSkill) ? 'gray' : undefined}>
                          {sourceLabel(selectedSkill, t)}
                        </Tag>
                        {selectedSkill.modeTags.map((tag) => (
                          <Tag key={tag} size='small' className={modeTagClassName(tag)}>
                            {modeTagLabel(tag, t)}
                          </Tag>
                        ))}
                        {selectedSkill.isCatalogFallback ? <Tag size='small'>{t('settings.skills.pendingSync')}</Tag> : null}
                        <Tag size='small'>
                          {isEditableSkill(selectedSkill) ? t('settings.skills.editable') : t('settings.skills.readonly')}
                        </Tag>
                        <Tag size='small'>
                          {editMode ? t('settings.skills.editingSource') : t('settings.skills.renderedPreview')}
                        </Tag>
                        <code title={getSkillMarkdownPath(selectedSkill)}>{getSkillDisplayPath(selectedSkill)}</code>
                      </div>
                    </div>
                    <div className='skills-settings__actions'>
                      <Button icon={<FolderOpen />} onClick={handleReveal}>
                        {t('settings.skills.reveal')}
                      </Button>
                      <Button icon={<Download />} loading={downloading} onClick={() => void handleDownload()}>
                        {t('settings.skills.download')}
                      </Button>
                      {editMode ? (
                        <>
                          <Button
                            icon={<PreviewOpen />}
                            disabled={saving}
                            onClick={() => {
                              setDraftContent(content);
                              setEditMode(false);
                            }}
                          >
                            {t('settings.skills.preview')}
                          </Button>
                          <Button type='primary' icon={<CheckOne />} loading={saving} onClick={() => void handleSave()}>
                            {t('settings.skills.save')}
                          </Button>
                        </>
                      ) : (
                        <Button
                          type={isEditableSkill(selectedSkill) ? 'primary' : 'secondary'}
                          icon={<Edit />}
                          disabled={!isEditableSkill(selectedSkill)}
                          onClick={() => setEditMode(true)}
                        >
                          {t('settings.skills.edit')}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <section className='skills-settings__filePanel'>
                  <Spin loading={contentLoading} className='skills-settings__contentSpin'>
                    {editMode ? (
                      <Input.TextArea
                        className='skills-settings__editor'
                        value={draftContent}
                        onChange={setDraftContent}
                        autoSize={{ minRows: 28 }}
                      />
                    ) : (
                      <SkillMarkdownPreview markdown={content} emptyText={t('settings.skills.emptyPreview')} />
                    )}
                  </Spin>
                </section>
              </>
            ) : (
              <div className='skills-settings__emptyDetail'>
                <OpenScienceIcon name='settingsSkills' size={42} />
                <h2>{t('settings.skills.emptyTitle')}</h2>
                <p>{t('settings.skills.emptyDescription')}</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default SkillsSettings;
