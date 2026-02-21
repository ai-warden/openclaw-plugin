/**
 * AI-Warden OpenClaw Plugin
 * Multi-layer security defense for AI agents
 * 
 * @see https://prompt-shield.se/openclaw
 */

import aiWardenPlugin from './plugin.js';
import type { SecurityConfig } from './types.js';

export default {
  id: 'ai-warden',
  name: 'AI-Warden Security',
  version: '1.0.0',
  description: 'Multi-layer security validation for AI agents - Blocks prompt injection, command injection, and data leakage',
  author: 'AI-Warden Security',
  homepage: 'https://prompt-shield.se/openclaw',
  
  // Configuration schema
  configSchema: {
    type: 'object',
    required: ['layers'],
    properties: {
      apiKey: {
        type: 'string',
        description: 'AI-Warden API key (optional - auto-detects from env or ~/.aiwardenrc)',
        sensitive: true
      },
      endpoint: {
        type: 'string',
        description: 'API endpoint (default: https://api.prompt-shield.se/v1)',
        default: 'https://api.prompt-shield.se/v1'
      },
      timeout: {
        type: 'number',
        description: 'Request timeout in milliseconds',
        default: 5000,
        minimum: 100,
        maximum: 30000
      },
      verbose: {
        type: 'boolean',
        description: 'Enable verbose logging',
        default: false
      },
      layers: {
        type: 'object',
        required: ['content', 'channel', 'toolArgs', 'subagents', 'output'],
        properties: {
          content: {
            type: 'boolean',
            description: 'Layer 0: Content validation (web_fetch, browser, read) - CRITICAL',
            default: true
          },
          channel: {
            type: 'boolean',
            description: 'Layer 1: Channel input validation',
            default: true
          },
          preLlm: {
            type: 'boolean',
            description: 'Layer 2: Pre-LLM context analysis (detects concatenated attacks)',
            default: false
          },
          toolArgs: {
            type: 'boolean',
            description: 'Layer 3: Tool argument sanitization',
            default: true
          },
          subagents: {
            type: 'boolean',
            description: 'Layer 4: Subagent task validation',
            default: true
          },
          output: {
            type: 'boolean',
            description: 'Layer 5: Output filtering (PII, credentials)',
            default: true
          }
        }
      },
      policy: {
        type: 'object',
        properties: {
          blockThreshold: {
            type: 'number',
            description: 'Score above which content is blocked (0-1000)',
            default: 200,
            minimum: 0,
            maximum: 1000
          },
          warnThreshold: {
            type: 'number',
            description: 'Score above which warnings are logged (0-1000)',
            default: 100,
            minimum: 0,
            maximum: 1000
          },
          cacheSeconds: {
            type: 'number',
            description: 'Cache TTL in seconds',
            default: 300,
            minimum: 0,
            maximum: 3600
          }
        }
      },
      content: {
        type: 'object',
        properties: {
          scanUrls: {
            type: 'boolean',
            description: 'Scan URLs fetched via web_fetch',
            default: true
          },
          scanFiles: {
            type: 'boolean',
            description: 'Scan files read via read tool',
            default: true
          },
          maxContentSize: {
            type: 'number',
            description: 'Maximum content size to scan (bytes)',
            default: 100000
          }
        }
      },
      output: {
        type: 'object',
        properties: {
          redactEmails: {
            type: 'boolean',
            description: 'Redact email addresses from output',
            default: true
          },
          redactApiKeys: {
            type: 'boolean',
            description: 'Redact API keys from output',
            default: true
          },
          redactPaths: {
            type: 'boolean',
            description: 'Redact file paths from output',
            default: false
          }
        }
      }
    }
  },
  
  // Plugin registration function
  register: aiWardenPlugin
};

// Export types for TypeScript users
export type { SecurityConfig, ScanResult, ValidationResult, FilterResult } from './types.js';
export { SecurityValidator } from './validator.js';
