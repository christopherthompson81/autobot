const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
const { GoalNear } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;
const breakTime = require('./autoBotLib').breakTime;
const bestHarvestTool = require('./autoBotLib').bestHarvestTool;

class Navigator {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.callback = () => {};
		this.active = false;
		this.goal = null;
		this.digging = false;
		this.goalProgress = {
			timestamp: Date.now(),
			position: new Vec3(0, 0, 0),
			threshold: 10,
			notified: false,
			startTimestamp: Date.now(),
			totalDistance: 0,
			movementLoopNotified: false,
		};
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
		this.digging = false;
		this.goalProgress = {
			timestamp: Date.now(),
			position: new Vec3(0, 0, 0),
			threshold: 10,
			notified: false,
			startTimestamp: Date.now(),
			totalDistance: 0,
			movementLoopNotified: false,
		};
	}

	setGoalProgress() {
		this.goalProgress.timestamp = Date.now();
		this.goalProgress.position = bot.entity.position.floored();
		this.goalProgress.threshold = 10;
		this.goalProgress.notified = false;
	}

	setHomePosition() {
		const craftingTables = this.bot.findBlocks({
			matching: this.bot.mcData.blocksByName['crafting_table'].id,
			maxDistance: 128,
			count: 10
		});
		// Only set home on near surface crafting tables
		let craftingTable = null;
		for (const point of craftingTables) {
			if (point.y >= 58) {
				craftingTable = this.bot.blockAt(point);
				break;
			}
		}
		if (!craftingTable) {
			return this.bot.entity.position;
		}
		else {
			return craftingTable.position;
		}
	}

	backupBot(callback) {
		this.bot.setControlState('back', true);
		// Timeout is necessary to allow the bot to move.
		// Possibly could be replaced with a while loop?
		sleep(350).then(() => {
			this.bot.clearControlStates();
			callback();
		});
	}

	arrivedHome() {
		const result = {
			error: false,
			resultCode: "arrivedHome",
			description: "Bot arrived back at the home position."
		};
		this.bot.emit('autobot.navigator.arrivedHome', result);
		this.active = false;
	}
		
	returnHome() {
		//console.log("Returning to home position: ", this.bot.autobot.homePosition);
		this.active = true;
		this.bot.pathfinder.setGoal(null);
		this.backupBot(() => {
			const p = this.bot.autobot.homePosition;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.bot.pathfinder.setGoal(goal);
		});
	}

	onGoalReached (goal) {
		const eventName = 'autobot.navigator.goalReached';
		let result = {};
		let activeFunction = "";
		const goalVec3 = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalVec3.distanceTo(this.bot.entity.position));
		if (!this.bot.autobot.getUnstuck.checkGoalProgress(goal)) {
			//console.log('Selecting getUnstuck behaviour');
			this.bot.autobot.getUnstuck.selectOnStuckBehaviour(this.bot.autobot.getUnstuck.goalProgress, goal);
			return;
		}
		// navigating first
		if (this.active) {
			sleep(350).then(this.arrivedHome);
			activeFunction = "navigator";
		}
		// collect drops next
		else if (this.bot.autobot.collectDrops.active) {
			sleep(350).then(this.bot.autobot.collectDrops.pickUpNext);
			activeFunction = "collectDrops";
		}
		// landscaping next
		else if (this.bot.autobot.landscaping.flatteningCube) {
			sleep(350).then(() => {
				this.bot.autobot.landscaping.flattenCallback(goalVec3);
			});
			activeFunction = "landscaping.flatteningCube";
		}
		else if (this.bot.autobot.landscaping.digging) {
			sleep(350).then(this.bot.autobot.landscaping.digNext);
			activeFunction = "landscaping.digging";
		}
		else if (this.bot.autobot.landscaping.placing) {
			sleep(350).then(this.bot.autobot.landscaping.placeNext);
			activeFunction = "landscaping.placing";
		}
		else if (this.bot.autobot.landscaping.gettingDirt) {
			sleep(350).then(this.bot.autobot.landscaping.dirtArrival);
			activeFunction = "landscaping.gettingDirt";
		}
		// then the rest
		else if (this.bot.autobot.autocraft.active) {
			sleep(350).then(this.bot.autobot.autocraft.callback);
			activeFunction = "autocraft";
		}
		else if (this.bot.autobot.lumberjack.active) { 
			this.bot.autobot.lumberjack.cutTreeNext();
			activeFunction = "lumberjack";
		}
		else if (this.bot.autobot.mining.active) {
			sleep(350).then(this.bot.autobot.mining.callback);
			activeFunction = "mining";
		}
		else if (this.bot.autobot.smelting.active) {
			sleep(350).then(this.bot.autobot.smelting.smeltingCallback);
			activeFunction = "smelting";
		}
		else if (this.bot.autobot.stash.cachingChests) {
			sleep(350).then(this.bot.autobot.stash.cacheChest);
			activeFunction = "cachingChests";
		}
		else if (this.bot.autobot.stash.active) {
			sleep(350).then(this.bot.autobot.stash.chestArrival);
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
		this.bot.emit(eventName, result);
	}

	setGoal(goal, dynamic = false) {
		this.goal = null;
		this.setGoalProgress();
		this.goalProgress.startTimestamp = Date.now();
		let goalPosition = goal ? new Vec3(goal.x, goal.y, goal.z) : null;
		this.goalProgress.distance = goalPosition ? bot.entity.position.distanceTo(goalPosition) : 0;
		this.goalProgress.movementLoopNotified = false;
		this.bot.pathfinder.setGoal(goal, dynamic);
	}

	monitorMovement () {
		if (!this.bot.pathfinder.isMoving()) {
			return;
		}
		// Test if stuck
		if (
			this.goalProgress.position.distanceTo(this.bot.entity.position) < 2 &&
			Date.now() > (this.goalProgress.timestamp + (this.goalProgress.threshold * 1000)) &&
			!this.goalProgress.notified
		) {
			//bot.emit('autobot.pathfinder.botStuck', this.goalProgress, path, stateGoal)
			bot.emit('autobot.navigator.botStuck', this.goalProgress, null, null);
			this.goalProgress.notified = true;
			//return
		}

		// Test if caught in a movement loop
		// Experiment: 3 * distance * (2*averageDigTime + moveOneBlockTime) === travelTimeLimit
		// Maybe it's a good limit, maybe not.
		// We're assuming an unmodified stone pickaxe as the tool and a stone block as the target (600 ms)
		if (this.goalProgress.distance > 0) {
			const stoneBlockDigTime = 600;
			const moveOneBlockTime = 500;
			const travelTimeLimit = 4 *	this.goalProgress.distance * (2*stoneBlockDigTime + moveOneBlockTime) + 10000;
			if (
				this.goalProgress.startTimestamp + travelTimeLimit < Date.now() &&
				!this.goalProgress.movementLoopNotified
			) {
				//this.bot.emit('autobot.pathfinder.exceededTravelTimeLimit', this.goalProgress, path, stateGoal)
				this.bot.emit('autobot.navigator.exceededTravelTimeLimit', this.goalProgress, null, null);
				this.goalProgress.movementLoopNotified = true;
			}
		}
		// Test for excessive break time
		if (this.bot.targetDigBlock) {
			//if (!digging && bot.entity.onGround) {
			if (!this.digging) {
				this.digging = true
				const block = this.bot.targetDigBlock;
				const tool = bestHarvestTool(this.bot, block);
				const blockBreakTime = breakTime(block, tool);
				this.goalProgress.threshold += (blockBreakTime / 1000);
				// Break time is in ms; Emit a message when breaking will take more than 3 seconds
				if (blockBreakTime > 3000) {
					// TODO: Rewrite event in autobot event format
					bot.emit('autobot.navigator.excessiveBreakTime', block, blockBreakTime);
				}
			}
		}
		else {
			this.digging = false;
		}
		if (!this.goalProgress.position.equals(bot.entity.position.floored())) {
			//console.log('+');
			const result = {
				error: false,
				resultCode: "reachedNextPoint",
				description: "Bot reached the next point on its path"
			};
			bot.emit('autobot.navigator.progress', result);
			setGoalProgress();
			if (bot.entity.isInWater) {
				const result = {
					error: false,
					resultCode: "inWater",
					description: "Bot entered water during pathfinding",
					stateGoal: this.stateGoal
				};
				bot.emit('autobot.navigator.progress', result);
			}
			const lavaBlocks = bot.findBlocks({
				point: bot.entity.position,
				matching: (b) => {
					if (!this.bot.canSeeBlock(b)) return false;
					if (b.type !== bot.mcData.blocksByName.lava.id) return false;
					return true;
				},
				maxDistance: 3,
				count: 1
			});
			if (lavaBlocks.length > 0) {
				const result = {
					error: false,
					resultCode: "lavaNearby",
					description: "Bot encountered lava during pathfinding",
					stateGoal: this.stateGoal
				};
				bot.emit('autobot.navigator.progress', result);
			}
			// Test for webs
			const cobwebs = bot.findBlocks({
				point: bot.entity.position,
				matching: (b) => {
					if (!this.bot.canSeeBlock(b)) return false;
					if (b.type !== bot.mcData.blocksByName.cobweb.id) return false;
					return true;
				},
				maxDistance: 3,
				count: 1
			});
			if (cobwebs.length > 0) {
				const result = {
					error: false,
					resultCode: "cobwebsNearby",
					description: "Bot encountered cobwebs during pathfinding",
					stateGoal: this.stateGoal
				};
				bot.emit('autobot.navigator.progress', result);
			}
			// Test for webs
		}
	}
}

module.exports = Navigator;
