/**
 * ===========================
 * Module: protocolDispatcher
 * Layer: Frontend Hook Helper
 * Responsibility:
 * - 分发 hack.chat 协议消息（chat/info/warn/online）
 * - 协调消息落地、在线用户更新、回复触发
 * ===========================
 */
import type { ChatMessage, HCIncomingMessage, ReplyMode } from '../../types';
import { shouldReplyToMessage } from './replyStrategy';

export interface ReplyInput {
  history: ChatMessage[];
  triggerMessage: string;
  sender: string;
  senderTrip?: string;
}

interface DispatchProtocolPacketOptions {
  packet: HCIncomingMessage;
  botName: string;
  replyMode: ReplyMode;
  messagesSnapshot: ChatMessage[];
  addMessage: (message: ChatMessage) => void;
  replaceOnlineUsers: (users: string[]) => void;
  appendOnlineUser: (nick: string) => void;
  removeOnlineUser: (nick: string) => void;
  onIncomingMessage?: (message: ChatMessage) => void;
  onReplyRequested?: (input: ReplyInput) => Promise<string>;
  sendChatMessage: (text: string) => void;
}

/**
 * 协议消息分发入口。
 * 输入一个 packet，根据 cmd 做对应状态变更和业务回调触发。
 */
export function dispatchProtocolPacket({
  packet,
  botName,
  replyMode,
  messagesSnapshot,
  addMessage,
  replaceOnlineUsers,
  appendOnlineUser,
  removeOnlineUser,
  onIncomingMessage,
  onReplyRequested,
  sendChatMessage,
}: DispatchProtocolPacketOptions): void {
  switch (packet.cmd) {
    case 'chat': {
      if (!packet.nick || !packet.text) return;
      const newMessage: ChatMessage = {
        time: packet.time || Date.now(),
        nick: packet.nick,
        text: packet.text,
        trip: packet.trip,
        type: 'message',
      };
      addMessage(newMessage);

      if (packet.nick === botName) return;
      onIncomingMessage?.(newMessage);

      const shouldReply = shouldReplyToMessage({
        replyMode,
        botName,
        text: packet.text,
      });

      if (shouldReply && onReplyRequested) {
        void onReplyRequested({
          history: messagesSnapshot,
          triggerMessage: packet.text,
          sender: packet.nick,
          senderTrip: packet.trip,
        })
          .then((response) => {
            if (!response) return;
            sendChatMessage(response);
          })
          .catch((error) => {
            console.error('Reply generation failed:', error);
          });
      }
      return;
    }

    case 'info': {
      if (!packet.text) return;
      addMessage({
        time: packet.time || Date.now(),
        nick: 'Server',
        text: packet.text,
        type: 'info',
      });
      return;
    }

    case 'warn': {
      if (!packet.text) return;
      addMessage({
        time: Date.now(),
        nick: 'Server',
        text: packet.text,
        type: 'warning',
      });
      return;
    }

    case 'onlineSet': {
      if (!Array.isArray(packet.nicks)) return;
      replaceOnlineUsers(packet.nicks);
      return;
    }

    case 'onlineAdd': {
      if (!packet.nick) return;
      appendOnlineUser(packet.nick);
      addMessage({
        time: Date.now(),
        nick: '*',
        text: `${packet.nick} joined`,
        type: 'info',
      });
      return;
    }

    case 'onlineRemove': {
      if (!packet.nick) return;
      removeOnlineUser(packet.nick);
      addMessage({
        time: Date.now(),
        nick: '*',
        text: `${packet.nick} left`,
        type: 'info',
      });
    }
  }
}
