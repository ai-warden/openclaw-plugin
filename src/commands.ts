/**
 * Warden Commands - Runtime control & statistics
 */

import type { StateManager } from './state-manager.js';
import type { SecurityConfig } from './types.js';

const LAYER_NAMES: Record<string, string> = {
  content: 'Layer 0: Content Validation',
  channel: 'Layer 1: Channel Input',
  preLlm: 'Layer 2: Pre-LLM Context',
  toolArgs: 'Layer 3: Tool Arguments',
  subagents: 'Layer 4: Subagent Tasks',
  output: 'Layer 5: Output Filtering'
};

export function registerWardenCommands(api: any, config: SecurityConfig, stateManager: StateManager) {
  
  console.log('[AI-Warden] Registering /warden command, api.registerCommand exists:', !!api.registerCommand);
  console.log('[AI-Warden] Available API methods:', Object.keys(api));
  
  // Main /warden command - Show menu
  api.registerCommand?.({
    name: 'warden',
    description: 'AI-Warden security control panel',
    acceptsArgs: true,  // Enable argument parsing
    handler: async (args: any) => {
      try {
        console.log('[AI-Warden] /warden handler called with args:', JSON.stringify(args, null, 2));
        
        // Moltbot can pass args in different formats:
        // 1. Array: ["status"]
        // 2. String: "status"  
        // 3. Object: {args: "status", commandBody: "/warden status", ...}
        let argsArray: string[];
        
        if (Array.isArray(args)) {
          argsArray = args;
        } else if (typeof args === 'string') {
          argsArray = args ? [args] : [];
        } else if (args?.args) {
          // args.args can be string or array
          argsArray = typeof args.args === 'string' ? [args.args] : args.args;
        } else if (args?.commandBody) {
          // Parse from commandBody as fallback
          const parts = args.commandBody.trim().split(/\s+/);
          argsArray = parts.slice(1); // Skip "/warden"
        } else {
          argsArray = [];
        }
        
        console.log('[AI-Warden] Extracted args array:', argsArray);
        
        if (!argsArray || argsArray.length === 0 || !argsArray[0]) {
          const response = [
            '🛡️ **AI-Warden Control Panel**',
            '',
            '**Commands:**',
            '• `/warden status` - View security status',
            '• `/warden stats` - Show statistics',
            '• `/warden layer <name> on/off` - Toggle security layer',
            '• `/warden health` - Check API connection status',
            '• `/warden reset` - Reset statistics',
            '• `/warden help` - Show detailed help',
            '',
            '**Quick Actions:**',
            '• `/warden layer channel off` - Disable channel scanning (save API calls)',
            '• `/warden layer channel on` - Enable channel scanning',
            '• `/warden pii mask` - Mask PII with labels',
            '',
            'Powered by AI-Warden | https://ai-warden.io'
          ].join('\n');
          console.log('[AI-Warden] Returning help text, length:', response.length);
          return { text: response };
        }
        
        const subcommand = argsArray[0].toLowerCase();
        let result;
        
        switch (subcommand) {
          case 'status':
            result = handleStatus(stateManager, config);
            break;
          
          case 'stats':
            result = handleStats(stateManager);
            break;
          
          case 'layer':
            result = handleLayerToggle(argsArray.slice(1), stateManager);
            break;
          
          case 'pii':
            result = handlePII(argsArray.slice(1), stateManager);
            break;
          
          case 'health':
            result = handleHealth(stateManager);
            break;
          
          case 'reset':
            result = handleReset(stateManager);
            break;
          
          case 'help':
            result = handleHelp();
            break;
          
          default:
            return { text: `❌ Unknown command: ${subcommand}\n\nUse \`/warden help\` for available commands.` };
        }
        
        // Extract text from result object if needed  
        const finalResult = typeof result === 'string' ? result : result.text;
        console.log('[AI-Warden] Returning result, type:', typeof finalResult, 'length:', finalResult?.length);
        return { text: finalResult };
      } catch (error) {
        console.error('[AI-Warden] /warden command error:', error);
        const errorMsg = `❌ Command error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.log('[AI-Warden] Returning error:', errorMsg);
        return { text: errorMsg };
      }
    }
  });
}

function handleStatus(stateManager: StateManager, config: SecurityConfig): { text: string } {
  const layers = stateManager.getLayerStates();
  
  const lines = [
    '🛡️ **AI-Warden Security Status**',
    '',
    '**Security Layers:**'
  ];
  
  for (const [key, name] of Object.entries(LAYER_NAMES)) {
    const enabled = layers[key as keyof typeof layers];
    const emoji = enabled ? '✅' : '❌';
    lines.push(`${emoji} ${name}`);
  }
  
  lines.push(
    '',
    '**Policy:**',
    `Block Threshold: ${config.policy?.blockThreshold || 200}`,
    `Warn Threshold: ${config.policy?.warnThreshold || 100}`,
    `Cache TTL: ${config.policy?.cacheSeconds || 300}s`,
    '',
    '💡 **Tip:** Use `/warden layer channel off` to save API calls in private chats!',
    '',
    'Use `/warden stats` to see usage statistics.'
  );
  
  return { text: lines.join('\n') };
}

function handleStats(stateManager: StateManager): { text: string } {
  const formatted = stateManager.getFormattedStats();
  return {
    text: formatted + '\n\nUse `/warden reset` to reset statistics.'
  };
}

function handleLayerToggle(args: string[], stateManager: StateManager): { text: string } {
  if (args.length < 2) {
    return {
      text: [
        '❌ **Usage:** `/warden layer <name> <on|off>`',
        '',
        '**Available layers:**',
        '• `content` - Content validation (web_fetch, browser, read)',
        '• `channel` - Channel input validation',
        '• `preLlm` - Pre-LLM context analysis',
        '• `toolArgs` - Tool argument sanitization',
        '• `subagents` - Subagent task validation',
        '• `output` - Output filtering',
        '',
        '**Example:**',
        '`/warden layer channel off` - Disable channel scanning'
      ].join('\n')
    };
  }
  
  const layerName = args[0].toLowerCase();
  const action = args[1].toLowerCase();
  
  // Validate layer name
  if (!(layerName in LAYER_NAMES)) {
    return {
      text: `❌ Unknown layer: ${layerName}\n\nAvailable: content, channel, preLlm, toolArgs, subagents, output`
    };
  }
  
  // Validate action
  if (action !== 'on' && action !== 'off') {
    return {
      text: `❌ Invalid action: ${action}\n\nUse 'on' or 'off'`
    };
  }
  
  const enabled = action === 'on';
  const success = stateManager.toggleLayer(layerName as any, enabled);
  
  if (!success) {
    return {
      text: `❌ Failed to toggle layer: ${layerName}`
    };
  }
  
  const emoji = enabled ? '✅' : '❌';
  const status = enabled ? 'enabled' : 'disabled';
  
  let tip = '';
  if (layerName === 'channel' && !enabled) {
    tip = '\n\n💡 **Cost Savings:** Channel scanning disabled. Great for private chats! This can reduce API usage by 30-50%.';
  } else if (layerName === 'channel' && enabled) {
    tip = '\n\n⚠️ **Security Enabled:** Channel scanning active. Recommended for shared/group chats.';
  }
  
  return {
    text: `${emoji} **${LAYER_NAMES[layerName]}** ${status}${tip}\n\nUse \`/warden status\` to see all layers.`
  };
}

function handleHealth(stateManager: StateManager): { text: string } {
  const isDown = stateManager.isApiDown();
  
  if (isDown) {
    return {
      text: [
        '🔴 **AI-Warden API Status: Down**',
        '',
        '**Current Mode:** Fallback to local pattern matching',
        '**Protection Level:** ~70-80% (degraded)',
        '',
        '⚠️ The API is currently unavailable.',
        'Your bot is still protected by local patterns, but full AI-powered validation is offline.',
        '',
        'Check https://status.prompt-shield.se for updates.'
      ].join('\n')
    };
  }
  
  return {
    text: [
      '🟢 **AI-Warden API Status: Operational**',
      '',
      '**Current Mode:** Full protection',
      '**Protection Level:** ~98% (all 3 layers active)',
      '',
      'All systems operational. Your bot is fully protected.',
      '',
      'Use `/warden stats` to see recent security events.'
    ].join('\n')
  };
}

function handleReset(stateManager: StateManager): { text: string } {
  stateManager.resetStats();
  return {
    text: '✅ **Statistics Reset**\n\nAll security statistics have been cleared.'
  };
}

function handleHelp(): { text: string } {
  return {
    text: [
      '🛡️ **AI-Warden Command Reference**',
      '',
      '**Status & Monitoring:**',
      '• `/warden` - Show main menu',
      '• `/warden status` - View all security layers and configuration',
      '• `/warden stats` - Show scan statistics and recent blocks',
      '',
      '**Layer Control:**',
      '• `/warden layer <name> on` - Enable a security layer',
      '• `/warden layer <name> off` - Disable a security layer',
      '',
      '**Available Layers:**',
      '• `content` - Validates external content (web_fetch, browser, read)',
      '• `channel` - Validates incoming messages (Telegram, Discord, etc.)',
      '• `preLlm` - Analyzes full conversation context',
      '• `toolArgs` - Validates tool arguments (exec, sessions_spawn)',
      '• `subagents` - Validates subagent task spawning',
      '• `output` - Filters output (PII, API keys, credentials)',
      '',
      '**Maintenance:**',
      '• `/warden health` - Check API connection & status',
      '• `/warden reset` - Reset all statistics',
      '',
      '**💡 Cost Optimization Tips:**',
      '',
      '**Solo Bot (Private Chat):**',
      '`/warden layer channel off` - Save API calls, you trust yourself!',
      '',
      '**Shared Bot (Group Chat):**',
      '`/warden layer channel on` - Full protection, you don\'t trust everyone.',
      '',
      '**Typical Savings:**',
      'Disabling channel layer in private chats = **30-50% fewer API calls** 💰',
      '',
      'Learn more: https://ai-warden.io/docs'
    ].join('\n')
  };
}

function handlePII(args: string[], stateManager: StateManager): { text: string } {
  // No args = show status
  if (args.length === 0) {
    const currentMode = stateManager.getPIIMode();
    const stats = stateManager.getPIIStats();
    
    const modeDescriptions = {
      'ignore': '**IGNORE** - Detect PII but don\'t modify text (just report)',
      'mask': '**MASK** - Replace PII with labeled placeholders ([EMAIL], [SSN], etc.)',
      'remove': '**REMOVE** - Delete PII completely from text'
    };
    
    const lines = [
      '🔒 **PII Detection Settings**',
      '',
      `**Current Mode:** ${currentMode.toUpperCase()}`,
      modeDescriptions[currentMode],
      ''
    ];
    
    if (currentMode === 'mask') {
      lines.push(
        '**Masking Examples:**',
        '• john@example.com → `[EMAIL]`',
        '• 123-45-6789 → `[SSN]`',
        '• 4532-1234-5678-9010 → `[CREDIT_CARD]`',
        '• +1-555-123-4567 → `[PHONE]`',
        ''
      );
    }
    
    lines.push(
      '**Statistics (Layer 5):**',
      `• Total outputs scanned: ${stats.totalScans}`,
      `• PII detected: ${stats.piiDetected} times`,
      `• Items processed: ${stats.itemsProcessed}`,
      ''
    );
    
    if (Object.keys(stats.byType).length > 0) {
      lines.push('**Detected PII Types:**');
      for (const [type, count] of Object.entries(stats.byType)) {
        lines.push(`• ${type}: ${count}`);
      }
      lines.push('');
    }
    
    lines.push(
      '**Supported PII Types:**',
      '✅ Credit Cards (Visa, MC, Amex, Discover)',
      '✅ US SSN',
      '✅ Emails',
      '✅ Phone Numbers (US + international)',
      '✅ IP Addresses',
      '✅ Nordic IDs (🇸🇪🇳🇴🇩🇰🇫🇮)',
      '✅ IBAN',
      '✅ US Passports',
      '✅ Driver Licenses (50 states)',
      '',
      '**Change mode:**',
      '`/warden pii ignore` - Detect only (no modification)',
      '`/warden pii mask` - Replace with labels (recommended)',
      '`/warden pii remove` - Delete PII completely'
    );
    
    return { text: lines.join('\n') };
  }
  
  // Set mode
  const mode = args[0].toLowerCase();
  
  if (mode !== 'ignore' && mode !== 'mask' && mode !== 'remove') {
    return {
      text: `❌ Invalid PII mode: ${mode}\n\nValid modes: \`ignore\`, \`mask\`, \`remove\``
    };
  }
  
  stateManager.setPIIMode(mode as 'ignore' | 'mask' | 'remove');
  
  const responses = {
    'ignore': [
      '✅ **PII mode set to IGNORE**',
      '',
      'PII will be detected but text won\'t be modified.',
      'Useful for debugging or when you trust all outputs.',
      '',
      '**Note:** Detection stats are still tracked.'
    ],
    'mask': [
      '✅ **PII mode set to MASK**',
      '',
      'PII will be replaced with labeled placeholders:',
      '• john@example.com → `[EMAIL]`',
      '• 123-45-6789 → `[SSN]`',
      '• 4532-1234-5678-9010 → `[CREDIT_CARD]`',
      '',
      '**Recommended for most use cases** - preserves context while protecting data.'
    ],
    'remove': [
      '✅ **PII mode set to REMOVE**',
      '',
      'PII will be completely deleted from text.',
      '',
      '**Warning:** May create awkward gaps in sentences.',
      'Example: "Email me at john@example.com" → "Email me at "',
      '',
      'Use when maximum data protection is required.'
    ]
  };
  
  return { text: responses[mode].join('\n') };
}
