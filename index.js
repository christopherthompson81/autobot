
/*
This script will harvest trees and ore, then process and store them.

- It will quit if no trees are found.
- It uses the default behaviour to get the pathfinder routine unstuck
- It will mine ore if it has no missing tools
- it will craft all tools of the best type (up to iron) it can make, with spares
- It will not harvest trees if there are 32 or greater logs in inventory
AND
- It will build chests on the storage grid
- It will build furnaces on the storage grid
- It will clear and flatten the target storage grid spaces
- It will smelt iron ore
- It will compress compressables
- It will stash non-essential items, valuables, and superfluous tools
- It will remember chests and their contents so as to optimize stashing

Unmonitored Events:
	* autobot.collectDrops.done
	* autobot.landscaping.digQueue.done
	* autobot.landscaping.flattenCube.done
	* autobot.landscaping.newStorageObject
	* autobot.landscaping.placeQueue.done
	* autobot.smelting.resupply
	* autobot.smelting.restoke
	* autobot.smelting.newFurnace
	* autobot.stashing.newChest
*/
'use strict';

const mineflayer = require('mineflayer');
const autoBot = require("./autoBot_plugin.js").autoBot;
const fs = require('fs');
const process = require('process');
const Vec3 = require('vec3').Vec3;
let config = JSON.parse(fs.readFileSync('autobot_config.json'));

let botId = process.argv[2]
botId = !botId ? '' : '_' + botId.toString();

const bot = mineflayer.createBot({
	host: config.host,
	port: config.port,
	username: `${config.username}${botId}`,
	password: config.password
});

bot.loadPlugin(autoBot);

function logResult(result) {
	console.log(result.description);
}

bot.once('spawn', () => {
	const selectBehaviour = () => {
		bot.autobot.behaviourSelect.resetAllBehaviours(
			bot.autobot.behaviourSelect.defaultPreTaskBehaviour
		);
	};
	bot.on('autobot.ready', (result) => {
		logResult(result);
		selectBehaviour();
	});
	bot.on('autobot.pathfinder.progress', () => { process.stdout.write("+"); });
	bot.on('autobot.pathfinder.botStuck', (goalProgress, path, stateGoal) => {
		console.log("Bot Stuck.");
		bot.autobot.getUnstuck.onBotStuck(goalProgress, path, stateGoal);
	});
	bot.on('autobot.pathfinder.exceededTravelTimeLimit', (goalProgress, path, stateGoal) => {
		console.log("Exceeded pathfinder travel time limit.");
		bot.autobot.getUnstuck.flattenAndGoHome({goalPosition: new Vec3(stateGoal.x, stateGoal.y, stateGoal.z)});
	});
	bot.on('autobot.pathfinder.excessiveBreakTime', (block, breakTime) => {
		console.log(`Excessive break time (${breakTime}) trying to break ${block.displayName} at ${block.position}`);
		if (bot.autobot.mining.active) {
			bot.pathfinder.setGoal(null);
			bot.autobot.mining.active = false;
			console.log('Excess break time forcing tool crafting. Mining Abandoned.');
			selectBehaviour();
		}
	});
	bot.on('autobot.navigator.goalReached', (result) => {
		if (result.resultCode === 'reachedGoal') {
			if (result.activeFunction === '') {
				selectBehaviour();
				return;
			}
			if (result.activeFunction === 'collectDrops') return;
			if (result.activeFunction === 'cachingChests') return;
			if (result.activeFunction === 'landscaping.gettingDirt') return;
			let message = `Reached goal of ${result.goalPosition}.`;
			message += ` Bot is ${result.distanceFromGoal} blocks from the goal`;
			message += ` and '${result.activeFunction}' is the active function.`;
			console.log(message);
		}
	});
	bot.on('autobot.navigator.arrivedHome', (result) => {
		logResult(result);
		selectBehaviour();
	});
	bot.on('autobot.lumberjack.treeFound', (result) => {
		console.log(result.description, result.tree[0].position, result.tree[0].displayName);
	});
	bot.on('autobot.lumberjack.done', (result) => {
		logResult(result);
		if (result.error) {
			console.log('Exiting');
			return;
		}
		if (result.resultCode === 'skipping') {
			bot.autobot.mining.mineBestOreVein();
		}
		else {
			selectBehaviour();
		}
	});
	bot.on('autobot.craftTools.done', (result) => {
		if (result.resultCode !== 'skipping') {
			logResult(result);
		}
	});
	bot.on('autobot.mining.digging', (result) => {
		if (result.resultCode === 'foundVein') {
			console.log(`${result.vein[0].displayName} vein found (${result.vein.length} ores).`);
			const travelDistance = Math.floor(bot.entity.position.distanceTo(result.vein[0].position));
			console.log(`Travel Distance: ${travelDistance}`);
		}
		else if (result.resultCode === 'notSafe') {
			console.log(`${result.description} ${result.block.position}`);
		}
		else if (result.resultCode === 'digError') {
			process.stdout.write("*");
		}
		else {
			logResult(result);
		}
	});
	bot.on('autobot.mining.done', (result) => {
		logResult(result);
		if (result.resultCode === 'noVeinFound') {
			console.log('Exiting');
			return;
		}
		selectBehaviour();
	});
	bot.on('autobot.stashing.behaviourSelect', (result) => {
		logResult(result);
		if (result.error) {
			console.log(result);
		}
	});
	bot.on('autobot.stashing.cachingChests.done', (result) => {
		logResult(result);
		selectBehaviour();
	});
	bot.on('autobot.stashing.done', (result) => {
		logResult(result);
		if (result.error) {
			console.log("Consider Exiting: ", result.resultCode);
		}
		bot.autobot.behaviourSelect.defaultPostTaskBehaviour();
	});
	bot.on('autobot.autocraft.done', logResult);
	bot.on('autobot.compression.done', (result) => {
		logResult(result);
		selectBehaviour();
	});
	bot.on('autobot.smelting.done', (result) => {
		if (result.resultCode === 'placingFurnaceError') {
			console.log(result);
			selectBehaviour();
			return;
		}
		console.log(result.takeOutputResult.description);
		console.log(result.restokeResult.description);
		console.log(result.resupplyResult.description);
		selectBehaviour();
	});
	bot.on('autobot.getUnstuck', logResult);
	bot.on('autobot.stashing.itemDeposit', logResult);
	bot.on('autobot.collectDrops.done', (result) => {
		console.log(result.description, result.collectedItems);
	});
	bot.on('autobot.craftTools.crafting', logResult);
	bot.on("autobot.behaviourSelect.preTask", (result) => {
		if (result.resultCode === "noPreTasks") {
			bot.autobot.behaviourSelect.defaultPostTaskBehaviour();
		}
		else {
			logResult(result);
		}
	});
	bot.on("autobot.behaviourSelect.postTask", logResult);
});
