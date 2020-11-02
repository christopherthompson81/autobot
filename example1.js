/*
This script will find trees and cut them down.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
*/
'use strict';

const mineflayer = require('mineflayer');
const autoBot = require("./autoBot_plugin.js").autoBot;
const sleep = require('./behaviours/autoBotLib').sleep;
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
	bot.on('autobot.ready', (result) => {
		logResult(result)
		console.log('Harvesting Tree');
		bot.autobot.lumberjack.harvestNearestTree();
	});
	bot.on('autobot.pathfinder.progress', (result) => { console.log("+"); });
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
	bot.on('autobot.navigator.arrivedHome', (result) => {
		logResult(result);
		console.log('Harvesting Tree');
		// rapid changes to pathfinding goals sometimes don't work, hence the delay
		sleep(350).then(bot.autobot.lumberjack.harvestNearestTree);
	});
	bot.on('autobot.lumberjack.done', (result) => {
		console.log(result.description);
		if (result.error) {
			console.log('Exiting')
			return;
		}
		console.log('Harvesting Tree');
		bot.autobot.lumberjack.harvestNearestTree();
	});
});
