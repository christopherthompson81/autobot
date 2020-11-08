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
const getPosHash = require('./behaviours/autoBotLib').getPosHash;

const Autocraft = require('./behaviours/Autocraft');
const CollectDrops = require('./behaviours/CollectDrops');
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
	bot.autobot.inventory = new Inventory(bot);
	bot.autobot.landscaping = new Landscaping(bot);
	bot.autobot.lumberjack = new Lumberjack(bot);
	bot.autobot.mining = new Mining(bot);
	bot.autobot.navigator = new Navigator(bot);
	bot.autobot.smelting = new Smelting(bot);
	bot.autobot.stash = new Stash(bot);
	bot.loadPlugin(pathfinder);
	//let currentTask = null;
	let currentTarget = {
		goalPosition: new Vec3(1, 0, 0),
		goalPosHash: '',
		errorPosition: new Vec3(1, 0, 0),
		distanceFromGoal: 0,
		errorCount: 0
	};
	
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

	function resetCurrentTarget() {
		currentTarget = {
			goalPosition: new Vec3(1, 0, 0),
			goalPosHash: '',
			errorPosition: new Vec3(1, 0, 0),
			distanceFromGoal: 0,
			errorCount: 0
		};
	}

	function checkGoalProgress(goal, stuck) {
		const goalPosition = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalPosition.distanceTo(bot.entity.position));
		if (distanceFromGoal > (Math.sqrt(goal.rangeSq) || 3) || stuck) {
			const goalPosHash = getPosHash(goalPosition);
			const errorPosition = bot.entity.position.clone();
			if (currentTarget.goalPosHash === goalPosHash) {
				// If we're still within 3 of the last stuck position then it's the same thing that's getting us stuck.
				const distanceFromLastError = Math.floor(currentTarget.errorPosition.distanceTo(errorPosition));
				if (distanceFromLastError <= 3) {
					currentTarget.errorCount++;
				}
				else {
					currentTarget.goalPosHash = goalPosHash;
					currentTarget.errorPosition = errorPosition;
					currentTarget.errorCount = 1;	
				}
			}
			else {
				currentTarget.goalPosHash = goalPosHash;
				currentTarget.errorPosition = errorPosition;
				currentTarget.errorCount = 1;
			}
			currentTarget.distanceFromGoal = distanceFromGoal;
			return false;
		}
		else {
			resetCurrentTarget();
			return true;
		}
	}

	function onGoalReached (goal) {
		const eventName = 'autobot.pathfinder.goalReached';
		let result = {};
		let activeFunction = "";
		const goalVec3 = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalVec3.distanceTo(bot.entity.position));
		if (!checkGoalProgress(goal, false)) {
			//console.log('Selecting getUnstuck behaviour');
			selectOnStuckBehaviour(goal);
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

	bot.autobot.onExcessiveBreakTime = function (block, breakTime) {
		//console.log(`Excessive break time (${breakTime}) trying to break ${block.displayName} at ${block.position}`);
		if (bot.autobot.mining.active) {
			bot.pathfinder.setGoal(null);
			bot.autobot.mining.active = false;
			// TODO: Add an event for this
			//console.log('Excess break time forcing tool crafting. Mining Abandoned.');
			bot.autobot.inventory.craftTools();
		}
	}

	bot.autobot.onBotStuck = function (goalProgress, path, goal) {
		if (!checkGoalProgress(goal, true)) {
			selectOnStuckBehaviour(goal);
		}
		else {
			backupAndContinue(goal);
		}
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
		bot.autobot.inventory.resetBehaviour();
		bot.autobot.landscaping.resetBehaviour();
		bot.autobot.lumberjack.resetBehaviour();
		bot.autobot.mining.resetBehaviour();
		bot.autobot.navigator.resetBehaviour();
		bot.autobot.smelting.resetBehaviour();
		bot.autobot.stash.resetBehaviour();
		callback();
	}

	// Strategies to try, in order:
	// 1). Move backwards one block and then continue
	// 2). Flatten surroundings and then continue
	// 3). Mark the goal position as a bad target and go home
	// 4). Mark the goal position as a bad target, try to flatten surroundings, and go home
	// 5). All behaviours after 4 are the same as 4.
	function selectOnStuckBehaviour(goal) {
		if (currentTarget.errorCount > 0 && currentTarget.errorCount <= 1) {
			backupAndContinue(goal);
		}
		else if (currentTarget.errorCount > 1 && currentTarget.errorCount <= 3) {
			flattenAndContinue(goal);
		}
		else if (currentTarget.errorCount > 3 && currentTarget.errorCount <= 4) {
			markBadAndGoHome();
		}
		else if (currentTarget.errorCount > 4) {
			flattenAndGoHome();
		}
		else {
			console.log('did not select a getUnstuck behaviour. currentTarget:', currentTarget);
		}
	}

	function backupAndContinue(goal) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "tooFar",
			description: `An error happened in attempting to reach the goal. Distance: ${currentTarget.distanceFromGoal}`
		};
		bot.autobot.navigator.backupBot(() => bot.pathfinder.setGoal(goal));
		bot.emit(eventName, result);
	}
	
	function flattenAndContinue(goal) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "tooFar",
			description: `Another error happened in attempting to reach the goal. Flattening Surroundings. Distance: ${currentTarget.distanceFromGoal}`
		};
		bot.pathfinder.setGoal(null);
		bot.clearControlStates();
		bot.autobot.landscaping.flattenCube(
			bot.entity.position,
			'cobblestone',
			['stone', 'cobblestone', 'diorite', 'andesite', 'granite', 'sand', 'dirt', 'grass_block'],
			() => bot.pathfinder.setGoal(goal)
		);
		bot.emit(eventName, result);
	}

	function markBadAndGoHome() {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "badTarget",
			description: "Many successive pathfinding errors at this position. Target is possibly unreachable. Marking as a bad target and returning home"
		};
		if (bot.autobot.mining.active) {
			bot.autobot.mining.badTargets.push(currentTarget.goalPosition.clone());
		}
		bot.autobot.resetAllBehaviours(bot.autobot.navigator.returnHome);
		bot.emit(eventName, result);
	}

	function flattenAndGoHome() {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "badTarget",
			description: "Very stuck. Target is possibly unreachable and the bot can't move. Marking as a bad target, flattening surroundings, and returning home"
		};
		if (bot.autobot.mining.active) {
			bot.autobot.mining.badTargets.push(currentTarget.goalPosition.clone());
		}
		bot.autobot.resetAllBehaviours(() => {
			bot.autobot.landscaping.flattenCube(
				bot.entity.position,
				'cobblestone',
				['stone', 'cobblestone', 'diorite', 'andesite', 'granite', 'sand', 'dirt', 'grass_block'],
				bot.autobot.navigator.returnHome
			);
		});
		bot.emit(eventName, result);
	}
}

module.exports = {
	autoBot: inject
}
