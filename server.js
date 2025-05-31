const Discord = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const { Client, Collection } = require("discord.js");
const { promisify } = require("util");
const fetch = require("node-fetch");
const parser = require('xml2js').parseString; // Assuming you're using xml2js for parsing XML
require("events").EventEmitter.defaultMaxListeners = 20;
const express = require("express");
const path = require("path");

const app = express();

// Serve the static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")));

// Serve the index.html file for the root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start the server on the specified port
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const ownerID = "1243018721090601032"; // Replace with your Discord ID
const cooldown = new Set(); // Prevents multiple intervals
const activeChannels = new Map(); // Stores intervals for each channel

require("dotenv").config();

// Initialize SQLite database (it will be saved in the project folder as data.db)
const db = new sqlite3.Database("./data.db", sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) console.error("SQLite connection error:", err);
    else console.log("Connected to SQLite database.");
});

// Create the users table if it doesn't exist
db.run("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT, money INTEGER)", (err) => {
    if (err) console.error(err);
});

// Create the autoroles table if it doesn't exist
db.run("CREATE TABLE IF NOT EXISTS autorole (guild_id TEXT PRIMARY KEY, role_id TEXT)", (err) => {
    if (err) console.error(err);
});

// Promisify db.get and db.run for async/await usage
const dbGet = promisify(db.get).bind(db);
const dbRun = (sql, params) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};

// Initialize bot
const client = new Client();
client.commands = new Collection();
const prefix = "s!";

// Initialize user-specific cooldowns
const userCooldowns = new Map();

// Function to create stylized embeds
function createEmbed(title, description, color = "#3498db") {
    return new Discord.MessageEmbed()
        .setTitle(`💎 ${title}`)
        .setDescription(description)
        .setColor(color)
        .setThumbnail("https://cdn.discordapp.com/emojis/1325286103351300137.webp?size=128&quality=lossless")
        .setTimestamp();
}

// Function to check if a user has 0 (or fewer) coins, and if so, reset to 500 and DM them
async function checkZeroBalance(userId, message) {
    try {
        let user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (user && user.money <= 0) {
            await dbRun("UPDATE users SET money = ? WHERE id = ?", [500, userId]);
            message.author.send(createEmbed(
                "Você perdeu tudo! 😞",
                "🚫 **Você perdeu todas as suas moedas.**\n💰 **Mas não se preocupe, você recebeu 500 moedas para continuar jogando!**\n🍀 **Boa sorte!**",
                "#e74c3c"
            ));
        }
    } catch (err) {
        console.error(err);
    }
}

// Listen for messages
client.on("message", async (message) => {
    if (!message.content.startsWith(prefix) || message.author.bot) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;
    
    // User-specific cooldown check (5 seconds per command)
    const now = Date.now();
    if (userCooldowns.has(userId)) {
        const expirationTime = userCooldowns.get(userId) + 5000; // 5 seconds cooldown
        if (now < expirationTime) {
            const timeLeft = Math.ceil((expirationTime - now) / 1000);
            return message.channel.send(createEmbed("Cooldown", `🚫 **Aguarde ${timeLeft} segundos para usar o comando novamente!**`, "#e74c3c"));
        }
    }
    // Set the cooldown for this user
    userCooldowns.set(userId, now);

    // REGISTER command
    if (command === "register") {
        try {
            let user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
            if (user) {
                return message.channel.send(createEmbed("Erro!", `🚫 **${message.author}, você já está registrado!**`, "#e74c3c"));
            }
            await dbRun("INSERT INTO users (id, username, money) VALUES (?, ?, ?)", [userId, message.author.tag, 1000]);
            return message.channel.send(createEmbed(
                "Registro Completo ✅",
                `🎉 **Bem-vindo, ${message.author}!**\n💰 Você recebeu **1,000 moedas**!`,
                "#2ecc71"
            ));
        } catch (err) {
            console.error(err);
            return message.channel.send(createEmbed("Erro!", "🚫 **Ocorreu um erro ao registrar.**", "#e74c3c"));
        }
    }

    // BALANCE command
    if (command === "balance") {
    try {
        const mentionedUser = message.mentions.users.first();
        const target = mentionedUser || message.author;
        const isBot = target.id === client.user.id;

        if (isBot) {
            // Gera valor entre 10 trilhões e 50 trilhões
            const min = 10 * 1e12;
            const max = 50 * 1e12;
            const richMoney = Math.floor(Math.random() * (max - min + 1)) + min;
            const formattedMoney = richMoney.toLocaleString("en-US");

            return message.channel.send(createEmbed(
                "Saldo do Bot 🤖💰",
                "👤 **Usuário:** " + target.toString() + "\n💰 **Saldo:** `" + formattedMoney + " moedas`",
                "#9b59b6"
            ));
        }

        let user = await dbGet("SELECT * FROM users WHERE id = ?", [target.id]);
        if (!user) {
            return message.channel.send(createEmbed(
                "Erro!",
                "🚫 **Usuário não registrado.**",
                "#e74c3c"
            ));
        }

        const formattedMoney = parseInt(user.money).toLocaleString("en-US");

        return message.channel.send(createEmbed(
            target.id === message.author.id ? "Seu Saldo 💰" : "Saldo do Usuário 💰",
            "👤 **Usuário:** " + target.toString() + "\n💰 **Saldo:** `" + formattedMoney + " moedas`",
            "#f1c40f"
        ));
    } catch (err) {
        console.error(err);
        return message.channel.send(createEmbed(
            "Erro!",
            "🚫 **Ocorreu um erro ao buscar o saldo.**",
            "#e74c3c"
        ));
    }
}


    // COINFLIP command
    if (command === "coinflip") {
        let bet = parseInt(args[0]);
        if (isNaN(bet) || bet <= 0)
            return message.channel.send(createEmbed("Erro!", "🚫 **Digite um valor válido para apostar!**", "#e74c3c"));
        try {
            let user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
            if (!user) return message.channel.send(createEmbed("Erro!", "🚫 **Registre-se primeiro com `s!register`!**", "#e74c3c"));
            if (user.money < bet) return message.channel.send(createEmbed("Erro!", "🚫 **Saldo insuficiente!**", "#e74c3c"));
            
            let newMoney = user.money - bet;
            if (Math.random() < 0.5) {
                // Lost
                await dbRun("UPDATE users SET money = ? WHERE id = ?", [newMoney, userId]);
                message.channel.send(createEmbed("🎲 Coinflip", "❌ **Você perdeu tudo!**", "#e74c3c"));
            } else {
                // Won: add winnings (bet * 2)
                newMoney += bet * 2;
                await dbRun("UPDATE users SET money = ? WHERE id = ?", [newMoney, userId]);
                message.channel.send(createEmbed("🎲 Coinflip", `✅ **Você ganhou ${bet * 2} moedas!**`, "#f1c40f"));
            }
            await checkZeroBalance(userId, message);
        } catch (err) {
            console.error(err);
            return message.channel.send(createEmbed("Erro!", "🚫 **Ocorreu um erro durante a jogada.**", "#e74c3c"));
        }
    }

if (command === "slots") {
    let bet = parseInt(args[0]);
    if (isNaN(bet) || bet <= 0)
        return message.channel.send(createEmbed("Erro!", "🚫 **Digite um valor válido para apostar!**", "#e74c3c"));

    try {
        let user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user)
            return message.channel.send(createEmbed("Erro!", "🚫 **Registre-se primeiro com `s!register`!**", "#e74c3c"));
        if (user.money < bet)
            return message.channel.send(createEmbed("Erro!", "🚫 **Saldo insuficiente!**", "#e74c3c"));

        // Símbolos com pesos pra aumentar chances
        const symbols = [
            "🍒", "🍒", "🍒", "🍒", "🍒",
            "🍋", "🍋", "🍋", "🍋",
            "🔔", "🔔", "🔔",
            "💎", "💎",
            "7️⃣",
            "🍀", "🍀", "🍀",
            "💣",
            "🥝", "🥝", "🥝", "🥝"
        ];

        const spin = () => Array.from({ length: 3 }, () => symbols[Math.floor(Math.random() * symbols.length)]);

        // Primeira rodada
        let currentResult = spin();
        let embed = createEmbed("🎰 Slots", `🎲 **Girando...** \n\`[❔][❔][❔]\``, "#f1c40f");
        const spinMsg = await message.channel.send(embed);

        // Animação de rolagem (4 frames)
        for (let i = 0; i < 4; i++) {
            currentResult = spin();
            const display = `\`[${currentResult.join("][")}]\``;
            const rollingEmbed = createEmbed("🎰 Slots", `🎲 **Girando...**\n${display}`, "#f1c40f");
            await wait(500);
            await spinMsg.edit(rollingEmbed);
        }

        // Contagem
        const counts = {};
        currentResult.forEach(sym => counts[sym] = (counts[sym] || 0) + 1);

        // Multiplicador
        let multiplier = 0;
        if (counts["7️⃣"] === 3) {
            multiplier = 150;
        } else if (Object.values(counts).includes(3)) {
            multiplier = 10;
        } else if ((counts["💎"] === 2 || counts["🍀"] === 2)) {
            multiplier = 5;
        } else if (Object.values(counts).includes(2)) {
            multiplier = 2;
        }

        const winnings = Math.floor(bet * multiplier);
        const newBalance = user.money - bet + winnings;
        await dbRun("UPDATE users SET money = ? WHERE id = ?", [newBalance, userId]);

        const resultDisplay = `\`[${currentResult.join("][")}]\``;
        const resultText = winnings > 0
            ? `✅ **Você ganhou ${winnings} moedas!**${multiplier >= 100 ? " 🤑 **JACKPOT!**" : ""}`
            : "❌ **Você perdeu tudo!**";

        const finalEmbed = createEmbed(
            "🎰 Slots",
            `🎲 **Resultado final:**\n${resultDisplay}\n\n${resultText}`,
            "#f1c40f"
        );

        await spinMsg.edit(finalEmbed);
        await checkZeroBalance(userId, message);

    } catch (err) {
        console.error(err);
        return message.channel.send(createEmbed("Erro!", "🚫 **Ocorreu um erro durante a jogada.**", "#e74c3c"));
    }
}

// Delay helper
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}



   // FORTUNETIGER command
if (command === "fortunetiger") {
    let bet = parseInt(args[0]);
    let spins = Math.min(parseInt(args[1]) || 1, 5);

    if (isNaN(bet) || bet <= 0 || isNaN(spins))
        return message.channel.send(createEmbed("Erro!", "🚫 **Digite valores válidos!**", "#e74c3c"));

    try {
        let user = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
        if (!user)
            return message.channel.send(createEmbed("Erro!", "🚫 **Registre-se primeiro com `s!register`!**", "#e74c3c"));

        if (user.money < bet * spins)
            return message.channel.send(createEmbed("Erro!", "🚫 **Saldo insuficiente!**", "#e74c3c"));

        let newMoney = user.money - bet * spins;
        let totalWinnings = 0;
        let results = [];

        const isHighBet = bet >= user.money * 0.25; // Apostando 25% ou mais

        for (let i = 0; i < spins; i++) {
            const roll = Math.random();
            let multiplier;

            if (isHighBet) {
                // Probabilidades melhores para apostas altas
                multiplier = roll < 0.05  ? 5
                            : roll < 0.15 ? 2
                            : roll < 0.30 ? 1.5
                            : roll < 0.55 ? 1.25
                            : roll < 0.80 ? 1
                            : roll < 0.95 ? 0.5
                            : 0;
            } else {
                // Probabilidades melhoradas para apostas normais
                multiplier = roll < 0.03 ? 5
                            : roll < 0.10 ? 2
                            : roll < 0.30 ? 1.5
                            : roll < 0.60 ? 1.25
                            : roll < 0.85 ? 1
                            : roll < 0.95 ? 0.5
                            : 0;
            }

            const winnings = Math.floor(bet * multiplier);
            totalWinnings += winnings;
            results.push(`🎰 **Giro ${i + 1}:** \`${winnings} moedas\``);
        }

        newMoney += totalWinnings;
        await dbRun("UPDATE users SET money = ? WHERE id = ?", [newMoney, userId]);

        message.channel.send(createEmbed(
            "🐅 Fortune Tiger",
            `${results.join("\n")}\n\n${totalWinnings > 0
                ? `💰 **Total ganho:** \`${totalWinnings} moedas\``
                : "❌ **Você não ganhou nada desta vez! Tente novamente.**"}`,
            "#f1c40f"
        ));

        await checkZeroBalance(userId, message);
    } catch (err) {
        console.error(err);
        return message.channel.send(createEmbed("Erro!", "🚫 **Ocorreu um erro durante a jogada.**", "#e74c3c"));
    }
}


    // PIX command
    if (command === "pix") {
        let mention = message.mentions.users.first();
        let value = parseInt(args[1]);
        
        if (!mention || mention.bot || mention.id === userId) {
            return message.channel.send(createEmbed("Erro!", "🚫 **Mencione um usuário válido (não pode ser você ou um bot)!**", "#e74c3c"));
        }
        if (isNaN(value) || value <= 0) {
            return message.channel.send(createEmbed("Erro!", "🚫 **Digite um valor válido para transferir!**", "#e74c3c"));
        }
        try {
            let sender = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
            if (!sender) return message.channel.send(createEmbed("Erro!", "🚫 **Registre-se primeiro com `s!register`!**", "#e74c3c"));
            if (sender.money < value) return message.channel.send(createEmbed("Erro!", "🚫 **Saldo insuficiente!**", "#e74c3c"));
            
            let newSenderMoney = sender.money - value;
            await dbRun("UPDATE users SET money = ? WHERE id = ?", [newSenderMoney, userId]);
            
            let recipient = await dbGet("SELECT * FROM users WHERE id = ?", [mention.id]);
            if (!recipient) {
                // If recipient is not registered, add them with 0 moedas
                await dbRun("INSERT INTO users (id, username, money) VALUES (?, ?, ?)", [mention.id, mention.tag, 0]);
                recipient = await dbGet("SELECT * FROM users WHERE id = ?", [mention.id]);
            }
            let newRecipientMoney = recipient.money + value;
            await dbRun("UPDATE users SET money = ? WHERE id = ?", [newRecipientMoney, mention.id]);
            
            message.channel.send(createEmbed(
                "💸 Pix",
                `✅ **Você transferiu ${value} moedas para ${mention.tag}!**`,
                "#f1c40f"
            ));
            await checkZeroBalance(userId, message);
        } catch (err) {
            console.error(err);
            return message.channel.send(createEmbed("Erro!", "🚫 **Ocorreu um erro durante a transferência.**", "#e74c3c"));
        }
    }
  
if (command === "autonsfw") {
    if (message.author.id !== ownerID) {
        return message.reply("❌ Somente o dono do bot pode utilizar este comando.");
    }

    if (!message.channel.nsfw) {
        return message.reply("❌ Esse comando somente pode ser utilizado em canais restritos a maiores de 18 anos.");
    }

    if (activeChannels.has(message.channel.id)) {
        return message.reply("⚠️ A postagem de NSFW automática já está ocorrendo neste canal!");
    }

    var args2 = message.content.split(" ").slice(1);
    var tags = args2.length > 0 ? args2.join("+") : "animated";

    message.reply(
        "✅ Postagem de NSFW automática inicializada com sucesso! " +
        "Tags: `" + tags.split("+").join(" ") + "`. " +
        "Agora postagens serão enviadas a cada 2 minutos."
    );

    var parseStringPromise = require("util")
        .promisify(require("xml2js").parseString);

    var interval = setInterval(async function () {
        var gifs = [];
        var usedPages = [];
        var attempts = 0;

        while (gifs.length < 10 && attempts < 20) {
            var page = Math.floor(Math.random() * 100) + 1;
            if (usedPages.indexOf(page) !== -1) {
                attempts++;
                continue;
            }
            usedPages.push(page);
            attempts++;

            try {
                var res = await fetch(
                    "https://api.rule34.xxx/index.php?" +
                    "page=dapi&s=post&q=index&limit=100&pid=" + page +
                    "&tags=" + tags
                );
                var body = await res.text();
                var result = await parseStringPromise(body);
            } catch (e) {
                // Pula página em caso de falha no fetch ou parse
                continue;
            }

            if (!result.posts || !result.posts.post) continue;

            for (var i = 0; i < result.posts.post.length; i++) {
                var url = result.posts.post[i].$.file_url;
                if (
                    (url.endsWith(".gif") || url.endsWith(".webm")) &&
                    gifs.indexOf(url) === -1
                ) {
                    gifs.push(url);
                }
                if (gifs.length >= 10) break;
            }
        }

        if (gifs.length === 0) {
            return message.channel.send(
                "⚠️ Nenhum NSFW encontrado para essas tags."
            );
        }

        for (var i = 0; i < gifs.length; i++) {
            var embed = new Discord.MessageEmbed()
                .setTitle("🔞 NSFW GIF")
                .setImage(gifs[i])
                .setColor("#ff0000")
                .setFooter("Powered by Rule34.xxx");

            message.channel.send(embed);
        }
    }, 2 * 60 * 1000);

    activeChannels.set(message.channel.id, interval);
}


if (command === "stopnsfw") {
    if (message.author.id !== ownerID) {
        return message.reply("❌ Somente o dono do bot pode parar a postagem automática.");
    }
    if (!activeChannels.has(message.channel.id)) {
        return message.reply("⚠️ Não tem nenhuma auto postagem ocorrendo no canal.");
    }

    clearInterval(activeChannels.get(message.channel.id));
    activeChannels.delete(message.channel.id);
    message.reply("🛑 Postagem de NSFW automática parada com sucesso.");
}
  // SETMOEDAS command (Admin only)
if (command === "setmoedas") {
    if (message.author.id !== ownerID) {
        return message.channel.send(createEmbed("Erro!", "🚫 **Apenas o dono do bot pode usar este comando!**", "#e74c3c"));
    }

    let targetUser = message.mentions.users.first();
    let amount = parseInt(args[1]);

    if (!targetUser || isNaN(amount)) {
        return message.channel.send(createEmbed("Erro!", "🚫 **Uso correto:** `s!setmoedas @usuário quantidade`", "#e74c3c"));
    }

    try {
        let user = await dbGet("SELECT * FROM users WHERE id = ?", [targetUser.id]);
        if (!user) {
            return message.channel.send(createEmbed("Erro!", "🚫 **Este usuário não está registrado!**", "#e74c3c"));
        }

        await dbRun("UPDATE users SET money = ? WHERE id = ?", [amount, targetUser.id]);
        return message.channel.send(createEmbed(
            "Saldo Atualizado ✅",
            `👤 **Usuário:** ${targetUser}\n💰 **Novo Saldo:** \`${amount.toLocaleString("en-US")} moedas\``,
            "#2ecc71"
        ));
    } catch (err) {
        console.error(err);
        return message.channel.send(createEmbed("Erro!", "🚫 **Ocorreu um erro ao atualizar o saldo.**", "#e74c3c"));
    }
}

  if (command === "embed") {
        if (!args.length) return message.channel.send("🚫 **Uso correto:** `!embed <mensagem>`");

        const embed = new Discord.MessageEmbed()
            .setColor("#3498db") // Cor azul, pode mudar
            .setDescription(args.join(" ")) // Junta os argumentos
            .setTimestamp()
            .setFooter(`Enviado por ${message.author.tag}`, message.author.displayAvatarURL());

        message.channel.send(embed);
    }

  
if (command === "addrole") {
    if (!message.member.hasPermission("MANAGE_ROLES")) {
        return message.channel.send(createEmbed(
            "Erro de Permissão",
            "🚫 Você precisa da permissão **Gerenciar Cargos** para usar este comando!",
            "#e74c3c"
        ));
    }

    const member = message.mentions.members.first();
    if (!member) {
        return message.channel.send(createEmbed(
            "Uso Incorreto",
            "🔧 Uso correto: `s!addrole @usuário <cargo>`\nVocê pode usar ID, menção (`<@&ID>`) ou parte do nome.",
            "#3498db"
        ));
    }

    // Monta a string de busca a partir de args (sem o mention)
    const search = args.slice(1).join(" ").trim();
    if (!search) {
        return message.channel.send(createEmbed(
            "Uso Incorreto",
            "🔧 Você precisa especificar um cargo (ID, menção ou nome parcial).",
            "#3498db"
        ));
    }

    // Tenta obter por ID puro ou menção
    let role =
        message.guild.roles.cache.get(search) ||
        message.guild.roles.cache.get(search.replace(/^<@&|>$/g, ""));

    // Se não encontrou, faz busca parcial pelo nome (case‑insensitive)
    if (!role) {
        const matches = message.guild.roles.cache.filter(r =>
            r.name.toLowerCase().includes(search.toLowerCase())
        );
        if (matches.size === 0) {
            return message.channel.send(createEmbed(
                "Cargo Não Encontrado",
                `🔍 Não achei nenhum cargo com nome parecido com \`${search}\`.`,
                "#e74c3c"
            ));
        }
        if (matches.size > 1) {
            const list = matches.map(r => `\`${r.name}\``).slice(0, 10).join(", ");
            return message.channel.send(createEmbed(
                "Múltiplos Resultados",
                `⚠️ Vários cargos correspondem a \`${search}\`: ${list}${matches.size > 10 ? ", …" : ""}.\nSeja mais específico ou use o ID.`,
                "#e74c3c"
            ));
        }
        role = matches.first();
    }

    try {
        await member.roles.add(role);

        // Extrai tag: primeiro tenta [conteúdo], senão emoji, senão primeira palavra
        const raw = role.name.trim();
        const bracket = raw.match(/^\[(.+?)\]/);
        let tag = bracket ? bracket[1]
            : (raw.match(/^(\p{Emoji}+)/u) || [])[1]
            || raw.split(/\s+/)[0];

        // Limpa qualquer prefixo [..] antigo do nickname
        const base = member.displayName.replace(/^(\[.*?\]\s*)+/, "");

        // Monta novo nickname e garante <=32 caracteres
        const newNick = `[${tag}] ${base}`.slice(0, 32);
        await member.setNickname(newNick);

        message.channel.send(createEmbed(
            "Cargo Adicionado com Sucesso",
            `✅ **Cargo:** ${role.name}\n👤 **Usuário:** ${member}\n📛 **Nickname atualizado:** \`${newNick}\``,
            "#2ecc71"
        ));
    } catch (error) {
        console.error("Erro no addrole:", error);
        const msg = error.code === 50013
            ? "❌ Sem permissão para gerenciar cargos ou nicknames!"
            : error.code === 50035
                ? "❌ Nickname muito longo (máx. 32 caracteres)!"
                : "Ocorreu um erro ao executar o comando!";
        message.channel.send(createEmbed("Erro", msg, "#e74c3c"));
    }
}
  if (command == "autorole") {
    if (!message.member.hasPermission("MANAGE_GUILD")) {
    return message.channel.send(createEmbed(
      "Permissão Negada",
      "🚫 Você precisa da permissão **Gerenciar Servidor** para usar este comando!",
      "#e74c3c"
    ));
  }

  const search = args.join(" ").trim();
  if (!search) {
    return message.channel.send(createEmbed(
      "Uso Incorreto",
      "🔧 Uso: `s!autorole <ID|menção|nome parcial do cargo>`",
      "#3498db"
    ));
  }

  // tenta por ID ou menção
  let role = message.guild.roles.cache.get(search)
          || message.guild.roles.cache.get(search.replace(/^<@&|>$/g, ""));

  // busca parcial se não encontrou
  if (!role) {
    const matches = message.guild.roles.cache.filter(r =>
      r.name.toLowerCase().includes(search.toLowerCase())
    );
    if (matches.size === 0) {
      return message.channel.send(createEmbed(
        "Cargo Não Encontrado",
        `🔍 Nenhum cargo encontrado parecido com \`${search}\`.`,
        "#e74c3c"
      ));
    }
    if (matches.size > 1) {
      const list = matches.map(r => `\`${r.name}\``).slice(0, 10).join(", ");
      return message.channel.send(createEmbed(
        "Múltiplos Resultados",
        `⚠️ Vários cargos correspondem a \`${search}\`: ${list}${matches.size > 10 ? ", …" : ""}.`,
        "#e74c3c"
      ));
    }
    role = matches.first();
  }

  try {
    // salva ou atualiza
    await dbRun(
      "INSERT OR REPLACE INTO autorole (guild_id, role_id) VALUES (?, ?)",
      [message.guild.id, role.id]
    );
    return message.channel.send(createEmbed(
      "Autorole Configurado",
      `✅ O cargo **${role.name}** será atribuído automaticamente a quem entrar.`,
      "#2ecc71"
    ));
  } catch (err) {
    console.error("Erro no autorole:", err);
    return message.channel.send(createEmbed(
      "Erro",
      "❌ Falha ao salvar autorole no banco de dados.",
      "#e74c3c"
    ));
  }
}
  
  if (command === "noautorole") {
    // Verifica se o autor da mensagem tem permissão de administrador
    if (!message.member.hasPermission("MANAGE_GUILD")) {
        return message.channel.send(createEmbed(
            "Permissão Negada",
            "🚫 Você precisa da permissão **Gerenciar Servidor** para usar este comando.",
            "#e74c3c"
        ));
    }

    // Remove o autorole da guilda
    db.run("DELETE FROM autorole WHERE guild_id = ?", [message.guild.id], function(err) {
        if (err) {
            console.error("Erro ao remover autorole:", err);
            return message.channel.send(createEmbed(
                "Erro",
                "❌ Ocorreu um erro ao tentar remover o autorole.",
                "#e74c3c"
            ));
        }

        if (this.changes === 0) {
            return message.channel.send(createEmbed(
                "Nenhum Autorole Encontrado",
                "ℹ️ Nenhum autorole estava configurado nesta guilda.",
                "#f1c40f"
            ));
        }

        message.channel.send(createEmbed(
            "Autorole Removido",
            "✅ O autorole foi removido com sucesso desta guilda.",
            "#2ecc71"
        ));
    });
}

});

// 3) LISTENER guildMemberAdd
client.on("guildMemberAdd", async member => {
  try {
    // busca a configuração
    const row = await dbGet(
      "SELECT role_id FROM autorole WHERE guild_id = ?",
      [member.guild.id]
    );
    if (!row) return;

    const role = member.guild.roles.cache.get(row.role_id);
    if (!role) return;

    // atribui cargo
    await member.roles.add(role);

    // lógica de tag (igual ao addrole)
    const raw = role.name.trim();
    const bracket = raw.match(/^\[(.+?)\]/);
    let tag = bracket
      ? bracket[1]
      : (raw.match(/^(\p{Emoji}+)/u) || [])[1]
        || raw.split(/\s+/)[0];

    // limpa prefixos antigos no nickname
    const base = member.displayName.replace(/^(\[.*?\]\s*)+/, "");

    // monta novo nickname e limita 32 chars
    const newNick = `[${tag}] ${base}`.slice(0, 32);
    await member.setNickname(newNick);

    // sem mensagem no canal
  } catch (err) {
    console.error("Erro no autorole ao adicionar membro:", err);
    // sem throw nem reply
  }
});

client.on("ready", () => {
  console.log(`🤖 Bot logado como ${client.user.tag}`);
});


// Bot login
client.login(process.env.BOT2_TOKEN);