import React from 'react';
import { BotConfig, ConnectionStatus, ModelProviderOption } from '../types';
import { Settings, Play, Square, Cpu, Globe, Hash, User } from 'lucide-react';

interface SettingsPanelProps {
  config: BotConfig;
  providers: ModelProviderOption[];
  status: ConnectionStatus;
  onConfigChange: (newConfig: BotConfig) => void;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  config,
  providers,
  status,
  onConfigChange,
  onConnect,
  onDisconnect,
}) => {
  const handleChange = (field: keyof BotConfig, value: any) => {
    onConfigChange({ ...config, [field]: value });
  };

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  return (
    <div className="bg-gray-900 border-r border-gray-800 w-full md:w-80 flex flex-col h-full">
      <div className="p-6 border-b border-gray-800 flex items-center gap-2">
        <Cpu className="w-6 h-6 text-cyan-500" />
        <h1 className="text-xl font-bold text-white tracking-tight">HackChat<span className="text-cyan-500">.AI</span></h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        
        {/* Connection Settings */}
        <section className="space-y-4">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-3 h-3" /> Connection
          </h2>
          
          <div className="space-y-1">
            <label className="text-sm text-gray-400 block">Channel</label>
            <div className="relative">
               <Hash className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
               <input
                 type="text"
                 value={config.channel}
                 disabled={isConnected}
                 onChange={(e) => handleChange('channel', e.target.value)}
                 className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 pl-9 text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition-colors disabled:opacity-50"
                 placeholder="lounge"
               />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400 block">Bot Nickname</label>
            <div className="relative">
              <User className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
              <input
                type="text"
                value={config.botName}
                disabled={isConnected}
                onChange={(e) => handleChange('botName', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 pl-9 text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition-colors disabled:opacity-50"
                placeholder="GeminiBot"
              />
            </div>
          </div>

           <div className="space-y-1">
            <label className="text-sm text-gray-400 block">Password (Optional)</label>
             <input
                type="password"
                value={config.password || ''}
                disabled={isConnected}
                onChange={(e) => handleChange('password', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-cyan-500 outline-none transition-colors disabled:opacity-50"
                placeholder="For tripcode"
              />
          </div>
        </section>

        {/* AI Personality */}
        <section className="space-y-4">
           <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <Settings className="w-3 h-3" /> AI Configuration
          </h2>

          <div className="space-y-1">
            <label className="text-sm text-gray-400 block">Model Provider</label>
            <div className="grid grid-cols-2 gap-2">
              {providers.map((provider) => {
                const active = config.provider === provider.id;
                const colorClass = active
                  ? 'bg-blue-900/30 border-blue-500 text-blue-400'
                  : 'bg-gray-800 border-gray-700 text-gray-400';

                return (
                  <button
                    key={provider.id}
                    onClick={() => provider.enabled && handleChange('provider', provider.id)}
                    disabled={!provider.enabled}
                    className={`px-3 py-2 rounded text-sm border transition-all flex flex-col items-center justify-center gap-1 ${colorClass} ${provider.enabled ? 'hover:bg-gray-700' : 'opacity-50 cursor-not-allowed'}`}
                  >
                    <span className="font-bold">{provider.label}</span>
                    <span className="text-[10px] opacity-70">
                      {provider.enabled ? (provider.subtitle || '') : 'Disabled'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-sm text-gray-400 block">Personality / System Instruction</label>
            <textarea
              value={config.personality}
              onChange={(e) => handleChange('personality', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm h-48 resize-none focus:ring-1 focus:ring-cyan-500 outline-none transition-colors"
              placeholder="You are a cynical hacker bot..."
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm text-gray-400 block">Reply Mode</label>
            <div className="grid grid-cols-2 gap-2">
               <button
                 onClick={() => handleChange('replyMode', 'mention')}
                 className={`px-3 py-2 rounded text-sm border transition-all ${config.replyMode === 'mention' ? 'bg-cyan-900/30 border-cyan-500 text-cyan-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
               >
                 Mentions Only
               </button>
               <button
                 onClick={() => handleChange('replyMode', 'all')}
                 className={`px-3 py-2 rounded text-sm border transition-all ${config.replyMode === 'all' ? 'bg-red-900/30 border-red-500 text-red-400' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
               >
                 All Messages
               </button>
            </div>
          </div>
        </section>

      </div>

      <div className="p-6 border-t border-gray-800">
        {isConnected ? (
          <button
            onClick={onDisconnect}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white py-3 rounded-lg font-medium transition-colors"
          >
            <Square className="w-4 h-4 fill-current" /> Disconnect
          </button>
        ) : (
          <button
            onClick={onConnect}
            disabled={isConnecting}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-colors ${
              isConnecting 
                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-900/50'
            }`}
          >
            {isConnecting ? (
               <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            {isConnecting ? 'Connecting...' : 'Connect to Hack.chat'}
          </button>
        )}
      </div>
    </div>
  );
};
