/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Collapse } from '@arco-design/web-react';
import classNames from 'classnames';
import React from 'react';
import ChannelHeader from './ChannelHeader';
import type { ChannelConfig } from './types';

interface ChannelItemProps {
  channel: ChannelConfig;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onToggleEnabled?: (enabled: boolean) => void;
  highlighted?: boolean;
}

const ChannelItem: React.FC<ChannelItemProps> = ({
  channel,
  isCollapsed,
  onToggleCollapse,
  onToggleEnabled,
  highlighted = false,
}) => {
  return (
    <div
      data-channel-id={channel.id}
      data-channel-status={channel.status}
      data-channel-extension={channel.isExtension ? 'true' : 'false'}
      className={classNames('rd-8px transition-shadow', {
        'shadow-[0_0_0_3px_rgba(245,197,66,0.82)]': highlighted,
      })}
    >
      <Collapse
        activeKey={isCollapsed ? [] : ['1']}
        onChange={onToggleCollapse}
        className='[&_div.arco-collapse-item-header-title]:flex-1'
      >
        <Collapse.Item
          header={<ChannelHeader channel={channel} onToggleEnabled={onToggleEnabled} />}
          name='1'
          className='[&_div.arco-collapse-item-content-box]:py-3'
        >
          {channel.content}
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

export default ChannelItem;
