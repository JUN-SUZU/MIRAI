const config = require('./config.json');
const { Client } = require('pg');

class DB {
    constructor() {
        this.client = new Client({
            user: config.db.user,
            host: config.db.host,
            database: config.db.database,
            password: config.db.password,
            port: config.db.port,
        });
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
            return res.rows;
        } catch (err) {
            console.error('クエリエラー', err.stack);
            throw err;
        }
    }
};

module.exports = DB;
