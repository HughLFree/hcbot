/**
 * =========================
 * Module: useHackChatSocket
 * Layer: Frontend Hook
 * Responsibility:
 * - 组合连接层、协议分发层、回复策略层
 * - 管理 UI 状态（连接状态/消息/在线用户）
 * =========================
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BotConfig, ChatMessage, ConnectionStatus, HCIncomingMessage } from '../types';
import { createHackChatConnection, HackChatConnection } from './socket/connectionLayer';
import { dispatchProtocolPacket, ReplyInput } from './socket/protocolDispatcher';

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

  const connectionRef = useRef<HackChatConnection | null>(null);
  const packetHandlerRef = useRef<(packet: HCIncomingMessage) => void>(() => {});
  const messagesRef = useRef<ChatMessage[]>([]);
  const configRef = useRef<BotConfig>(config);

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
   * 读取最新配置，供连接层在非 React 上下文中安全访问。
   */
  const getConfig = useCallback(() => configRef.current, []);

  /**
   * 统一封装发送聊天消息动作。
   */
  const sendChatMessage = useCallback((text: string) => {
    connectionRef.current?.sendChatMessage(text);
  }, []);

  /**
   * [Function]
   * Name: handlePacket
   * Purpose: 协议分发层入口，根据 cmd 更新状态并触发可选回复回调。
   */
  const handlePacket = useCallback((packet: HCIncomingMessage) => {
    const currentConfig = configRef.current;
    dispatchProtocolPacket({
      packet,
      botName: currentConfig.botName,
      replyMode: currentConfig.replyMode,
      messagesSnapshot: messagesRef.current,
      addMessage,
      replaceOnlineUsers: (users) => setOnlineUsers(users),
      appendOnlineUser: (nick) => setOnlineUsers((prev) => [...prev, nick]),
      removeOnlineUser: (nick) => setOnlineUsers((prev) => prev.filter((name) => name !== nick)),
      onIncomingMessage,
      onReplyRequested,
      sendChatMessage,
    });
  }, [addMessage, onIncomingMessage, onReplyRequested, sendChatMessage]);

  useEffect(() => {
    packetHandlerRef.current = handlePacket;
  }, [handlePacket]);

  /**
   * 组件生命周期内创建一次连接层实例，并在卸载时释放。
   */
  useEffect(() => {
    const connection = createHackChatConnection({
      getConfig,
      onStatusChange: setStatus,
      onSystemMessage: addMessage,
      onPacket: (packet) => packetHandlerRef.current(packet),
    });
    connectionRef.current = connection;

    return () => {
      connection.disconnect();
      if (connectionRef.current === connection) {
        connectionRef.current = null;
      }
    };
  }, [addMessage, getConfig]);

  /**
   * [Function]
   * Name: disconnect
   * Purpose: 断开连接并回收连接层资源。
   */
  const disconnect = useCallback(() => {
    connectionRef.current?.disconnect();
  }, []);

  /**
   * [Function]
   * Name: connect
   * Purpose: 触发连接层建立连接，连接前清空当前消息窗口。
   */
  const connect = useCallback(() => {
    if (status === 'connected' || status === 'connecting') return;
    clearMessages();
    connectionRef.current?.connect();
  }, [clearMessages, status]);

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
