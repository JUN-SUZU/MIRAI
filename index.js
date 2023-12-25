const { Client, Events, GatewayIntentBits } = require('discord.js');
const https = require('https');
const fs = require('fs');

const config = require('./config.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, c => {
	console.log(`準備OKです! ${c.user.tag}がログインします。`);
});

// ログインする
client.login(config.token);