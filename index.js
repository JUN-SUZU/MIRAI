const config = require('./config.json');
// discord.js
const { ActionRowBuilder, ActivityType, ChannelType, Client, Collection, EmbedBuilder, Events, GatewayIntentBits, PermissionsBitField, getUserAgentAppendix } = require('discord.js');
// http
const http = require('http');
// url
const { URLSearchParams } = require('url');
// reCAPTCHA Enterprise
const { RecaptchaEnterpriseServiceClient } = require('@google-cloud/recaptcha-enterprise');
// 2Factor Authentication
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
// other modules
const fs = require('fs');
const cron = require('node-cron');
const Database = require('./db.js');
const { parse } = require('path');
const { use } = require('react');
const db = new Database();
const ipCache = {};
let tfaAppSecretCache = {};
const baseColor = '#7fffd2';

const httpServer = http.createServer((req, res) => {
    let url = req.url.replace(/\?.*$/, '');
    let method = req.method;
    let ipadr = getIPAddress(req);
    checkIP(ipadr);
    const logFilePath = `./accesslog/${new Date().getMonth() + 1}-${new Date().getDate()}.log`;
    if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, 'Access Log\n');
    }
    if (method === 'GET') {
        fs.appendFileSync(logFilePath, `GET ${url} ${req.headers['user-agent']} ${ipadr}\n`);
        // XSS 対策
        if (req.url.includes('<') || req.url.includes('>')) {
            // 303 See Other
            // パラメータを削除してリダイレクト
            console.log('Redirected');
            res.writeHead(303, { 'Location': url });
            res.end();
            return;
        }
        if (url.endsWith('/')) url += 'index.html';
        if (!url.split('/').splice(-1)[0].includes('.')) url += '/index.html';
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
        req.on('end', async () => {
            fs.appendFileSync(logFilePath, `POST ${url} ${req.headers['user-agent']} ${ipadr} data: ${body}\n`);
            // SecureCookieを取得
            const { user_id, session_id } = parseCookies(req);
            if (url === '/auth/api/') {
                let data = body.split('&');
                let lang = data[0].split('=')[1];
                let birthday = data[1].split('=')[1];
                let token = data[2].split('=')[1];
                if (!lang || !birthday || !token) {
                    res.writeHead(403, { 'Content-Type': 'text/html' });
                    res.end(fs.readFileSync('./docs/auth/api/fail.html'));
                    return;
                }
                const miraiAuth = await db.users.session.update({
                    session_id: session_id,
                    user_id: user_id,
                    ip: ipadr,
                    last_date: new Date().toISOString(),
                    expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                });
                if (miraiAuth !== "authSuccessSessionUpdated") {
                    res.writeHead(403, { 'Content-Type': 'text/html' });
                    res.end(fs.readFileSync('./docs/auth/api/fail.html'));
                    return;
                }
                createAssessment(token).then(async (score) => {
                    let robot = false;
                    if (score >= 0.8) {
                        robot = false;
                        res.writeHead(200);
                        res.end(fs.readFileSync('./docs/auth/api/success.html'));
                    } else {
                        robot = true;
                        res.writeHead(403, { 'Content-Type': 'text/html' });
                        res.end(fs.readFileSync('./docs/auth/api/fail.html'));
                    }
                    await db.users.upsert.auth({
                        user_id: user_id,
                        lang: lang,
                        birthday: birthday,
                        country: ipDataResponse.rows[0].country,
                        authDate: new Date().toISOString(),
                        vpn: ipDataResponse.rows[0].vpn,
                        robot: robot
                    });
                    updateRole(null, user_id);
                });
                return;
            }
            let data = {};
            try {
                data = JSON.parse(body);
                if (url === '/login/api/') {
                    if (!ipCache[ipadr] || !ipCache[ipadr].verified) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const oauth2TokenResponse = await fetch('https://discord.com/api/oauth2/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: new URLSearchParams({
                            client_id: config.clientID,
                            client_secret: config.clientSecret,
                            grant_type: 'authorization_code',
                            code: data.code,
                            redirect_uri: config.url + '/login/',
                            scope: 'identify email'
                        }),
                    }).then(res => res.json());
                    if (!oauth2TokenResponse.access_token) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const userDataResponse = await fetch('https://discord.com/api/users/@me', {
                        headers: {
                            Authorization: `Bearer ${oauth2TokenResponse.access_token}`,
                        },
                    }).then(res => res.json());
                    if (!userDataResponse.id) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    await db.users.upsert.nonAuth({
                        user_id: userDataResponse.id,
                        username: userDataResponse.username,
                        global_name: userDataResponse.global_name || null,
                        avatar: userDataResponse.avatar || null
                    });
                    await db.users.upsert.oAuth2({
                        user_id: userDataResponse.id,
                        email: userDataResponse.email,
                        verified: userDataResponse.verified,
                        refresh_token: oauth2TokenResponse.refresh_token,
                        discord_token_expires_at: new Date(Date.now() + oauth2TokenResponse.expires_in * 1000).toISOString(),
                    });
                    const sessionID = crypto.createHash('sha256').update(Math.random().toString(36).slice(-8)).digest('hex');
                    // sessionを作成
                    await db.users.session.insert({
                        session_id: sessionID,
                        user_id: userDataResponse.id,
                        ip: ipadr,
                        ua: req.headers['user-agent'],
                        vpn: ipCache[ipadr].vpn,
                        firstdate: new Date().toLocaleString(),
                        lastdate: new Date().toLocaleString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString(),
                        enabled: !dbResponse.rows[0].tfa_enabled
                    });
                    // dbResponse.rows[0].tfa_enabledがtrueの場合はTFAを要求する
                    if (dbResponse.rows[0].tfa_enabled) {
                        const tfaTimeLimit = 90;
                        await db.users.tfa.addTemp({
                            user_id: userDataResponse.id,
                            session_id: sessionID,
                            issued_at: new Date().toLocaleString(),
                            expires_at: new Date(Date.now() + tfaTimeLimit * 1000).toISOString(),
                        });
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Set-Cookie': [
                                `user_id=${userDataResponse.id}; Max-Age=${tfaTimeLimit}; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                                `session_id=${sessionID}; Max-Age=${tfaTimeLimit}; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                            ]
                        });
                        res.end(JSON.stringify({ result: 'tfa' }));
                        return;
                    }
                    else {
                        // 14日間のセッションを作成(14日以内に更新すれば引き続き使用可能)
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Set-Cookie': [
                                `user_id=${userDataResponse.id}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                                `session_id=${sessionID}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                            ]
                        });
                        res.end(JSON.stringify({ result: 'success' }));
                    }
                }
                else if (url === '/login/api/tfa/') {
                    const tfa_tmp = await db.users.tfa.getTemp({
                        session_id: data.sessionID,
                        user_id: user_id
                    });
                    if (!tfa_tmp || tfa_tmp.rowCount === 0) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const secret = await db.users.tfa.getSecret({
                        user_id: user_id
                    });
                    if (!secret) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const verified = speakeasy.totp.verify({
                        secret: secret,
                        encoding: 'base32',
                        token: data.code
                    });
                    if (verified) {
                        // セッションを有効化
                        await db.users.session.enable({
                            session_id: data.sessionID,
                            user_id: user_id
                        });
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Set-Cookie': [
                                `user_id=${user_id}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                                `session_id=${data.sessionID}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                            ]
                        });
                        res.end(JSON.stringify({ result: 'success' }));
                        await db.users.tfa.deleteTemp({
                            session_id: data.sessionID,
                            user_id: user_id
                        });
                    }
                    else {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                    }
                }
                else if (url === '/account/api/') {
                    const sessionChallenge = await db.users.session.update({
                        session_id: session_id,
                        user_id: user_id,
                        ip: ipadr,
                        last_date: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                    });
                    const deviceAccounts = data.deviceAccounts;// linked_accountsに追加
                    if (deviceAccounts) {
                        // デバイスアカウントarrayを登録
                        await db.users.link.set(deviceAccounts);
                    }

                    if (sessionChallenge === "sessionNotFound") {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    else if (sessionChallenge === "ipNotMatchSessionDisabled") {
                        if (!ipCache[ipadr] || !ipCache[ipadr].verified) {
                            res.writeHead(403, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ result: 'fail' }));
                            return;
                        }
                        // 新しいIDでセッションを作成
                        const sessionID = crypto.createHash('sha256').update(Math.random().toString(36).slice(-8)).digest('hex');
                        await db.users.session.insert({
                            session_id: sessionID,
                            user_id: user_id,
                            ip: ipadr,
                            ua: req.headers['user-agent'],
                            vpn: ipCache[ipadr].vpn,
                            firstdate: new Date().toLocaleString(),
                            lastdate: new Date().toLocaleString(),
                            expires_at: new Date(Date.now() + 1209600 * 1000).toISOString(),
                            enabled: false
                        });
                        // データを取得して返す
                        const userData = await db.users.getById(user_id);
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Set-Cookie': [
                                `user_id=${user_id}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                                `session_id=${sessionID}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                            ]
                        });
                        res.end(JSON.stringify({
                            result: 'success',
                            username: userData.username,
                            globalName: userData.globalName,
                            avatar: userData.avatar,
                            authorized: userData.authDate && (!userData.robot ? true : false) && (!userData.vpn ? true : false),
                            authDate: userData.authDate,
                            tfa: userData.tfa_enabled,
                            tfaMethod: userData.tfa_method,
                            tfaDate: userData.tfa_issued_at,
                        }));
                    }
                    else if (sessionChallenge === "authSuccessSessionUpdated") {
                        // データを取得して返す
                        const userData = await db.users.getById(user_id);
                        res.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Set-Cookie': [
                                `user_id=${user_id}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                                `session_id=${session_id}; Max-Age=1209600; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                            ]
                        });
                        res.end(JSON.stringify({
                            result: 'success',
                            username: userData.username,
                            globalName: userData.globalName,
                            avatar: userData.avatar,
                            authorized: userData.authDate && (!userData.robot ? true : false) && (!userData.vpn ? true : false),
                            authDate: userData.authDate,
                            tfa: userData.tfa_enabled,
                            tfaMethod: userData.tfa_method,
                            tfaDate: userData.tfa_issued_at,
                        }));
                    }
                }
                else if (url === '/account/logout/') {
                    const sessionChallenge = await db.users.session.update({
                        session_id: session_id,
                        user_id: user_id,
                        ip: ipadr,
                        last_date: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                    });
                    if (sessionChallenge !== "authSuccessSessionUpdated") {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    // セッションを無効化
                    await db.users.session.logout({
                        session_id: session_id
                    });
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Set-Cookie': [
                            `user_id=; Max-Age=0; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                            `session_id=; Max-Age=0; Secure; HttpOnly; SameSite=None; Domain=.jun-suzu.net; Path=/`,
                        ]
                    });
                    res.end(JSON.stringify({ result: 'success' }));
                }
                else if (url === '/account/tfa/') {
                    const sessionChallenge = await db.users.session.update({
                        session_id: session_id,
                        user_id: user_id,
                        ip: ipadr,
                        last_date: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                    });
                    if (sessionChallenge !== "authSuccessSessionUpdated") {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const userDataResponse = await db.users.getById(user_id);
                    if (data.method === 'app') {
                        let secret = speakeasy.generateSecret({
                            length: 20,
                            name: userDataResponse.rows[0].username,
                            issuer: 'MIRAI'
                        });
                        let otpurl = speakeasy.otpauthURL({
                            secret: secret.ascii,
                            label: encodeURIComponent(userDataResponse.rows[0].username),
                            issuer: 'MIRAI'
                        });
                        let qrFileName = Math.random().toString(36).slice(-8);
                        QRCode.toFile(`./docs/tfa/qrcode/${qrFileName}.png`, otpurl, function (err) {
                            if (err) console.error(err);
                        });
                        tfaAppSecretCache[user_id] = secret.base32;
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ QRCode: `${config.url}/tfa/qrcode/${qrFileName}.png`, secret: secret.base32 }));
                    }
                    else if (data.method === 'appCode') {
                        const verified = speakeasy.totp.verify({
                            secret: tfaAppSecretCache[user_id],
                            encoding: 'base32',
                            token: data.code
                        });
                        if (verified) {
                            await db.users.tfa.addMethod({
                                user_id: user_id,
                                tfa_enabled: true,
                                tfa_method: 'app',
                                tfa_app_secret: tfaAppSecretCache[user_id],
                                tfa_issued_at: new Date().toISOString()
                            });
                            delete tfaAppSecretCache[user_id];
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ result: 'success' }));
                            client.guilds.cache.forEach((guild) => {
                                if (guild.members.cache.has(user_id)) {
                                    updateRole(guild.id, user_id);
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
                    const sessionChallenge = await db.users.session.update({
                        session_id: session_id,
                        user_id: user_id,
                        ip: ipadr,
                        last_date: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                    });
                    if (sessionChallenge !== "authSuccessSessionUpdated") {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    // ユーザーが所属しているサーバーのIDを取得
                    const memberGuildIds = client.guilds.cache.filter(guild => {
                        return guild.members.cache.has(user_id);
                    }).map(guild => {
                        return guild.id;
                    });
                    let servers = [];
                    const guildDataResponse = await db.guilds.get(memberGuildIds);
                    if (!guildDataResponse || guildDataResponse.rowCount === 0) return;
                    memberGuildIds.forEach(guildId => {
                        const guild = client.guilds.cache.get(guildId);
                        if (!guild) return;
                        const guildData = guildDataResponse.rows.find(guild => guild.guild_id === guildId);
                        if (!guildData) {
                            if (guild.ownerId === user_id) {
                                // 初期設定がされていないサーバーは、オーナーのみ表示
                                servers.push({
                                    id: guild.id,
                                    name: guild.name
                                });
                            }
                        }
                        else if (guild.members.cache.get(user_id).permissions.has(PermissionsBitField.Flags.Administrator)) {
                            // 初期設定がされているサーバーは、全ての管理者に表示
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
                    const sessionChallenge = await db.users.session.update({
                        session_id: session_id,
                        user_id: user_id,
                        ip: ipadr,
                        last_date: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                    });
                    if (sessionChallenge !== "authSuccessSessionUpdated") {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    let guild = client.guilds.cache.get(data.serverID);
                    guild.members.fetch();
                    if (!guild.members.cache.has(user_id)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const guildDataResponse = await db.guilds.get([data.serverID]);
                    if (((!guildDataResponse || guildDataResponse.rowCount === 0) && guild.ownerId !== user_id) ||
                        !guild.members.cache.has(user_id).permissions.has(PermissionsBitField.Flags.Administrator)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    let serverData = Object.assign({}, guildDataResponse.rows[0]);
                    serverData.serverName = guild.name;
                    serverData.channels = guild.channels.cache.filter((channel) => {
                        return channel.type === ChannelType.GuildText;
                    }).map((channel) => {
                        return {
                            id: channel.id,
                            name: channel.name
                        };
                    });
                    serverData.roles = guild.roles.cache.filter((role) => {
                        return role.name !== '@everyone' && !role.managed && role.editable;
                    }).map((role) => {
                        return {
                            id: role.id,
                            name: role.name
                        };
                    });
                    db.write('server');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(serverData));
                }
                else if (url === '/setting/server/update/api/') {
                    const sessionChallenge = await db.users.session.update({
                        session_id: session_id,
                        user_id: user_id,
                        ip: ipadr,
                        last_date: new Date().toISOString(),
                        expires_at: new Date(Date.now() + 1209600 * 1000).toISOString()
                    });
                    if (sessionChallenge !== "authSuccessSessionUpdated") {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    let guild = client.guilds.cache.get(data.serverID);
                    guild.members.fetch();
                    if (!guild.members.cache.has(user_id)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    const guildDataResponse = await db.guilds.get([data.serverID]);
                    if (((!guildDataResponse || guildDataResponse.rowCount === 0) && guild.ownerId !== user_id) ||
                        !guild.members.cache.has(user_id).permissions.has(PermissionsBitField.Flags.Administrator)) {
                        res.writeHead(403, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ result: 'fail' }));
                        return;
                    }
                    // サーバーの設定を更新
                    db.guilds.set({
                        guild_id: data.serverID,
                        name: guild.name,
                        owner_id: user_id,
                        lang: data.lang,
                        country: data.country,
                        channel_id: data.channel_id,
                        role_id: data.role_id,
                        tfa_required: data.tfa_required,
                        vpn_check: data.vpn_check,
                        robot_check: data.robot_check,
                        spam_protection_level: data.spam_protection_level,
                        auth_exempt_settings: data.auth_exempt_settings,
                        notice_enabled: data.notice_enabled
                    });
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

// IPアドレスに関連する情報を取得する
let checkingIPList = [];
async function checkIP(ipadr) {
    // http://ip-api.com/json/{query}?fields=status,message,country,countryCode,region,city,timezone,isp,org,proxy にアクセスしてVPNかどうかを判定
    if (!ipCache[ipadr] || !ipCache[ipadr].verified) {
        ipCache[ipadr] = await db.ipAddresses.get(ipadr).then(res => {
            if (res.rowCount === 0) {
                return { verified: false };
            }
            else {
                return res.rows[0];
            }
        });
    }
    if (ipCache[ipadr].verified) {
        return;
    }
    if (checkingIPList.includes(ipadr)) return;
    checkingIPList.push(ipadr);
    const ipDataResponse = await fetch(`http://ip-api.com/json/${ipadr}?fields=180251`);
    checkingIPList = checkingIPList.filter(ip => ip !== ipadr);
    if (ipDataResponse.status !== 200) {
        console.log(`Failed to get IP data: ${ipDataResponse.statusText}`);
        if (ipDataResponse.status === 429) {
            console.log(`Rate limit exceeded for IP: ${ipadr}. Retrying in 30 seconds.`);
            setTimeout(() => {
                checkIP(ipadr);
            }, 1000 * 30);
            return;
        }
    }
    else {
        const data = await ipDataResponse.json();
        if (data.status === 'fail') {
            console.log(`Failed to get IP data: ${data.message}`);
            return;
        }
        db.ipAddresses.set({
            address: ipadr,
            country: data.country,
            country_code: data.countryCode,
            region_name: data.regionName,
            city: data.city,
            vpn: data.proxy
        });
        ipCache[ipadr] = {
            verified: true,
            country: data.country,
            country_code: data.countryCode,
            region_name: data.regionName,
            city: data.city,
            vpn: data.proxy
        };
    }
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
    await client.guilds.fetch();
    updateRole();
    let memberCount = 0;
    client.guilds.cache.forEach((guild) => {
        memberCount += guild.memberCount;
    });
    client.user.setActivity(`Mirai | ${memberCount} users`, { type: ActivityType.WATCHING });
});
client.on('guildCreate', async (guild) => {
    // サーバーの所有者に設定画面のURLをDMで送信
    const owner = await guild.fetchOwner();
    owner.send(`このBotの設定画面はこちらです: ${config.url}/setting/server/?id=${guild.id}`)
        .catch(e => {
            console.error(e);
            console.log('I can\'t tell anything to the owner');
        });
    // サーバーのメンバーを取得
    guild.members.fetch();
});
// 新規メンバー参加時のイベント
client.on('guildMemberAdd', async (member) => {
    // 認証が完了していない場合は、認証を要求するメッセージを送信
    const userDataResponse = await db.users.getById(member.user.id);
    if (!userDataResponse || userDataResponse.rowCount === 0) {
        // ユーザーデータが存在しない場合は、非認証情報を作成
        await db.users.upsert.nonAuth({
            user_id: member.user.id,
            username: member.user.username,
            global_name: member.user.globalName || null,
            avatar: member.user.avatar || null
        });
    }
    if (!userDataResponse || userDataResponse.rowCount === 0 || !userDataResponse.rows[0].auth_date) {
        const embed = new EmbedBuilder()
            .setTitle('認証')
            .setDescription('認証を行うには、リンクにアクセスしてください。自宅のネットワークからパソコンを使ってアクセスすることをお勧めします。\n' +
                `こちらのリンクをクリックしてDiscordでログインし、認証プロセスを完了させてください: [認証](${config.url}/login/)`)
            .setColor(baseColor);
        await member.send({ embeds: [embed] })
            .catch(e => {
                console.error(e);
            });
    }
    // ロールの更新
    updateRole(member.guild.id, member.user.id);
});

client.on('guildMemberRemove', async (member) => {
    console.log(`${member.user.tag} has left the server`);
});

// BOT以外がロールの更新をした時にupdateRoleを実行
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (oldMember.roles.cache.size === newMember.roles.cache.size) return;
    const auditLogs = await newMember.guild.fetchAuditLogs({ type: 25, limit: 1 });
    const logEntry = auditLogs.entries.first();
    if (!logEntry || logEntry.executor.bot) return;
    if (logEntry.target.id === newMember.id) {
        updateRole(newMember.guild.id, newMember.id);
    }
});

client.on('messageCreate', async (message) => {
    let permission = message.channel.permissionsFor(client.user);
    if (!permission.has(PermissionsBitField.Flags.SendMessages)) return;
    let content = message.content;
    const guildDataResponse = await db.guilds.get([message.guild.id]);
    if (!guildDataResponse || guildDataResponse.rowCount === 0) return;
    const guildData = guildDataResponse.rows[0];
    // bad keyword 'onlyfan' 'leaks' 'nsfw' 'nudes' 大文字小文字を区別しない
    // discord.gg/ を含む
    // @everyone が必ず含まれている場合のみ
    if ((content.match(/onlyfan/i) || content.match(/leaks/i) || content.match(/nsfw/i) || content.match(/nudes/i) || content.match(/今すぐ/i)) &&
        content.includes('@everyone') &&
        content.includes('https://discord.gg/') &&
        guildData.spam_protection_level >= 1) {
        await db.users.restrict.add({
            user_id: message.author.id,
            username: message.author.username,
            reason: '不適切なメッセージを送信したため',
            restriction_type: 'timeout',
            action_time: new Date().toISOString(),
            handler: 'SystemTemp',
            notes: `メッセージ内容: ${content.substring(0, 30)}...`
        });
        message.delete();
        message.reply('不適切なメッセージが検出されたため削除しました。');
        // タイムアウトする
        message.member.timeout(5 * 60 * 1000, '不適切なメッセージを送信したため')
            .then(console.log)
            .catch(console.error);
        sendNotice(message.guild.id, `不適切なメッセージが検出されました。ユーザー: ${message.author.tag} サーバー: ${message.guild.name} チャンネル: ${message.channel.name} 日時: ${new Date().toLocaleString()} メッセージ: ${content}`);
    }
});

// 1日に1回メンバーリストの修正を行う
cron.schedule('0 0 * * *', () => {
    updateRole();
});

async function sendNotice(guildID, message) {
    // db.read('server');
    // const guild = client.guilds.cache.get(guildID);
    // if (!db.serverData[guildID] || (db.serverData[guildID] && db.serverData[guildID].notice)) {
    //     const owner = await guild.fetchOwner();
    //     owner.send(message).catch(e => {
    //         console.error(e);
    //         console.log('I can\'t tell anything to the owner');
    //         return false;
    //     }).then(() => {
    //         return true;
    //     });
    // }
    const guildDataResponse = await db.guilds.get([guildID]);
    const guild = client.guilds.cache.get(guildID);
    if (!guildDataResponse || guildDataResponse.rowCount === 0 || guildDataResponse.rows[0].notice_enabled) {
        const owner = await guild.fetchOwner();
        owner.send(message).catch(e => {
            console.error(e);
            console.log('I can\'t tell anything to the owner');
            return false;
        }).then(() => {
            return true;
        });
    }
    else {
        const channel = guild.channels.cache.get(guildDataResponse.rows[0].channel_id);
        if (!channel) return;
        const permissions = channel.permissionsFor(client.user);
        if (!permissions.has(PermissionsBitField.Flags.ViewChannel) ||
            !permissions.has(PermissionsBitField.Flags.SendMessages) ||
            !permissions.has(PermissionsBitField.Flags.EmbedLinks) ||
            !permissions.has(PermissionsBitField.Flags.AttachFiles) ||
            channel.type == ChannelType.GuildForum) {
            const owner = await guild.fetchOwner();
            owner.send(`通知チャンネルにメッセージを送信する権限がありません。通知チャンネルの権限を確認してください。`)
                .catch(e => {
                    console.error(e);
                    console.log('I can\'t tell anything to the owner');
                    return false;
                }).then(() => {
                    return true;
                });
        }
        else {
            const embed = new EmbedBuilder()
                .setTitle('通知')
                .setDescription(message)
                .setColor(baseColor);
            channel.send({ embeds: [embed] }).catch(e => {
                console.error(e);
                return false;
            }).then(() => {
                return true;
            });
        }
    }
}

async function updateRole(guildID = null, discordID = null) {
    if (!guildID) {
        await client.guilds.fetch();
        client.guilds.cache.forEach((guild) => {
            updateRole(guild.id, discordID);
        });
        return;
    }
    db.read('server')
    db.read('account');
    db.read('blacklist');
    const dbGuilds = await db.guilds.get([guildID]);
    if (!dbGuilds || dbGuilds.rowCount === 0) return;
    let guild = client.guilds.cache.get(guildID);
    let role = guild.roles.cache.get(dbGuilds.rows[0].role_id);
    if (!role) return;
    await guild.members.fetch();
    let me = guild.members.me;
    let lackPermissions = [];
    if (role.position > me.roles.highest.position) lackPermissions.push('ロールの位置');
    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) lackPermissions.push('ロールの管理');
    if (!role.editable) lackPermissions.push('設定したロールの編集');
    if (lackPermissions.length > 0) {
        console.log("HELLO I'M NO PERM;;" + guild.name);
        sendNotice(guildID, `Botの権限が不足しているため、ロールの更新ができません。次の権限を付与してください: ${lackPermissions.join(', ')}`);
        return;
    }
    guild.members.cache.forEach((member) => {
        if (member.user.bot) return;
        if (discordID && member.user.id !== discordID) return;
        const exempt = dbGuilds.rows[0]?.auth_exempt_settings?.[member.user.id]?.expires_at;
        if (exempt && new Date(exempt) > new Date()) {
            // 認証免除設定がある場合は、ロールを付与
            if (!member.roles.cache.has(dbGuilds.rows[0].role_id)) {
                member.roles.add(guild.roles.cache.get(dbGuilds.rows[0].role_id))
            }
        }
        else {
            // let userData = db.accountData[member.user.id];
            const userDataResponse = db.users.getById(member.user.id);
            if (!userDataResponse || userDataResponse.rowCount === 0 || userDataResponse.rows[0].auth_date == null ||
                (userDataResponse.rows[0].vpn && dbGuilds.rows[0].vpn_check) ||
                (userDataResponse.rows[0].robot && dbGuilds.rows[0].robot_check) ||
                getAge(userDataResponse.rows[0].birthday) < 13 ||
                (dbGuilds.rows[0].lang && userDataResponse.rows[0].lang !== dbGuilds.rows[0].lang) ||
                (dbGuilds.rows[0].country && userDataResponse.rows[0].country !== dbGuilds.rows[0].country) ||
                (dbGuilds.rows[0].danger && db.blacklistData[member.user.id] && db.blacklistData[member.user.id].count > 0) ||
                (dbGuilds.rows[0].tfa_required && !userDataResponse.rows[0].tfa_enabled)) {
                    // ユーザーデータが存在しない、または認証されていない、または認証条件を満たしていない場合は、ロールを削除
                    if (member.roles.cache.has(dbGuilds.rows[0].role_id)) {
                        member.roles.remove(guild.roles.cache.get(dbGuilds.rows[0].role_id))
                            .catch(e => {
                                console.error(`Failed to remove role from ${member.user.tag}: ${e.message}`);
                            });
                    }
            }
            else if (!member.roles.cache.has(dbGuilds.rows[0].role_id)) {
                // ユーザーデータが存在し、認証されている場合は、ロールを付与
                member.roles.add(guild.roles.cache.get(dbGuilds.rows[0].role_id))
                    .catch(e => {
                        console.error(`Failed to add role to ${member.user.tag}: ${e.message}`);
                    });
            }
        }
    });
}

function getAge(birthday) {
    if (!birthday) return 0;
    let now = new Date();
    let birth = new Date(birthday);
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

client.login(config.token);
