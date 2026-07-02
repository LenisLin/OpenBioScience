import React from 'react';
import PageLoadingState from './PageLoadingState';
import { useTranslation } from 'react-i18next';

const AppLoader: React.FC = () => {
  const { t } = useTranslation();
  return (
    <div className='relative min-h-screen w-full bg-bg-1'>
      <PageLoadingState label={t('common.loadingDeepScientist')} />
    </div>
  );
};

export default AppLoader;
