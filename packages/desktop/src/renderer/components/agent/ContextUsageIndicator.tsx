/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Popover } from '@arco-design/web-react';
import React, { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { TokenUsageData } from '@/common/config/storage';

// 从 modelContextLimits 导入默认上下文限制
import { DEFAULT_CONTEXT_LIMIT } from '@/renderer/utils/model/modelContextLimits';

interface ContextUsageIndicatorProps {
  tokenUsage: TokenUsageData | null;
  context_limit?: number;
  className?: string;
  size?: number;
  onCompact?: () => void;
  disabled?: boolean;
  isCompacting?: boolean;
  showWhenEmpty?: boolean;
}

const getUsageTone = (percentage: number) => {
  if (percentage >= 90) {
    return {
      start: '#f97316',
      end: '#ef4444',
      text: '#ef4444',
      glow: 'rgba(239, 68, 68, 0.22)',
    };
  }
  if (percentage >= 75) {
    return {
      start: '#d97706',
      end: '#f97316',
      text: '#d97706',
      glow: 'rgba(249, 115, 22, 0.18)',
    };
  }
  if (percentage >= 55) {
    return {
      start: '#8a6d1d',
      end: '#d59e0d',
      text: '#8a6d1d',
      glow: 'rgba(213, 158, 13, 0.16)',
    };
  }
  return {
    start: '#6b7280',
    end: '#9ca3af',
    text: 'var(--color-text-2)',
    glow: 'rgba(107, 114, 128, 0.12)',
  };
};

const ContextUsageIndicator: React.FC<ContextUsageIndicatorProps> = ({
  tokenUsage,
  context_limit = DEFAULT_CONTEXT_LIMIT,
  className = '',
  size = 24,
  onCompact,
  disabled = false,
  isCompacting = false,
  showWhenEmpty = false,
}) => {
  const { t } = useTranslation();
  const gradientId = useId().replace(/:/g, '');

  const effectiveTokenUsage = tokenUsage ?? (showWhenEmpty ? { total_tokens: 0 } : null);

  const { percentage, displayTotal, displayLimit } = useMemo(() => {
    if (!effectiveTokenUsage) {
      return {
        percentage: 0,
        displayTotal: '0',
        displayLimit: formatTokenCount(context_limit, true),
      };
    }

    const total = effectiveTokenUsage.total_tokens;
    const pct = context_limit > 0 ? (total / context_limit) * 100 : 0;

    return {
      percentage: Math.min(100, pct),
      displayTotal: formatTokenCount(total),
      displayLimit: formatTokenCount(context_limit, true),
    };
  }, [effectiveTokenUsage, context_limit]);

  // 如果没有 token 数据，不显示
  if (!effectiveTokenUsage) {
    return null;
  }

  // 计算圆环参数
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  const usageTone = getUsageTone(percentage);

  // 根据状态获取颜色
  const getStrokeColor = () => {
    if (percentage <= 1) return usageTone.end;
    return `url(#${gradientId})`;
  };

  // 背景圆环颜色 - 适配深浅主题
  const getTrackColor = () => {
    return 'var(--color-fill-3)';
  };

  const isClickable = Boolean(onCompact) && !disabled && !isCompacting;
  const handleClick = () => {
    if (!isClickable) return;
    onCompact?.();
  };
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isClickable) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCompact?.();
    }
  };

  const popoverContent = (
    <div className='p-8px min-w-160px'>
      <div className='text-14px font-medium text-t-primary'>
        <span style={{ color: usageTone.text }}>{percentage.toFixed(1)}%</span> · {displayTotal} / {displayLimit}{' '}
        {t('conversation.contextUsage.contextUsed', 'context used')}
      </div>
      {onCompact && (
        <div className='mt-4px text-12px text-t-secondary'>
          {isCompacting
            ? t('conversation.contextUsage.compacting', { defaultValue: 'Compacting context...' })
            : t('conversation.contextUsage.compactHint', { defaultValue: 'Click to compact conversation context' })}
        </div>
      )}
    </div>
  );

  return (
    <Popover content={popoverContent} position='top' trigger='hover' className='context-usage-popover'>
      <div
        aria-label={t('conversation.contextUsage.contextUsed', 'context used')}
        className={`context-usage-indicator flex items-center justify-center ${isClickable ? 'cursor-pointer' : 'cursor-default'} ${disabled ? 'opacity-50' : ''} ${isCompacting ? 'animate-pulse' : ''} ${className}`}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role={isClickable ? 'button' : undefined}
        style={{
          width: size,
          height: size,
          filter: percentage >= 75 ? `drop-shadow(0 0 4px ${usageTone.glow})` : undefined,
        }}
        tabIndex={isClickable ? 0 : undefined}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          <defs>
            <linearGradient id={gradientId} x1='0%' y1='0%' x2='100%' y2='100%'>
              <stop offset='0%' stopColor={usageTone.start} />
              <stop offset='100%' stopColor={usageTone.end} />
            </linearGradient>
          </defs>
          {/* 背景圆环 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={getTrackColor()}
            strokeWidth={strokeWidth}
          />
          {/* 进度圆环 */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill='none'
            stroke={getStrokeColor()}
            strokeWidth={strokeWidth}
            strokeLinecap='round'
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            style={{
              transition: 'stroke-dashoffset 0.3s ease, stroke 0.3s ease',
            }}
          />
        </svg>
      </div>
    </Popover>
  );
};

/**
 * 格式化 token 数量显示
 * @param count token 数量
 * @param hideZeroDecimals 是否隐藏小数点为0的情况（如 1.0M 显示为 1M），默认为 false
 * @returns 格式化后的字符串，如 "37.0K" 或 "1.2M"，当 hideZeroDecimals 为 true 时 "1.0M" 显示为 "1M"
 */
export function formatTokenCount(count: number, hideZeroDecimals = false): string {
  if (count >= 1_000_000) {
    const value = count / 1_000_000;
    const formatted = value.toFixed(1);
    return hideZeroDecimals && formatted.endsWith('.0') ? `${Math.floor(value)}M` : `${formatted}M`;
  }
  if (count >= 1_000) {
    const value = count / 1_000;
    const formatted = value.toFixed(1);
    return hideZeroDecimals && formatted.endsWith('.0') ? `${Math.floor(value)}K` : `${formatted}K`;
  }
  return count.toString();
}

export default ContextUsageIndicator;
