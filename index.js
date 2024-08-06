const config = require('./config.json');
// discord.js
const { ActionRowBuilder, ActivityType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits, PermissionsBitField } = require('discord.js');
// http
const http = require('http');
// reCAPTCHA Enterprise
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
// 2Factor Authentication
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
// other modules
const fs = require('fs');
const cron = require('node-cron');
const database = require('./db.js');
const db = new database();
let tfaWaitingAccount = {};
let tfaAppSecretCache = {};
const baseColor = '#7fffd2';

const httpServer = http.createServer((req, res) => {
    let url = req.url.replace(/\?.*$/, '');
    let method = req.method;
    let ipadr = getIPAddress(req);
    checkIP(ipadr);
    if (method === 'GET') {
        console.log(`requested: GET ${url} data: ${req.headers['user-agent']} ip: ${ipadr}`);
        if (url.endsWith('/')) url += 'index.html';
        if (url.replace('../', '') !== url) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('Forbidden');
            return;
        }
        fs.readFile(`./docs${url}`, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
            } else {
                if (url.endsWith('.html')) res.writeHead(200, { 'Content-Type': 'text/html' });
                else if (url.endsWith('.css')) res.writeHead(200, { 'Content-Type': 'text/css' });
                else if (url.endsWith('.js')) res.writeHead(200, { 'Content-Type': 'text/javascript' });
                else if (url.endsWith('.ico')) res.writeHead(200, { 'Content-Type': 'image/x-icon' });
                else res.writeHead(200);
                res.end(data);
            }
        });
    }
    else if (method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk.toString();
        });
        req.on('end', () => {
            console.log(`requested: POST ${url} data: ${body} ip: ${ipadr}`);
            if (url === '/auth/api/') {
                let data = body.split('&');
                let lang = data[0].split('=')[1];
                let age = data[1].split('=')[1];
                let token = data[2].split('=')[1];
                let discordID = data[3].split('=')[1];
                let miraiKey = data[4].split('=')[1];
                db.read('account');
                if (!db.auth(discordID, miraiKey)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result: 'fail' }));
                    return;
                }
                db.read('ip');
                db.accountData[discordID].lang = lang;
                db.accountData[discordID].age = age;
                db.accountData[discordID].country = db.ipData[ipadr].countryCode;
                db.accountData[discordID].authDate = new Date().toLocaleString();
                db.accountData[discordID].vpn = db.ipData[ipadr].vpn;
                createAssessment(token).then((score) => {
                    if (score >= 0.8) {
                        db.accountData[discordID].robot = false;
                        res.writeHead(200);
                        res.end(fs.readFileSync('./docs/auth/api/success.html'));
                    } else {
                        db.accountData[discordID].robot = true;
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(fs.readFileSync('./docs/auth/api/fail.html'));
                    }
                    db.write('account');
                    updateRole(null, discordID);
                });
                return;
            }
            let data = {};
            try {
                data = JSON.parse(body);
                if (url === '/login/api/') {
                    if (!db.ipData[ipadr].status) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    getDiscordToken(data.code).then((token) => {
                        getUserData(token).then((user) => {
                            if (!user.id) {
                                res.writeHead(403, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ result: 'fail' }));
                                return;
                            }
                            db.read('account');
                            let miraiKey = Math.random().toString(36).slice(-8);
                            if (!db.accountData[user.id]) {
                                db.accountData[user.id] = {
                                    username: user.username,
                                    globalName: user["global_name"],
                                    email: user.email,
                                    avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
                                    verified: user.verified,
                                    sessions: {}
                                };
                            }
                            if (db.accountData[user.id].tfa !== undefined) {
                                tfaWaitingAccount[user.id] = miraiKey;
                                res.writeHead(200, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ result: 'tfa', userID: user.id, miraiKey: miraiKey }));
                                return;
                            }
                            db.accountData[user.id].sessions[miraiKey] = {
                                ip: ipadr,
                                ua: req.headers['user-agent'],
                                vpn: db.ipData[ipadr].vpn,
                                firstdate: new Date().toLocaleString(),
                                lastdate: new Date().toLocaleString(),
                                enabled: true
                            };
                            db.accountData[user.id].lastsession = miraiKey;
                            db.write('account');
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ result: 'success', userID: user.id, miraiKey: miraiKey }));
                        });
                    }).catch((e) => {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                    });
                }
                else if (url === '/login/api/tfa/') {
                    db.read('account');
                    if (!tfaWaitingAccount[data.userID]) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const verified = speakeasy.totp.verify({
                        secret: db.accountData[data.userID].tfa.app.secret,
                        encoding: 'base32',
                        token: data.code
                    });
                    if (verified) {
                        db.accountData[data.userID].sessions[tfaWaitingAccount[data.userID]] = {
                            ip: ipadr,
                            ua: req.headers['user-agent'],
                            vpn: db.ipData[ipadr].vpn,
                            firstdate: new Date().toLocaleString(),
                            lastdate: new Date().toLocaleString(),
                            enabled: true
                        };
                        db.accountData[data.userID].lastsession = tfaWaitingAccount[data.userID];
                        db.write('account');
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'success', userID: data.userID, miraiKey: tfaWaitingAccount[data.userID] }));
                        delete tfaWaitingAccount[data.userID];
                    }
                    else {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                    }
                }
                else if (url === '/account/api/') {
                    db.read('account');
                    let userData = db.accountData[data.userID];
                    if (!db.auth(data.userID, data.miraiKey)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        username: userData.username,
                        globalName: userData.globalName,
                        avatar: userData.avatar,
                        authorized: userData.authDate && !userData.robot ? true : false,
                        authDate: userData.authDate,
                        tfa: userData.tfa !== undefined ? true : false,
                        tfaMethod: userData.tfa !== undefined ? userData.tfa.method : null,
                        tfaDate: userData.tfa !== undefined ? userData.tfa.date : null
                    }));
                }
                else if (url === '/account/logout/') {
                    db.read('account');
                    if (!db.auth(data.userID, data.miraiKey)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    db.accountData[data.userID].sessions[data.miraiKey].enabled = false;
                    db.write('account');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result: 'success' }));
                }
                else if (url === '/account/tfa/') {
                    db.read('account');
                    if (!db.auth(data.userID, data.miraiKey)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    if (data.method === 'app') {
                        let secret = speakeasy.generateSecret({
                            length: 20,
                            name: db.accountData[data.userID].username,
                            issuer: 'MIRAI'
                        });
                        let otpurl = speakeasy.otpauthURL({
                            secret: secret.ascii,
                            label: encodeURIComponent(db.accountData[data.userID].username),
                            issuer: 'MIRAI'
                        });
                        let qrFileName = Math.random().toString(36).slice(-8);
                        QRCode.toFile(`./docs/tfa/qrcode/${qrFileName}.png`, otpurl, function (err) {
                            if (err) console.error(err);
                        });
                        tfaAppSecretCache[data.userID] = secret.base32;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ QRCode: `${config.url}/tfa/qrcode/${qrFileName}.png`, secret: secret.base32 }));
                        console.log(`${config.url}/tfa/qrcode/${qrFileName}.png`);
                    }
                    else if (data.method === 'appCode') {
                        const verified = speakeasy.totp.verify({
                            secret: tfaAppSecretCache[data.userID],
                            encoding: 'base32',
                            token: data.code
                        });
                        if (verified) {
                            db.accountData[data.userID].tfa = {
                                method: 'app',
                                date: new Date().toLocaleString(),
                                app: {
                                    enabled: true,
                                    secret: tfaAppSecretCache[data.userID]
                                }
                            };
                            db.write('account');
                            delete tfaAppSecretCache[data.userID];
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ result: 'success' }));
                            client.guilds.cache.forEach((guild) => {
                                if (guild.members.cache.has(data.userID)) {
                                    updateRole(guild.id, data.userID);
                                }
                            });
                        }
                        else {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ result: 'fail' }));
                        }
                    }
                }
                else if (url === '/setting/servers/api/') {
                    db.read('account');
                    if (!db.auth(data.userID, data.miraiKey)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    let servers = [];
                    db.read('server');
                    client.guilds.cache.forEach(guild => {
                        if (!guild.members.cache.has(data.userID)) {
                            return;// メンバーでない場合はスキップ
                        }
                        if (!db.serverData[guild.id]) {
                            // サーバーの初期設定がされていない場合
                            if (guild.ownerId === data.userID) {
                                // オーナーのみ
                                servers.push({
                                    id: guild.id,
                                    name: guild.name
                                });
                            }
                        }
                        else if (guild.members.cache.get(data.userID).permissions.has(PermissionsBitField.Administrator)) {
                            // サーバーの初期設定がされている場合
                            // 管理者権限を持っている場合は表示
                            servers.push({
                                id: guild.id,
                                name: guild.name
                            });
                        }
                    });
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(servers));
                }
                else if (url === '/setting/server/api/') {
                    db.read('account');
                    if (!db.auth(data.userID, data.miraiKey)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    db.read('server');
                    if (!db.serverData[data.serverID]) {
                        db.serverData[data.serverID] = {
                            country: null,
                            lang: null,
                            danger: true,
                            notice: true,
                            channel: null,
                            role: null,
                            tfa: false,
                            robot: true,
                            vpn: true,
                            excluded: []
                        };
                    }
                    let guild = client.guilds.cache.get(data.serverID);
                    db.serverData[data.serverID].serverName = guild.name;
                    db.serverData[data.serverID].channels = guild.channels.cache.map((channel) => {
                        return {
                            id: channel.id,
                            name: channel.name
                        };
                    });
                    db.serverData[data.serverID].roles = guild.roles.cache.map((role) => {
                        return {
                            id: role.id,
                            name: role.name
                        };
                    }).filter((role) => role.name !== '@everyone');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(db.serverData[data.serverID]));
                }
                else if (url === '/setting/server/update/api/') {
                    db.read('account');
                    db.read('server');
                    if (!db.auth(data.userID, data.miraiKey)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    delete data.miraiKey;
                    db.serverData[data.serverID] = data;
                    db.write('server');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ result: 'success' }));
                    updateRole(data.serverID);
                }
            } catch (e) {
                console.error(e);
            }
        });
    }
});

function getIPAddress(req) {
    if (req.headers['x-forwarded-for']) {
        return req.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
    } else if (req.connection.remoteAddress) {
        return req.connection.remoteAddress;
    } else {
        return req.socket.remoteAddress;
    }
}

function checkIP(ipadr) {
    db.read('ip');
    // http://ip-api.com/json/{query}?fields=status,message,country,countryCode,region,city,timezone,isp,org,proxy にアクセスしてVPNかどうかを判定
    if (db.ipData[ipadr] && !db.ipData[ipadr].status) return;
    fetch(`http://ip-api.com/json/${ipadr}?fields=180251`)
        .then(response => response.json())
        .then(data => {
            if (data.status === 'fail') {
                console.log(`Failed to get IP data: ${data.message}`);
                db.ipData[ipadr] = { status: false };
            }
            db.ipData[ipadr] = {
                status: true,
                country: data.country,
                countryCode: data.countryCode,
                regionName: data.regionName,
                city: data.city,
                vpn: data.proxy
            };
            db.write('ip');
        });
}

async function getDiscordToken(code) {
    const data = {
        client_id: config.clientID,
        client_secret: config.clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: config.url + '/login/',
        scope: 'identify email'
    };
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(data),
    };
    const response = await fetch('https://discord.com/api/oauth2/token', options);
    const json = await response.json();
    return json.access_token;
}

async function getUserData(token) {
    const options = {
        headers: {
            Authorization: `Bearer ${token}`
        }
    };
    const response = await fetch('https://discord.com/api/users/@me', options);
    return await response.json();
}

/**
  * 評価を作成して UI アクションのリスクを分析する。
  *
  * projectID: Google Cloud プロジェクト ID
  * recaptchaSiteKey: サイト / アプリに関連付けられた reCAPTCHA キー
  * token: クライアントから取得した生成トークン。
  * recaptchaAction: トークンに対応するアクション名。
  */
async function createAssessment(token) {
    const projectID = "mirai-1716871528113";
    const recaptchaKey = "6Lc-KespAAAAAAXHezZCb2OKM63wu7MxM3Su7IU_";
    const recaptchaAction = "auth";
    // reCAPTCHA クライアントを作成する。
    // TODO: クライアント生成コードをキャッシュに保存するか（推奨）、メソッドを終了する前に client.close() を呼び出す。
    const client = new RecaptchaEnterpriseServiceClient();
    const projectPath = client.projectPath(projectID);

    // 評価リクエストを作成する。
    const request = ({
        assessment: {
            event: {
                token: token,
                siteKey: recaptchaKey,
            },
        },
        parent: projectPath,
    });

    const [response] = await client.createAssessment(request);

    // トークンが有効かどうかを確認する。
    if (!response.tokenProperties.valid) {
        console.log(`The CreateAssessment call failed because the token was: ${response.tokenProperties.invalidReason}`);
        return null;
    }

    // 想定どおりのアクションが実行されたかどうかを確認する。
    // The `action` property is set by user client in the grecaptcha.enterprise.execute() method.
    if (response.tokenProperties.action === recaptchaAction) {
        // リスクスコアと理由を取得する。
        // 評価の解釈の詳細については、以下を参照:
        // https://cloud.google.com/recaptcha-enterprise/docs/interpret-assessment
        console.log(`The reCAPTCHA score is: ${response.riskAnalysis.score}`);
        response.riskAnalysis.reasons.forEach((reason) => {
            console.log(reason);
        });

        return response.riskAnalysis.score;
    } else {
        console.log("The action attribute in your reCAPTCHA tag does not match the action you are expecting to score");
        return null;
    }
}

httpServer.listen(config.port, () => {
    console.log(`Server is running at http://127.0.0.1:${config.port}`);
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.MessageContent
    ]
});
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('Mirai', { type: ActivityType.WATCHING });
    updateRole();
});
client.on('guildCreate', async (guild) => {
    // サーバーの所有者に設定画面のURLをDMで送信
    const owner = await guild.fetchOwner();
    owner.send(`このBotの設定画面はこちらです: ${config.url}/setting/server/?id=${guild.id}`);
    // サーバーのメンバーを取得
    guild.members.fetch();
});
// 新規メンバー参加時のイベント
client.on('guildMemberAdd', async (member) => {
    db.read('account');
    if (!db.accountData[member.user.id]) {
        // 認証要求メッセージを送信
        const embed = new EmbedBuilder()
            .setTitle('認証')
            .setDescription('認証を行うには、リンクにアクセスしてください。自宅のネットワークからパソコンを使ってアクセスすることをお勧めします。\n' +
                `こちらのリンクをクリックしてください: [認証](${config.url}/login/)`)
            .setColor(baseColor)
        try {
            await member.send({ embeds: [embed] });
        }
        catch (e) {
            console.log('Could not send DM');
        }
    }
    else {
        // ロールの更新
        updateRole(member.guild.id, member.user.id);
    }
});

client.on('guildMemberRemove', async (member) => {
    console.log(`${member.user.tag} has left the server`);
});

client.on('messageCreate', async (message) => {
    let permission = message.channel.permissionsFor(client.user);
    if (!permission.has(PermissionsBitField.SendMessages)) return;
    let content = message.content;
    db.read('server');
    if (!db.serverData[message.guild.id]) {
        return;
    }
    // bad keyword 'onlyfan' 'leaks' 'nsfw' 'nudes' 大文字小文字を区別しない
    // discord.gg/ を含む
    // @everyone が必ず含まれている場合のみ
    if ((content.match(/onlyfan/i) || content.match(/leaks/i) || content.match(/nsfw/i) || content.match(/nudes/i)) &&
        content.includes('@everyone') &&
        content.includes('https://discord.gg/') &&
        db.serverData[message.guild.id].danger) {
        db.read('blacklist');
        if (!db.blacklistData[message.author.id]) {
            db.blacklistData[message.author.id] = {}
        }
        db.blacklistData[message.author.id].count = (db.blacklistData[message.author.id].count || 0) + 1;
        if (!db.blacklistData[message.author.id].log) {
            db.blacklistData[message.author.id].log = [];
        }
        db.blacklistData[message.author.id].log.push({
            date: new Date().toLocaleString(),
            message: content,
            server: message.guild.name,
            channel: message.channel.name,
        });
        db.write('blacklist');
        message.delete();
        message.reply('不適切なメッセージが検出されたため削除しました。');
        // タイムアウトする
        message.member.timeout(5 * 60 * 1000, '不適切なメッセージを送信したため')
            .then(console.log)
            .catch(console.error);
    }
});

// 1日に1回メンバーリストの修正を行う
cron.schedule('0 0 * * *', () => {
    updateRole();
});

async function updateRole(guildID = null, discordID = null) {
    if (!guildID) {
        client.guilds.cache.forEach((guild) => {
            updateRole(guild.id, discordID);
        });
        return;
    }
    db.read('server')
    db.read('account');
    db.read('blacklist');
    let guild = client.guilds.cache.get(guildID);
    if (!db.serverData[guildID]) return;
    let role = guild.roles.cache.get(db.serverData[guildID].role);
    if (!role) return;
    await guild.members.fetch();
    if (role.position > guild.members.cache.get(client.user.id).roles.highest.position) {   // ロールが自分のロールより上にある場合はスキップ
        console.log("HELLO I'M NO PERM;;" + guild.name);
        return;
    }
    guild.members.cache.forEach((member) => {
        if (member.user.bot) return;
        if (discordID && member.user.id !== discordID) return;
        try {
            if (db.serverData[guildID].excluded.includes(member.user.username)) {
                if (!member.roles.cache.has(db.serverData[guildID].role)) {
                    member.roles.add(guild.roles.cache.get(db.serverData[guildID].role));
                }
            }
            else {
                let userData = db.accountData[member.user.id];
                if (!userData || (userData.robot && db.serverData[guildID].robot) ||
                    (userData.vpn && db.serverData[guildID].vpn) ||
                    userData.age < 13 ||
                    (db.serverData[guildID].lang && userData.lang !== db.serverData[guildID].lang) ||
                    (db.serverData[guildID].country && userData.country !== db.serverData[guildID].country) ||
                    (db.serverData[guildID].danger && db.blacklistData[member.user.id] && db.blacklistData[member.user.id].count > 0) ||
                    (db.serverData[guildID].tfa && userData.tfa == undefined)) {
                    if (member.roles.cache.has(db.serverData[guildID].role)) {
                        member.roles.remove(guild.roles.cache.get(db.serverData[guildID].role));
                    }
                }
                else if (!member.roles.cache.has(db.serverData[guildID].role)) {
                    member.roles.add(guild.roles.cache.get(db.serverData[guildID].role));
                }
            }
        }
        catch (e) {
            console.error(e);
        }
    });
}

client.login(config.token);
