/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { UserInputAnswer, UserInputQuestion, UserInputResult } from '@/common/chat/userInput';
import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './UserInputSummary.css';
import { getUserInputLabels, getUserInputStatusLabel } from './userInputI18n';

const findAnswer = (answers: UserInputAnswer[] | undefined, questionId: string): UserInputAnswer | undefined =>
  answers?.find((answer) => answer.questionId === questionId);

const answerLabel = (question: UserInputQuestion, answer: UserInputAnswer | undefined, language?: string): string => {
  const labelsForLanguage = getUserInputLabels(language);
  if (!answer) return labelsForLanguage.noAnswer;
  const labels = (answer.selectedOptionIds || [])
    .map((id) => question.options?.find((option) => option.id === id)?.label)
    .filter((item): item is string => Boolean(item));
  if (answer.otherText) labels.push(answer.otherText);
  if (answer.text) labels.push(answer.text);
  return labels.length ? labels.join(labelsForLanguage.answerJoiner) : labelsForLanguage.noAnswer;
};

const UserInputSummary: React.FC<{ results: UserInputResult[] }> = ({ results }) => {
  const { i18n } = useTranslation();
  const labels = getUserInputLabels(i18n.language);
  const [expanded, setExpanded] = useState(true);
  const latest = results.at(-1);
  const questionCount = useMemo(() => results.reduce((sum, item) => sum + item.questions.length, 0), [results]);

  if (!latest || questionCount === 0) return null;

  const flatQuestions = results.flatMap((result) =>
    result.questions.map((question) => ({
      result,
      question,
      answer: findAnswer(result.answers, question.id),
    }))
  );

  return (
    <div className='user-input-summary' data-testid='user-input-summary'>
      <button type='button' className='user-input-summary__toggle' onClick={() => setExpanded((value) => !value)}>
        <span>
          {getUserInputStatusLabel(latest.status, i18n.language)} {labels.questionCount(questionCount)}
        </span>
        {expanded ? <IconDown /> : <IconRight />}
      </button>
      {expanded ? (
        <div className='user-input-summary__body'>
          {flatQuestions.map(({ result, question, answer }) => (
            <div className='user-input-summary__item' key={`${result.requestId}-${question.id}`}>
              <div className='user-input-summary__question'>{question.title}</div>
              <div className='user-input-summary__answer'>{answerLabel(question, answer, i18n.language)}</div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default UserInputSummary;
