/**
 * ===========
 * Module: App
 * Layer: Frontend Page
 * Responsibility:
 * - 装配配置、socket、profile、reply 三条主链路
 * - 连接 SettingsPanel 与 TerminalOutput
 * ===========
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SettingsPanel } from './components/SettingsPanel';
import { TerminalOutput } from './components/TerminalOutput';
import { BotConfig, ModelProviderOption, ServerBootstrapResponse } from './types';
import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { FALLBACK_BOOTSTRAP, getProviderOption, toBotConfig } from './config/botConfig';
import { useProfileSync } from './hooks/useProfileSync';
import { useBotReply } from './hooks/useBotReply';
import { useHackChatSocket } from './hooks/useHackChatSocket';

/**
 * [Function]
 * Name: App
 * Purpose: 应用主组件，负责初始化配置并拼装各功能 hook。
 * Output: React 页面结构
 */
const App: React.FC = () => {
  const [providers, setProviders] = useState<ModelProviderOption[]>(FALLBACK_BOOTSTRAP.providers);
  const [config, setConfig] = useState<BotConfig>(toBotConfig(FALLBACK_BOOTSTRAP.defaults));
  const configRef = useRef<BotConfig>(toBotConfig(FALLBACK_BOOTSTRAP.defaults));
  const providersRef = useRef<ModelProviderOption[]>(FALLBACK_BOOTSTRAP.providers);
  configRef.current = config;
  providersRef.current = providers;

  useEffect(() => {
    /**
     * [Function]
     * Name: initBootstrapConfig
     * Purpose: 启动时从后端拉取 bootstrap 配置，并合并到前端运行态配置。
     */
    const initBootstrapConfig = async () => {
      try {
        const response = await fetch('/api/config/bootstrap');
        if (!response.ok) return;
        const data = (await response.json()) as ServerBootstrapResponse;
        const bootstrap = data?.bootstrap;
        if (!bootstrap) return;

        if (Array.isArray(bootstrap.providers) && bootstrap.providers.length > 0) {
          setProviders(bootstrap.providers);
        }

        setConfig((prev) => {
          const next = { ...prev };
          const defaults = bootstrap.defaults;

          if (
            typeof defaults.channel === 'string' &&
            defaults.channel.trim().length > 0 &&
            prev.channel === FALLBACK_BOOTSTRAP.defaults.channel
          ) {
            next.channel = defaults.channel.trim();
          }

          if (
            typeof defaults.botName === 'string' &&
            defaults.botName.trim().length > 0 &&
            prev.botName === FALLBACK_BOOTSTRAP.defaults.botName
          ) {
            next.botName = defaults.botName.trim();
          }

          if (
            typeof defaults.personality === 'string' &&
            defaults.personality.trim().length > 0 &&
            prev.personality.trim().length === 0
          ) {
            next.personality = defaults.personality.trim();
          }

          if (
            typeof defaults.provider === 'string' &&
            prev.provider === FALLBACK_BOOTSTRAP.defaults.provider
          ) {
            next.provider = defaults.provider;
            if (!getProviderOption(bootstrap.providers, defaults.provider)) {
              console.warn(`Server default provider is not in frontend provider list yet: ${defaults.provider}`);
            }
          }

          if (
            (defaults.replyMode === 'mention' || defaults.replyMode === 'all') &&
            prev.replyMode === FALLBACK_BOOTSTRAP.defaults.replyMode
          ) {
            next.replyMode = defaults.replyMode;
          }

          return next;
        });
      } catch (error) {
        console.error('Failed to load bootstrap config from server:', error);
      }
    };

    void initBootstrapConfig();
  }, []);

  const getChannel = useMemo(() => () => configRef.current.channel, []);
  const getConfig = useMemo(() => () => configRef.current, []);
  const getProviders = useMemo(() => () => providersRef.current, []);

  const { handleIncomingMessage, fetchProfileContextByTrip } = useProfileSync({ getChannel });
  const { generateReply } = useBotReply({ getConfig, getProviders, fetchProfileContextByTrip });

  const { status, messages, onlineUsers, connect, disconnect } = useHackChatSocket({
    config,
    onIncomingMessage: handleIncomingMessage,
    onReplyRequested: generateReply,
  });

  return (
    <div className="flex h-full flex-col md:flex-row bg-gray-950 text-gray-200">
      <SettingsPanel
        config={config}
        providers={providers}
        status={status}
        onConfigChange={setConfig}
        onConnect={connect}
        onDisconnect={disconnect}
      />

      <div className="flex-1 flex flex-col h-full min-w-0 min-h-0">
        <header className="bg-gray-900 border-b border-gray-800 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-emerald-500 shadow-emerald-500/50 shadow-lg' : status === 'connecting' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
            <div>
              <h2 className="font-bold text-white flex items-center gap-2">
                #{config.channel}
              </h2>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                {status === 'connected' ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs text-gray-500">
            <div className="flex -space-x-2">
              {onlineUsers.slice(0, 5).map((user, i) => (
                <div key={user + i} className="w-6 h-6 rounded-full bg-gray-700 border border-gray-900 flex items-center justify-center text-[10px] text-white overflow-hidden" title={user}>
                  {user.charAt(0).toUpperCase()}
                </div>
              ))}
              {onlineUsers.length > 5 && (
                <div className="w-6 h-6 rounded-full bg-gray-800 border border-gray-900 flex items-center justify-center text-[10px] text-white">
                  +{onlineUsers.length - 5}
                </div>
              )}
            </div>
            <span>{onlineUsers.length} Online</span>
          </div>
        </header>

        <main className="flex-1 min-h-0 p-4 overflow-hidden flex flex-col bg-gray-950 relative">
          <TerminalOutput messages={messages} />

          {status === 'error' && (
            <div className="absolute top-4 right-4 bg-red-900/90 text-white px-4 py-3 rounded shadow-lg flex items-center gap-3 border border-red-700 animate-bounce">
              <AlertTriangle className="w-5 h-5" />
              <div>
                <p className="font-bold text-sm">Connection Error</p>
                <p className="text-xs">Check console or try again.</p>
              </div>
            </div>
          )}
        </main>

        <footer className="bg-gray-900 border-t border-gray-800 p-3 text-xs text-gray-500 text-center">
          Running as {config.botName} via {getProviderOption(providers, config.provider)?.label || config.provider}. Responses limited to 5-50 words.
        </footer>
      </div>
    </div>
  );
};

export default App;
