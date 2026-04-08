## OSRS Community Discord Bot

This is a Discord bot tailored for a large Old School Runescape community. It provides:

- **New member verification**: Users click a button, enter their OSRS username, and automatically receive a role to access the rest of the server.
- **Bossing / LFG events**: Members can create organized LFG posts for bosses/raids with interactive buttons for signups.
- **Basic community management**: Slash commands, logging channel for verifications, and a structure you can easily extend with moderation or utility commands.

**Full command & feature reference:** see [COMMANDS.md](./COMMANDS.md).

### 1. Prerequisites

- **Node.js** 18+ installed.
- A **Discord application & bot** created in the [Discord Developer Portal](https://discord.com/developers).
- In the bot settings:
  - Enable **Privileged Gateway Intents** for **Server Members Intent**.
  - Add the bot to your server with at least `applications.commands` and `bot` scopes and appropriate permissions (Manage Roles if you want it to assign the verified role).

### 2. Environment variables

You already have a `.env` file. Make sure it has the following keys (values filled with your own):

```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id
GUILD_ID=your_main_guild_id
DEFAULT_PREFIX=!
DATA_DIR=./data
```

> Do **not** commit your `.env` file to git or share your bot token.

### 3. Install dependencies

From the project root:

```bash
npm install
```

### 4. Register slash commands

Each time you add or change slash commands, run:

```bash
npm run deploy-commands
```

This registers the commands (like `/setup-verify` and `/lfg`) in the guild specified by `GUILD_ID`.

**Discord → Server Settings → Integrations → your bot → Commands:** you can add **role** and **channel** overrides on top of each command’s default permissions (`setDefaultMemberPermissions` in the code).

- **Channel rules:** “Only in `#lfg`” usually means you must **disable** the command on **every other channel** (or parent category) with the red **X**, not only enable `#lfg`. Channels with no override keep the default (often still allowed).
- **Who it affects:** members with **Administrator** may still see or use commands in more places; test with a normal account.
- **DMs:** redeploy sets `dm_permission: false` on all slash commands so permissions stay **guild-only** and match what you configure in the server.

Re-run `npm run deploy-commands` after pulling updates so registration stays in sync.

`/birthday` uses one command for every subcommand (Discord does not split them in Integrations). `/birthday list` is visible to the same people who can use `/birthday` in that channel; use channel overrides if `list` should only be run in staff channels.

### 5. Run the bot

```bash
npm start
```

The bot should log in and print its tag in the console.

### 5b. Staff dashboard (HTTP)

The bot serves a small **staff dashboard** page from the same process (no extra npm packages).

- Default URL: **`http://127.0.0.1:3847/`** (only your PC unless you change the bind address).
- Set **`DASHBOARD_PORT=0`** in `.env` to turn it off.
- Optional: **`DASHBOARD_HOST=0.0.0.0`** to listen on all interfaces (use with a reverse proxy / firewall in production).
- **`GET /health`** returns JSON `{ ok, botReady, tag }` (for uptime checks).
- Dashboard UI supports **Discord OAuth login** and can be locked to a single Discord user ID (owner-only).

Configure owner-only OAuth in `.env`:

```env
DASHBOARD_DISCORD_CLIENT_ID=your_discord_app_client_id
DASHBOARD_DISCORD_CLIENT_SECRET=your_discord_app_client_secret
DASHBOARD_DISCORD_REDIRECT_URI=https://your-dashboard-host/auth/discord/callback
DASHBOARD_OWNER_DISCORD_ID=your_discord_user_id
DASHBOARD_SESSION_SECRET=long_random_secret
```

Notes:
- In Discord Developer Portal, add your callback URL to **OAuth2 → Redirects**.
- The callback path must match exactly: **`/auth/discord/callback`**.
- If these vars are not set, the dashboard still runs in basic mode without OAuth lock.

To show a **“Bot dashboard”** link in the Terpinheimer site navbar, set on the **website** server:

```env
BOT_DASHBOARD_URL=http://127.0.0.1:3847/
```

(Use your public URL if the dashboard is exposed behind HTTPS.)

### 6. Configure verification

1. In your server, decide:
   - Which **channel** should host the verification button (e.g. `#verify-here`).
   - Which **role** is the "verified" role that unlocks the rest of the server.
   - (Optional) Which **log channel** should receive verification logs.
2. Use the slash command:

```text
/setup-verify channel:#verify-here role:@Verified log_channel:#mod-logs
```

The bot will:

- Post a verification message with a **Verify** button in the given channel.
- Save that channel, role, and optional log channel in `data/config.json`.

#### New member flow

- New members open the verification channel (where `/setup-verify` posted the **Verify** button). The bot does **not** send a per-join welcome ping there.
- They click **Verify**, a modal pops up asking for their **OSRS username**.
- On submit:
  - Their OSRS username is stored in `data/verifications.json`.
  - Staff review in the log channel; on approval they get **Member** (and optional extra role).
  - A log line is sent to the log channel (if configured).

### 7. Using the LFG / bossing feature

Anyone with permission to send messages can create an LFG post with:

```text
/lfg boss:<pick from list> time:"Tonight 8pm EST" max:5 requirements:"Trident, 90+ magic"
```

Options:

- **boss**: Predefined list (CoX, ToB, ToA, Nex, etc.) plus an "Other" option.
- **time**: Free-form text, ISO date/time, a Discord timestamp (`<t:unix:F>`), or relative (`in 30m`). For clock times like `8pm`, either include a US zone suffix (`8pm CST`) or set the **`timezone`** option (IANA, e.g. US Central) so the post can show `<t:…>` — each person sees that moment in **their own** client timezone.
- **timezone** (optional): Used when the time text has no `CST` / `EST` / etc.
- **max** (optional): Maximum players for your group.

The bot will:

- Create an **embed** summarizing the event (boss, time, host, requirements).
- Add interactive buttons:
  - `✅ Going`
  - `🤔 Maybe`
  - `❌ Not going`
- Track signups in `data/lfgEvents.json` and update the embed fields as users press buttons.

This makes it easy for members to:

- See who is going and who is interested.
- Ping the group.
- Coordinate bossing runs and raids in an organized way.

### 8. Extending the bot

The bot is structured so you can easily add more commands:

- Add new command files under `src/commands/` following the pattern in `verify.js` and `lfg.js`.
- Re-run:

```bash
npm run deploy-commands
```

Some common additions you might want for a large community:

- **Moderation**: `/mute`, `/kick`, `/ban`, `/warn`, with logging to a mod channel.
- **Utility**: `/gearcheck`, `/kc`, `/price` proxies to OSRS APIs.
- **Events**: `/event create`, `/event list`, `/event notify` building on top of the LFG system.

### 9. Data files

By default, the bot stores data in the folder specified by `DATA_DIR` (default `./data`):

- `config.json`: Verification and log channel/role IDs.
- `verifications.json`: Mapping of Discord user IDs to OSRS usernames and verification timestamps.
- `lfgEvents.json`: Active LFG events with participants.

You can back these files up or reset them if you need to reconfigure the bot.

### 10. Local checkpoints (rollback snapshots)

If you want quick restore points without git, use the built-in checkpoint scripts:

```bash
npm run checkpoint:create -- "before-big-change"
npm run checkpoint:list
```

To restore a checkpoint:

```bash
npm run checkpoint:restore -- -Name "20260326-210500-before-big-change"
```

Or restore the latest:

```bash
npm run checkpoint:restore -- -Latest
```

Snapshots are stored in `.checkpoints/` and exclude `node_modules` and the checkpoint folder itself.

