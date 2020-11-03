/*
This script will harvest trees and ore.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
- It will craft a wooden axe if it needs one
AND
- It will mine ore if it has a pickaxe
- It will craft a wooden pickaxe if it needs one
*/
'use strict';

const mineflayer = require('mineflayer');
const autoBot = require("./autoBot_plugin.js").autoBot;
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

function logResult(result) {
	console.log(result.description);
}

bot.loadPlugin(autoBot);

function botLoop() {
	if (bot.autobot.inventory.havePickaxe()) {
		console.log('Mining ore');
		bot.autobot.mining.mineBestOreVein();
		return;
	}
	const missingTools = [];
	if (!bot.autobot.inventory.haveAxe()) missingTools.push(bot.mcData.itemsByName['wooden_axe'].id);
	if (!bot.autobot.inventory.havePickaxe()) missingTools.push(bot.mcData.itemsByName['wooden_pickaxe'].id);
	if (missingTools.length > 0) {
		console.log('Crafting missing tools: ', missingTools);
		bot.autobot.inventory.craftToolNext(missingTools);
	}
	else {
		console.log('Harvesting Tree');
		bot.autobot.lumberjack.harvestNearestTree();
	}
}

bot.once('spawn', () => {
	bot.on('autobot.ready', (result) => {
		logResult(result);
		botLoop();
	});
	bot.on('autobot.pathfinder.progress', () => { console.log("+"); });
	bot.on('autobot.pathfinder.goalReached', (result) => {
		logResult(result);
		if (result.resultCode === 'reachedGoal') {
			console.log("Goal position:", result.goalPosition);
			console.log("Distance from goal:", result.distanceFromGoal);
			console.log("Active Function:", result.activeFunction);
		}
	});
	bot.on('bot_stuck', (goalProgress, path, stateGoal) => {
		console.log("Bot Stuck. Returning to home position.");
		bot.autobot.onBotStuck(goalProgress, path, stateGoal);
	});
	bot.on('excessive_break_time', (block, breakTime) => {
		console.log(`Excessive break time (${breakTime}) trying to break ${block.displayName} at ${block.position}`);
		if (bot.autobot.mining.active) {
			bot.pathfinder.setGoal(null);
			bot.autobot.mining.active = false;
			console.log('Excess break time forcing tool crafting. Mining Abandoned.');
			botLoop();
		}
	});
	bot.on('autobot.navigator.arrivedHome', (result) => {
		logResult(result);
		botLoop();
	});
	bot.on('autobot.lumberjack.done', (result) => {
		logResult(result);
		if (result.error) {
			console.log('Exiting');
			return;
		}
		botLoop();
	});
	bot.on('autobot.craftTools.done', (result) => {
		logResult(result);
		if (result.error) {
			console.log('Exiting');
			return;
		}
		if (!bot.autobot.inventory.haveAxe() || !bot.autobot.inventory.havePickaxe()) {
			bot.autobot.lumberjack.harvestNearestTree();
		}
		else {
			botLoop();
		}
	});
	bot.on('autobot.mining.digging', logResult);
	bot.on('autobot.mining.done', (result) => {
		logResult(result);
		if (result.resultCode === 'noVeinFound') {
			console.log('Exiting');
			return;
		}
		botLoop();
	});
});
