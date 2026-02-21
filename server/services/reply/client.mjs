import { getDeepSeekClient, isDeepSeekClientReady } from '../llm/client.mjs';

export function isReplyClientReady() {
  return isDeepSeekClientReady();
}

export function getReplyClient() {
  return getDeepSeekClient();
}
