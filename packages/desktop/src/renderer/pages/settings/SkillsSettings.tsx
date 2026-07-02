/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import { Button, Empty, Input, Message, Spin, Tag } from '@arco-design/web-react';
import { CheckOne, Download, Edit, FolderOpen, PreviewOpen, Refresh, Search } from '@icon-park/react';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import remarkGfm from 'remark-gfm';
import SettingsPageWrapper from './components/SettingsPageWrapper';
import './SkillsSettings.css';

type SkillSource = 'builtin' | 'custom' | 'extension' | 'builtin-auto';

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

const REMARK_PLUGINS = [remarkGfm];

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

const isDepositedSkill = (skill: SkillInfo): boolean => {
  if (skill.source === 'custom' || skill.is_custom) return true;
  const haystack = `${skill.name} ${skill.description} ${skill.location} ${skill.relative_location || ''}`;
  return /知识沉淀|deposition|lab[-_ ]?skill|protocol/iu.test(haystack);
};

const getSkillRank = (skill: SkillInfo): number => {
  if (isDepositedSkill(skill)) return 0;
  if (skill.source === 'custom') return 1;
  if (skill.source === 'extension') return 2;
  if (skill.source === 'builtin-auto') return 3;
  return 4;
};

const sourceLabel = (skill: SkillInfo): string => {
  if (isDepositedSkill(skill)) return '知识沉淀';
  if (skill.source === 'extension') return '扩展';
  if (skill.source === 'builtin-auto') return '自动注入';
  if (skill.source === 'builtin') return '内置';
  return '自建';
};

const isEditableSkill = (skill: SkillInfo): boolean => isDepositedSkill(skill) || skill.source === 'custom';

const buildSkillId = (source: SkillSource, name: string, location: string, index: number): string =>
  `${source}:${name}:${location || index}`;

const buildSkills = (
  availableSkills: Array<Omit<SkillInfo, 'id'> & { source: 'builtin' | 'custom' | 'extension' }>,
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
      };
    }),
  ];

  const seenNames = new Set<string>();
  return items
    .toSorted((left, right) => {
      const rankDiff = getSkillRank(left) - getSkillRank(right);
      if (rankDiff !== 0) return rankDiff;
      return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' });
    })
    .filter((skill) => {
      const key = skill.name.trim().toLowerCase();
      if (!key) return true;
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
};

const readSkillContent = async (skill: SkillInfo): Promise<string> => {
  const candidates = Array.from(
    new Set([getSkillMarkdownPath(skill), normalizePath(skill.location || '')].filter(Boolean))
  );
  const results = await Promise.allSettled(candidates.map((path) => ipcBridge.fs.readFile.invoke({ path })));
  for (const result of results) {
    if (result.status === 'fulfilled' && typeof result.value === 'string') return result.value;
  }
  throw new Error('Skill content is not readable');
};

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

const SkillMarkdownPreview: React.FC<{ markdown: string }> = ({ markdown }) => (
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
      {stripMarkdownFrontmatter(markdown) || '暂无可预览内容。'}
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
      const haystack = `${skill.name} ${skill.description} ${sourceLabel(skill)} ${skill.location}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [searchQuery, skills]);

  const stats = useMemo(() => {
    const deposited = skills.filter(isDepositedSkill).length;
    const editable = skills.filter(isEditableSkill).length;
    return { total: skills.length, deposited, editable };
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
      Message.error(t('settings.skills.fetchError', { defaultValue: '获取技能列表失败' }));
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
    void readSkillContent(selectedSkill)
      .then((nextContent) => {
        if (cancelled) return;
        setContent(nextContent);
        setDraftContent(nextContent);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[SkillsSettings] Failed to read skill content:', error);
        setContent(`# ${selectedSkill.name}\n\n${selectedSkill.description || '该技能没有可读取的 SKILL.md。'}`);
        setDraftContent('');
      })
      .finally(() => {
        if (!cancelled) setContentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedSkill]);

  const handleSave = useCallback(async () => {
    if (!selectedSkill || !isEditableSkill(selectedSkill)) return;
    const markdownPath = getSkillMarkdownPath(selectedSkill);
    if (!markdownPath) {
      Message.error('缺少可写入的 SKILL.md 路径');
      return;
    }
    setSaving(true);
    try {
      const ok = await ipcBridge.fs.writeFile.invoke({ path: markdownPath, data: draftContent });
      if (!ok) throw new Error('writeFile returned false');
      setContent(draftContent);
      setEditMode(false);
      Message.success('技能已保存');
      void fetchSkills();
    } catch (error) {
      console.error('[SkillsSettings] Failed to save skill:', error);
      Message.error('保存技能失败');
    } finally {
      setSaving(false);
    }
  }, [draftContent, fetchSkills, selectedSkill]);

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
      Message.success(`技能已下载到 ${targetPath}`);
    } catch (error) {
      console.error('[SkillsSettings] Failed to download skill:', error);
      void ipcBridge.fs.cancelZip.invoke({ request_id });
      Message.error('下载技能失败');
    } finally {
      setDownloading(false);
    }
  }, [selectedSkill]);

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
            <h1>{t('settings.skills.title', { defaultValue: '技能' })}</h1>
            <p>查看、检索和维护 OpenScience 可调用的科研技能。知识沉淀生成的技能会优先展示，并保持可编辑。</p>
          </div>
          <div className='skills-settings__stats'>
            <span>
              <b>{stats.total}</b>
              全部
            </span>
            <span>
              <b>{stats.deposited}</b>
              知识沉淀
            </span>
            <span>
              <b>{stats.editable}</b>
              可编辑
            </span>
          </div>
        </header>

        <div className='skills-settings__grid'>
          <aside className='skills-settings__listPane'>
            <div className='skills-settings__listToolbar'>
              <Input
                allowClear
                prefix={<Search size={15} />}
                placeholder='搜索技能、描述或来源'
                value={searchQuery}
                onChange={setSearchQuery}
              />
              <Button icon={<Refresh />} loading={loading} onClick={() => void fetchSkills()}>
                刷新
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
                          <OpenScienceIcon
                            name={isDepositedSkill(skill) ? 'depositionSkill' : 'settingsSkills'}
                            size={22}
                          />
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
                              {sourceLabel(skill)}
                            </span>
                          </span>
                          <span className='skills-settings__itemDesc'>{skill.description || '暂无描述'}</span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <Empty description='没有找到匹配的技能' />
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
                        <OpenScienceIcon
                          name={isDepositedSkill(selectedSkill) ? 'depositionSkill' : 'settingsSkills'}
                          size={22}
                        />
                        {selectedSkill.name}
                      </h2>
                      <div className='skills-settings__meta'>
                        <Tag size='small' color={isDepositedSkill(selectedSkill) ? 'gray' : undefined}>
                          {sourceLabel(selectedSkill)}
                        </Tag>
                        <Tag size='small'>{isEditableSkill(selectedSkill) ? '可编辑' : '只读'}</Tag>
                        <Tag size='small'>{editMode ? '编辑源文件' : '渲染预览'}</Tag>
                        <code title={getSkillMarkdownPath(selectedSkill)}>{getSkillDisplayPath(selectedSkill)}</code>
                      </div>
                    </div>
                    <div className='skills-settings__actions'>
                      <Button icon={<FolderOpen />} onClick={handleReveal}>
                        位置
                      </Button>
                      <Button icon={<Download />} loading={downloading} onClick={() => void handleDownload()}>
                        下载
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
                            预览
                          </Button>
                          <Button type='primary' icon={<CheckOne />} loading={saving} onClick={() => void handleSave()}>
                            保存
                          </Button>
                        </>
                      ) : (
                        <Button
                          type={isEditableSkill(selectedSkill) ? 'primary' : 'secondary'}
                          icon={<Edit />}
                          disabled={!isEditableSkill(selectedSkill)}
                          onClick={() => setEditMode(true)}
                        >
                          编辑
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
                      <SkillMarkdownPreview markdown={content} />
                    )}
                  </Spin>
                </section>
              </>
            ) : (
              <div className='skills-settings__emptyDetail'>
                <OpenScienceIcon name='settingsSkills' size={42} />
                <h2>暂无技能</h2>
                <p>导入或生成一个技能后，这里会显示可预览、可编辑、可下载的详情。</p>
              </div>
            )}
          </main>
        </div>
      </div>
    </SettingsPageWrapper>
  );
};

export default SkillsSettings;
