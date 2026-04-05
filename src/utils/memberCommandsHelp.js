const { EmbedBuilder } = require('discord.js');

/**
 * Single embed listing slash commands and interactions available to normal members (no mod/staff commands).
 */
function buildMemberCommandsEmbed(prefix) {
  const p = prefix || '!';

  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('Member commands')
    .setDescription(
      'Use **slash commands** by typing `/` in chat. This list hides most staff-only setup commands.\n\n' +
        `**Text commands:** \`${p}commands\` / \`${p}help\` — this guide · \`${p}BOTW\` — random boss of the week · \`${p}SOTW\` — random skill of the week`
    )
    .addFields(
      {
        name: 'OSRS & bossing',
        value:
          '`/lookup` — Hiscores overview + Runewatch check\n' +
          '`/boss` — Open the OSRS Wiki page for a boss\n' +
          '`/gear` — Recommended gear from wiki strategy pages (styles: melee / range / magic / budget)\n' +
          '`/events` — Modals: name/start/end/description, then podium (1st–3rd) & pets\n' +
          '`/lfg` — Bossing group (times: add `8pm CST` or use `timezone` for `<t:…>` local display)\n' +
          '`/price` / `/ge` — Grand Exchange item price\n' +
          '`/dry` — Dry-streak odds (e.g. rate `1/512`, your `kc`)',
        inline: false
      },
      {
        name: 'Profile & server info',
        value:
          '`/userinfo` — User profile\n' +
          '`/serverinfo` — Server information\n' +
          '`/avatar` — Show a member’s avatar\n' +
          '`/timezone` — Assign or clear your timezone role\n' +
          '`/birthday` — `set`, `clear`, or `view` your birthday (`list` is staff-only)',
        inline: false
      },
      {
        name: 'Quick tools',
        value:
          '`/poll` — Multi-choice poll (question + up to 10 options, with reaction voting)\n' +
          '`/remind` — DM yourself a reminder later (`in`: e.g. `2h`, `30m`, `1d`)\n' +
          '`/afk` — Set/clear AFK; others see a reply when they @ you',
        inline: false
      },
      {
        name: 'Staff-only (moderation)',
        value:
          '`/note` — Internal notes on a member (`add` / `list`); replies are **ephemeral** (not warnings).\n' +
          'Also: `/warn`, `/kick`, `/ban`, `/timeout`, `/purge`, `/modlog`, `/giveaway`, `/setup-verify`, `/verify-approvers`, `/wom`, etc.',
        inline: false
      },
      {
        name: 'Buttons & panels (no slash)',
        value:
          '• **Verification** — Server verify button + modal; mods approve before roles apply.\n' +
          '• **LFG posts** — Going / Maybe, and **Create temp voice** on LFG embeds.\n' +
          '• **Giveaways** — Enter on giveaway messages (staff create them with `/giveaway`).\n' +
          '• **Role panels** — Self-assign roles from panel messages (staff build with `/rolepanel`).',
        inline: false
      }
    )
    .setFooter({ text: 'Slash commands may be hidden until you type / — use the command name to search.' });
}

module.exports = { buildMemberCommandsEmbed };
