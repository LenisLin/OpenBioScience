/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { ipcBridge } from '@/common';
import {
  COLLABORATION_MODULES,
  COLLABORATION_PARTITION,
  COLLABORATION_PREWARM_INITIAL_DELAY_MS,
  COLLABORATION_PREWARM_STEP_DELAY_MS,
  FEISHU_DESKTOP_USER_AGENT,
  getCollaborationModule,
  getCollaborationPanelId,
} from './collaborationConfig';

const PARKED_BOUNDS = { x: -10000, y: -10000, width: 1, height: 1 };

const CollaborationWebPrewarmer: React.FC = () => {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;
    const timers = COLLABORATION_MODULES.map((module, index) =>
      window.setTimeout(
        () => {
          if (cancelled) return;
          const resolvedModule = getCollaborationModule(module.id);
          void ipcBridge.nativeWebPanel.show.invoke({
            id: getCollaborationPanelId(module.id),
            url: resolvedModule.url,
            bounds: PARKED_BOUNDS,
            partition: COLLABORATION_PARTITION,
            userAgent: FEISHU_DESKTOP_USER_AGENT,
            bringToFront: false,
            preserveCurrentUrl: true,
          });
        },
        COLLABORATION_PREWARM_INITIAL_DELAY_MS + index * COLLABORATION_PREWARM_STEP_DELAY_MS
      )
    );

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
};

export default CollaborationWebPrewarmer;
