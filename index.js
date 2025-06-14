const { Client, GatewayIntentBits, ActivityType, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const app = express();
const port = 3000;

// ========== CONFIGURAÇÕES ==========

// Configuração do Twitter Monitor
const TWITTER_CONFIG = {
    ENABLED: true, // Mude para false para desabilitar o monitor de tweets
    USERNAME: 'bereguedez', // Usuário do Twitter para monitorar
    CHANNEL_ID: '1375592053341421728', // Canal onde postar os tweets
    CHECK_INTERVAL: 30000 // Verifica a cada 30 segundos
};

// Configurar cliente do Discord com todas as intents necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ========== CÓDIGO ORIGINAL DO STATUS MONITOR ==========

// Array com os IDs dos usuários a serem monitorados
const USER_IDS = [
  '874517110678765618',  // ID da Bia
  '682694935631233203',   // Seu ID
  '320295547439153153',   // Walk
  '852671600389783583',   // Finish
  '996840264855470090',   // PedroLixo
  '504586268781576202'   // t3uk
];

// Dicionário para armazenar as informações de cada usuário
const users = {};

// Inicializar as informações de cada usuário
USER_IDS.forEach(id => {
  users[id] = {
    status: 'offline',
    avatar: null,
    tag: null,
    lastAvatarCheck: 0
  };
});

const AVATAR_CHECK_INTERVAL = 60 * 1000; // Verificar avatar a cada 1 minuto

// ========== CÓDIGO NOVO DO TWITTER MONITOR ==========

// Arquivo para salvar o último tweet
const LAST_TWEET_FILE = 'last_tweet.json';

// Função para obter dados do perfil do Twitter via RSS
async function getTwitterProfileRSS(username) {
    try {
        const url = `https://nitter.net/${username}/rss`;
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data, { xmlMode: true });
        
        const firstItem = $('item').first();
        if (firstItem.length === 0) {
            return null;
        }

        const title = firstItem.find('title').text();
        const description = firstItem.find('description').text();
        const link = firstItem.find('link').text();
        const pubDate = firstItem.find('pubDate').text();
        
        // Extrai ID do tweet do link
        const tweetId = link.split('/').pop();
        
        // Remove HTML tags da descrição
        const cleanText = description.replace(/<[^>]*>/g, '').trim();
        
        return {
            profile: {
                name: username,
                username: username,
                image: `https://unavatar.io/twitter/${username}`
            },
            tweet: {
                id: tweetId,
                text: cleanText,
                time: pubDate,
                url: link
            }
        };
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro ao buscar RSS do Twitter:`, error.message);
        return null;
    }
}

// Carrega último tweet salvo
function loadLastTweet() {
    try {
        if (fs.existsSync(LAST_TWEET_FILE)) {
            const data = fs.readFileSync(LAST_TWEET_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro ao carregar último tweet:`, error);
    }
    return null;
}

// Salva último tweet
function saveLastTweet(tweetData) {
    try {
        fs.writeFileSync(LAST_TWEET_FILE, JSON.stringify(tweetData, null, 2));
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro ao salvar último tweet:`, error);
    }
}

// Cria embed do tweet
function createTweetEmbed(data) {
    const embed = new EmbedBuilder()
        .setAuthor({
            name: `${data.profile.name} (@${data.profile.username})`,
            iconURL: data.profile.image,
            url: `https://twitter.com/${data.profile.username}`
        })
        .setDescription(data.tweet.text)
        .setColor(0x1DA1F2)
        .setURL(data.tweet.url)
        .setTimestamp(new Date(data.tweet.time))
        .setFooter({
            text: 'Twitter Monitor',
            iconURL: 'https://abs.twimg.com/favicons/twitter.3.ico'
        });

    return embed;
}

// Função principal para verificar novos tweets
async function checkForNewTweets() {
    if (!TWITTER_CONFIG.ENABLED) return;
    
    try {
        console.log(`[${new Date().toISOString()}] Verificando tweets de @${TWITTER_CONFIG.USERNAME}...`);
        
        const data = await getTwitterProfileRSS(TWITTER_CONFIG.USERNAME);
        
        if (!data || !data.tweet) {
            console.log(`[${new Date().toISOString()}] Nenhum tweet encontrado para @${TWITTER_CONFIG.USERNAME}`);
            return;
        }

        const lastTweet = loadLastTweet();
        
        // Verifica se é um tweet novo
        if (!lastTweet || lastTweet.id !== data.tweet.id) {
            console.log(`[${new Date().toISOString()}] Novo tweet encontrado de @${TWITTER_CONFIG.USERNAME}!`);
            
            const channel = client.channels.cache.get(TWITTER_CONFIG.CHANNEL_ID);
            if (!channel) {
                console.error(`[${new Date().toISOString()}] Canal ${TWITTER_CONFIG.CHANNEL_ID} não encontrado!`);
                return;
            }

            const embed = createTweetEmbed(data);
            await channel.send({ 
                content: `🐦 **Novo tweet de @${data.profile.username}!**`,
                embeds: [embed] 
            });

            // Salva o tweet como último visto
            saveLastTweet({
                id: data.tweet.id,
                text: data.tweet.text,
                time: data.tweet.time
            });
            
            console.log(`[${new Date().toISOString()}] Tweet enviado com sucesso!`);
        } else {
            console.log(`[${new Date().toISOString()}] Nenhum tweet novo encontrado para @${TWITTER_CONFIG.USERNAME}`);
        }
    } catch (error) {
        console.error(`[${new Date().toISOString()}] Erro ao verificar tweets:`, error);
    }
}

// ========== DASHBOARD INTEGRADO ==========

// Função para gerar o HTML do dashboard principal (atualizado)
function generateMainDashboard(req) {
  let usersHTML = '';
  
  // Gerar HTML para cada usuário
  Object.keys(users).forEach(userId => {
    const user = users[userId];
    usersHTML += `
      <div class="user-card">
        <h3>Usuário ID: ${userId}</h3>
        <div class="user-info">
          <img class="avatar" src="${user.avatar || '/img/default_avatar.png'}" alt="Avatar do usuário">
          <div>
            <h2>${user.tag || 'Usuário Discord'}</h2>
            <p>
              <span class="status-indicator ${user.status}"></span>
              Status atual: ${user.status}
            </p>
          </div>
        </div>
        <p><a href="/user/${userId}" class="view-button">Ver página individual</a></p>
      </div>
    `;
  });

  // Informações do Twitter Monitor
  const lastTweet = loadLastTweet();
  const twitterStatus = TWITTER_CONFIG.ENABLED ? 
    `<div class="twitter-status active">
      <h3>🐦 Twitter Monitor</h3>
      <p><strong>Monitorando:</strong> @${TWITTER_CONFIG.USERNAME}</p>
      <p><strong>Canal:</strong> ${TWITTER_CONFIG.CHANNEL_ID}</p>
      <p><strong>Status:</strong> ✅ Ativo</p>
      <p><strong>Último tweet:</strong> ${lastTweet ? lastTweet.text.substring(0, 100) + '...' : 'Nenhum tweet ainda'}</p>
      <p><strong>Verificação:</strong> A cada ${TWITTER_CONFIG.CHECK_INTERVAL/1000} segundos</p>
    </div>` :
    `<div class="twitter-status inactive">
      <h3>🐦 Twitter Monitor</h3>
      <p><strong>Status:</strong> ❌ Desativado</p>
    </div>`;

  return `
    <html>
      <head>
        <title>Bot Discord Integrado - Status Monitor + Twitter</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; background-color: #f5f5f5; }
          .status { padding: 10px; border: 1px solid #ccc; margin: 20px 0; background-color: white; border-radius: 5px; }
          .user-info { display: flex; align-items: center; }
          .avatar { width: 80px; height: 80px; border-radius: 50%; margin-right: 15px; }
          .status-indicator { width: 20px; height: 20px; border-radius: 50%; display: inline-block; margin-right: 10px; }
          .online { background-color: #43b581; }
          .idle { background-color: #faa61a; }
          .dnd { background-color: #f04747; }
          .offline { background-color: #747f8d; }
          .ping-info { background-color: #e8f4f8; padding: 15px; border-radius: 5px; margin-top: 20px; }
          .user-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; background-color: white; }
          .view-button { display: inline-block; background-color: #5865F2; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; }
          .twitter-status { padding: 15px; margin: 20px 0; border-radius: 5px; }
          .twitter-status.active { background-color: #e8f5e8; border: 1px solid #4caf50; }
          .twitter-status.inactive { background-color: #ffeaa7; border: 1px solid #f39c12; }
          .main-title { color: #5865F2; text-align: center; margin-bottom: 30px; }
          .section-title { color: #333; border-bottom: 2px solid #5865F2; padding-bottom: 10px; }
        </style>
      </head>
      <body>
        <h1 class="main-title">🤖 Bot Discord Integrado</h1>
        <h2 class="section-title">Status Monitor + Twitter Monitor</h2>
        
        ${twitterStatus}
        
        <h2 class="section-title">👥 Usuários Monitorados</h2>
        <div class="users-container">
          ${usersHTML}
        </div>
        
        <div class="status">
          <h3>📡 APIs Disponíveis</h3>
          <p><strong>Status de todos os usuários:</strong> <code>${req.protocol}://${req.get('host')}/status</code></p>
          <p><strong>Status de usuário específico:</strong> <code>${req.protocol}://${req.get('host')}/status/{userId}</code></p>
          <p><strong>Comando manual Twitter:</strong> Digite <code>!check</code> no Discord</p>
          <p><strong>Status do Twitter:</strong> Digite <code>!twitter</code> no Discord</p>
        </div>
        
        <div class="ping-info">
          <h3>🔄 Sistema Keep-Alive</h3>
          <p>Bot está ativo! Sistema de ping está rodando a cada 5 minutos.</p>
          <p>Último ping: <span id="lastPing">${new Date().toISOString()}</span></p>
        </div>
        
        <script>
          // Atualizar status na página a cada 5 segundos
          setInterval(() => {
            fetch('/status')
              .then(response => response.json())
              .then(data => {
                document.getElementById('lastPing').innerText = data.timestamp;
              });
          }, 5000);

          // Ping automático para manter o bot ativo
          setInterval(() => {
            fetch('/ping')
              .then(response => response.text())
              .then(data => {
                console.log('Auto-ping realizado pelo cliente web');
              });
          }, 5000);
        </script>
      </body>
    </html>
  `;
}

// Função para gerar o HTML da página de um usuário específico (mantida original)
function generateUserDashboard(req, userId) {
  const user = users[userId];
  if (!user) {
    return `<html><body><h1>Usuário não encontrado</h1><p>Voltar para <a href="/">página principal</a></p></body></html>`;
  }
  
  return `
    <html>
      <head>
        <title>Discord Status Monitor - Usuário ${userId}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
          .status { padding: 10px; border: 1px solid #ccc; margin: 20px 0; }
          .user-info { display: flex; align-items: center; }
          .avatar { width: 80px; height: 80px; border-radius: 50%; margin-right: 15px; }
          .status-indicator { width: 20px; height: 20px; border-radius: 50%; display: inline-block; margin-right: 10px; }
          .online { background-color: #43b581; }
          .idle { background-color: #faa61a; }
          .dnd { background-color: #f04747; }
          .offline { background-color: #747f8d; }
          .ping-info { background-color: #f0f0f0; padding: 10px; border-radius: 5px; margin-top: 20px; }
          .back-button { display: inline-block; background-color: #5865F2; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <a href="/" class="back-button">← Voltar</a>
        <h1>Monitor de Status Discord - Usuário ${userId}</h1>
        <div class="user-info">
          <img id="avatarImage" class="avatar" src="${user.avatar || '/img/default_avatar.png'}" alt="Avatar do usuário">
          <div>
            <h2 id="username">${user.tag || 'Usuário Discord'}</h2>
            <p>
              <span id="statusIndicator" class="status-indicator ${user.status}"></span>
              Status atual: <span id="currentStatus">${user.status}</span>
            </p>
          </div>
        </div>
        <div class="status">
          <p>Para usar a API, acesse: <code>${req.protocol}://${req.get('host')}/status/${userId}</code></p>
          <p>Exemplo de resposta:</p>
          <pre>{
  "userId": "${userId}",
  "username": "${user.tag || 'exemplo#0000'}",
  "status": "${user.status}",
  "statusImage": "${getStatusImageUrl(user.status)}",
  "avatarUrl": "${user.avatar || 'URL do avatar'}",
  "timestamp": "${new Date().toISOString()}"
}</pre>
        </div>
        <div class="ping-info">
          <h3>Informações de Atualização</h3>
          <p>Última verificação de avatar: <span id="lastAvatarCheck">${new Date(user.lastAvatarCheck).toISOString()}</span></p>
        </div>
        <script>
          // Atualizar status na página a cada 5 segundos
          setInterval(() => {
            fetch('/status/${userId}')
              .then(response => response.json())
              .then(data => {
                document.getElementById('currentStatus').innerText = data.status;
                document.getElementById('statusIndicator').className = 'status-indicator ' + data.status;
                document.getElementById('username').innerText = data.username || 'Usuário Discord';
                if (data.avatarUrl) {
                  document.getElementById('avatarImage').src = data.avatarUrl + '?t=' + new Date().getTime();
                }
                document.getElementById('lastAvatarCheck').innerText = data.lastAvatarCheck;
              });
          }, 5000);

          // Ping automático para manter o bot ativo
          setInterval(() => {
            fetch('/ping')
              .then(response => response.text())
              .then(data => {
                console.log('Auto-ping realizado pelo cliente web');
              });
          }, 5000);
        </script>
      </body>
    </html>
  `;
}

// ========== ROTAS WEB ==========

// Rota principal para o dashboard
app.get('/', (req, res) => {
  res.send(generateMainDashboard(req));
  console.log(`[${new Date().toISOString()}] Dashboard principal acessado`);
});

// Rota para página de usuário específico
app.get('/user/:userId', (req, res) => {
  const userId = req.params.userId;
  res.send(generateUserDashboard(req, userId));
  console.log(`[${new Date().toISOString()}] Dashboard do usuário ${userId} acessado`);
});

// ========== FUNÇÕES ORIGINAIS ==========

// Função para verificar e atualizar as informações dos usuários
async function updateAllUsersInfo() {
  for (const userId of USER_IDS) {
    await updateUserInfo(userId);
  }
}

// Função para verificar e atualizar as informações de um usuário específico
async function updateUserInfo(userId) {
  try {
    // Forçar a obtenção do usuário novamente
    const user = await client.users.fetch(userId, { force: true });
    if (user) {
      const newAvatar = user.displayAvatarURL({ size: 2048, format: 'png', dynamic: true });
      
      // Verificar se o avatar mudou
      if (newAvatar !== users[userId].avatar) {
        console.log(`[${new Date().toISOString()}] Avatar do usuário ${userId} atualizado: ${newAvatar}`);
        users[userId].avatar = newAvatar;
      }
      
      // Atualizar a tag do usuário também
      users[userId].tag = user.tag;
      
      // Buscar o status em todos os servidores
      let foundInServer = false;
      client.guilds.cache.forEach(async (guild) => {
        try {
          const member = await guild.members.fetch(userId);
          if (member) {
            foundInServer = true;
            users[userId].status = member.presence ? member.presence.status : 'offline';
            
            // Verificar avatar do servidor
            const memberAvatar = member.displayAvatarURL({ size: 2048, format: 'png', dynamic: true });
            if (memberAvatar !== users[userId].avatar) {
              console.log(`[${new Date().toISOString()}] Avatar do servidor para usuário ${userId} atualizado: ${memberAvatar}`);
              users[userId].avatar = memberAvatar;
            }
          }
        } catch (e) {
          // Ignorar erros ao buscar membro em servidores específicos
        }
      });
      
      users[userId].lastAvatarCheck = Date.now();
      console.log(`[${new Date().toISOString()}] Informações do usuário ${userId} atualizadas com sucesso`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Erro ao atualizar informações do usuário ${userId}:`, err);
  }
}

// Endpoint para obter o status de todos os usuários
app.get('/status', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  const usersData = {};
  
  for (const userId of USER_IDS) {
    const user = users[userId];
    // Adicionar parâmetro de tempo para evitar cache
    const avatarUrlWithCache = user.avatar ? 
      user.avatar + (user.avatar.includes('?') ? '&' : '?') + 't=' + Date.now() : null;
    
    usersData[userId] = {
      userId: userId,
      username: user.tag,
      status: user.status,
      statusImage: getStatusImageUrl(user.status),
      avatarUrl: avatarUrlWithCache,
      lastAvatarCheck: new Date(user.lastAvatarCheck).toISOString()
    };
  }
  
  res.json({
    users: usersData,
    timestamp: new Date().toISOString(),
    twitterMonitor: {
      enabled: TWITTER_CONFIG.ENABLED,
      username: TWITTER_CONFIG.USERNAME,
      channelId: TWITTER_CONFIG.CHANNEL_ID,
      lastTweet: loadLastTweet()
    }
  });

  console.log(`[${new Date().toISOString()}] Requisição de status de todos os usuários atendida`);
});

// Endpoint para obter o status de um usuário específico
app.get('/status/:userId', (req, res) => {
  const userId = req.params.userId;
  
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');

  if (!users[userId]) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  const user = users[userId];
  // Adicionar parâmetro de tempo para evitar cache
  const avatarUrlWithCache = user.avatar ? 
    user.avatar + (user.avatar.includes('?') ? '&' : '?') + 't=' + Date.now() : null;
  
  res.json({ 
    userId: userId,
    username: user.tag,
    status: user.status,
    statusImage: getStatusImageUrl(user.status),
    avatarUrl: avatarUrlWithCache,
    timestamp: new Date().toISOString(),
    lastAvatarCheck: new Date(user.lastAvatarCheck).toISOString()
  });

  console.log(`[${new Date().toISOString()}] Requisição de status do usuário ${userId} atendida`);
});

// Função para retornar URL da imagem baseada no status
function getStatusImageUrl(status) {
  switch(status) {
    case 'online': return '/img/online.png';
    case 'idle': return '/img/idle.png';
    case 'dnd': return '/img/dnd.png';
    default: return '/img/offline.png';
  }
}

// ========== INICIALIZAÇÃO ==========

// Iniciar o servidor Express ANTES de iniciar o bot
app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] Servidor web iniciado na porta ${port}`);
  // Inicie o bot Discord DEPOIS que o servidor estiver funcionando
  startBot();
});

// Função separada para iniciar o bot
function startBot() {
  console.log(`[${new Date().toISOString()}] Iniciando o bot Discord...`);

  // Evento quando o bot estiver pronto
  client.once('ready', async () => {
    console.log(`[${new Date().toISOString()}] Bot iniciado como ${client.user.tag}`);
    
    client.user.setStatus('dnd');
    client.user.setActivity('Status + Twitter Monitor', { type: ActivityType.Watching });
    
    // Fazer a verificação inicial de todos os usuários
    await updateAllUsersInfo();
    
    // Configurar verificação periódica das informações de todos os usuários
    setInterval(updateAllUsersInfo, AVATAR_CHECK_INTERVAL);
    
    // Iniciar monitoramento do Twitter se habilitado
    if (TWITTER_CONFIG.ENABLED) {
      console.log(`[${new Date().toISOString()}] Iniciando monitoramento do Twitter para @${TWITTER_CONFIG.USERNAME}`);
      // Verifica imediatamente
      await checkForNewTweets();
      // Configura verificação periódica
      setInterval(checkForNewTweets, TWITTER_CONFIG.CHECK_INTERVAL);
    }
  });

  // Monitorar mudanças de presença (ORIGINAL)
  client.on('presenceUpdate', (oldPresence, newPresence) => {
    const userId = newPresence.userId;
    if (USER_IDS.includes(userId)) {
      users[userId].status = newPresence.status;
      console.log(`[${new Date().toISOString()}] Status do usuário ${userId} atualizado para: ${users[userId].status}`);
    }
  });

  // ========== NOVOS COMANDOS DO TWITTER ==========
  
  // Comandos do Twitter via mensagem
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    
    // Comando para verificar manualmente por tweets
    if (message.content === '!check') {
      if (!TWITTER_CONFIG.ENABLED) {
        message.reply('❌ Monitor do Twitter está desabilitado!');
        return;
      }
      message.reply('🔍 Verificando por novos tweets...');
      await checkForNewTweets();
    }
    
    // Comando para ver status do Twitter
    if (message.content === '!twitter') {
      const lastTweet = loadLastTweet();
      const status = TWITTER_CONFIG.ENABLED ? '✅ Ativo' : '❌ Desativado';
      
      const embed = new EmbedBuilder()
        .setTitle('🐦 Status do Twitter Monitor')
        .setColor(0x1DA1F2)
        .addFields(
          { name: 'Status', value: status, inline: true },
          { name: 'Usuário', value: `@${TWITTER_CONFIG.USERNAME}`, inline: true },
          { name: 'Canal', value: `<#${TWITTER_CONFIG.CHANNEL_ID}>`, inline: true },
          { name: 'Intervalo', value: `${TWITTER_CONFIG.CHECK_INTERVAL/1000}s`, inline: true }
        );
        
      if (lastTweet) {
        embed.addFields(
          { name: 'Último Tweet', value: lastTweet.text.substring(0, 100) + '...', inline: false },
          { name: 'Data', value: new Date(lastTweet.time).toLocaleString('pt-BR'), inline: true }
        );
      }
      
      message.reply({ embeds: [embed] });
    }
    
    // Comando original de status
    if (message.content === '!status') {
      const lastTweet = loadLastTweet();
      if (lastTweet) {
        message.reply(`📊 **Status do Bot:**\n` +
          `👤 Monitorando: @${TWITTER_CONFIG.USERNAME}\n` +
          `📝 Último tweet: ${lastTweet.text.substring(0, 100)}...\n` +
          `🕐 Verificando a cada ${TWITTER_CONFIG.CHECK_INTERVAL/1000}s\n` +
          `👥 Usuários monitorados: ${USER_IDS.length}`);
      } else {
        message.reply('📊 Bot ativo, mas ainda não encontrou tweets.');
      }
    }
  });

  // Fazer login com o token do bot
  client.login(process.env.TOKEN).catch(err => {
    console.error(`[${new Date().toISOString()}] Erro ao fazer login no Discord:`, err);
  });
}

// ========== KEEP-ALIVE ORIGINAL ==========

// Rota de ping para manter o serviço ativo
app.get('/ping', (req, res) => {
  res.send('Pong! Bot está ativo!');
  console.log(`[${new Date().toISOString()}] Ping recebido`);
});

// Sistema Keep-Alive para Render
function pingService() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] PING INTERNO: Mantendo o serviço ativo`);
  
  // Obtém a URL do serviço a partir das variáveis de ambiente do Render
  // ou usa localhost em ambiente de desenvolvimento
  const serviceUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}/ping`;
  
  try {
    fetch(serviceUrl)
      .then(response => console.log(`[${timestamp}] Auto-ping bem-sucedido`))
      .catch(err => console.log(`[${timestamp}] Erro no auto-ping: ${err.message}`));
  } catch (error) {
    console.log(`[${timestamp}] Exceção no auto-ping: ${error.message}`);
  }
}

// Ping a cada 5 minutos
