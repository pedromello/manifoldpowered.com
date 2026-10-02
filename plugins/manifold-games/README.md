# Source overlay for the installed Manifold plugin

This is a prepared source change, **not an installed release or a complete new plugin**. It preserves the current plugin's name, owner, defaultPrompt (including its original type/value), branding, MCP URL/configuration and audience. Only the skill changes and the two existing manifest versions advance to `0.1.2`; unchanged MCP files and binary logo are intentionally omitted from this overlay and remain in the owned source.

The exact owned source and release guard are recorded in [the implementation checkpoint](../../docs/manifold-mcp/10-card-descoberta.md#fonte-do-plugin-instalado). Current source was inspected through Plugin Creator. Do not publish this directory as a replacement plugin or infer ownership/audience from its manifest. No update/upload action has been executed.

Before a separately authorized update: reread the current source/release, reconcile concurrent changes, compare effective configuration, package only this overlay at its original relative paths, and preserve unchanged files through the supported guarded update. A release save does not prove skill behavior or card rendering in ChatGPT; test them in the intended host afterward.

Manual behavior checks: broad discovery with no preferences; known tastes already supplied; a direct game question requiring no follow-up; small/empty review sample; contradictory filtered comments; missing media/player failure; PC already specified but requirements unavailable; MCP tool failure. These are host evaluation cases, not guarantees established by Jest fixtures.
