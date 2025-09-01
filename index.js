const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const express = require('express');
const app = express();
const port = 3000;

// Configurar cliente do Discord com todas as intents necessárias
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMembers
  ]
});

// Array com os IDs dos usuários a serem monitorados
const USER_IDS = [
  '601352854451781642'
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

// Função para gerar o HTML do dashboard principal
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

  return `
    <html>
      <head>
        <title>Discord Status Monitor - Múltiplos Usuários</title>
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
          .user-card { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .view-button { display: inline-block; background-color: #5865F2; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>Discord Status Monitor - Múltiplos Usuários</h1>
        
        <div class="users-container">
          ${usersHTML}
        </div>
        
        <div class="status">
          <p>Para usar a API, acesse: <code>${req.protocol}://${req.get('host')}/status</code></p>
          <p>Para informações de um usuário específico: <code>${req.protocol}://${req.get('host')}/status/{userId}</code></p>
        </div>
        
        <div class="ping-info">
          <h3>Sistema Keep-Alive</h3>
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

// Função para gerar o HTML da página de um usuário específico
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
    timestamp: new Date().toISOString()
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
    
    client.user.setStatus('idle');
    client.user.setActivity('you...', { type: ActivityType.Watching });
    
    // Fazer a verificação inicial de todos os usuários
    await updateAllUsersInfo();
    
    // Configurar verificação periódica das informações de todos os usuários
    setInterval(updateAllUsersInfo, AVATAR_CHECK_INTERVAL);
  });

  // Monitorar mudanças de presença
  client.on('presenceUpdate', (oldPresence, newPresence) => {
    const userId = newPresence.userId;
    if (USER_IDS.includes(userId)) {
      users[userId].status = newPresence.status;
      console.log(`[${new Date().toISOString()}] Status do usuário ${userId} atualizado para: ${users[userId].status}`);
    }
  });

  // Fazer login com o token do bot
  client.login(process.env.TOKEN).catch(err => {
    console.error(`[${new Date().toISOString()}] Erro ao fazer login no Discord:`, err);
  });
}

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

// Ping a cada 5 minutos para evitar inatividade no Render
setInterval(pingService, 5 * 60 * 1000);

// Ping adicional mais frequente para estabilidade (a cada 30 segundos)
setInterval(() => {
  console.log(`[${new Date().toISOString()}] Micro-ping interno para garantir atividade`);
}, 30 * 1000);

// Certificar-se de que o bot continue rodando mesmo se houver erros não tratados
process.on('uncaughtException', function(err) {
  console.error(`[${new Date().toISOString()}] ERRO NÃO TRATADO: `, err);
  console.log('O bot continuará funcionando apesar do erro.');
});

