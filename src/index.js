const {
  DISCORD_TOKEN,
  TICKET_CATEGORY_ID,
  LOG_CHANNEL_ID,
} = process.env;

const STAFF_ROLE_ID = '1567191306977943712';

const STAFF_ROLE_ID = '1567191306977943712';

const STAFF_ROLE_ID = '1567191306977943712';

if (!DISCORD_TOKEN) {
  console.error('Configure DISCORD_TOKEN no ambiente antes de iniciar o bot.');
  process.exit(1);
}

if (!STAFF_ROLE_ID) {
  console.warn('STAFF_ROLE_ID não está definido. Ações de equipe ficarão indisponíveis até configurá-lo.');
}

const client = new Client({
  intents: ['Guilds'],
});

const PURPLE = 0x7B2CBF;
const CUSTOM_IDS = {
  exchange: 'nexus:ticket:exchange',
  buy: 'nexus:ticket:buy',
  sell: 'nexus:ticket:sell',
  claim: 'nexus:ticket:claim',
  close: 'nexus:ticket:close',
};

const TICKET_TYPES = {
  [CUSTOM_IDS.exchange]: { key: 'troca', label: 'Troca', emoji: '🔄' },
  [CUSTOM_IDS.buy]: { key: 'comprar', label: 'Comprar', emoji: '🛒' },
  [CUSTOM_IDS.sell]: { key: 'vender', label: 'Vender', emoji: '💰' },
};

function isStaff(member) {
  return Boolean(STAFF_ROLE_ID && member?.roles?.cache?.has(STAFF_ROLE_ID));
}

function safeChannelPart(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20) || 'membro';
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.claim)
      .setLabel('Assumir ticket')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(CUSTOM_IDS.close)
      .setLabel('Encerrar ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger),
  );
}

function makePanel() {
  const embed = new EmbedBuilder()
    .setColor(PURPLE)
    .setTitle('💜 Nexus Blox Store | Middleman')
    .setDescription(
      'Bem-vindo(a) à **Nexus Blox Store**!\n\n' +
      'Abra um atendimento privado escolhendo uma das opções abaixo. Nossa equipe irá ajudar você.\n\n' +
      '🔄 **Troca** — suporte para realizar uma troca com segurança.\n' +
      '🛒 **Comprar** — atendimento para compras.\n' +
      '💰 **Vender** — atendimento para vendas.\n\n' +
      'Nunca compartilhe sua senha ou códigos de autenticação.'
    )
    .setFooter({ text: 'Nexus Blox Store • Atendimento seguro' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CUSTOM_IDS.exchange).setLabel('Troca').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.buy).setLabel('Comprar').setEmoji('🛒').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(CUSTOM_IDS.sell).setLabel('Vender').setEmoji('💰').setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [row] };
}

async function createTicket(interaction, type) {
  const { guild, user } = interaction;
  if (!guild) {
    return interaction.reply({ content: 'Os tickets só podem ser abertos dentro de um servidor.', ephemeral: true });
  }

  const existing = guild.channels.cache.find((channel) =>
    channel.type === ChannelType.GuildText && channel.topic?.includes(`nexus-ticket-owner:${user.id}`),
  );
  if (existing) {
    return interaction.reply({ content: `Você já tem um ticket aberto: ${existing}`, ephemeral: true });
  }

  const permissionOverwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks],
    },
    {
      id: client.user.id,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks],
    },
  ];

  if (STAFF_ROLE_ID && guild.roles.cache.has(STAFF_ROLE_ID)) {
    permissionOverwrites.push({
      id: STAFF_ROLE_ID,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    });
  }

  try {
    const channel = await guild.channels.create({
      name: `${type.key}-${safeChannelPart(user.username)}`.slice(0, 90),
      type: ChannelType.GuildText,
      topic: `nexus-ticket-owner:${user.id} | tipo:${type.key} | aberto por:${user.tag}`,
      parent: TICKET_CATEGORY_ID && guild.channels.cache.has(TICKET_CATEGORY_ID) ? TICKET_CATEGORY_ID : undefined,
      permissionOverwrites,
      reason: `Ticket ${type.label} aberto por ${user.tag}`,
    });

    const embed = new EmbedBuilder()
      .setColor(PURPLE)
      .setTitle(`${type.emoji} Atendimento: ${type.label}`)
      .setDescription(`${user}, descreva aqui como a equipe pode ajudar.\n\nUm membro da equipe pode assumir o atendimento pelos botões abaixo.`)
      .addFields({ name: 'Aberto por', value: `${user}`, inline: true }, { name: 'Assunto', value: type.label, inline: true })
      .setTimestamp();

    await channel.send({
      content: STAFF_ROLE_ID && guild.roles.cache.has(STAFF_ROLE_ID) ? `<@&${STAFF_ROLE_ID}> ${user}` : `${user}`,
      embeds: [embed],
      components: [ticketControls()],
      allowedMentions: { users: [user.id], roles: STAFF_ROLE_ID ? [STAFF_ROLE_ID] : [] },
    });

    return interaction.reply({ content: `Seu ticket privado foi criado: ${channel}`, ephemeral: true });
  } catch (error) {
    console.error('Erro ao criar ticket:', error);
    return interaction.reply({ content: 'Não foi possível criar o ticket. Verifique as permissões do bot e tente novamente.', ephemeral: true });
  }
}

async function closeTicket(interaction) {
  const { channel, guild, member } = interaction;
  if (!guild || !channel || channel.type !== ChannelType.GuildText || !channel.topic?.includes('nexus-ticket-owner:')) {
    return interaction.reply({ content: 'Este botão só pode ser usado em um canal de ticket.', ephemeral: true });
  }
  if (!isStaff(member)) {
    return interaction.reply({ content: 'Somente a equipe pode encerrar tickets.', ephemeral: true });
  }

  await interaction.reply({ content: `Ticket encerrado por ${interaction.user}. Este canal será removido em 5 segundos.` });

  if (LOG_CHANNEL_ID) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (logChannel?.isTextBased()) {
      await logChannel.send({
        embeds: [new EmbedBuilder()
          .setColor(PURPLE)
          .setTitle('Ticket encerrado')
          .setDescription(`Canal: **${channel.name}**\nEncerrado por: ${interaction.user}\n${channel.topic}`)
          .setTimestamp()],
      }).catch((error) => console.error('Não foi possível registrar o encerramento:', error));
    }
  }

  setTimeout(() => {
    channel.delete(`Ticket encerrado por ${interaction.user.tag}`).catch((error) => {
      console.error('Não foi possível excluir o canal do ticket:', error);
    });
  }, 5000);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Nexus Blox Store conectado como ${readyClient.user.tag}.`);

  const { REST, Routes, SlashCommandBuilder } = require('discord.js');
  const CLIENT_ID = '1567710436038541352';
const GUILD_ID = '1565709224393187388';

  if (!CLIENT_ID || !GUILD_ID) {
    console.error('Falta CLIENT_ID ou GUILD_ID.');
    return;
  }

  const commands = [
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Publica o painel de atendimento da Nexus Blox Store.')
      .setDMPermission(false)
      .toJSON(),
  ];

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Comando /painel registrado com sucesso!');
  } catch (error) {
    console.error('Erro ao registrar /painel:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'painel') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'Você precisa da permissão Gerenciar Servidor para publicar o painel.', ephemeral: true });
      }
      return interaction.reply({ ...makePanel() });
    }

    if (!interaction.isButton()) return;

    const type = TICKET_TYPES[interaction.customId];
    if (type) return await createTicket(interaction, type);

    if (interaction.customId === CUSTOM_IDS.claim) {
      if (!isStaff(interaction.member)) {
        return interaction.reply({ content: 'Somente a equipe pode assumir tickets.', ephemeral: true });
      }
      return interaction.reply({ content: `🙋 Ticket assumido por ${interaction.user}.` });
    }

    if (interaction.customId === CUSTOM_IDS.close) return await closeTicket(interaction);
  } catch (error) {
    console.error('Erro ao processar interação:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Ocorreu um erro ao processar esta ação.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Não foi possível conectar o bot ao Discord:', error);
  process.exitCode = 1;
});
