/**
 * ======================
 * Module: useProfileSync
 * Layer: Frontend Hook
 * Responsibility:
 * - 同步用户 trip 身份到后端
 * - 捕捉 setprofile 指令并触发资料更新
 * - 读取用户画像并转换为 prompt 上下文
 * ======================
 */
import { useCallback } from 'react';
import type {
  IngestMessageRequest,
  ProfileByTripResponse,
  ProfileFromMessageRequest,
} from '../../shared/contracts';
import { ChatMessage, ProfileUpdateResult, UserProfile } from '../types';

interface UseProfileSyncOptions {
  getChannel: () => string;
}

/**
 * [Function]
 * Name: toProfileContext
 * Purpose: 将结构化画像过滤后转为可注入 prompt 的文本块。
 */
function toProfileContext(profile: UserProfile): string {
  const lines: string[] = [];
  Object.entries(profile).forEach(([key, value]) => {
    if (key === 'updated_at') return;
    if (value === null || value === undefined) return;
    if (typeof value === 'string' && value.trim() === '') return;
    if (Array.isArray(value) && value.length === 0) return;
    lines.push(`- ${key}: ${JSON.stringify(value)}`);
  });
  return lines.join('\n');
}

/**
 * [Function]
 * Name: useProfileSync
 * Purpose: 组装身份同步、资料更新、画像读取三类能力。
 * Input:
 * - getChannel: 获取当前频道名（函数式读取，避免旧闭包）
 * Output:
 * - { handleIncomingMessage, fetchProfileContextByTrip }
 */
export const useProfileSync = ({ getChannel }: UseProfileSyncOptions) => {
  /**
   * [Function]
   * Name: persistTripIdentity
   * Purpose: 仅在消息带 trip 时上报身份信息，更新 rooms/users 的 last_seen 与 display_name。
   */
  const persistTripIdentity = useCallback((message: ChatMessage) => {
    if (!message.trip) return;

    const payload: IngestMessageRequest = {
      room_id: getChannel(),
      trip_code: message.trip,
      display_name: message.nick,
      seen_at: Math.floor((message.time || Date.now()) / 1000),
    };

    fetch('/api/ingest-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch((error) => {
      console.error('Failed to persist trip identity:', error);
    });
  }, [getChannel]);

  /**
   * [Function]
   * Name: tryUpdateProfileFromMessage
   * Purpose: 捕捉 setprofile 命令并调用后端完成资料抽取/合并。
   */
  const tryUpdateProfileFromMessage = useCallback(async (message: ChatMessage) => {
    if (!message.trip) return;
    if (!message.text || !/^\s*setprofile\b/i.test(message.text)) return;

    try {
      const payload: ProfileFromMessageRequest = {
        room_id: getChannel(),
        trip_code: message.trip,
        display_name: message.nick,
        message_text: message.text,
      };

      const response = await fetch('/api/profile/from-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result: ProfileUpdateResult = await response.json();
      if (!result.ok) {
        console.error('Profile update failed:', result.error || result.reason);
      }
    } catch (error) {
      console.error('Failed to update user_profile from setprofile:', error);
    }
  }, [getChannel]);

  /**
   * [Function]
   * Name: fetchProfileContextByTrip
   * Purpose: 按 trip 获取画像，并转为 prompt 可直接使用的上下文文本。
   */
  const fetchProfileContextByTrip = useCallback(async (tripCode?: string): Promise<string> => {
    if (!tripCode) return '';

    try {
      const response = await fetch(`/api/profile/${encodeURIComponent(tripCode)}`);
      if (!response.ok) return '';

      const data = (await response.json()) as ProfileByTripResponse;
      const profile = data?.profile_json as UserProfile | undefined;
      if (!profile) return '';
      return toProfileContext(profile);
    } catch (error) {
      console.error('Failed to fetch user_profile by trip:', error);
      return '';
    }
  }, []);

  /**
   * [Function]
   * Name: handleIncomingMessage
   * Purpose: 来消息时统一触发身份同步与 setprofile 检测。
   */
  const handleIncomingMessage = useCallback((message: ChatMessage) => {
    persistTripIdentity(message);
    void tryUpdateProfileFromMessage(message);
  }, [persistTripIdentity, tryUpdateProfileFromMessage]);

  return {
    handleIncomingMessage,
    fetchProfileContextByTrip,
  };
};
