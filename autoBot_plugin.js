/*
Experimental Minecraft Bot - plugin

The goal of this framework is to allow people to write bots at a high level
that can function independantly from an operator by responding to behaviour
events.

*/
'use strict';

const pathfinder = require('./pathfinder/pathfinder').pathfinder;
const Movements = require('./pathfinder/pathfinder').Movements;
//const { GoalBlock, GoalNear, GoalGetToBlock } = require('./pathfinder/pathfinder').goals;
const minecraftData = require('minecraft-data');
const Vec3 = require('vec3').Vec3;

const sleep = require('./behaviours/autobotLib').sleep;

const Autocraft = require('./behaviours/Autocraft');
const CollectDrops = require('./behaviours/CollectDrops');
const GetUnstuck = require('./behaviours/GetUnstuck');
const Inventory = require('./behaviours/Inventory');
const Landscaping = require('./behaviours/Landscaping');
const Lumberjack = require('./behaviours/Lumberjack');
const Mining = require('./behaviours/Mining');
const Navigator = require('./behaviours/Navigator');
const Smelting = require('./behaviours/Smelting');
const Stash = require('./behaviours/Stash');

/*****************************************************************************/

function inject (bot) {
	bot.mcData = null;
	bot.autobot = {};
	bot.autobot.autocraft = new Autocraft(bot);
	bot.autobot.collectDrops = new CollectDrops(bot);
	bot.autobot.getUnstuck = new GetUnstuck(bot);
	bot.autobot.inventory = new Inventory(bot);
	bot.autobot.landscaping = new Landscaping(bot);
	bot.autobot.lumberjack = new Lumberjack(bot);
	bot.autobot.mining = new Mining(bot);
	bot.autobot.navigator = new Navigator(bot);
	bot.autobot.smelting = new Smelting(bot);
	bot.autobot.stash = new Stash(bot);
	bot.loadPlugin(pathfinder);
	
	bot.once('spawn', autoBotLoader);

	function autoBotLoader() {
		bot.mcData = minecraftData(bot.version);
		bot.defaultMove = new Movements(bot, bot.mcData);
		bot.pathfinder.setMovements(bot.defaultMove);
		bot.on('goal_reached', onGoalReached);
		bot.waitForChunksToLoad(() => {
			//console.log('Waiting for 5 seconds to allow world to load.');
			sleep(5000).then(() => {
				bot.autobot.homePosition = bot.autobot.navigator.setHomePosition();
				//console.log(`Home Position: ${bot.autobot.homePosition}`);
				//bot.autobot.stash.stashNonEssentialInventory();
				bot.emit('autobot.ready', {error: false, resultCode: "ready", description: "autoBot is ready to run"});
			});
		});
	}

	function onGoalReached (goal) {
		const eventName = 'autobot.pathfinder.goalReached';
		let result = {};
		let activeFunction = "";
		const goalVec3 = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalVec3.distanceTo(bot.entity.position));
		if (!bot.autobot.getUnstuck.checkGoalProgress(goal, false)) {
			console.log('Selecting getUnstuck behaviour');
			bot.autobot.getUnstuck.selectOnStuckBehaviour(goal);
			return;
		}
		// navigating first
		if (bot.autobot.navigator.active) {
			sleep(350).then(bot.autobot.navigator.arrivedHome);
			activeFunction = "navigator";
		}
		// landscaping next
		else if (bot.autobot.landscaping.flatteningCube) {
			sleep(350).then(bot.autobot.landscaping.flattenCallback);
			activeFunction = "landscaping.flatteningCube";
		}
		else if (bot.autobot.landscaping.digging) {
			sleep(350).then(bot.autobot.landscaping.callback);
			activeFunction = "landscaping.digging";
		}
		else if (bot.autobot.landscaping.placing) {
			sleep(350).then(bot.autobot.landscaping.callback);
			activeFunction = "landscaping.placing";
		}
		else if (bot.autobot.landscaping.gettingDirt) {
			sleep(350).then(bot.autobot.landscaping.dirtArrival);
			activeFunction = "landscaping.gettingDirt";
		}
		// then the rest
		else if (bot.autobot.autocraft.active) {
			sleep(350).then(bot.autobot.autocraft.callback);
			activeFunction = "autocraft";
		}
		else if (bot.autobot.collectDrops.active) {
			sleep(350).then(bot.autobot.collectDrops.pickUpNext);
			activeFunction = "collectDrops";
		}
		else if (bot.autobot.lumberjack.active) { 
			bot.autobot.lumberjack.cutTreeNext();
			activeFunction = "lumberjack";
		}
		else if (bot.autobot.mining.active) {
			sleep(350).then(bot.autobot.mining.callback);
			activeFunction = "mining";
		}
		else if (bot.autobot.smelting.active) {
			sleep(350).then(bot.autobot.smelting.smeltingCallback);
			activeFunction = "smelting";
		}
		else if (bot.autobot.stash.cachingChests) {
			sleep(350).then(bot.autobot.stash.cacheChest);
			activeFunction = "cachingChests";
		}
		else if (bot.autobot.stash.active) {
			sleep(350).then(bot.autobot.stash.chestArrival);
			activeFunction = "stash";
		}
		result = {
			error: false,
			resultCode: "reachedGoal",
			description: "Reached the target goal successfully.",
			goalPosition: goalVec3,
			distanceFromGoal: distanceFromGoal,
			activeFunction: activeFunction
		};
		bot.emit(eventName, result);
	}

	bot.autobot.onStashingDone = function (result) {
		bot.autobot.stash.defaultPostStashBehaviour();
	}

	bot.autobot.onLumberjackDone = function (result) {
		bot.autobot.stash.stashNonEssentialInventory();
	}

	bot.autobot.onMiningDone = function (result) {
		bot.autobot.stash.stashNonEssentialInventory();
	}

	bot.autobot.onArrivedHome = function () {
		bot.autobot.stash.stashNonEssentialInventory();
	}

	bot.autobot.resetAllBehaviours = function (callback) {
		bot.autobot.autocraft.resetBehaviour();
		bot.autobot.collectDrops.resetBehaviour();
		//bot.autobot.getUnstuck.resetBehaviour();
		bot.autobot.inventory.resetBehaviour();
		bot.autobot.landscaping.resetBehaviour();
		bot.autobot.lumberjack.resetBehaviour();
		bot.autobot.mining.resetBehaviour();
		bot.autobot.navigator.resetBehaviour();
		bot.autobot.smelting.resetBehaviour();
		bot.autobot.stash.resetBehaviour();
		callback();
	}
}

module.exports = {
	autoBot: inject
}
