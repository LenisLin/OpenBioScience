/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import ScaleControl from '@/renderer/components/settings/ScaleControl';
import FontSizeStepper from '@/renderer/components/settings/FontSizeStepper';
import SettingsSection, { SettingsRows } from '@/renderer/components/settings/SettingsSection';
import CssThemeSettings from '@renderer/pages/settings/AppearanceSettings/CssThemeSettings';
import AionScrollArea from '@/renderer/components/base/AionScrollArea';
import { FONT_SIZE_KEYS, FONT_SIZE_SPECS, FONT_SIZE_STEP, type FontSizeKey } from '@/common/config/fontSizes';
import { useThemeContext } from '@renderer/hooks/context/ThemeContext';
import { useSettingsViewMode } from '../settingsViewContext';

/** Map each configurable font-size region to its row label i18n key. */
const FONT_SIZE_LABEL_KEY: Record<FontSizeKey, string> = {
  chat: 'settings.fontSizeChat',
  markdown: 'settings.fontSizeMarkdown',
  code: 'settings.fontSizeCode',
};

/**
 * 偏好设置行组件 / Preference row component
 * 用于显示标签和对应的控件，统一的水平布局 / Used for displaying labels and corresponding controls in a unified horizontal layout
 */
const PreferenceRow: React.FC<{
  /** 标签文本 / Label text */
  label: string;
  /** 控件元素 / Control element */
  children: React.ReactNode;
}> = ({ label, children }) => (
  <div className='flex flex-col items-stretch gap-10px py-12px md:flex-row md:items-center md:justify-between md:gap-24px'>
    <div className='text-14px text-t-primary leading-22px'>{label}</div>
    <div className='w-full flex md:flex-1 md:justify-end'>{children}</div>
  </div>
);

/**
 * 外观设置内容组件 / Appearance settings content component
 *
 * 提供外观相关的配置选项，包括主题画廊和字体缩放
 * Provides appearance-related configuration options including theme gallery and font scale
 *
 * @features
 * - 统一主题画廊（浅色、深色及装饰主题）/ Unified theme gallery (light, dark, decorative)
 * - 缩放比例控制 / Zoom scale control
 */
const AppearanceModalContent: React.FC = () => {
  const { t } = useTranslation();
  const viewMode = useSettingsViewMode();
  const isPageMode = viewMode === 'page';
  const { fontSizes, setFontSize } = useThemeContext();

  return (
    <div className='flex flex-col h-full w-full'>
      {/* 内容区域 / Content Area */}
      <AionScrollArea className='flex-1 min-h-0 pb-16px' disableOverflow={isPageMode}>
        <div className='settings-appearance'>
          {/* 主题画廊 / Theme Gallery */}
          <SettingsSection
            title={t('settings.theme')}
            description={t('settings.cssTheme.selectOrCustomize', { defaultValue: 'Choose how OpenScience looks.' })}
            icon='theme'
          >
            <CssThemeSettings />
          </SettingsSection>

          {/* 字体大小 / Font sizes */}
          <SettingsSection
            title={t('settings.appearanceTypography', { defaultValue: 'Typography' })}
            description={t('settings.appearanceTypographyDescription', {
              defaultValue: 'Tune chat, Markdown, and code text without changing the whole window scale.',
            })}
            icon='fontSize'
          >
            <SettingsRows>
              {FONT_SIZE_KEYS.map((key) => (
                <PreferenceRow key={key} label={t(FONT_SIZE_LABEL_KEY[key])}>
                  <FontSizeStepper
                    value={fontSizes[key]}
                    min={FONT_SIZE_SPECS[key].min}
                    max={FONT_SIZE_SPECS[key].max}
                    step={FONT_SIZE_STEP}
                    defaultValue={FONT_SIZE_SPECS[key].default}
                    resetLabel={t('settings.fontSizeStepperReset')}
                    onChange={(px) => void setFontSize(key, px)}
                  />
                </PreferenceRow>
              ))}
            </SettingsRows>
          </SettingsSection>

          {/* 缩放控制 / Scale Control */}
          <SettingsSection title={t('settings.scale')} description={t('settings.scaleDescription')} icon='scale'>
            <SettingsRows>
              <PreferenceRow label={t('settings.scale')}>
                <ScaleControl />
              </PreferenceRow>
            </SettingsRows>
          </SettingsSection>
        </div>
      </AionScrollArea>
    </div>
  );
};

export default AppearanceModalContent;
