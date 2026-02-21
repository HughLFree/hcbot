function buildCurrentSituation(targetMessage, targetSender) {
  return targetMessage && targetSender
    ? `用户「${targetSender}」刚刚说：「${targetMessage}」`
    : '请自然参与当前对话。';
}

function buildOptionalProfileContext(profileContext) {
  if (!profileContext || typeof profileContext !== 'string' || profileContext.trim().length === 0) return '';
  return `\n当前对话人物的已知资料（仅在自然合适时参考，不要刻意引用）：\n${profileContext}\n`;
}

export function buildSinglePassPrompt({
  context,
  targetMessage,
  targetSender,
  profileContext,
  memoryContextJson,
}) {
  return `
下面是一个公开聊天室的最近聊天记录。请仔细区分不同昵称的发言者。
---
${context}
---
${buildOptionalProfileContext(profileContext)}
以下是与当前对话人物相关的已存记忆（已按重要性筛选，仅在自然相关时使用，可忽略不相关内容）：
${memoryContextJson}

当前情况：
${buildCurrentSituation(targetMessage, targetSender)}

任务要求：
1. 必须完全按照 system 中定义的人格设定进行回应。
2. reply 是发送到聊天室的内容：
   - 自然，生动（优先 5–60 字，讲知识可适度变长。）
   - 不要添加名字前缀
   - 不要解释规则或提到“记忆”“数据库”等
   - reply 字符串本身必须以 "*" 开头并以 "*" 结尾（例如 "*你好*"）

3. 输出必须是严格 JSON：

输出 JSON 格式必须如下：

{
  "reply": "*string*",
  "memory": {
    "items": [
      {
        "text": "简洁客观的记忆陈述句",
        "importance": 1-10 的整数,
        "tags": ["标签1", "标签2"]
      }
    ]
  }
}

记忆提取规则：
4. 提取出有用的信息（限制在70字内），记录到memory中，并按1-10分评估这段记忆重要性。
5. 如果没有需要记录的记忆，请将 "items" 设为 []。
6. 记忆是后台结构信息，不应影响 reply 的自然度和人格表现。
`;
}

export function buildTwoPassReplyPrompt({
  context,
  targetMessage,
  targetSender,
  profileContext,
  memoryContextJson,
}) {
  return `
下面是一个公开聊天室的最近聊天记录。请仔细区分不同昵称的发言者。
---
${context}
---
${buildOptionalProfileContext(profileContext)}
以下是与当前对话人物相关的已存记忆（已按重要性筛选，仅在自然相关时使用，可忽略不相关内容）：
${memoryContextJson}

当前情况：
${buildCurrentSituation(targetMessage, targetSender)}

任务要求：
1. 必须完全按照 system 中定义的人格设定进行回应。
2. reply 是发送到聊天室的内容：
   - 自然，生动（优先 5-60 字，讲知识可适度变长。）
   - 不要添加名字前缀
   - 不要解释规则或提到“记忆”“数据库”等
   - 可输出自己的表情动作和内心想法，用括号括起来，例如：(温和地笑)(想了一会儿)(表情动作可以混在文本中，但不要过多，保持自然)
   - reply 字符串本身必须以 "*" 开头并以 "*" 结尾（例如 "*你好*"）
3. 只输出严格 JSON。

输出 JSON 格式：
{
  "reply": "*string*"
}
`;
}

export function buildTwoPassMemoryPrompt({
  context,
  targetMessage,
  targetSender,
  memoryContextJson,
}) {
  return `
你是记忆提取器。根据下面的对话与当前消息，判断是否需要生成长期可复用记忆。

聊天记录：
---
${context}
---
当前消息：
${buildCurrentSituation(targetMessage, targetSender)}

已存记忆（仅供参考，避免重复）：
${memoryContextJson}

规则：
1. 只提取可长期复用的信息，忽略短期噪声。
2. 每条记忆 text 需要简洁客观（不超过70字）。
3. importance 必须是 1-10 的整数。
4. 输出必须是严格 JSON，不要输出其他文本。
5. 无可记录信息时返回空数组。

输出 JSON 格式：
{
  "memory": {
    "items": [
      {
        "text": "简洁客观的记忆陈述句",
        "importance": 1-10 的整数,
        "tags": ["标签1", "标签2"]
      }
    ]
  }
}
`;
}
