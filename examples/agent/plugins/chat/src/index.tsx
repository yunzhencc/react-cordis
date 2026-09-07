import type { Context } from '@deepseek-ai/cordis';
import type {} from '@examples/agent-models';
import type {} from '@yunzhen/cordis-ui-i18n';
import type {} from '@yunzhen/cordis-ui-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChatComposer } from './chat-composer';
import styles from './chat.module.css';

interface ChatMessage {
  content: string;
  id: string;
  role: 'assistant' | 'user';
}

const messages = {
  zh: {
    chat: {
      message: '消息',
      model: '模型',
      placeholder: '输入消息',
      send: '发送',
      stop: '停止',
      title: '聊天',
    },
  },
  en: {
    chat: {
      message: 'Message',
      model: 'Model',
      placeholder: 'Message Codex',
      send: 'Send',
      stop: 'Stop',
      title: 'Chat',
    },
  },
} as const;

export const inject = ['i18n', 'models', 'routes'];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.i18n.register('chat', messages));
  const models = ctx.models;
  ctx.routes.inject('app-layout', () => ctx.routes.register({
    id: 'chat',
    navigation: { label: 'Chat', labelKey: 'chat:chat.title', order: 10 },
    parentId: 'app-layout',
    path: 'chat',
    Component: () => <ChatPage models={models} />,
  }));
}

function ChatPage({ models }: Pick<Context, 'models'>) {
  const { t } = useTranslation('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>(models.defaultModelId);
  const [streaming, setStreaming] = useState(false);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const messageIdRef = useRef(0);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function send(content: string) {
    if (!content || controllerRef.current)
      return;

    const userMessage: ChatMessage = { content, id: String(messageIdRef.current++), role: 'user' };
    const requestMessages = [...messages, userMessage];
    const controller = new AbortController();
    controllerRef.current = controller;
    setMessages([...requestMessages, { content: '', id: String(messageIdRef.current++), role: 'assistant' }]);
    setStreaming(true);

    try {
      for await (const chunk of models.stream({
        abortSignal: controller.signal,
        messages: requestMessages,
        modelId: selectedModelId,
      })) {
        setMessages(current => appendAssistantText(current, chunk));
      }
    }
    catch (error) {
      if (!controller.signal.aborted)
        setMessages(current => replaceAssistantText(current, `Error: ${error instanceof Error ? error.message : String(error)}`));
    }
    finally {
      if (controllerRef.current === controller) {
        controllerRef.current = undefined;
        setStreaming(false);
      }
    }
  }

  return (
    <section className={styles.chatPage}>
      <h1 className={styles.visuallyHidden}>{t('chat.title')}</h1>
      <ul className={styles.messageList} aria-label={t('chat.title')}>
        {messages.map(message => (
          <li key={message.id} className={message.role === 'user' ? styles.userMessage : styles.assistantMessage}>
            {message.content}
          </li>
        ))}
      </ul>
      <div className={styles.composerDock}>
        <ChatComposer
          disabled={streaming}
          onSend={content => void send(content)}
          onStop={() => controllerRef.current?.abort()}
          placeholder={t('chat.placeholder')}
          sendLabel={t('chat.send')}
          stopLabel={t('chat.stop')}
        >
          <select aria-label={t('chat.model')} className={styles.modelPicker} value={selectedModelId} onChange={event => setSelectedModelId(event.target.value)}>
            {models.snapshot().map(model => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
        </ChatComposer>
      </div>
    </section>
  );
}

function appendAssistantText(messages: readonly ChatMessage[], text: string): ChatMessage[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant')
    return [...messages];
  return [...messages.slice(0, -1), { ...last, content: last.content + text }];
}

function replaceAssistantText(messages: readonly ChatMessage[], text: string): ChatMessage[] {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant')
    return [...messages];
  return [...messages.slice(0, -1), { ...last, content: text }];
}
