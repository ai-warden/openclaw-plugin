/**
 * AI-Warden Security Plugin for Moltbot/OpenClaw
 * 
 * Multi-layer security validation for AI agents
 * - Content filtering
 * - Channel validation  
 * - Tool argument scanning
 * - Sub-agent spawn validation
 * - Output filtering
 * 
 * @see https://github.com/ai-warden/openclaw-plugin
 */

import aiWardenPlugin from './src/plugin.js';

/**
 * Plugin export for Moltbot discovery system
 * Required fields: id, name, configSchema, register
 */
export default {
  id: 'ai-warden',
  name: 'AI-Warden Security',
  description: 'Multi-layer security validation for AI agents',
  version: '1.0.1',
  
  /**
   * Configuration schema for plugin settings
   * Exposed in Moltbot config.yaml under plugins.ai-warden
   */
  configSchema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: 'Enable AI-Warden security plugin',
        default: true
      },
      apiKey: {
        type: 'string',
        description: 'AI-Warden API key (optional - auto-detects from env AI_WARDEN_API_KEY)',
        default: ''
      },
      layers: {
        type: 'object',
        description: 'Security layer configuration - toggle individual layers on/off',
        properties: {
          content: {
            type: 'boolean',
            description: 'Content filtering layer (incoming messages)',
            default: true
          },
          channel: {
            type: 'boolean',
            description: 'Channel validation layer',
            default: true
          },
          preLlm: {
            type: 'boolean',
            description: 'Pre-LLM validation layer (before model invocation)',
            default: false
          },
          toolArgs: {
            type: 'boolean',
            description: 'Tool argument validation layer',
            default: true
          },
          subagents: {
            type: 'boolean',
            description: 'Sub-agent spawn validation layer',
            default: true
          },
          output: {
            type: 'boolean',
            description: 'Output filtering layer (outgoing messages)',
            default: true
          }
        },
        default: {
          content: true,
          channel: true,
          preLlm: false,
          toolArgs: true,
          subagents: true,
          output: true
        }
      },
      policy: {
        type: 'object',
        description: 'Security policy thresholds and behavior',
        properties: {
          blockThreshold: {
            type: 'number',
            description: 'Block requests with risk score above this value (0-1000)',
            default: 200,
            minimum: 0,
            maximum: 1000
          },
          warnThreshold: {
            type: 'number',
            description: 'Warn on requests with risk score above this value (0-1000)',
            default: 100,
            minimum: 0,
            maximum: 1000
          },
          failOpen: {
            type: 'boolean',
            description: 'Allow requests if AI-Warden API is unreachable (fail-open vs fail-closed)',
            default: true
          }
        },
        default: {
          blockThreshold: 200,
          warnThreshold: 100,
          failOpen: true
        }
      },
      enableStats: {
        type: 'boolean',
        description: 'Enable statistics tracking',
        default: true
      }
    },
    default: {
      enabled: true,
      layers: {
        content: true,
        channel: true,
        preLlm: false,
        toolArgs: true,
        subagents: true,
        output: true
      },
      policy: {
        blockThreshold: 200,
        warnThreshold: 100,
        failOpen: true
      },
      enableStats: true
    }
  },
  
  /**
   * Plugin registration function
   * Called by Moltbot when plugin is loaded
   * 
   * @param api - Moltbot plugin API
   */
  register: aiWardenPlugin
};
