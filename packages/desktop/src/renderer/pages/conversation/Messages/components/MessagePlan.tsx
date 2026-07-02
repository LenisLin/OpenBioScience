import { IconDown, IconRight } from '@arco-design/web-react/icon';
import React, { useEffect, useState } from 'react';
import type { IMessagePlan } from '@/common/chat/chatLib';
import AgentStatusIcon from '@/renderer/components/icons/AgentStatusIcon';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { isCodexConversationRuntime } from '@/renderer/pages/conversation/utils/agentBackend';
import classNames from 'classnames';

const TodoItemIcon: React.FC<{ status: IMessagePlan['content']['entries'][number]['status'] }> = ({ status }) => {
  if (status === 'completed') return <AgentStatusIcon name='checkOne' size={16} />;
  if (status === 'in_progress') return <AgentStatusIcon name='loading' size={16} spin />;
  return <AgentStatusIcon name='time' size={16} />;
};

const MessagePlan: React.FC<{ message: IMessagePlan }> = ({ message }) => {
  const conversationContext = useConversationContextSafe();
  const collapseByDefault = isCodexConversationRuntime(conversationContext);
  const [showMore, setShowMore] = useState(!collapseByDefault);

  useEffect(() => {
    if (collapseByDefault) {
      setShowMore(false);
    }
  }, [collapseByDefault, message.id]);

  return (
    <div>
      <div className='flex items-center gap-10px color-#86909C cursor-pointer' onClick={() => setShowMore(!showMore)}>
        <span className='inline-flex items-center gap-6px'>
          <AgentStatusIcon name='listCheckbox' size={16} />
          <span>To do list</span>
        </span>
        {showMore ? <IconDown /> : <IconRight />}
      </div>
      {showMore && (
        <div className='p-l-20px flex flex-col gap-8px pt-8px'>
          {message.content.entries.map((item, index) => {
            return (
              <div
                className='message-plan-item flex flex-row items-center color-#86909C gap-8px'
                key={`${item.content}-${index}`}
              >
                <span className='size-22px flex items-center justify-center'>
                  <TodoItemIcon status={item.status} />
                </span>
                <span className={classNames(item.status === 'completed' && 'line-through text-t-tertiary')}>
                  {item.content}{' '}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MessagePlan;
