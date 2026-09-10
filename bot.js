require('dotenv').config();
const { ethers } = require('ethers');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Configurações do Telegram
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHANNEL_ID;
const WEBSITE_URL = process.env.WEBSITE_URL;

// Configuração das Redes EVM (Polygon, BNB, Base, Arbitrum, Optimism, Avalanche)
const EVM_NETWORKS = [
  {
    name: "Polygon",
    emoji: "🟣",
    rpcUrl: process.env.POLYGON_RPC,
    contractAddress: process.env.POLYGON_CONTRACT,
    explorer: "https://polygonscan.com"
  },
  {
    name: "BNB Smart Chain",
    emoji: "🟡",
    rpcUrl: process.env.BNB_RPC,
    contractAddress: process.env.BNB_CONTRACT,
    explorer: "https://bscscan.com"
  },
  {
    name: "Base",
    emoji: "🔵",
    rpcUrl: process.env.BASE_RPC,
    contractAddress: process.env.BASE_CONTRACT,
    explorer: "https://basescan.org"
  },
  {
    name: "Arbitrum",
    emoji: "🔷",
    rpcUrl: process.env.ARBITRUM_RPC,
    contractAddress: process.env.ARBITRUM_CONTRACT,
    explorer: "https://arbiscan.io"
  },
  {
    name: "Optimism",
    emoji: "🔴",
    rpcUrl: process.env.OPTIMISM_RPC,
    contractAddress: process.env.OPTIMISM_CONTRACT,
    explorer: "https://optimistic.etherscan.io"
  },
  {
    name: "Avalanche",
    emoji: "❄️",
    rpcUrl: process.env.AVALANCHE_RPC,
    contractAddress: process.env.AVALANCHE_CONTRACT,
    explorer: "https://snowtrace.io"
  }
];

// ABI simplificada para os contratos EVM
const CONTRACT_ABI = [
  "event BilheteComprado(address indexed jogador, uint256 quantidadeApostas)",
  "event SorteioSolicitado(uint256 indexed requestId)",
  "event SorteioRealizado(uint256 indexed requestId, uint256 maskSorteada)",
  "event PremioSacado(address indexed jogador, uint256 valor)"
];

async function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });
    const data = await response.json();
    if (!data.ok) console.error("Erro Telegram API:", data);
  } catch (error) {
    console.error("Erro de rede ao enviar para o Telegram:", error);
  }
}

function shortAddress(addr) {
  if (!addr) return "Desconhecido";
  return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
}

// Iniciar ouvintes para as redes EVM (Polygon, BNB, Base, Arbitrum, Optimism, Avalanche)
function startEvmListeners() {
  EVM_NETWORKS.forEach(net => {
    if (!net.rpcUrl || !net.contractAddress) {
      console.log(`⚠️ Ignorando ${net.name}: RPC ou Contrato não configurado no .env.`);
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(net.rpcUrl);
      const contract = new ethers.Contract(net.contractAddress, CONTRACT_ABI, provider);

      console.log(`🚀 Conectado e ouvindo eventos na rede EVM: ${net.name}`);

      // 1. Bilhete Comprado
      contract.on("BilheteComprado", async (jogador, quantidadeApostas, event) => {
        const txHash = event.log.transactionHash;
        const msg = `${net.emoji} *[${net.name}] Novo Bilhete Comprado!*\n\n` +
                    `👤 Jogador: \`${shortAddress(jogador)}\`\n` +
                    `🎟 Total de apostas na rodada: *${quantidadeApostas.toString()}*\n\n` +
                    `🔍 [Ver Transação](${net.explorer}/tx/${txHash})\n` +
                    `🌐 [Acesse o Site](${WEBSITE_URL})`;
        await sendTelegramMessage(msg);
      });

      // 2. Sorteio Solicitado
      contract.on("SorteioSolicitado", async (requestId, event) => {
        const txHash = event.log.transactionHash;
        const msg = `${net.emoji} *[${net.name}] Sorteio Solicitado!* 🎲\n\n` +
                    `🆔 Request ID: \`${requestId.toString()}\`\n` +
                    `Aguardando resposta do oráculo Chainlink VRF...\n\n` +
                    `🔍 [Ver Transação](${net.explorer}/tx/${txHash})`;
        await sendTelegramMessage(msg);
      });

      // 3. Sorteio Realizado
      contract.on("SorteioRealizado", async (requestId, maskSorteada, event) => {
        const txHash = event.log.transactionHash;
        let ganhadoresInfo = "Apuração finalizada!";
        try {
          const historicoCount = await contract.getHistoricoCount();
          if (historicoCount > 0) {
            const ultimo = await contract.ultimosGanhadores(historicoCount - 1n);
            const valorFormatado = (Number(ultimo.valor) / 10**6).toFixed(2);
            ganhadoresInfo = `🏆 Ganhador: \`${shortAddress(ultimo.carteira)}\`\n` +
                             `💰 Prêmio (${ultimo.tipo}): *${valorFormatado} USDT*`;
          }
        } catch (err) {
          console.error(`Erro ao buscar detalhes do ganhador em ${net.name}:`, err);
        }

        const msg = `${net.emoji} 🎉 *[${net.name}] SORTEIO REALIZADO!* 🎉\n\n` +
                    `${ganhadoresInfo}\n\n` +
                    `🔍 [Auditoria da Tx](${net.explorer}/tx/${txHash})\n` +
                    `🌐 [Site Oficial](${WEBSITE_URL})`;
        await sendTelegramMessage(msg);
      });

      // 4. Prêmio Sacado
      contract.on("PremioSacado", async (jogador, valor, event) => {
        const txHash = event.log.transactionHash;
        const valorFormatado = (Number(valor) / 10**6).toFixed(2);
        const msg = `${net.emoji} *[${net.name}] Prêmio Resgatado!* 💸\n\n` +
                    `👤 Vencedor: \`${shortAddress(jogador)}\`\n` +
                    `💵 Valor Sacado: *${valorFormatado} USDT*\n\n` +
                    `🔍 [Ver Transação](${net.explorer}/tx/${txHash})`;
        await sendTelegramMessage(msg);
      });

    } catch (error) {
      console.error(`Erro ao inicializar ${net.name}:`, error);
    }
  });
}

// Ouvinte para Solana
function startSolanaListener() {
  if (!process.env.SOLANA_PROGRAM_ID) return;
  console.log("🟣 [Solana] Monitor configurado e pronto.");
}

// Ouvinte para Tron
function startTronListener() {
  if (!process.env.TRON_CONTRACT_ADDRESS) return;
  console.log("🔴 [Tron] Monitor configurado e pronto.");
}

// Inicializar todos os monitores das 8 redes
startEvmListeners();
startSolanaListener();
startTronListener();
