# Runtime Wiring

`src/index.js` is the composition root. It wires modules in this order:

1. Build in-memory state + persistence wrappers from `stateStore`.
2. Create Discord client and load commands.
3. Register lifecycle hooks (`ready`, `SIGINT`, `SIGTERM`, `exit`).
4. Register schedulers (giveaways, birthdays, reminders, GE, WOM, LFG expiry).
5. Register interaction/message/voice handlers.
6. Login bot.

## Runtime Modules

- `loadCommands.js` — Loads slash commands from `src/commands`.
- `stateStore.js` — Loads/saves config + runtime json stores.
- `schedulers.js` — All interval-based jobs.
- `lifecycle.js` — Process + client lifecycle hooks.
- `interactionHandler.js` — Dispatcher for interaction domains.
- `interaction/chatInput.js` — Autocomplete + slash command dispatch.
- `interaction/buttons.js` — Button handlers (`verify`, `rolepanel`, `verifylog`, `lfg`, `giveaway`).
- `interaction/modals.js` — Modal handlers (`verify`, `giveaway:create`, `poll:create`, `events` pass-through).
- `messageHandler.js` — MessageCreate handling (stickies, AFK, prefix helpers).
- `voiceHandler.js` — VoiceStateUpdate cleanup for temp LFG channels.
