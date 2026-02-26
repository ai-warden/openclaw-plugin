# CRITICAL FIX: message_received Cannot Block Messages

## ROOT CAUSE DISCOVERED

After analyzing Moltbot's source code (`/moltbot-src/dist/plugins/hooks.js`):

### message_received Hook Implementation:
```javascript
async function runMessageReceived(event, ctx) {
    return runVoidHook("message_received", event, ctx);
}
```

**`runVoidHook` = FIRE-AND-FORGET**:
- Runs in parallel
- Return values are IGNORED
- Errors are CAUGHT and logged (not propagated)

### In dispatch-from-config.js:
```javascript
void hookRunner
    .runMessageReceived({...})
    .catch((err) => {
        logVerbose(`message_received hook failed: ${String(err)}`);
    });
```

**Result**: The hook is explicitly called with `void` and `.catch()`:
- ❌ Cannot return {block: true}
- ❌ Cannot throw errors to block
- ✅ Can only LOG/OBSERVE messages

## THE SOLUTION

Use `before_agent_start` hook instead, which:
1. **CAN block** by throwing errors
2. **Runs before LLM** processes the message
3. **Is sequential** (not parallel)

### Implementation:
```typescript
api.on('before_agent_start', async (event, ctx) => {
  // Extract latest user message
  const messages = event.messages || [];
  const lastMessage = messages.filter(m => m.role === 'user').pop();
  
  // Scan content
  const result = await validator.scanContent({
    content: lastMessage.content,
    source: 'channel'
  });
  
  // BLOCK by throwing
  if (!result.safe) {
    throw new Error('⛔️ Message blocked by security policy');
  }
});
```

## LAYERS MAPPING

| Original Layer | Hook to Use | Can Block? | Notes |
|---|---|---|---|
| Layer 1: Channel | `before_agent_start` | ✅ YES | Scan latest user message |
| Layer 2: Pre-LLM | `before_agent_start` | ✅ YES | Scan full conversation context |
| Layer 3: Tool Args | `before_tool_call` | ✅ YES | Scan tool parameters |
| Layer 5: Output | `message_sending` | ✅ YES | Filter/redact output |

**Note**: Layers 1 & 2 should be MERGED into one `before_agent_start` hook that checks both.

## FILES TO UPDATE

1. **src/plugin.ts**: Replace message_received with before_agent_start
2. **README.md**: Update documentation
3. **INSTALL.md**: Update hook examples

## NEXT STEPS

1. Move Layer 1 logic to before_agent_start
2. Keep Layer 2 logic in before_agent_start
3. Make them check different things:
   - **Layer 1**: Scan ONLY the latest user message (fast)
   - **Layer 2**: Scan FULL conversation history (thorough, enabled separately)
4. Rebuild plugin
5. Test with "Ignore all previous instructions"
