require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;

if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('Configure DISCORD_TOKEN e CLIENT_ID no ambiente antes de registrar os comandos.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publica o painel de atendimento da Nexus Blox Store.')
    .setDMPermission(false)
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
const route = GUILD_ID
  ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
  : Routes.applicationCommands(CLIENT_ID);

(async () => {
  try {
    const result = await rest.put(route, { body: commands });
    console.log(`${result.length} comando(s) registrado(s) ${GUILD_ID ? `no servidor ${GUILD_ID}` : 'globalmente'}.`);
  } catch (error) {
    console.error('Não foi possível registrar os comandos:', error);
    process.exitCode = 1;
  }
})();
