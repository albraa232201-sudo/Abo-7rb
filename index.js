const express = require("express");
const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, ActionRowBuilder, ButtonBuilder,
  ButtonStyle, EmbedBuilder
} = require("discord.js");

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error("Missing DISCORD_TOKEN or DISCORD_CLIENT_ID environment variable.");
  process.exit(1);
}

const app = express();
app.get("/", (_req, res) => res.send("USER HUNTER is online."));
app.get("/health", (_req, res) => res.json({ ok: true }));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Health server listening on ${port}`));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const savedByUser = new Map();

function cleanSeed(value) {
  return (value || "user").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 12) || "user";
}
function makeNames(seed = "") {
  const base = cleanSeed(seed);
  const tails = ["x", "q", "v", "7", "z", "io", "404", "r", "x7", "tv"];
  return Array.from({ length: 8 }, (_, i) => {
    const suffix = tails[Math.floor(Math.random() * tails.length)];
    const number = Math.random() < 0.35 ? String(Math.floor(Math.random() * 90 + 10)) : "";
    return (base + suffix + number).slice(0, 20);
  });
}
function makeEmbed(names, title = "🎯 USER HUNTER — نتائج الصيد") {
  return new EmbedBuilder()
    .setColor(0x54f0a2)
    .setTitle(title)
    .setDescription(names.map((n, i) => `\`${i + 1}.\` **@${n}**`).join("\n"))
    .setFooter({ text: "فحص التوفر الحقيقي متاح حاليًا لروبلوكس فقط" });
}
function buttons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("uh_generate").setLabel("توليد جديد").setEmoji("🔄").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("uh_save").setLabel("حفظ النتائج").setEmoji("💾").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("uh_check").setLabel("فحص روبلوكس").setEmoji("🔎").setStyle(ButtonStyle.Secondary)
  );
}

const command = new SlashCommandBuilder()
  .setName("hunter")
  .setDescription("افتح أداة صيد اليوزرات")
  .addStringOption(o => o.setName("seed").setDescription("حروف تبدأ بها اليوزرات").setRequired(false));

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  const body = [command.toJSON()];
  if (GUILD_ID) {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body });
    console.log("Guild slash command registered.");
  } else {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body });
    console.log("Global slash command registered (may take time to appear).");
  }
}

client.once("ready", () => console.log(`Logged in as ${client.user.tag}`));

client.on("interactionCreate", async interaction => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === "hunter") {
      const names = makeNames(interaction.options.getString("seed") || "");
      await interaction.reply({ embeds: [makeEmbed(names)], components: [buttons()] });
      return;
    }

    if (!interaction.isButton()) return;
    const ownerId = interaction.message.interactionMetadata?.user?.id
      || interaction.message.interaction?.user?.id;
    if (ownerId && ownerId !== interaction.user.id) {
      await interaction.reply({ content: "هذي الأداة مو لك؛ افتح /hunter عشان تستخدم نسختك.", ephemeral: true });
      return;
    }

    const current = interaction.message.embeds[0]?.description || "";
    const names = [...current.matchAll(/\*\*@([a-zA-Z0-9_]+)\*\*/g)].map(m => m[1]);

    if (interaction.customId === "uh_generate") {
      const next = makeNames(names[0] || "");
      await interaction.update({ embeds: [makeEmbed(next)], components: [buttons()] });
    } else if (interaction.customId === "uh_save") {
      const list = savedByUser.get(interaction.user.id) || [];
      const merged = [...new Set([...list, ...names])];
      savedByUser.set(interaction.user.id, merged);
      await interaction.reply({ content: `💾 حفظت ${names.length} يوزر لك خلال تشغيل البوت.`, ephemeral: true });
    } else if (interaction.customId === "uh_check") {
      if (!names.length) {
        await interaction.reply({ content: "ما لقيت يوزرات أفحصها. جرّب توليد جديد.", ephemeral: true });
        return;
      }
      await interaction.deferReply({ ephemeral: true });
      const results = [];
      for (const username of names.slice(0, 8)) {
        try {
          const response = await fetch("https://users.roblox.com/v1/usernames/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ usernames: [username], excludeBannedUsers: true })
          });
          if (!response.ok) throw new Error("Roblox API unavailable");
          const data = await response.json();
          const taken = Array.isArray(data.data) && data.data.length > 0;
          results.push(`${taken ? "❌ مستخدم" : "✅ غير مستخدم"} — **@${username}**`);
        } catch {
          results.push(`⚠️ تعذّر الفحص — **@${username}**`);
        }
      }
      await interaction.editReply("**نتيجة فحص روبلوكس:**\n" + results.join("\n"));
    }
  } catch (error) {
    console.error(error);
    if (interaction.isRepliable()) {
      const msg = "صار خطأ بسيط. جرّب مرة ثانية.";
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      else await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }
})();
