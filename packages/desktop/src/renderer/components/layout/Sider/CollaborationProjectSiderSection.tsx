/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Right } from '@icon-park/react';
import classNames from 'classnames';
import { COLLABORATION_MODULES, type CollaborationModuleId } from '@/renderer/pages/collaboration/collaborationConfig';
import CollaborationIcon from '@/renderer/components/icons/CollaborationIcon';
import SiderItem from './SiderItem';

interface CollaborationProjectSiderSectionProps {
  pathname: string;
  onNavigate: (path: string) => void;
}

const ICON_BY_MODULE: Record<CollaborationModuleId, React.ReactElement> = {
  messages: <CollaborationIcon name='message' size={21} />,
  calendar: <CollaborationIcon name='calendar' size={21} />,
  docs: <CollaborationIcon name='docs' size={21} />,
  tasks: <CollaborationIcon name='taskPage' size={21} />,
};

const COLLABORATION_SECTION_EXPANDED_KEY = 'collaboration-project-section-expanded-v2';

const CollaborationProjectSiderSection: React.FC<CollaborationProjectSiderSectionProps> = ({
  pathname,
  onNavigate,
}) => {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<boolean>(() => {
    const stored = localStorage.getItem(COLLABORATION_SECTION_EXPANDED_KEY);
    return stored === 'true';
  });

  useEffect(() => {
    localStorage.setItem(COLLABORATION_SECTION_EXPANDED_KEY, String(expanded));
  }, [expanded]);

  return (
    <div className='min-w-0'>
      <div
        className='group/label sider-section-label flex items-center px-12px h-28px select-none sticky top-0 z-10 mt-8px cursor-pointer'
        onClick={() => setExpanded((value) => !value)}
      >
        <span className='text-14px text-t-tertiary sider-section-title group-hover/label:text-t-primary transition-colors font-[500] leading-none'>
          {t('common.collaboration.title', { defaultValue: 'Collaboration' })}
        </span>
        <span className='ml-2px flex items-center justify-center opacity-0 group-hover/label:opacity-100 transition-opacity text-t-tertiary'>
          <Right
            theme='outline'
            size={12}
            className={classNames('transition-transform duration-150', { 'rotate-90': expanded })}
          />
        </span>
      </div>
      {expanded && (
        <div className='px-8px flex flex-col gap-2px'>
          {COLLABORATION_MODULES.map((module) => (
            <SiderItem
              key={module.id}
              icon={ICON_BY_MODULE[module.id]}
              name={t(module.labelKey, { defaultValue: module.defaultLabel })}
              selected={pathname === module.path || pathname.startsWith(`${module.path}/`)}
              onClick={() => onNavigate(module.path)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default CollaborationProjectSiderSection;
