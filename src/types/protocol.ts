// hack.chat protocol types
export interface HCIncomingMessage {
  cmd: string;
  nick?: string;
  text?: string;
  trip?: string;
  time?: number;
  warn?: string;
  nicks?: string[]; // List of users in the channel (onlineSet)
}

export interface HCOutgoingMessage {
  cmd: string;
  channel?: string;
  nick?: string;
  pass?: string;
  text?: string;
}

