require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  Events,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const {
  DISCORD_TOKEN,
  TICKET_CATEGORY_ID,
  LOG_CHANNEL_ID,
  DASHBOARD_PASSWORD,
} = process.env;

const CLIENT_ID = '1567710436038541352';
const GUILD_ID = '1565709224393187388';
const STAFF_ROLE_ID = '1567191306977943712';

const PURPLE = 0x7B2CBF;

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'panel-config.json');
const DASHBOARD_DIR = path.join(__dirname, '..', 'dashboard');

const DEFAULT_PANELS = {
  atendimento: {
    title: '💜 Nexus Blox Store | Atendimento',
    description: 'Selecione uma opção abaixo para abrir seu atendimento.',
    color: '7B2CBF',
    image: '',
    buttons: [
      { id: 'troca', label: 'Troca', emoji: '🔄' },
      { id: 'comprar', label: 'Comprar', emoji: '' },
      { id: 'vender', label: 'Vender', emoji: '💰' },
      { id: 'suporte-geral', label: 'Suporte Geral', emoji: '💬' },
      { id: 'denuncia', label: 'Denúncia', emoji: '🆘' },
    ],
    channelId: null,
    messageId: null,
  },

  espadas: {
    title: '⚔️ Nexus Blox Store | Espadas',
    description: 'Clique abaixo para comprar sua espada.',
    color: '7B2CBF',
    image: '',
    buttons: [
      { id: 'comprar', label: 'Comprar', emoji: '' },
    ],
    channelId: null,
    messageId: null,
  },
};

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(JSON.stringify(DEFAULT_PANELS));
    }

    const saved = JSON.parse(
      fs.readFileSync(CONFIG_FILE, 'utf8')
    );

    // Mantém configurações antigas do painel de atendimento.
    if (!saved.panels) {
      const atendimento = {
        ...DEFAULT_PANELS.atendimento,
        ...saved,
      };

      return {
        atendimento,
        espadas: JSON.parse(JSON.stringify(DEFAULT_PANELS.espadas)),
      };
    }

    return {
      atendimento: {
        ...DEFAULT_PANELS.atendimento,
        ...(saved.panels.atendimento || {}),
      },
      espadas: {
        ...DEFAULT_PANELS.espadas,
        ...(saved.panels.espadas || {}),
      },
    };
  } catch (error) {
    console.error('Erro ao carregar configuração:', error);
    return JSON.parse(JSON.stringify(DEFAULT_PANELS));
  }
}

let panels = loadConfig();

function saveConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ panels }, null, 2)
  );
}

function getPanel(panelKey) {
  return panels[panelKey] || panels.atendimento;
}

function getColor(panelKey) {
  const color = getPanel(panelKey).color;

  return /^[0-9A-Fa-f]{6}$/.test(color)
    ? parseInt(color, 16)
    : PURPLE;
}

function makePanel(panelKey) {
  const config = getPanel(panelKey);

  const embed = new EmbedBuilder()
    .setColor(getColor(panelKey))
    .setTitle(config.title)
    .setDescription(config.description)
    .setFooter({
      text: 'Nexus Blox Store',
    });

  if (config.image) {
    embed.setImage(config.image);
  }

  const buttons = config.buttons.slice(0, 5).map(item => {
    const styles = {
      comprar: ButtonStyle.Success,
      'suporte-geral': ButtonStyle.Primary,
      denuncia: ButtonStyle.Danger,
    };

    const style = styles[item.id] || ButtonStyle.Secondary;

    const button = new ButtonBuilder()
      .setCustomId(`nexus:ticket:${panelKey}:${item.id}`)
      .setLabel(item.label)
      .setStyle(style);

    if (item.emoji) {
      button.setEmoji(item.emoji);
    }

    return button;
  });

  return {
    embeds: [embed],
    components: buttons.length
      ? [new ActionRowBuilder().addComponents(buttons)]
      : [],
  };
}

async function updatePanelMessage(panelKey) {
  const config = getPanel(panelKey);

  if (!config.channelId || !config.messageId) {
    return false;
  }

  try {
    const channel = await client.channels.fetch(
      config.channelId
    );

    if (!channel || !channel.isTextBased()) {
      return false;
    }

    const message = await channel.messages.fetch(
      config.messageId
    );

    await message.edit(makePanel(panelKey));

    return true;
  } catch (error) {
    console.error(`Erro ao atualizar painel ${panelKey}:`, error);
    return false;
  }
}

function isStaff(member) {
  return (
    member.roles.cache.has(STAFF_ROLE_ID) ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

function safeChannelPart(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'membro';
}

function ticketControls() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('nexus:ticket:claim')
      .setLabel('Assumir')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('nexus:ticket:close')
      .setLabel('Fechar')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );
}

async function createTicket(interaction, ticketType) {
  const guild = interaction.guild;

  if (!guild) {
    return interaction.reply({
      content: 'Este botão só funciona dentro do servidor.',
      ephemeral: true,
    });
  }

  const channel = await guild.channels.create({
    name: `${safeChannelPart(ticketType.label)}-${safeChannelPart(interaction.user.username)}`,
    type: ChannelType.GuildText,
    parent: TICKET_CATEGORY_ID || undefined,

    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ],
  });

  await channel.send({
    content:
      `${interaction.user} ${ticketType.emoji || '🎫'} ` +
      `Atendimento de **${ticketType.label}** aberto!\n` +
      'A equipe irá atender você.',
    components: [ticketControls()],
  });

  await interaction.reply({
    content: `Seu atendimento foi criado: ${channel}`,
    ephemeral: true,
  });
}

async function closeTicket(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({
      content: 'Somente a equipe pode fechar este atendimento.',
      ephemeral: true,
    });
  }

  await interaction.reply({
    content: '🔒 Atendimento fechado pela equipe. Este canal será apagado em 5 segundos.',
  });

  if (LOG_CHANNEL_ID) {
    try {
      const logChannel = await client.channels.fetch(LOG_CHANNEL_ID);

      if (logChannel && logChannel.isTextBased()) {
        await logChannel.send(
          `🔒 O canal ${interaction.channel.name} foi fechado por ${interaction.user.tag}.`
        );
      }
    } catch (error) {
      console.error('Erro ao enviar log:', error);
    }
  }

  setTimeout(() => {
    interaction.channel.delete().catch(console.error);
  }, 5000);
}

// COMANDOS DO DISCORD

const commands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publicar ou atualizar um painel')
    .addStringOption(option =>
      option.setName('tipo')
        .setDescription('Escolha qual painel publicar')
        .setRequired(true)
        .addChoices(
          { name: 'Atendimento', value: 'atendimento' },
          { name: 'Espadas', value: 'espadas' }
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('editarpainel')
    .setDescription('Editar título e descrição do painel de atendimento')
    .addStringOption(option =>
      option.setName('titulo')
        .setDescription('Novo título')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('descricao')
        .setDescription('Nova descrição')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('imagem')
    .setDescription('Alterar ou remover a imagem do painel de atendimento')
    .addStringOption(option =>
      option.setName('url')
        .setDescription('Link da imagem')
        .setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('remover')
        .setDescription('Remover a imagem')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('cor')
    .setDescription('Alterar a cor do painel de atendimento')
    .addStringOption(option =>
      option.setName('hex')
        .setDescription('Cor hexadecimal, exemplo: 7B2CBF')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('adicionarbotao')
    .setDescription('Adicionar um botão ao painel de atendimento')
    .addStringOption(option =>
      option.setName('nome')
        .setDescription('Nome do botão')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('emoji')
        .setDescription('Emoji do botão')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('removerbotao')
    .setDescription('Remover um botão do painel de atendimento')
    .addStringOption(option =>
      option.setName('nome')
        .setDescription('Nome do botão')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

// DASHBOARD

const app = express();

app.use(express.json());
app.use(express.static(DASHBOARD_DIR));

function protegerDashboard(req, res, next) {
  const autenticacao = req.headers.authorization || '';

  if (!DASHBOARD_PASSWORD) {
    return res.status(503).send(
      'Senha do Dashboard não configurada na FadeHost.'
    );
  }

  if (!autenticacao.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Dashboard"');
    return res.status(401).send('Acesso restrito.');
  }

  const dados = Buffer.from(
    autenticacao.slice(6),
    'base64'
  ).toString('utf8');

  const separador = dados.indexOf(':');
  const senha = separador >= 0
    ? dados.slice(separador + 1)
    : '';

  if (senha !== DASHBOARD_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Dashboard"');
    return res.status(401).send('Senha incorreta.');
  }

  next();
}

app.use('/api', protegerDashboard);

app.get('/api/config', (req, res) => {
  const panelKey = req.query.panel === 'espadas'
    ? 'espadas'
    : 'atendimento';

  res.json({
    ...getPanel(panelKey),
    panel: panelKey,
  });
});

app.post('/api/config', async (req, res) => {
  const panelKey = req.body.panel === 'espadas'
    ? 'espadas'
    : 'atendimento';

  const config = getPanel(panelKey);
  const { title, description, color, image, buttons } = req.body;

  if (typeof title === 'string') {
    config.title = title.slice(0, 256);
  }

  if (typeof description === 'string') {
    config.description = description.slice(0, 4000);
  }

  if (
    typeof color === 'string' &&
    /^[0-9A-Fa-f]{6}$/.test(color)
  ) {
    config.color = color;
  }

  if (typeof image === 'string') {
    if (image === '') {
      config.image = '';
    } else {
      try {
        const url = new URL(image);

        if (!['http:', 'https:'].includes(url.protocol)) {
          throw new Error();
        }

        config.image = image;
      } catch {
        return res.status(400).json({
          error: 'Link de imagem inválido.',
        });
      }
    }
  }

  if (Array.isArray(buttons)) {
    if (buttons.length > 5) {
      return res.status(400).json({
        error: 'O painel pode ter no máximo 5 botões.',
      });
    }

    config.buttons = buttons
      .filter(item =>
        item &&
        typeof item.id === 'string' &&
        typeof item.label === 'string'
      )
      .map(item => ({
        id: safeChannelPart(item.id),
        label: item.label.slice(0, 80),
        emoji: typeof item.emoji === 'string'
          ? item.emoji.slice(0, 20)
          : '',
      }));
  }

  try {
    saveConfig();

    const updated = await updatePanelMessage(panelKey);

    return res.json({
      success: true,
      panelUpdated: updated,
      panel: panelKey,
    });
  } catch (error) {
    console.error('Erro ao salvar painel:', error);

    return res.status(500).json({
      error: 'Não foi possível salvar a configuração.',
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'online' });
});

app.listen(
  process.env.PORT || 3000,
  '0.0.0.0',
  () => {
    console.log('Dashboard Nexus iniciado!');
  }
);

// BOT DISCORD

client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);

  try {
    const rest = new REST({
      version: '10',
    }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('Todos os comandos foram registrados com sucesso.');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// INTERAÇÕES

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (
        !interaction.memberPermissions?.has(
          PermissionFlagsBits.ManageGuild
        )
      ) {
        return interaction.reply({
          content: 'Você não tem permissão para usar este comando.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'painel') {
        const panelKey = interaction.options.getString('tipo');

        await interaction.deferReply({ ephemeral: true });

        const updated = await updatePanelMessage(panelKey);

        if (updated) {
          return interaction.editReply(
            `Painel de ${panelKey} atualizado!`
          );
        }

        const message = await interaction.channel.send(
          makePanel(panelKey)
        );

        const config = getPanel(panelKey);
        config.channelId = message.channel.id;
        config.messageId = message.id;

        saveConfig();

        return interaction.editReply(
          `Painel de ${panelKey} publicado e salvo!`
        );
      }

      if (interaction.commandName === 'editarpainel') {
        const config = getPanel('atendimento');
        const title = interaction.options.getString('titulo');
        const description = interaction.options.getString('descricao');

        if (title !== null) config.title = title;
        if (description !== null) config.description = description;

        saveConfig();

        const updated = await updatePanelMessage('atendimento');

        return interaction.reply({
          content: updated
            ? 'Título e descrição do atendimento atualizados!'
            : 'Configuração salva. Use /painel e escolha Atendimento.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'imagem') {
        const config = getPanel('atendimento');
        const url = interaction.options.getString('url');
        const remove = interaction.options.getBoolean('remover');

        if (remove) {
          config.image = '';
        } else if (url) {
          try {
            const parsed = new URL(url);

            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error();
            }

            config.image = url;
          } catch {
            return interaction.reply({
              content: 'Envie um link de imagem válido começando com https:// ou http://.',
              ephemeral: true,
            });
          }
        } else {
          return interaction.reply({
            content: 'Informe uma URL ou marque remover como verdadeiro.',
            ephemeral: true,
          });
        }

        saveConfig();

        const updated = await updatePanelMessage('atendimento');

        return interaction.reply({
          content: updated
            ? 'Imagem do atendimento atualizada!'
            : 'Imagem salva. Use /painel e escolha Atendimento.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'cor') {
        const config = getPanel('atendimento');
        const hex = interaction.options.getString('hex').replace('#', '');

        if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.reply({
            content: 'Cor inválida. Use seis caracteres, por exemplo: 7B2CBF.',
            ephemeral: true,
          });
        }

        config.color = hex;
        saveConfig();

        const updated = await updatePanelMessage('atendimento');

        return interaction.reply({
          content: updated
            ? 'Cor do atendimento atualizada!'
            : 'Cor salva. Use /painel e escolha Atendimento.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'adicionarbotao') {
        const config = getPanel('atendimento');

        if (config.buttons.length >= 5) {
          return interaction.reply({
            content: 'O painel já tem 5 botões. Remova um antes de adicionar outro.',
            ephemeral: true,
          });
        }

        const label = interaction.options.getString('nome').trim();
        const emoji = interaction.options.getString('emoji') || '🎫';
        const id = safeChannelPart(label);

        if (
          !label ||
          config.buttons.some(button => button.id === id)
        ) {
          return interaction.reply({
            content: 'Nome vazio ou botão com esse nome já existe.',
            ephemeral: true,
          });
        }

        config.buttons.push({
          id,
          label: label.slice(0, 80),
          emoji,
        });

        saveConfig();

        const updated = await updatePanelMessage('atendimento');

        return interaction.reply({
          content: updated
            ? 'Botão adicionado ao painel de atendimento!'
            : 'Botão salvo. Use /painel e escolha Atendimento.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'removerbotao') {
        const config = getPanel('atendimento');
        const name = safeChannelPart(
          interaction.options.getString('nome')
        );

        const before = config.buttons.length;

        config.buttons = config.buttons.filter(button =>
          button.id !== name &&
          safeChannelPart(button.label) !== name
        );

        if (config.buttons.length === before) {
          return interaction.reply({
            content: 'Não encontrei esse botão. Confira o nome.',
            ephemeral: true,
          });
        }

        saveConfig();

        const updated = await updatePanelMessage('atendimento');

        return interaction.reply({
          content: updated
            ? 'Botão removido!'
            : 'Remoção salva. Use /painel e escolha Atendimento.',
          ephemeral: true,
        });
      }
    }

    if (interaction.isButton()) {
      const customId = interaction.customId;

      if (customId === 'nexus:ticket:claim') {
        if (!isStaff(interaction.member)) {
          return interaction.reply({
            content: 'Somente a equipe pode assumir atendimentos.',
            ephemeral: true,
          });
        }

        return interaction.reply({
          content: `🙋 Atendimento assumido por ${interaction.user}.`,
        });
      }

      if (customId === 'nexus:ticket:close') {
        return closeTicket(interaction);
      }

      if (customId.startsWith('nexus:ticket:')) {
        const parts = customId.split(':');
        const panelKey = parts[2];
        const id = parts[3];

        if (!['atendimento', 'espadas'].includes(panelKey)) {
          return;
        }

        const ticketType = getPanel(panelKey).buttons.find(
          button => button.id === id
        );

        if (ticketType) {
          return createTicket(interaction, ticketType);
        }
      }
    }
  } catch (error) {
    console.error('Erro na interação:', error);

    const message = 'Ocorreu um erro. Confira o console do bot.';

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({
        content: message,
        ephemeral: true,
      }).catch(() => {});
    } else {
      await interaction.reply({
        content: message,
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

// INICIAR BOT

if (!DISCORD_TOKEN) {
  console.error(
    'ERRO: DISCORD_TOKEN não foi configurado na hospedagem.'
  );

  process.exit(1);
}

client.login(DISCORD_TOKEN);
