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
const Inventory = require('./behaviours/Inventory');
const Landscaping = require('./behaviours/Landscaping');
const Lumberjack = require('./behaviours/Lumberjack');
const Mining = require('./behaviours/Mining');
const Navigator = require('./behaviours/Navigator');
const Smelting = require('./behaviours/Smelting');
const Stash = require('./behaviours/Stash');

function inject (bot) {
	bot.mcData = null;
	bot.autobot = {};
	bot.autobot.autocraft = new Autocraft(bot);
	bot.autobot.collectDrops = new CollectDrops(bot);
	bot.autobot.inventory = new Inventory(bot);
	bot.autobot.landscaping = new Landscaping(bot);
	bot.autobot.lumberjack = new Lumberjack(bot);
	bot.autobot.mining = new Mining(bot);
	bot.autobot.navigator = new Navigator(bot);
	bot.autobot.smelting = new Smelting(bot);
	bot.autobot.stash = new Stash(bot);
	bot.loadPlugin(pathfinder);
	let defaultMove = null;
	//let currentTask = null;
	let currentTarget = {
		posHash: '',
		errorCount: 0
	};
	
	bot.once('spawn', autoBotLoader);

	function autoBotLoader() {
		bot.mcData = minecraftData(bot.version);
		defaultMove = new Movements(bot, bot.mcData);
		bot.pathfinder.setMovements(defaultMove);
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
		const goalVec3 = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalVec3.distanceTo(bot.entity.position));
		if (distanceFromGoal > (Math.sqrt(goal.rangeSq) || 3)) {
			//console.log("An error happened in attempting to reach the goal. Distance", distanceFromGoal);
			const goalPos = new Vec3(goal.x, goal.y, goal.z);
			const posHash = goal.x + ',' + goal.y + ',' + goal.z;
			if (currentTarget.posHash === posHash) {
				currentTarget.errorCount++;
				if (currentTarget.errorCount > 5) {
					if (bot.autobot.mining.active) {
						bot.autobot.mining.badTargets.push(goalPos.clone());
					}
					bot.autobot.navigator.returnHome();
					return;
				}
			}
			else {
				currentTarget.posHash = posHash;
				currentTarget.errorCount = 1;
			}
			bot.autobot.navigator.backupBot(() => bot.pathfinder.setGoal(goal));
			return;
		}
		// navigating first
		if (bot.autobot.navigator.active) {
			bot.autobot.navigator.arrivedHome();
		}
		// landscaping next
		else if (bot.autobot.landscaping.flatteningCube) {
			bot.autobot.landscaping.callback();
		}
		else if (bot.autobot.landscaping.digging) {
			bot.autobot.landscaping.callback();
		}
		else if (bot.autobot.landscaping.placing) {
			bot.autobot.landscaping.callback();
		}
		// then the rest
		else if (bot.autobot.autocraft.active) {
			bot.autobot.autocraft.callback();
		}
		else if (bot.autobot.collectDrops.active) {
			bot.autobot.collectDrops.callback();
		}
		else if (bot.autobot.lumberjack.active) {
			bot.autobot.lumberjack.callback();
		}
		else if (bot.autobot.mining.active) {
			bot.autobot.mining.callback();
		}
		else if (bot.autobot.smelting.active) {
			bot.autobot.smelting.callback();
		}
		else if (bot.autobot.stash.active) {
			bot.autobot.stash.callback();
		}
	}

	bot.autobot.onExcessiveBreakTime = function (block, breakTime) {
		//console.log(`Excessive break time (${breakTime}) trying to break ${block.displayName} at ${block.position}`);
		if (bot.autobot.mining.active) {
			bot.pathfinder.setGoal(null);
			bot.autobot.mining.active = false;
			//console.log('Excess break time forcing tool crafting. Mining Abandoned.');
			bot.autobot.inventory.craftTools();
		}
	}

	bot.autobot.onBotStuck = function (goalProgress, path, goal) {
		//console.log("Pathfinder indicates bot is stuck. Goal Progress: ", goalProgress);
		//console.log("Path: ", path);
		//console.log("Goal: ", goal);
		bot.autobot.mining.badTargets.push(new Vec3(goal.x, goal.y, goal.z));
		bot.autobot.navigator.returnHome();
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
}

module.exports = {
	autoBot: inject
}
