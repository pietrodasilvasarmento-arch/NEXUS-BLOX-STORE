
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const {
  DISCORD_TOKEN,
  TICKET_CATEGORY_ID,
  LOG_CHANNEL_ID,
} = process.env;

const STAFF_ROLE_ID = '1567191306977943712';
const CLIENT_ID = '1567710436038541352';
const GUILD_ID = '1565709224393187388';

if (!DISCORD_TOKEN) {
  console.error('Configure DISCORD_TOKEN no ambiente.');
  process.exit(1);
}

const client = new Client({ intents: ['Guilds'] });

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'panel-config.json');

const DEFAULT_CONFIG = {
  title: '💜 Nexus Blox Store | Middleman',
  description:
    'Bem-vindo(a) à **Nexus Blox Store**!\n\n' +
    'Abra um atendimento privado escolhendo uma das opções abaixo.\n\n' +
    'Nunca compartilhe sua senha ou códigos de autenticação.',
  color: '7B2CBF',
  image: '',
  buttons: [
    { id: 'exchange', label: 'Troca', emoji: '🔄', style: 2 },
    { id: 'buy', label: 'Comprar', emoji: '🛒', style: 3 },
    { id: 'sell', label: 'Vender', emoji: '💰', style: 1 },
  ],
  panel: null,
};

let config = { ...DEFAULT_CONFIG };

function loadConfig() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });

    if (fs.existsSync(CONFIG_FILE)) {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      config = { ...DEFAULT_CONFIG, ...saved };
    } else {
      saveConfig();
    }
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
  }
}

function saveConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

loadConfig();

function isStaff(member) {
  return Boolean(member?.roles?.cache?.has(STAFF_ROLE_ID));
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

function makePanel() {
  const embed = new EmbedBuilder()
    .setColor(parseInt(config.color, 16))
    .setTitle(config.title)
    .setDescription(config.description)
    .setFooter({ text: 'Nexus Blox Store • Atendimento seguro' });

  if (config.image) {
    embed.setImage(config.image);
  }

  const buttons = config.buttons.map((item) => {
    const button = new ButtonBuilder()
      .setCustomId(`nexus:ticket:${item.id}`)
      .setLabel(item.label)
      .setStyle(item.style || ButtonStyle.Primary);

    if (item.emoji) button.setEmoji(item.emoji);
    return button;
  });

  const components = buttons.length
    ? [new ActionRowBuilder().addComponents(buttons)]
    : [];

  return { embeds: [embed], components };
}

async function updatePanelMessage() {
  if (!config.panel?.channelId || !config.panel?.messageId) {
    return false;
  }

  try {
    const channel = await client.channels.fetch(config.panel.channelId);
    if (!channel || !channel.isTextBased()) return false;

    const message = await channel.messages.fetch(config.panel.messageId);
    await message.edit(makePanel());
    return true;
  } catch (error) {
    console.error('Não foi possível atualizar o painel:', error);
    return false;
  }
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nexus:ticket:claim')
      .setLabel('Assumir ticket')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('nexus:ticket:close')
      .setLabel('Encerrar ticket')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

async function createTicket(interaction, type) {
  const { guild, user } = interaction;

  if (!guild) {
    return interaction.reply({
      content: 'Os tickets só podem ser abertos dentro de um servidor.',
      ephemeral: true,
    });
  }

  const existing = guild.channels.cache.find((channel) =>
    channel.type === ChannelType.GuildText &&
    channel.topic?.includes(`nexus-ticket-owner:${user.id}`)
  );

  if (existing) {
    return interaction.reply({
      content: `Você já tem um ticket aberto: ${existing}`,
      ephemeral: true,
    });
  }

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (guild.roles.cache.has(STAFF_ROLE_ID)) {
    permissionOverwrites.push({
      id: STAFF_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  try {
    const channel = await guild.channels.create({
      name: `${safeChannelPart(type.key)}-${safeChannelPart(user.username)}`.slice(0, 90),
      type: ChannelType.GuildText,
      topic: `nexus-ticket-owner:${user.id} | tipo:${type.key} | aberto por:${user.tag}`,
      parent:
        TICKET_CATEGORY_ID &&
        guild.channels.cache.has(TICKET_CATEGORY_ID)
          ? TICKET_CATEGORY_ID
          : undefined,
      permissionOverwrites,
      reason: `Ticket ${type.label} aberto por ${user.tag}`,
    });

    const embed = new EmbedBuilder()
      .setColor(parseInt(config.color, 16))
      .setTitle(`${type.emoji || '🎫'} Atendimento: ${type.label}`)
      .setDescription(
        `${user}, descreva aqui como a equipe pode ajudar.\n\n` +
        'Um membro da equipe pode assumir o atendimento pelos botões abaixo.'
      )
      .addFields(
        { name: 'Aberto por', value: `${user}`, inline: true },
        { name: 'Assunto', value: type.label, inline: true }
      )
      .setTimestamp();

    await channel.send({
      content: guild.roles.cache.has(STAFF_ROLE_ID)
        ? `<@&${STAFF_ROLE_ID}> ${user}`
        : `${user}`,
      embeds: [embed],
      components: [ticketControls()],
      allowedMentions: {
        users: [user.id],
        roles: guild.roles.cache.has(STAFF_ROLE_ID) ? [STAFF_ROLE_ID] : [],
      },
    });

    return interaction.reply({
      content: `Seu ticket privado foi criado: ${channel}`,
      ephemeral: true,
    });
  } catch (error) {
    console.error('Erro ao criar ticket:', error);
    return interaction.reply({
      content: 'Não foi possível criar o ticket. Verifique as permissões do bot.',
      ephemeral: true,
    });
  }
}

async function closeTicket(interaction) {
  const { channel, guild, member } = interaction;

  if (
    !guild ||
    !channel ||
    channel.type !== ChannelType.GuildText ||
    !channel.topic?.includes('nexus-ticket-owner:')
  ) {
    return interaction.reply({
      content: 'Este botão só pode ser usado em um canal de ticket.',
      ephemeral: true,
    });
  }

  if (!isStaff(member)) {
    return interaction.reply({
      content: 'Somente a equipe pode encerrar tickets.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: `Ticket encerrado por ${interaction.user}. Este canal será removido em 5 segundos.`,
  });

  if (LOG_CHANNEL_ID) {
    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);

    if (logChannel?.isTextBased()) {
      await logChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(parseInt(config.color, 16))
            .setTitle('Ticket encerrado')
            .setDescription(
              `Canal: **${channel.name}**\n` +
              `Encerrado por: ${interaction.user}\n` +
              `${channel.topic}`
            )
            .setTimestamp(),
        ],
      }).catch(console.error);
    }
  }

  setTimeout(() => {
    channel.delete(`Ticket encerrado por ${interaction.user.tag}`)
      .catch(console.error);
  }, 5000);
}

function adminCommand(command) {
  return command.setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
}

const commands = [
  adminCommand(
    new SlashCommandBuilder()
      .setName('painel')
      .setDescription('Publica o painel ou atualiza o painel existente.')
  ),

  adminCommand(
    new SlashCommandBuilder()
      .setName('editarpainel')
      .setDescription('Altera o título e a descrição do painel.')
      .addStringOption(o => o.setName('titulo').setDescription('Novo título').setRequired(false))
      .addStringOption(o => o.setName('descricao').setDescription('Nova descrição').setRequired(false))
  ),

  adminCommand(
    new SlashCommandBuilder()
      .setName('imagem')
      .setDescription('Troca ou remove a imagem do painel.')
      .addStringOption(o => o.setName('url').setDescription('URL da imagem ou escreva remover').setRequired(true))
  ),

  adminCommand(
    new SlashCommandBuilder()
      .setName('cor')
      .setDescription('Altera a cor do painel.')
      .addStringOption(o => o.setName('hex').setDescription('Cor hexadecimal, exemplo: #7B2CBF').setRequired(true))
  ),

  adminCommand(
    new SlashCommandBuilder()
      .setName('adicionarbotao')
      .setDescription('Adiciona um botão que abre um ticket.')
      .addStringOption(o => o.setName('nome').setDescription('Nome do botão').setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Emoji do botão').setRequired(false))
  ),

  adminCommand(
    new SlashCommandBuilder()
      .setName('removerbotao')
      .setDescription('Remove um botão pelo nome.')
      .addStringOption(o => o.setName('nome').setDescription('Nome do botão').setRequired(true))
  ),
].map(command => command.toJSON());

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Nexus Blox Store conectado como ${readyClient.user.tag}.`);

  const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );
    console.log('Comandos do painel registrados!');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({
          content: 'Você precisa da permissão Gerenciar Servidor.',
          ephemeral: true,
        });
      }

      const command = interaction.commandName;

      if (command === 'painel') {
        await interaction.deferReply({ ephemeral: true });

        const updated = await updatePanelMessage();

        if (updated) {
          return interaction.editReply('Painel existente atualizado!');
        }

        const message = await interaction.channel.send(makePanel());
        config.panel = {
          channelId: message.channelId,
          messageId: message.id,
        };
        saveConfig();

        return interaction.editReply('Painel publicado e salvo!');
      }

      if (command === 'editarpainel') {
        const title = interaction.options.getString('titulo');
        const description = interaction.options.getString('descricao');

        if (!title && !description) {
          return interaction.reply({
            content: 'Informe um título, uma descrição ou os dois.',
            ephemeral: true,
          });
        }

        if (title) config.title = title.slice(0, 256);
        if (description) config.description = description.slice(0, 4000);

        saveConfig();
        const updated = await updatePanelMessage();

        return interaction.reply({
          content: updated
            ? 'Título e descrição atualizados no painel!'
            : 'Configurações salvas. Use /painel para publicar o painel.',
          ephemeral: true,
        });
      }

      if (command === 'imagem') {
        const url = interaction.options.getString('url').trim();

        if (url.toLowerCase() === 'remover') {
          config.image = '';
        } else {
          try {
            const parsed = new URL(url);
            if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
            config.image = url;
          } catch {
            return interaction.reply({
              content: 'Envie um link válido começando com https:// ou http://, ou escreva remover.',
              ephemeral: true,
            });
          }
        }

        saveConfig();
        const updated = await updatePanelMessage();

        return interaction.reply({
          content: updated
            ? 'Imagem do painel atualizada!'
            : 'Imagem salva. Use /painel para publicar.',
          ephemeral: true,
        });
      }

      if (command === 'cor') {
        let hex = interaction.options.getString('hex').trim().replace('#', '');

        if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
          return interaction.reply({
            content: 'Cor inválida. Exemplo correto: #7B2CBF',
            ephemeral: true,
          });
        }

        config.color = hex.toUpperCase();
        saveConfig();
        const updated = await updatePanelMessage();

        return interaction.reply({
          content: updated
            ? 'Cor do painel atualizada!'
            : 'Cor salva. Use /painel para publicar.',
          ephemeral: true,
        });
      }

      if (command === 'adicionarbotao') {
        if (config.buttons.length >= 5) {
          return interaction.reply({
            content: 'O Discord permite no máximo 5 botões nesta linha. Remova um antes de adicionar outro.',
            ephemeral: true,
          });
        }

        const label = interaction.options.getString('nome').trim();
        const emoji = interaction.options.getString('emoji');
        const id = safeChannelPart(label).replace(/-/g, '_');

        if (!label || config.buttons.some(b => b.label.toLowerCase() === label.toLowerCase())) {
          return interaction.reply({
            content: 'Esse botão já existe ou o nome está vazio.',
            ephemeral: true,
          });
        }

        let uniqueId = id || 'novo';
        let suffix = 2;
        while (config.buttons.some(b => b.id === uniqueId)) {
          uniqueId = `${id}_${suffix++}`;
        }

        config.buttons.push({
          id: uniqueId,
          label: label.slice(0, 80),
          emoji: emoji || '',
          style: ButtonStyle.Primary,
        });

        saveConfig();
        const updated = await updatePanelMessage();

        return interaction.reply({
          content: updated
            ? `Botão **${label}** adicionado ao painel!`
            : `Botão **${label}** salvo. Use /painel para publicar.`,
          ephemeral: true,
        });
      }

      if (command === 'removerbotao') {
        const name = interaction.options.getString('nome').trim().toLowerCase();
        const index = config.buttons.findIndex(
          b => b.label.toLowerCase() === name || b.id.toLowerCase() === name
        );

        if (index === -1) {
          return interaction.reply({
            content: 'Não encontrei esse botão. Informe o nome exatamente como aparece no painel.',
            ephemeral: true,
          });
        }

        const removed = config.buttons.splice(index, 1)[0];
        saveConfig();
        const updated = await updatePanelMessage();

        return interaction.reply({
          content: updated
            ? `Botão **${removed.label}** removido!`
            : `Botão **${removed.label}** removido das configurações. Use /painel para publicar.`,
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'nexus:ticket:claim') {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: 'Somente a equipe pode assumir tickets.',
            ephemeral: true,
          });
        }

        return interaction.reply({
          content: `🙋 Ticket assumido por ${interaction.user}.`,
        });
      }

      if (interaction.customId === 'nexus:ticket:close') {
        return await closeTicket(interaction);
      }

      if (interaction.customId.startsWith('nexus:ticket:')) {
        const id = interaction.customId.slice('nexus:ticket:'.length);
        const button = config.buttons.find(b => b.id === id);

        if (button) {
          return await createTicket(interaction, {
            key: button.id,
            label: button.label,
            emoji: button.emoji,
          });
        }
      }
    }
  } catch (error) {
    console.error('Erro ao processar interação:', error);

    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocorreu um erro ao processar esta ação.',
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

client.login(DISCORD_TOKEN).catch((error) => {
  console.error('Não foi possível conectar o bot ao Discord:', error);
});
