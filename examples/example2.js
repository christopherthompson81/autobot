/*
This script will find trees and cut them down.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
- AND
- It will craft a wooden axe if it needs one
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

function botLoop() {
	if (!bot.autobot.inventory.haveAxe()) {
		bot.autobot.autocraft.autoCraft(
			bot.mcData.itemsByName['wooden_axe'].id,
			1,
			bot.autobot.lumberjack.harvestNearestTree
		)
	}
	else {
		bot.autobot.lumberjack.harvestNearestTree();
	}
}

bot.on('autobot.ready', botLoop);
bot.on('bot_stuck', bot.autobot.onBotStuck);
bot.on('autobot.navigator.arrivedHome', botLoop);
bot.on('autobot.lumberjack.done', (result) => {
	console.log(result.description);
	if (result.error) return;
	botLoop();
});
