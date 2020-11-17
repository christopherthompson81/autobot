
/*
This script will just attempt to smelt ores
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

bot.once('spawn', () => {
	const stash = bot.autobot.stash.stashNonEssentialInventory;
	bot.on('autobot.ready', (result) => {
		logResult(result);
		stash();
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
			stash();
		}
	});
	bot.on('autobot.navigator.arrivedHome', (result) => {
		logResult(result);
		stash();
	});
	bot.on('autobot.lumberjack.done', (result) => {
		logResult(result);
		if (result.error) {
			console.log('Exiting');
			return;
		}
		stash();
	});
	bot.on('autobot.craftTools.done', logResult);
	bot.on('autobot.mining.digging', logResult);
	bot.on('autobot.mining.done', (result) => {
		logResult(result);
		if (result.resultCode === 'noVeinFound') {
			console.log('Exiting');
			return;
		}
		stash();
	});
	bot.on('autobot.stashing.done', (result) => {
		logResult(result);
		if (result.error) {
			console.log('Exiting');
			return;
		}
		bot.autobot.smelting.smeltOre();
	});
	bot.on('autobot.autocraft.done', logResult);
	bot.on('autobot.compression.done', logResult);
	bot.on('autobot.smelting.done', (result) => {
		console.log(result.takeOutputResult.description);
		console.log(result.restokeResult.description);
		console.log(result.resupplyResult.description);
	});
	bot.on('autobot.smelting.newFurnace', logResult);
	//bot.on('autobot.smelting.resupply', logResult);
	//bot.on('autobot.smelting.restoke', logResult);
	bot.on('autobot.stashing.newChest', logResult);
});
