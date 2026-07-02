/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Button, Result } from '@arco-design/web-react';
import i18n from '@/renderer/services/i18n';

type ScheduledTasksErrorBoundaryProps = React.PropsWithChildren<{
  onBack?: () => void;
}>;

type ScheduledTasksErrorBoundaryState = {
  error: Error | null;
};

class ScheduledTasksErrorBoundary extends React.Component<
  ScheduledTasksErrorBoundaryProps,
  ScheduledTasksErrorBoundaryState
> {
  state: ScheduledTasksErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): ScheduledTasksErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ScheduledTasksErrorBoundary] Scheduled tasks route crashed:', error, info);
  }

  private handleBack = (): void => {
    if (this.props.onBack) {
      this.props.onBack();
      return;
    }
    window.location.hash = '#/guid';
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className='flex min-h-full w-full items-center justify-center px-16px py-32px'>
        <Result
          status='error'
          title={i18n.t('cron.errorBoundary.title', { defaultValue: 'Scheduled tasks failed to load' })}
          subTitle={this.state.error.message}
          extra={
            <Button type='primary' onClick={this.handleBack}>
              {i18n.t('cron.errorBoundary.backHome', { defaultValue: 'Back to home' })}
            </Button>
          }
        />
      </div>
    );
  }
}

export default ScheduledTasksErrorBoundary;
