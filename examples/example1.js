/*
This script will find trees and cut them down.
- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
*/
'use strict';

const autoBot = require("./autoBot_plugin.js").autobot;
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('autobot_config.json'));

let botId = process.argv[2]
botId = !botId ? '' : '_' + botId.toString();

const bot = mineflayer.createBot({
	host: config.host,
	port: config.port,
	username: `${config.username}${botId}`,
	password: config.password
});

bot.loadPlugin(autobot);
bot.on('autobot.ready', bot.autobot.lumberjack.harvestNearestTree);
bot.on('bot_stuck', bot.autobot.onBotStuck);
bot.on('autobot.lumberjack.done', (result) => {
	if (result.error) {
		console.log(result.error);
		return;
	}
	console.log(result.description);
	bot.autobot.harvestNearestTree();
});
