import React, { useEffect, useRef } from 'react';
import { ChatMessage } from '../types';

interface TerminalOutputProps {
  messages: ChatMessage[];
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({ messages }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex-1 min-h-0 bg-black/50 border border-gray-800 rounded-lg p-4 font-mono text-sm overflow-y-auto h-full shadow-inner">
      {messages.length === 0 && (
        <div className="text-gray-500 italic text-center mt-10">No messages yet. Waiting for connection...</div>
      )}
      {messages.map((msg, idx) => (
        <div key={idx} className="mb-1 break-words">
          <span className="text-gray-500 select-none">[{formatTime(msg.time)}]</span>{' '}
          {msg.type === 'info' && (
            <span className="text-cyan-400">Wait, {msg.text}</span>
          )}
          {msg.type === 'warning' && (
            <span className="text-yellow-500">Warning: {msg.text}</span>
          )}
          {msg.type === 'message' && (
            <>
              <span className="font-bold text-emerald-400">
                 {msg.trip ? <span className="text-xs text-gray-600 mr-1" title={msg.trip}>◆</span> : null}
                 {msg.nick}
              </span>
              <span className="text-gray-400">: </span>
              <span className="text-gray-200">{msg.text}</span>
            </>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};
