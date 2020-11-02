
/*
This script will harvest trees and ore.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
(X) - It will craft a wooden axe if it needs one
- It will mine ore if it has a pickaxe
(X) - It will craft a wooden pickaxe if it needs one
AND
- it will craft all tools of the best type (up to iron) it can make, with spares
- (*) Not self-sufficient on iron production at this point.
*/
'use strict';

const mineflayer = require('mineflayer');
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
	if (bot.autobot.inventory.havePickaxe()) {
		bot.autobot.mining.mineBestOreVein();
		return;
	}
	const missingTools = [];
	if (!bot.autobot.inventory.haveAxe()) missingTools.push(bot.mcData.itemsByName['wooden_axe'].id);
	if (!bot.autobot.inventory.havePickaxe()) missingTools.push(bot.mcData.itemsByName['wooden_pickaxe'].id);
	if (missingTools.length > 0) {
		bot.autobot.inventory.craftToolNext(missingTools);
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
bot.on('autobot.craftTools.done', (result) => {
	console.log(result.description);
	if (result.error) return;
	if (!bot.autobot.inventory.haveAxe() || !bot.autobot.inventory.havePickaxe()) {
		bot.autobot.lumberjack.harvestNearestTree();
	}
	else {
		botLoop();
	}
});
bot.on('autobot.mining.digging', (result) => {
	console.log(result.description);
});
bot.on('autobot.mining.done', (result) => {
	console.log(result.description);
	if (result.resultCode === 'noVeinFound') return;
	botLoop();
});
