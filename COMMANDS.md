# Bot commands & features

This page lists **slash commands** and other **interactive flows** (buttons, modals) your bot exposes.

---

## Slash commands

### `/setup-verify`

**Who can use it:** members with **Manage Server**  
**Purpose:** Creates the verification setup for new members.

**Options:**

| Option | Required | Description |
|--------|----------|-------------|
| `channel` | Yes | Text channel where the **Verify** button message is posted. |
| `role` | Yes | Role granted after a moderator **accepts** a verification (see verification flow below). |
| `log_channel` | No | Channel where pending verifications appear for staff (**Accept** / **Deny**). |

**What it does:** Posts a message with a **Verify** button, and saves your choices to `data/config.json`.

---

### `/lookup`

**Who can use it:** anyone who can use slash commands (no special permission set on the command)  
**Purpose:** Look up an **Old School RuneScape** name on **Jagex hiscores** and check **Runewatch**.

**Options:**

| Option | Required | Description |
|--------|----------|-------------|
| `rsn` | Yes | RuneScape name (spaces allowed). |

**What it does:** Replies with an embed: total level, XP, overall rank, top skills, links to hiscores, and Runewatch status (green / red / amber depending on result and API reachability).

---

### `/lfg`

**Who can use it:** members who can **Send Messages** in the channel  
**Purpose:** Create a **looking-for-group** post for bossing / raids.

**Options:**

| Option | Required | Description |
|--------|----------|-------------|
| `boss` | Yes | Preset boss/activity (CoX, ToB, ToA, Nex, etc., or **Other**). |
| `time` | Yes | When the run is (free text, e.g. `"Tonight 9pm EST"`). |
| `max` | No | Maximum number of players. |

**What it does:**

- Posts an **embed** in the **current channel** (thumbnail for known bosses).
- Adds buttons: **Going**, **Maybe**, **Not going** (updates the embed).
- Adds **Create temp voice** — creates a **temporary voice channel** for the group; it is **deleted when empty**.

---

### `/giveaway`

**Who can use it:** members with **Manage Server**  
**Purpose:** Start a giveaway using a **modal** (popup form).

**Modal fields:**

| Field | Description |
|-------|-------------|
| Number of winners | How many winners to draw (clamped in code). |
| Name of Giveaway | Title shown on the giveaway embed. |
| End date & time | `YYYY-MM-DD HH:mm`, Unix time, or a Discord timestamp like `<t:…:F>`. |
| Description | Rules, prizes, how to enter, etc. |

**What it does:** Posts an embed with an **Enter** button; entries are stored; when the end time passes the bot announces winner(s) and removes the button.

---

### `/stick`

**Who can use it:** members with **Manage Messages**  
**Purpose:** Keep a **sticky** message at the **bottom** of a text channel (Discord has no real “pin to bottom”; the bot **reposts** the sticky after normal messages).

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `/stick set` | `content` (required), `channel` (optional, default: current channel). |
| `/stick clear` | `channel` (optional). Removes the sticky for that channel. |

**Data:** `data/stickies.json`

---

### `/kick`

**Who can use it:** members with **Kick Members**  
**Purpose:** Remove a member from the server.

**Options:** `user` (required), `reason` (optional).

---

### `/ban`

**Who can use it:** members with **Ban Members**  
**Purpose:** Ban a member.

**Options:** `user` (required), `days` (optional, 0–7 days of message delete), `reason` (optional).

---

### `/timeout`

**Who can use it:** members with **Moderate Members**  
**Purpose:** Discord **timeout** (temporary server mute).

**Options:** `user` (required), `minutes` (required, 1–4320), `reason` (optional).

---

### `/clear`

**Who can use it:** members with **Manage Messages**  
**Purpose:** Bulk-delete recent messages in the **current** channel.

**Options:** `amount` (required, 1–100).

---

### `/warn`

**Who can use it:** members with **Moderate Members**  
**Purpose:** Add a warning entry to a member's mod record.

**Options:** `user` (required), `reason` (required).

---

### `/warnings`

**Who can use it:** members with **Moderate Members**  
**Purpose:** View warning history for a member (shows up to 10 recent warnings).

**Options:** `user` (required).

---

### `/clear-warnings`

**Who can use it:** members with **Moderate Members**  
**Purpose:** Clear all warning entries for a member.

**Options:** `user` (required).

---

### `/untimeout`

**Who can use it:** members with **Moderate Members**  
**Purpose:** Remove an active timeout from a member.

**Options:** `user` (required), `reason` (optional).

---

### `/unban`

**Who can use it:** members with **Ban Members**  
**Purpose:** Unban a user by Discord user ID.

**Options:** `user_id` (required), `reason` (optional).

---

### `/lock`

**Who can use it:** members with **Manage Channels**  
**Purpose:** Lock a channel by preventing `@everyone` from sending messages.

**Options:** `channel` (optional, defaults to current channel).

---

### `/unlock`

**Who can use it:** members with **Manage Channels**  
**Purpose:** Unlock a channel for `@everyone` message sending.

**Options:** `channel` (optional, defaults to current channel).

---

### `/purge`

**Who can use it:** members with **Manage Messages**  
**Purpose:** Purge messages either by raw amount or by specific user.

**Options:** `amount` (required, 1–100), `user` (optional).

---

### `/modlog`

**Who can use it:** members with **Manage Server**  
**Purpose:** Configure the channel used for automatic moderation logs.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `/modlog set` | `channel` (required). Sets where moderation events are logged. |
| `/modlog view` | Shows current mod log channel. |
| `/modlog clear` | Disables moderation logging. |

---

### `/rolepanel`

**Who can use it:** members with **Manage Roles**  
**Purpose:** Post a button role menu where members can self-toggle roles.

**Options:** `title` (required), `role1` (required), `role2..role5` (optional), `description` (optional), `channel` (optional).

---

### `/userinfo`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Show member profile details (ID, joined date, roles, nickname).

**Options:** `user` (optional, defaults to yourself).

---

### `/serverinfo`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Show server details (member count, channels, roles, created date, owner ID).

---

### `/avatar`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Show a user's avatar image.

**Options:** `user` (optional, defaults to yourself).

---

### `/slowmode`

**Who can use it:** members with **Manage Channels**  
**Purpose:** Set or disable channel slowmode.

**Options:** `seconds` (required, 0-21600), `channel` (optional, defaults to current).

---

### `/poll`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Create a quick yes/no reaction poll.

**Options:** `question` (required).

---

### `/announce`

**Who can use it:** members with **Manage Messages**  
**Purpose:** Post a formatted staff announcement into a channel.

**Options:** `message` (required), `channel` (optional, defaults to current).

---

### `/boss`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Link directly to the OSRS Wiki page for a boss.

**Options:** `bossname` (required, free text), `style` (optional: any / melee / range / magic / budget).

---

### `/gear`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Pull recommended equipment from the OSRS Wiki strategy page for a boss.

**Options:** `bossname` (required, free text).

**Behavior:**

- Looks up `<Boss>/Strategies` on OSRS Wiki.
- Finds the `Equipment` (or gear-related) section when available.
- Returns a clean summary and links the exact strategy page source.
- Falls back to a helpful message/search if strategy data is missing.

---

### `/timezone`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Let members self-assign a timezone role.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `/timezone set` | `zone` (required). Assigns the matching timezone role. If missing, bot creates it automatically. |
| `/timezone clear` | Removes any `TZ | ...` role from the member. |

**Role behavior:** The bot removes existing `TZ | ...` roles from the member before assigning the new one so users only keep one timezone role.

---

### `/birthday`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Save your birthday date + timezone so the bot posts a birthday message at midnight in your timezone.

**Subcommands:**

| Subcommand | Description |
|------------|-------------|
| `/birthday set` | `date` (MM-DD), `timezone`, optional `channel`. |
| `/birthday view` | View your saved birthday settings. |
| `/birthday clear` | Remove your birthday settings. |
| `/birthday list` | Staff list of saved birthdays for this server (requires Manage Server). |

**Announcement behavior:** On your saved date, at **00:00** in your selected timezone, the bot posts `Happy Birthday` and mentions you in the configured channel.

---

### `/ping`

**Who can use it:** anyone who can use slash commands  
**Purpose:** Quick bot health check with response latency.

---

## Verification (buttons & modals — not slash commands)

These appear after you run **`/setup-verify`**.

1. **Verify** (button)  
   - Opens a modal asking for **OSRS username**.  
   - Submission is **pending** until a moderator acts.  
   - Does **not** assign the role or change nickname until **accepted**.

2. **Log channel message** (for staff)  
   - **Nickname Request** embed: requested name, Discord ID, member **avatar thumbnail**, **Accept** / **Deny**.  
   - Second embed: **same `/lookup` data** (hiscores + Runewatch) for that OSRS name.  
   - **Accept:** grants configured **verified role**, sets **nickname** to the OSRS name.  
   - **Deny:** removes verified role if present; restores previous nickname (best effort).  
   - Only users with **Manage Server** can use Accept/Deny.

3. **New member welcome** (optional)  
   - If `verificationChannelId` is set, new joins get a short welcome line in that channel.

---

## LFG (buttons)

On each `/lfg` post:

- **Going / Maybe / Not going** — updates participant lists on the embed.  
- **Create temp voice** — creates a temp voice channel (see `/lfg` above).

---

## Giveaway (button)

- **Enter** — adds the user to the entrant list (once per user).

---

## Role panels (button)

- **Role toggle buttons** (from `/rolepanel`) — clicking adds/removes the linked role from the member.

---

## Data files (reference)

| File | Contents |
|------|----------|
| `data/config.json` | Verification channel, verified role, verification log channel, and mod log channel settings. |
| `data/verifications.json` | User verification records and status. |
| `data/lfgEvents.json` | LFG message IDs and signups. |
| `data/giveaways.json` | Active / ended giveaways. |
| `data/stickies.json` | Per-channel sticky text and message IDs. |
| `data/warnings.json` | Warning history for moderation commands. |

---

## Refresh slash commands after code changes

If you add or change command definitions:

```bash
npm run deploy-commands
```

Then restart the bot (`npm start`).
