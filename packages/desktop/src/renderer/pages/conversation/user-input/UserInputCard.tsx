/**
 * @license
 * Copyright 2025 DeepOrganiser (deepscientist.cc)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { UserInputAnswer, UserInputQuestion, UserInputRequest } from '@/common/chat/userInput';
import { IconLeft, IconRight } from '@arco-design/web-react/icon';
import classNames from 'classnames';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './UserInputCard.css';
import { getUserInputLabels } from './userInputI18n';

type UserInputCardProps = {
  request: UserInputRequest;
  conversationId: string;
};

const getInitialText = (question: UserInputQuestion): string => '';

export const UserInputCard: React.FC<UserInputCardProps> = ({ request, conversationId }) => {
  const { i18n } = useTranslation();
  const labels = getUserInputLabels(i18n.language);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({});
  const questions = request.questions;
  const question = questions[Math.min(index, questions.length - 1)];

  useEffect(() => {
    if (!request.conversationId) {
      void ipcBridge.conversation.userInput.claim.invoke({ requestId: request.requestId, conversationId });
    }
  }, [conversationId, request.conversationId, request.requestId]);

  const progress = `${index + 1} / ${questions.length}`;
  const isLastQuestion = index >= questions.length - 1;

  const isOtherSelected = (q: UserInputQuestion): boolean => selected[q.id]?.includes('__other__') ?? false;

  const hasAnswer = useCallback(
    (q: UserInputQuestion): boolean => {
      if (q.type === 'text') return Boolean((texts[q.id] || '').trim());
      const selectedOptionIds = (selected[q.id] || []).filter((id) => id !== '__other__');
      return selectedOptionIds.length > 0 || Boolean((otherTexts[q.id] || '').trim());
    },
    [otherTexts, selected, texts]
  );

  const toggleOption = (q: UserInputQuestion, optionId: string) => {
    setSelected((prev) => {
      const current = prev[q.id] || [];
      if (q.type === 'single_choice') {
        return { ...prev, [q.id]: current.includes(optionId) ? [] : [optionId] };
      }
      const next = current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
      return { ...prev, [q.id]: next };
    });
  };

  const answers = useMemo<UserInputAnswer[]>(() => {
    return questions.map((q) => ({
      questionId: q.id,
      selectedOptionIds: selected[q.id]?.filter((id) => id !== '__other__'),
      text: q.type === 'text' ? texts[q.id] || getInitialText(q) : undefined,
      otherText: otherTexts[q.id],
    }));
  }, [otherTexts, questions, selected, texts]);

  const submit = useCallback(async () => {
    await ipcBridge.conversation.userInput.answer.invoke({
      requestId: request.requestId,
      answers,
    });
  }, [answers, request.requestId]);

  const currentRequiredMissing = Boolean(question?.required && !hasAnswer(question));
  const allRequiredAnswered = questions.every((q) => !q.required || hasAnswer(q));
  const primaryDisabled = currentRequiredMissing || (isLastQuestion && !allRequiredAnswered);

  const handlePrimary = useCallback(async () => {
    if (!question || primaryDisabled) return;
    if (!isLastQuestion) {
      setIndex((value) => Math.min(questions.length - 1, value + 1));
      return;
    }
    await submit();
  }, [isLastQuestion, primaryDisabled, question, questions.length, submit]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void ipcBridge.conversation.userInput.cancel.invoke({ requestId: request.requestId, reason: 'skipped' });
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        void handlePrimary();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePrimary, request.requestId]);

  if (!question) return null;

  return (
    <div className='user-input-card-shell'>
      <div className='user-input-card' data-testid='user-input-card'>
        {request.title || request.reason ? (
          <div className='user-input-card__eyebrow'>
            {request.title ? <span>{request.title}</span> : null}
            {request.reason ? <em>{request.reason}</em> : null}
          </div>
        ) : null}
        <div className='user-input-card__head'>
          <div className='user-input-card__title'>{question.title}</div>
          <div className='user-input-card__pager'>
            <button
              type='button'
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              aria-label={labels.previousQuestion}
            >
              <IconLeft />
            </button>
            <span>{progress}</span>
            <button
              type='button'
              disabled={index >= questions.length - 1}
              onClick={() => setIndex((value) => Math.min(questions.length - 1, value + 1))}
              aria-label={labels.nextQuestion}
            >
              <IconRight />
            </button>
          </div>
        </div>
        {question.description ? <div className='user-input-card__description'>{question.description}</div> : null}

        {question.type === 'text' ? (
          <textarea
            className='user-input-card__textarea'
            value={texts[question.id] || ''}
            placeholder={question.placeholder || labels.textPlaceholder}
            onChange={(event) => setTexts((prev) => ({ ...prev, [question.id]: event.target.value }))}
          />
        ) : (
          <div className='user-input-card__options'>
            {(question.options || []).map((option, optionIndex) => {
              const active = selected[question.id]?.includes(option.id) ?? false;
              return (
                <button
                  key={option.id}
                  type='button'
                  className={classNames('user-input-option', active && 'user-input-option--active')}
                  onClick={() => toggleOption(question, option.id)}
                >
                  <span className='user-input-option__index'>{optionIndex + 1}</span>
                  <span className='user-input-option__main'>
                    <span className='user-input-option__label'>
                      {option.label}
                      {option.recommended ? <b>{labels.recommended}</b> : null}
                    </span>
                    {option.description ? <span className='user-input-option__description'>{option.description}</span> : null}
                  </span>
                </button>
              );
            })}
            {question.allowOther ? (
              <button
                type='button'
                className={classNames('user-input-option', isOtherSelected(question) && 'user-input-option--active')}
                onClick={() => toggleOption(question, '__other__')}
              >
                <span className='user-input-option__index'>✎</span>
                <span className='user-input-option__main'>
                  <span className='user-input-option__label'>{question.otherLabel || labels.otherLabel}</span>
                </span>
              </button>
            ) : null}
            {question.allowOther && isOtherSelected(question) ? (
              <input
                className='user-input-card__other'
                value={otherTexts[question.id] || ''}
                placeholder={labels.otherPlaceholder}
                onChange={(event) => setOtherTexts((prev) => ({ ...prev, [question.id]: event.target.value }))}
              />
            ) : null}
          </div>
        )}

        <div className='user-input-card__foot'>
          <button
            type='button'
            className='user-input-card__skip'
            onClick={() => void ipcBridge.conversation.userInput.cancel.invoke({ requestId: request.requestId, reason: 'skipped' })}
          >
            {labels.skip} <kbd>ESC</kbd>
          </button>
          <button
            type='button'
            className='user-input-card__submit'
            disabled={primaryDisabled}
            onClick={() => void handlePrimary()}
          >
            {isLastQuestion ? labels.submit : labels.continue} ↩
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserInputCard;
