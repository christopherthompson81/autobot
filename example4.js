
/*
This script will harvest trees and ore.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
(X) - It will craft a wooden axe if it needs one
(X) - It will mine ore if it has a pickaxe
(X) - It will craft a wooden pickaxe if it needs one
AND
- it will craft all tools of the best type (up to iron) it can make, with spares
- (*) Not self-sufficient on iron production at this point.
- It will mine ore if it has no missing tools
- It will not harvest trees if there are 32 or greater logs in inventory
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
	const missingTools = bot.autobot.inventory.missingTools();
	if (missingTools.length > 0) {
		console.log('Returning to cutting trees because of missing tools.', missingTools);
		bot.autobot.inventory.craftTools((result) => {
			bot.autobot.lumberjack.harvestNearestTree(32);
		});
	}
	else {
		console.log('Returning to mining.');
		bot.autobot.inventory.craftTools((result) => {
			bot.autobot.mining.mineBestOreVein();
		});
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
	bot.on('autobot.craftTools.done', logResult);
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
