/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UserInputResult } from '@/common/chat/userInput';

export type UserInputUiLanguage = 'zh' | 'en';

export const resolveUserInputUiLanguage = (language?: string): UserInputUiLanguage =>
  language?.replace(/_/g, '-').toLowerCase().startsWith('zh') ? 'zh' : 'en';

const labels = {
  zh: {
    previousQuestion: '上一题',
    nextQuestion: '下一题',
    textPlaceholder: '请输入补充信息',
    otherLabel: '其他',
    otherPlaceholder: '请补充说明',
    recommended: '推荐',
    skip: '忽略',
    continue: '继续',
    submit: '提交',
    pendingBadge: '需要用户输入',
    noAnswer: '未提供答案',
    asked: '已询问',
    incomplete: '询问未完成',
    questionCount: (count: number) => `${count} 个问题`,
    answerJoiner: '、',
  },
  en: {
    previousQuestion: 'Previous question',
    nextQuestion: 'Next question',
    textPlaceholder: 'Enter additional information',
    otherLabel: 'Other',
    otherPlaceholder: 'Add details',
    recommended: 'Recommended',
    skip: 'Skip',
    continue: 'Continue',
    submit: 'Submit',
    pendingBadge: 'Input needed',
    noAnswer: 'No answer provided',
    asked: 'Asked',
    incomplete: 'Question incomplete',
    questionCount: (count: number) => `${count} ${count === 1 ? 'question' : 'questions'}`,
    answerJoiner: ', ',
  },
} satisfies Record<UserInputUiLanguage, Record<string, unknown>>;

export const getUserInputLabels = (language?: string) => labels[resolveUserInputUiLanguage(language)];

export const getUserInputStatusLabel = (status: UserInputResult['status'], language?: string): string => {
  const uiLabels = getUserInputLabels(language);
  if (status === 'answered' || status === 'timeout' || status === 'skipped' || status === 'cancelled') {
    return uiLabels.asked as string;
  }
  return uiLabels.incomplete as string;
};
