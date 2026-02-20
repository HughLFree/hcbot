/**
 * =========================
 * Module: useHackChatSocket
 * Layer: Frontend Hook
 * Responsibility:
 * - 管理 hack.chat WebSocket 生命周期
 * - 分发消息事件与在线用户状态
 * - 将“是否需要回复”交给上层回调处理
 * =========================
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BotConfig, ChatMessage, ConnectionStatus, HCIncomingMessage, HCOutgoingMessage } from '../types';

interface ReplyInput {
  history: ChatMessage[];
  triggerMessage: string;
  sender: string;
  senderTrip?: string;
}

interface UseHackChatSocketOptions {
  config: BotConfig;
  onIncomingMessage?: (message: ChatMessage) => void;
  onReplyRequested?: (input: ReplyInput) => Promise<string>;
}

/**
 * [Function]
 * Name: useHackChatSocket
 * Purpose:
 * - 建立并维护聊天室连接
 * - 输出 UI 需要的连接/消息/在线状态
 * Input:
 * - config: 当前机器人配置
 * - onIncomingMessage: 来消息业务回调
 * - onReplyRequested: 触发回复时的异步回调
 * Output:
 * - { status, messages, onlineUsers, connect, disconnect }
 */
export const useHackChatSocket = ({
  config,
  onIncomingMessage,
  onReplyRequested,
}: UseHackChatSocketOptions) => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const configRef = useRef<BotConfig>(config);
  const pingIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  /**
   * [Function]
   * Name: addMessage
   * Purpose: 同步写入消息列表状态和消息 ref，保证渲染与回调读取一致。
   */
  const addMessage = useCallback((msg: ChatMessage) => {
    messagesRef.current = [...messagesRef.current, msg];
    setMessages((prev) => [...prev, msg]);
  }, []);

  /**
   * [Function]
   * Name: clearMessages
   * Purpose: 清空消息状态与消息 ref，常用于重新连接前重置界面。
   */
  const clearMessages = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
  }, []);

  /**
   * [Function]
   * Name: sendPacket
   * Purpose: 统一发送 WebSocket 数据包，内部负责连接状态判断。
   */
  const sendPacket = useCallback((packet: HCOutgoingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(packet));
    }
  }, []);

  /**
   * [Function]
   * Name: disconnect
   * Purpose: 断开连接并回收资源（socket + ping timer）。
   */
  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    setStatus('disconnected');
  }, []);

  /**
   * [Function]
   * Name: connect
   * Purpose:
   * - 建立与 hack.chat 的连接
   * - 绑定事件处理（chat/info/warn/online）
   * - 在满足策略时触发 onReplyRequested
   */
  const connect = useCallback(() => {
    if (status === 'connected' || status === 'connecting') return;

    setStatus('connecting');
    clearMessages();

    const ws = new WebSocket('wss://hack.chat/chat-ws');
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      addMessage({
        time: Date.now(),
        nick: 'System',
        text: 'Connected to wss://hack.chat/chat-ws',
        type: 'info',
      });

      sendPacket({
        cmd: 'join',
        channel: configRef.current.channel,
        nick: configRef.current.botName,
        pass: configRef.current.password,
      });

      pingIntervalRef.current = window.setInterval(() => {
        sendPacket({ cmd: 'ping' });
      }, 60000);
    };

    ws.onmessage = (event) => {
      try {
        const data: HCIncomingMessage = JSON.parse(event.data);

        switch (data.cmd) {
          case 'chat':
            if (data.nick && data.text) {
              const newMessage: ChatMessage = {
                time: data.time || Date.now(),
                nick: data.nick,
                text: data.text,
                trip: data.trip,
                type: 'message',
              };
              addMessage(newMessage);

              if (data.nick === configRef.current.botName) return;
              onIncomingMessage?.(newMessage);

              const lowerText = data.text.toLowerCase();
              const lowerBotName = configRef.current.botName.toLowerCase();
              const isMentioned =lowerText.includes(lowerBotName) ;

              const shouldReply = configRef.current.replyMode === 'mention'
                ? isMentioned
                : (isMentioned || Math.random() < 0.1);

              if (shouldReply && onReplyRequested) {
                void onReplyRequested({
                  history: messagesRef.current,
                  triggerMessage: data.text,
                  sender: data.nick,
                  senderTrip: data.trip,
                }).then((response) => {
                  if (!response) return;
                  sendPacket({ cmd: 'chat', text: response });
                });
              }
            }
            break;

          case 'info':
            if (data.text) {
              addMessage({
                time: data.time || Date.now(),
                nick: 'Server',
                text: data.text,
                type: 'info',
              });
            }
            break;

          case 'warn':
            if (data.text) {
              addMessage({
                time: Date.now(),
                nick: 'Server',
                text: data.text,
                type: 'warning',
              });
            }
            break;

          case 'onlineSet':
            if (Array.isArray(data.nicks)) {
              setOnlineUsers(data.nicks);
            }
            break;

          case 'onlineAdd':
            if (data.nick) {
              setOnlineUsers((prev) => [...prev, data.nick!]);
              addMessage({
                time: Date.now(),
                nick: '*',
                text: `${data.nick} joined`,
                type: 'info',
              });
            }
            break;

          case 'onlineRemove':
            if (data.nick) {
              setOnlineUsers((prev) => prev.filter((n) => n !== data.nick));
              addMessage({
                time: Date.now(),
                nick: '*',
                text: `${data.nick} left`,
                type: 'info',
              });
            }
            break;
        }
      } catch (error) {
        console.error('Failed to parse WS message', error);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      addMessage({
        time: Date.now(),
        nick: 'System',
        text: 'Connection closed.',
        type: 'warning',
      });
    };

    ws.onerror = (err) => {
      console.error(err);
      setStatus('error');
      addMessage({
        time: Date.now(),
        nick: 'System',
        text: 'WebSocket encountered an error.',
        type: 'warning',
      });
    };
  }, [addMessage, clearMessages, onIncomingMessage, onReplyRequested, sendPacket, status]);

  // 页面卸载时主动断开，减少幽灵连接
  useEffect(() => {
    const handleBeforeUnload = () => disconnect();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    messages,
    onlineUsers,
    connect,
    disconnect,
  };
};
