/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import { isLabSkillDepositionConversationExtra } from '@/common/chat/labSkillDeposition';
import { isMedicalEvidenceConversationExtra } from '@/common/chat/medicalEvidence';
import { isScienceConversationExtra } from '@/common/chat/science';
import OpenScienceIcon from '@/renderer/components/icons/OpenScienceIcon';
import { getAgentLogo } from '@/renderer/utils/model/agentLogo';
import { MessageOne } from '@icon-park/react';
import React from 'react';
import { useTranslation } from 'react-i18next';

import { getBackendKeyFromConversation } from './utils/exportHelpers';

type DragOverlayContentProps = {
  conversation?: TChatConversation;
};

const DragOverlayContent: React.FC<DragOverlayContentProps> = ({ conversation }) => {
  const { t } = useTranslation();
  if (!conversation) return null;

  const backendKey = getBackendKeyFromConversation(conversation);
  const logo = getAgentLogo(backendKey);
  const isMedicalEvidence = isMedicalEvidenceConversationExtra(conversation.extra);
  const isLabSkillDeposition = isLabSkillDepositionConversationExtra(conversation.extra);
  const isScience = isScienceConversationExtra(conversation.extra);

  return (
    <div
      className='flex items-center gap-10px px-12px py-8px rd-8px min-w-200px max-w-300px'
      style={{
        backgroundColor: 'var(--color-bg-1)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        border: '1px solid var(--color-border-2)',
        transform: 'scale(1.02)',
      }}
    >
      {isMedicalEvidence ? (
        <OpenScienceIcon
          name='modeMedicalEvidence'
          size={18}
          visualScale={1.1}
          title={t('guid.medicalEvidence.menuLabel')}
          className='flex-shrink-0'
        />
      ) : isLabSkillDeposition ? (
        <OpenScienceIcon
          name='modeDeposition'
          size={18}
          visualScale={1.08}
          title={t('guid.skillDeposition.menuLabel')}
          className='flex-shrink-0'
        />
      ) : isScience ? (
        <OpenScienceIcon
          name='modeScience'
          size={18}
          visualScale={1.08}
          title={t('guid.scienceProject.menuLabel')}
          className='flex-shrink-0'
        />
      ) : logo ? (
        <img src={logo} alt={`${backendKey || 'agent'} logo`} className='w-18px h-18px rounded-50% flex-shrink-0' />
      ) : (
        <MessageOne theme='outline' size='20' className='line-height-0 flex-shrink-0' />
      )}
      <div className='text-14px lh-24px text-t-primary truncate flex-1'>{conversation.name}</div>
    </div>
  );
};

export default DragOverlayContent;
