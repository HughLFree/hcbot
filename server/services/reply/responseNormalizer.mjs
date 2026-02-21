import { SERVER_CONFIG } from '../../config.mjs';

export function normalizeString(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const tags = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = item.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(normalized);
  }
  return tags.slice(0, 8);
}

function clampImportance(value) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return SERVER_CONFIG.memory.defaultImportance;
  return Math.max(
    SERVER_CONFIG.memory.minImportance,
    Math.min(SERVER_CONFIG.memory.maxImportance, parsed)
  );
}

export function parseModelJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function getMemoryItemsFromOutput(rawOutput) {
  const safeOutput = rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)
    ? rawOutput
    : {};
  const memory = safeOutput.memory && typeof safeOutput.memory === 'object' && !Array.isArray(safeOutput.memory)
    ? safeOutput.memory
    : safeOutput;

  return Array.isArray(memory.items) ? memory.items : [];
}

export function normalizeMemoryItems(rawOutput) {
  return getMemoryItemsFromOutput(rawOutput)
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const text = normalizeString(item.text);
      if (!text) return null;
      return {
        text,
        importance: clampImportance(item.importance),
        tags: normalizeTags(item.tags),
      };
    })
    .filter(Boolean);
}

export function normalizeModelOutput(rawOutput) {
  const safeOutput = rawOutput && typeof rawOutput === 'object' && !Array.isArray(rawOutput)
    ? rawOutput
    : {};
  const reply = normalizeString(safeOutput.reply);
  const normalizedItems = normalizeMemoryItems(safeOutput);

  return {
    reply,
    memory: {
      items: normalizedItems,
    },
  };
}
