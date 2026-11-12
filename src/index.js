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
const OWNER_ID = '1142628108445437963';
const STAFF_ROLE_ID = '1567191306977943712';
const PURPLE = 0x7B2CBF;

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'panel-config.json');
const DASHBOARD_DIR = path.join(__dirname, '..', 'dashboard');

const DEFAULT_PANELS = {
  atendimento: {
    id: 'atendimento',
    title: '💜 Nexus Blox Store | Atendimento',
    description: 'Selecione uma opção abaixo para abrir seu atendimento.',
    color: '7B2CBF',
    image: '',
    buttons: [
      { id: 'troca', label: 'Troca', emoji: '🔄', style: 'Secondary' },
      { id: 'comprar', label: 'Comprar', emoji: '', style: 'Success' },
      { id: 'vender', label: 'Vender', emoji: '💰', style: 'Secondary' },
      { id: 'suporte-geral', label: 'Suporte Geral', emoji: '💬', style: 'Primary' },
      { id: 'denuncia', label: 'Denúncia', emoji: '🆘', style: 'Danger' },
    ],
    channelId: null,
    messageId: null,
  },
  espadas: {
    id: 'espadas',
    title: '⚔️ Nexus Blox Store | Espadas',
    description: 'Produtos disponíveis na loja.',
    color: '7B2CBF',
    image: '',
    buttons: [
      { id: 'comprar', label: 'Comprar', emoji: '', style: 'Success' },
    ],
    channelId: null,
    messageId: null,
  },
};

function safeId(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'painel';
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return clone(DEFAULT_PANELS);
    }

    const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const oldPanels = saved.panels || saved;
    const result = {};

    for (const [id, panel] of Object.entries(oldPanels)) {
      if (!panel || typeof panel !== 'object') continue;

      result[safeId(id)] = {
        id: safeId(id),
        title: panel.title || id,
        description: panel.description || '',
        color: panel.color || '7B2CBF',
        image: panel.image || '',
        buttons: Array.isArray(panel.buttons)
          ? panel.buttons.map((button, index) => ({
              id: safeId(button.id || button.label || `categoria-${index + 1}`),
              label: String(button.label || 'Atendimento').slice(0, 80),
              emoji: typeof button.emoji === 'string' ? button.emoji : '',
              style: button.style || defaultStyle(button.id),
            }))
          : [],
        channelId: panel.channelId || null,
        messageId: panel.messageId || null,
      };
    }

    for (const [id, panel] of Object.entries(DEFAULT_PANELS)) {
      if (!result[id]) result[id] = clone(panel);
    }

    return result;
  } catch (error) {
    console.error('Erro ao carregar configurações:', error);
    return clone(DEFAULT_PANELS);
  }
}

function defaultStyle(id) {
  if (id === 'comprar') return 'Success';
  if (id === 'suporte-geral') return 'Primary';
  if (id === 'denuncia') return 'Danger';
  return 'Secondary';
}

let panels = loadConfig();

function saveConfig() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    CONFIG_FILE,
    JSON.stringify({ panels }, null, 2)
  );
}

function getPanel(id) {
  return panels[safeId(id)] || null;
}

function getColor(panel) {
  return /^[0-9A-Fa-f]{6}$/.test(panel.color)
    ? parseInt(panel.color, 16)
    : PURPLE;
}

function getButtonStyle(style) {
  const styles = {
    Primary: ButtonStyle.Primary,
    Secondary: ButtonStyle.Secondary,
    Success: ButtonStyle.Success,
    Danger: ButtonStyle.Danger,
  };

  return styles[style] || ButtonStyle.Secondary;
}

function makePanel(panelId) {
  const config = getPanel(panelId);
  if (!config) throw new Error('Painel não encontrado.');

  const embed = new EmbedBuilder()
    .setColor(getColor(config))
    .setTitle(config.title)
    .setDescription(config.description)
    .setFooter({ text: 'Nexus Blox Store' });

  if (config.image) embed.setImage(config.image);

  const buttons = config.buttons.slice(0, 25).map(item => {
    const button = new ButtonBuilder()
      .setCustomId(`nexus:ticket:${panelId}:${item.id}`)
      .setLabel(item.label.slice(0, 80))
      .setStyle(getButtonStyle(item.style));

    if (item.emoji) button.setEmoji(item.emoji);
    return button;
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(buttons.slice(i, i + 5))
    );
  }

  return {
    embeds: [embed],
    components: rows,
  };
}

async function updatePanelMessage(panelId) {
  const config = getPanel(panelId);
  if (!config || !config.channelId || !config.messageId) return false;

  try {
    const channel = await client.channels.fetch(config.channelId);
    if (!channel || !channel.isTextBased()) return false;

    const message = await channel.messages.fetch(config.messageId);
    await message.edit(makePanel(panelId));
    return true;
  } catch (error) {
    console.error(`Erro ao atualizar painel ${panelId}:`, error);
    return false;
  }
}

function isStaff(member) {
  return Boolean(
    member?.roles?.cache?.has(STAFF_ROLE_ID) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

function safeChannelPart(value) {
  return safeId(value);
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

// COMANDOS
const commands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Publicar ou atualizar um painel')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID do painel, por exemplo: atendimento ou espadas')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('editarpainel')
    .setDescription('Editar título e descrição do painel de atendimento')
    .addStringOption(option =>
      option.setName('titulo').setDescription('Novo título').setRequired(false)
    )
    .addStringOption(option =>
      option.setName('descricao').setDescription('Nova descrição').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('imagem')
    .setDescription('Alterar ou remover a imagem do painel de atendimento')
    .addStringOption(option =>
      option.setName('url').setDescription('Link da imagem').setRequired(false)
    )
    .addBooleanOption(option =>
      option.setName('remover').setDescription('Remover a imagem').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName('cor')
    .setDescription('Alterar a cor do painel de atendimento')
    .addStringOption(option =>
      option.setName('hex').setDescription('Cor hexadecimal').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
].map(command => command.toJSON());

// DASHBOARD
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(DASHBOARD_DIR));

function protegerDashboard(req, res, next) {
  const auth = req.headers.authorization || '';

  if (!DASHBOARD_PASSWORD) {
    return res.status(503).send('Senha do Dashboard não configurada na FadeHost.');
  }

  if (!auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Dashboard"');
    return res.status(401).send('Acesso restrito.');
  }

  const dados = Buffer.from(auth.slice(6), 'base64').toString('utf8');
  const separador = dados.indexOf(':');
  const senha = separador >= 0 ? dados.slice(separador + 1) : '';

  if (senha !== DASHBOARD_PASSWORD) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Nexus Dashboard"');
    return res.status(401).send('Senha incorreta.');
  }

  next();
}

app.use('/api', protegerDashboard);

// Lista todos os painéis
app.get('/api/panels', (req, res) => {
  res.json({
    panels: Object.values(panels),
  });
});

// Cria um painel novo
app.post('/api/panels', (req, res) => {
  const title = String(req.body.title || '').trim();
  const id = safeId(req.body.id || title);

  if (!title) {
    return res.status(400).json({ error: 'Informe o nome do painel.' });
  }

  if (panels[id]) {
    return res.status(409).json({ error: 'Já existe um painel com esse ID.' });
  }

  panels[id] = {
    id,
    title: title.slice(0, 256),
    description: String(req.body.description || 'Selecione uma opção abaixo.').slice(0, 4000),
    color: '7B2CBF',
    image: '',
    buttons: [],
    channelId: null,
    messageId: null,
  };

  saveConfig();
  res.json({ success: true, panel: panels[id] });
});

// Carrega um painel específico
app.get('/api/config', (req, res) => {
  const id = safeId(req.query.panel || 'atendimento');
  const panel = getPanel(id);

  if (!panel) {
    return res.status(404).json({ error: 'Painel não encontrado.' });
  }

  res.json({
    ...panel,
    panels: Object.values(panels).map(item => ({
      id: item.id,
      title: item.title,
    })),
  });
});

// Salva edição de painel
app.post('/api/config', async (req, res) => {
  const id = safeId(req.body.panelId || req.body.panel || 'atendimento');
  const config = getPanel(id);

  if (!config) {
    return res.status(404).json({ error: 'Painel não encontrado.' });
  }

  const { title, description, color, image, buttons } = req.body;

  if (typeof title === 'string') config.title = title.slice(0, 256);
  if (typeof description === 'string') config.description = description.slice(0, 4000);

  if (typeof color === 'string') {
    if (!/^[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ error: 'Cor inválida.' });
    }
    config.color = color;
  }

  if (typeof image === 'string') {
    if (image === '') {
      config.image = '';
    } else {
      try {
        const url = new URL(image);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
        config.image = image;
      } catch {
        return res.status(400).json({ error: 'Link de imagem inválido.' });
      }
    }
  }

  if (Array.isArray(buttons)) {
    if (buttons.length > 25) {
      return res.status(400).json({ error: 'O painel pode ter no máximo 25 categorias.' });
    }

    config.buttons = buttons
      .filter(item => item && typeof item.label === 'string' && item.label.trim())
      .map((item, index) => ({
        id: safeId(item.id || item.label || `categoria-${index + 1}`),
        label: item.label.trim().slice(0, 80),
        emoji: typeof item.emoji === 'string' ? item.emoji.slice(0, 20) : '',
        style: ['Primary', 'Secondary', 'Success', 'Danger'].includes(item.style)
          ? item.style
          : defaultStyle(item.id),
      }));
  }

  try {
    saveConfig();
    const updated = await updatePanelMessage(id);

    res.json({
      success: true,
      panelUpdated: updated,
      panel: id,
    });
  } catch (error) {
    console.error('Erro ao salvar painel:', error);
    res.status(500).json({ error: 'Não foi possível salvar a configuração.' });
  }
});

// Adiciona uma categoria/botão
app.post('/api/panels/:id/buttons', (req, res) => {
  const panel = getPanel(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Painel não encontrado.' });

  if (panel.buttons.length >= 25) {
    return res.status(400).json({ error: 'Limite de 25 categorias por painel.' });
  }

  const label = String(req.body.label || '').trim();
  if (!label) return res.status(400).json({ error: 'Informe o nome da categoria.' });

  const id = safeId(req.body.id || label);
  if (panel.buttons.some(item => item.id === id)) {
    return res.status(409).json({ error: 'Essa categoria já existe neste painel.' });
  }

  const style = ['Primary', 'Secondary', 'Success', 'Danger'].includes(req.body.style)
    ? req.body.style
    : 'Secondary';

  panel.buttons.push({
    id,
    label: label.slice(0, 80),
    emoji: String(req.body.emoji || '').slice(0, 20),
    style,
  });

  saveConfig();
  res.json({ success: true, panel });
});

// Remove uma categoria/botão
app.delete('/api/panels/:id/buttons/:buttonId', (req, res) => {
  const panel = getPanel(req.params.id);
  if (!panel) return res.status(404).json({ error: 'Painel não encontrado.' });

  const before = panel.buttons.length;
  panel.buttons = panel.buttons.filter(item => item.id !== safeId(req.params.buttonId));

  if (before === panel.buttons.length) {
    return res.status(404).json({ error: 'Categoria não encontrada.' });
  }

  saveConfig();
  res.json({ success: true, panel });
});

// Remove um painel
app.delete('/api/panels/:id', (req, res) => {
  const id = safeId(req.params.id);

  if (id === 'atendimento' || id === 'espadas') {
    return res.status(400).json({ error: 'Os painéis principais não podem ser removidos.' });
  }

  if (!panels[id]) return res.status(404).json({ error: 'Painel não encontrado.' });

  delete panels[id];
  saveConfig();
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'online' });
});

app.listen(process.env.PORT || 3000, '0.0.0.0', () => {
  console.log('Dashboard Nexus iniciado!');
});

// BOT DISCORD
client.once(Events.ClientReady, async () => {
  console.log(`Bot online: ${client.user.tag}`);

  try {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log('Comandos registrados com sucesso.');
  } catch (error) {
    console.error('Erro ao registrar comandos:', error);
  }
});

// INTERAÇÕES
client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {

      // PROTEÇÃO DO FUNDADOR
      if (interaction.user.id !== OWNER_ID) {
        return interaction.reply({
          content: '❌ Apenas o Fundador pode usar os comandos do SPACE NEXUS!',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'painel') {
        const id = safeId(interaction.options.getString('id'));
        const config = getPanel(id);

        if (!config) {
          return interaction.reply({
            content: 'Não encontrei esse painel. Confira o ID no Dashboard.',
            ephemeral: true,
          });
        }

        await interaction.deferReply({ ephemeral: true });

        const updated = await updatePanelMessage(id);

        if (updated) {
          return interaction.editReply(`Painel **${config.title}** atualizado!`);
        }

        const message = await interaction.channel.send(makePanel(id));
        config.channelId = message.channel.id;
        config.messageId = message.id;
        saveConfig();

        return interaction.editReply(`Painel **${config.title}** publicado e salvo!`);
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
            ? 'Painel de atendimento atualizado!'
            : 'Configuração salva. Use /painel id:atendimento para publicar.',
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
            if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
            config.image = url;
          } catch {
            return interaction.reply({
              content: 'Envie um link válido começando com https:// ou http://.',
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
          content: updated ? 'Imagem atualizada!' : 'Imagem salva. Publique o painel novamente.',
          ephemeral: true,
        });
      }

      if (interaction.commandName === 'cor') {
        const config = getPanel('atendimento');
        const hex = interaction.options.getString('hex').replace('#', '');

        if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
          return interaction.reply({
            content: 'Cor inválida. Use seis caracteres, exemplo: 7B2CBF.',
            ephemeral: true,
          });
        }

        config.color = hex;
        saveConfig();
        const updated = await updatePanelMessage('atendimento');

        return interaction.reply({
          content: updated ? 'Cor atualizada!' : 'Cor salva. Publique o painel novamente.',
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
        const panelId = parts[2];
        const buttonId = parts[3];

        const panel = getPanel(panelId);
        if (!panel) return;

        const ticketType = panel.buttons.find(item => item.id === buttonId);
        if (ticketType) return createTicket(interaction, ticketType);
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
  console.error('ERRO: DISCORD_TOKEN não foi configurado na hospedagem.');
  process.exit(1);
}

client.login(DISCORD_TOKEN);
