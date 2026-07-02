import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import ContextUsageIndicator from '@/renderer/components/agent/ContextUsageIndicator';

describe('ContextUsageIndicator', () => {
  it('renders current context usage when token data is available', () => {
    render(<ContextUsageIndicator tokenUsage={{ total_tokens: 50_000 }} context_limit={100_000} />);

    expect(screen.getByLabelText(/context used|上下文已使用/)).toBeInTheDocument();
  });

  it('can render an empty context usage ring before token data arrives', () => {
    const { container } = render(<ContextUsageIndicator tokenUsage={null} context_limit={100_000} showWhenEmpty />);

    expect(screen.getByLabelText(/context used|上下文已使用/)).toBeInTheDocument();
    expect(container.querySelector('.context-usage-indicator')).toBeInTheDocument();
  });

  it('triggers compact action when the indicator is clickable', () => {
    const onCompact = vi.fn();
    render(
      <ContextUsageIndicator tokenUsage={{ total_tokens: 80_000 }} context_limit={100_000} onCompact={onCompact} />
    );

    fireEvent.click(screen.getByRole('button'));

    expect(onCompact).toHaveBeenCalledTimes(1);
  });
});
