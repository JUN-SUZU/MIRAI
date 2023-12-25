const { SlashCommandBuilder } = require('discord.js');
module.exports = {
	data: new SlashCommandBuilder()
		.setName('setup')
		.setDescription('MIRAIのセットアップを開始します。'),
	execute: async function(interaction) {
		await interaction.reply('MIRAIのセットアップが進行中です。しばらくお待ちください。');
	},
};