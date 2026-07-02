/**
 * @license
 * Copyright 2026 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import classNames from 'classnames';
import React from 'react';
import type { SettingsIconName } from '@/renderer/components/icons/SettingsIcon';
import SettingsIcon from '@/renderer/components/icons/SettingsIcon';
import './SettingsSection.css';

interface SettingsSectionProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  icon?: SettingsIconName;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  title,
  description,
  children,
  className,
  contentClassName,
  icon,
}) => {
  return (
    <section className={classNames('settings-section', className)}>
      <div className='settings-section__header'>
        {icon && <SettingsIcon className='settings-section__icon' name={icon} size={24} />}
        <div className='settings-section__header-copy'>
          <h3 className='settings-section__title'>{title}</h3>
          {description && <p className='settings-section__description'>{description}</p>}
        </div>
      </div>
      <div className={classNames('settings-section__content', contentClassName)}>{children}</div>
    </section>
  );
};

export const SettingsRows: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={classNames('settings-rows', className)}>{children}</div>
);

export default SettingsSection;
