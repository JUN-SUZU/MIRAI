const { link } = require('fs');
const config = require('./config.json');
const { Client } = require('pg');
const { use } = require('react');

class Database {
    constructor() {
        this.client = new Client({
            user: config.db.user,
            host: config.db.host,
            database: config.db.database,
            password: config.db.password,
            port: config.db.port,
        });
        const users = {
            getById: async (userId) => {
                const sql = 'SELECT * FROM users WHERE user_id = $1';
                const params = [userId];
                return await this.query(sql, params);
            },
            list: async (limit = 10, offset = 0) => {
                const sql = 'SELECT * FROM users ORDER BY user_id LIMIT $1 OFFSET $2';
                const params = [limit, offset];
                return await this.query(sql, params);
            },
            upsert: {
                nonAuth: async (userObj) => {
                    // サーバーの全ユーザーの情報を保存
                    const sql = `
                            INSERT INTO users (user_id, username, global_name, avatar)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (user_id) DO UPDATE
                            SET username = EXCLUDED.username,
                                global_name = EXCLUDED.global_name,
                                avatar = EXCLUDED.avatar;
                            `;
                    const params = [
                        userObj.user_id,
                        userObj.username,
                        userObj.global_name,
                        userObj.avatar
                    ];
                    return await this.query(sql, params);
                },
                oAuth2: async (userObj) => {
                    // Discord OAuth2認証で取得したユーザー情報を保存
                    const sql = `
                            INSERT INTO users (user_id, email, verified, refresh_token, discord_token_expires_at)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (user_id) DO UPDATE
                            SET email = EXCLUDED.email,
                                verified = EXCLUDED.verified,
                                refresh_token = EXCLUDED.refresh_token,
                                discord_token_expires_at = EXCLUDED.discord_token_expires_at;
                            `;
                    const params = [
                        userObj.user_id,
                        userObj.email,
                        userObj.verified,
                        userObj.refresh_token,
                        userObj.discord_token_expires_at
                    ];
                    return await this.query(sql, params);
                },
                auth: async (userObj) => {
                    // MIRAI認証で取得したユーザー情報を保存
                    const sql = `
                            INSERT INTO users (user_id, lang, birthday, country, auth_date, vpn, robot)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            ON CONFLICT (user_id) DO UPDATE
                            SET lang = EXCLUDED.lang,
                                birthday = EXCLUDED.birthday,
                                country = EXCLUDED.country,
                                auth_date = EXCLUDED.auth_date,
                                vpn = EXCLUDED.vpn,
                                robot = EXCLUDED.robot;
                            `;
                    const params = [
                        userObj.user_id,
                        userObj.lang,
                        userObj.birthday,
                        userObj.country,
                        userObj.auth_date,
                        userObj.vpn,
                        userObj.robot
                    ];
                    return await this.query(sql, params);
                }
            },
            deleteById: async (userId) => {
                const sql = 'DELETE FROM users WHERE user_id = $1 RETURNING *';
                const params = [userId];
                return await this.query(sql, params);
            },
            session: {
                getByUserId: async (userId) => {
                    const sql = 'SELECT * FROM sessions WHERE user_id = $1';
                    const params = [userId];
                    return await this.query(sql, params);
                },
                insert: async (sessionObj) => {
                    // セッションを新規作成
                    const sql = `
                            INSERT INTO sessions (session_id, user_id, ip, ua, vpn, first_date, last_date, expires_at, enabled)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                            ON CONFLICT (session_id) DO NOTHING
                            RETURNING *`;
                    const params = [
                        sessionObj.session_id,
                        sessionObj.user_id,
                        sessionObj.ip,
                        sessionObj.ua,
                        sessionObj.vpn,
                        sessionObj.first_date,
                        sessionObj.last_date,
                        sessionObj.expires_at,
                        sessionObj.enabled
                    ];
                    return await this.query(sql, params);
                },
                update: async (sessionObj) => {
                    // ipアドレスが一致する場合は、セッションの有効期限を更新
                    const sql = `
                            UPDATE sessions
                            SET last_date = $1, expires_at = $2
                            WHERE session_id = $3 AND user_id = $4 AND ip = $5
                            AND expires_at > NOW() AND enabled = true
                            RETURNING *`;
                    const params = [
                        sessionObj.last_date,
                        sessionObj.expires_at,
                        sessionObj.session_id,
                        sessionObj.user_id,
                        sessionObj.ip
                    ];
                    const result = await this.query(sql, params);
                    if (result.rowCount === 0) {
                        // ipアドレスが不一致の場合は、同じidのセッションを無効化する
                        const resultDisable = await this.user.session.disableOnIpMismatch(sessionObj);
                        if (resultDisable.rowCount !== 0) return "ipNotMatchSessionDisabled";
                        else return "sessionNotFound";
                    }
                    else return "authSuccessSessionUpdated";
                },
                disableOnIpMismatch: async (sessionObj) => {
                    // ipアドレスが不一致の場合は、同じidのセッションを無効化する
                    const sql = `
                            UPDATE sessions
                            SET enabled = false
                            WHERE session_id = $1 AND user_id = $2 AND ip != $3
                            RETURNING *`;
                    const params = [
                        sessionObj.session_id,
                        sessionObj.user_id,
                        sessionObj.ip
                    ];
                    return await this.query(sql, params);
                },
                enable: async (sessionObj) => {
                    // セッションを有効化
                    const sql = `
                            UPDATE sessions
                            SET enabled = true
                            WHERE session_id = $1 AND user_id = $2
                            AND expires_at > NOW() AND enabled = false
                            RETURNING *`;
                    const params = [
                        sessionObj.session_id,
                        sessionObj.user_id
                    ];
                    return await this.query(sql, params);
                },
                logout: async (sessionObj) => {
                    const sql = `
                            UPDATE sessions
                            SET enabled = false
                            WHERE session_id = $1
                            RETURNING *`;
                    const params = [
                        sessionObj.session_id
                    ];
                    return await this.query(sql, params);
                }
            },
            tfa: {
                addMethod: async (userObj) => {
                    // ユーザーのTFAメソッドを追加
                    const sql = `
                            INSERT INTO users (user_id, tfa_enabled, tfa_method, tfa_app_secret, tfa_issued_at)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT (user_id) DO UPDATE
                            SET tfa_enabled = EXCLUDED.tfa_enabled,
                                tfa_method = EXCLUDED.tfa_method,
                                tfa_app_secret = EXCLUDED.tfa_app_secret,
                                tfa_issued_at = EXCLUDED.tfa_issued_at;
                            `;
                    const params = [
                        userObj.user_id,
                        userObj.tfa_enabled,
                        userObj.tfa_method,
                        userObj.tfa_app_secret,
                        userObj.tfa_issued_at
                    ];
                    return await this.query(sql, params);
                },
                getSecret: async (userObj) => {
                    // ユーザーのTFAシークレットを取得
                    const sql = `
                            SELECT tfa_app_secret FROM users WHERE user_id = $1
                            AND tfa_enabled = true`;
                    const params = [
                        userObj.user_id
                    ];
                    const result = await this.query(sql, params);
                    if (result.rowCount === 0) return null;
                    if (result.rows[0].tfa_app_secret === null) return null;
                    return result.rows[0].tfa_app_secret;
                },
                addTemp: async (tfaTmpObj) => {
                    // tfa_tmpにsession_idを保存
                    const sql = `
                            INSERT INTO tfa_tmp (session_id, user_id, issued_at, expires_at)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT (session_id) DO NOTHING
                            RETURNING *`;
                    const params = [
                        tfaTmpObj.session_id,
                        tfaTmpObj.user_id,
                        tfaTmpObj.issued_at,
                        tfaTmpObj.expires_at
                    ];
                    return await this.query(sql, params);
                },
                getTemp: async (tfaTmpObj) => {
                    // TFAの検証
                    const sql = `
                            SELECT * FROM tfa_tmp WHERE session_id = $1 AND user_id = $2
                            AND expires_at > NOW()`;
                    const params = [
                        tfaTmpObj.session_id,
                        tfaTmpObj.user_id
                    ];
                    return await this.query(sql, params);
                },
                deleteTemp: async (tfaTmpObj) => {
                    // TFAの検証に成功したら、tfa_tmpから削除
                    const sql = `
                            DELETE FROM tfa_tmp WHERE session_id = $1 AND user_id = $2
                            RETURNING *`;
                    const params = [
                        tfaTmpObj.session_id,
                        tfaTmpObj.user_id
                    ];
                    return await this.query(sql, params);
                }
            },
            link: {
                get: async (userObj) => {
                    // ユーザーのリンク情報を取得
                    const sql = `
                            SELECT DISTINCT u.*
                            FROM linked_accounts la
                            JOIN users u ON (
                                (la.base_user_id = $1 AND u.user_id = la.linked_user_id)
                            OR (la.linked_user_id = $1 AND u.user_id = la.base_user_id)
                            );
                            `;
                    const params = [
                        userObj.user_id
                    ];
                    return await this.query(sql, params);
                },
                set: async (accounts) => {
                    // ユーザーのリンク情報を追加
                    const placeholders = [];
                    const params = [];
                    for (let i = 0; i < accounts.length; i++) {
                        for (let j = i + 1; j < accounts.length; j++) {
                            if (accounts[i].user_id !== accounts[j].user_id) {
                                params.push(accounts[i].user_id, accounts[j].user_id);
                            }
                        }
                    }
                    for (let i = 0; i < params.length; i += 2) {
                        placeholders.push(`($${i + 1}, $${i + 2})`);
                    }
                    const sql = `
                            INSERT INTO linked_accounts (base_user_id, linked_user_id)
                            VALUES ${placeholders.join(',')}
                            ON CONFLICT (base_user_id, linked_user_id) DO NOTHING
                            RETURNING *`;
                    return await this.query(sql, params);
                }
            },
            restrict: {
                get: async (userId) => {
                    // ユーザーの制限情報を取得
                    const sql = 'SELECT * FROM restricts WHERE user_id = $1';
                    const params = [userId];
                    return await this.query(sql, params);
                },
                add: async (restrictObj) => {
                    // ユーザーの制限情報を保存
                    const sql = `
                            INSERT INTO restricted_logs (user_id, username, reason, restriction_type, action_time, handler, notes)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                            RETURNING *`;
                    const params = [
                        restrictObj.user_id,
                        restrictObj.username,
                        restrictObj.reason,
                        restrictObj.restriction_type,
                        restrictObj.action_time,
                        restrictObj.handler,
                        restrictObj.notes
                    ];
                    return await this.query(sql, params);
                },
                getActiveRestrictions: async (userId) => {
                    // ユーザーの制限タイプを取得
                    const sql = `
                            SELECT restriction_type
                            FROM restricts
                            WHERE user_id = $1 AND lifted_at IS NULL`;
                    const params = [userId];
                    const result = await this.query(sql, params);
                    const restrictionTypes = result.rows.map(row => row.restriction_type);
                    // 重複を排除
                    return [...new Set(restrictionTypes)];
                },
                forgive: async (userId) => {
                    // ユーザーの制限を解除
                    const sql = `
                            UPDATE restricts
                            SET lifted_at = NOW()
                            WHERE user_id = $1 AND lifted_at IS NULL
                            RETURNING *`;
                    const params = [userId];
                    return await this.query(sql, params);
                }
            }
        }
        const guilds = {
            get: async (guildId) => {
                // ギルドの情報を取得
                const sql = 'SELECT * FROM guilds WHERE guild_id = $1';
                const params = [guildId];
                return await this.query(sql, params);
            },
            list: async (guildIds) => {
                // ギルドの情報を取得
                const sql = 'SELECT * FROM guilds WHERE guild_id = ANY($1)';
                const params = [guildIds];
                return await this.query(sql, params);
            },
            set: async (guildObj) => {
                // ギルドの情報を保存
                const sql = `
                        INSERT INTO guilds (guild_id, name, owner_id, lang, country, channel_id, role_id, tfa_required, vpn_check, robot_check, spam_protection_level, auth_exempt_settings, notice_enabled, created_at, updated_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
                        ON CONFLICT (guild_id) DO UPDATE
                        SET name = EXCLUDED.name,
                            owner_id = EXCLUDED.owner_id,
                            lang = EXCLUDED.lang,
                            country = EXCLUDED.country,
                            channel_id = EXCLUDED.channel_id,
                            role_id = EXCLUDED.role_id,
                            tfa_required = EXCLUDED.tfa_required,
                            vpn_check = EXCLUDED.vpn_check,
                            robot_check = EXCLUDED.robot_check,
                            spam_protection_level = EXCLUDED.spam_protection_level,
                            auth_exempt_settings = EXCLUDED.auth_exempt_settings,
                            notice_enabled = EXCLUDED.notice_enabled,
                            updated_at = NOW()
                        RETURNING *`;
                const params = [
                    guildObj.guild_id,
                    guildObj.name,
                    guildObj.owner_id,
                    guildObj.lang,
                    guildObj.country,
                    guildObj.channel_id,
                    guildObj.role_id,
                    guildObj.tfa_required,
                    guildObj.vpn_check,
                    guildObj.robot_check,
                    guildObj.spam_protection_level,
                    guildObj.auth_exempt_settings,
                    guildObj.notice_enabled
                ];
                return await this.query(sql, params);
            }
        }
        const ipAddresses = {
            get: async (ipAddress) => {
                // ipアドレスの情報を取得
                const sql = 'SELECT * FROM ip_addresses WHERE ip_address = $1';
                const params = [ipAddress];
                return await this.query(sql, params);
            },
            set: async (ipInfo) => {
                // ipアドレスの情報を保存
                const sql = `
                        INSERT INTO ip_addresses (ip_address, verified, country, country_code, region_name, city, vpn, updated_at)
                        VALUES ($1, TRUE, $2, $3, $4, $5, $6, NOW())
                        ON CONFLICT (ip_address) DO UPDATE
                        SET verified = TRUE,
                            country = EXCLUDED.country,
                            country_code = EXCLUDED.country_code,
                            region_name = EXCLUDED.region_name,
                            city = EXCLUDED.city,
                            vpn = EXCLUDED.vpn,
                            updated_at = NOW()
                        RETURNING *`;
                const params = [
                    ipInfo.address,
                    ipInfo.country,
                    ipInfo.country_code,
                    ipInfo.region_name,
                    ipInfo.city,
                    ipInfo.vpn
                ];
                return await this.query(sql, params);
            }
        }
        this.users = users;
        this.guilds = guilds;
        this.ipAddresses = ipAddresses;
    }
    async connect() {
        try {
            await this.client.connect();
            console.log("PostgreSQLに接続成功");
        } catch (err) {
            console.error('接続エラー', err.stack);
        }
    }
    async disconnect() {
        try {
            await this.client.end();
            console.log("PostgreSQLから切断成功");
        } catch (err) {
            console.error('切断エラー', err.stack);
        }
    }
    async query(sql, params) {
        try {
            const res = await this.client.query(sql, params);
            return res;
        } catch (err) {
            console.error('クエリエラー', err.stack);
            return null;
        }
    }
};

module.exports = Database;
