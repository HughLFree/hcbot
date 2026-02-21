/**
 * ==========================
 * Module: connectionLayer
 * Layer: Frontend Hook Helper
 * Responsibility:
 * - 管理 WebSocket 连接生命周期（connect/disconnect/ping）
 * - 与服务器进行基础协议交互（join/chat/ping）
 * - 把收到的原始协议包回调给上层分发器
 * ==========================
 */
import type {
  BotConfig,
  ChatMessage,
  ConnectionStatus,
  HCIncomingMessage,
  HCOutgoingMessage,
} from '../../types';

const HACK_CHAT_WS_URL = 'wss://hack.chat/chat-ws';
const PING_INTERVAL_MS = 60000;

interface ConnectionLayerOptions {
  getConfig: () => BotConfig;
  onStatusChange: (status: ConnectionStatus) => void;
  onSystemMessage: (message: ChatMessage) => void;
  onPacket: (packet: HCIncomingMessage) => void;
}

export interface HackChatConnection {
  connect: () => void;
  disconnect: () => void;
  sendChatMessage: (text: string) => void;
}

/**
 * 创建 hack.chat 连接实例。
 * 该函数只负责连接层，不处理具体业务协议分支逻辑。
 */
export function createHackChatConnection({
  getConfig,
  onStatusChange,
  onSystemMessage,
  onPacket,
}: ConnectionLayerOptions): HackChatConnection {
  let ws: WebSocket | null = null;
  let pingIntervalId: number | null = null;

  /**
   * 关闭心跳定时器，避免重复 ping 与泄漏。
   */
  const stopPing = () => {
    if (pingIntervalId) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
  };

  /**
   * 统一发送出站协议包（仅在连接可写时发送）。
   */
  const sendPacket = (packet: HCOutgoingMessage) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(packet));
    }
  };

  /**
   * 建立 websocket 连接并绑定事件。
   */
  const connect = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    onStatusChange('connecting');
    ws = new WebSocket(HACK_CHAT_WS_URL);
    const currentSocket = ws;

    currentSocket.onopen = () => {
      onStatusChange('connected');
      onSystemMessage({
        time: Date.now(),
        nick: 'System',
        text: `Connected to ${HACK_CHAT_WS_URL}`,
        type: 'info',
      });

      const config = getConfig();
      sendPacket({
        cmd: 'join',
        channel: config.channel,
        nick: config.botName,
        pass: config.password,
      });

      pingIntervalId = window.setInterval(() => {
        sendPacket({ cmd: 'ping' });
      }, PING_INTERVAL_MS);
    };

    currentSocket.onmessage = (event) => {
      try {
        const packet: HCIncomingMessage = JSON.parse(event.data);
        onPacket(packet);
      } catch (error) {
        console.error('Failed to parse WS message', error);
      }
    };

    currentSocket.onclose = () => {
      stopPing();
      onStatusChange('disconnected');
      onSystemMessage({
        time: Date.now(),
        nick: 'System',
        text: 'Connection closed.',
        type: 'warning',
      });
      if (ws === currentSocket) ws = null;
    };

    currentSocket.onerror = (error) => {
      console.error(error);
      onStatusChange('error');
      onSystemMessage({
        time: Date.now(),
        nick: 'System',
        text: 'WebSocket encountered an error.',
        type: 'warning',
      });
    };
  };

  /**
   * 主动断开连接并回收本地资源。
   */
  const disconnect = () => {
    if (ws) {
      ws.close();
      ws = null;
    }
    stopPing();
    onStatusChange('disconnected');
  };

  return {
    connect,
    disconnect,
    sendChatMessage: (text: string) => sendPacket({ cmd: 'chat', text }),
  };
}
