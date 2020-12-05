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
		this.idlePos = new Vec3(0, 0, 0);
		this.idleTime = Date.now();
		this.idleNotified = false;
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
		this.idlePos = new Vec3(0, 0, 0);
		this.idleTime = Date.now();
		this.idleNotified = false;
	}

	setGoalProgress() {
		this.goalProgress.timestamp = Date.now();
		this.goalProgress.position = this.bot.entity.position.floored();
		this.goalProgress.threshold = 10;
		this.goalProgress.notified = false;
	}

	setHomePosition() {
		const craftingTables = this.bot.findBlocks({
			matching: this.bot.mcData.blocksByName.crafting_table.id,
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
		
	returnHome() {
		//console.log("Returning to home position: ", this.bot.autobot.homePosition);
		this.active = true;
		this.bot.autobot.navigator.setGoal(null);
		this.backupBot(() => {
			const p = this.bot.autobot.homePosition;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.bot.autobot.navigator.setGoal(goal);
		});
	}

	findActiveFunction() {
		let activeFunction = "";
		// navigating first
		if (this.active) activeFunction = "navigator";
		// collect drops next
		else if (this.bot.autobot.collectDrops.active) activeFunction = "collectDrops";
		// landscaping next
		else if (this.bot.autobot.landscaping.flatteningCube) activeFunction = "landscaping.flatteningCube";
		else if (this.bot.autobot.landscaping.digging) activeFunction = "landscaping.digging";
		else if (this.bot.autobot.landscaping.placing) activeFunction = "landscaping.placing";
		else if (this.bot.autobot.landscaping.gettingDirt) activeFunction = "landscaping.gettingDirt";
		// then the rest
		else if (this.bot.autobot.autocraft.active) activeFunction = "autocraft";
		else if (this.bot.autobot.lumberjack.active) activeFunction = "lumberjack";
		else if (this.bot.autobot.mining.active) activeFunction = "mining";
		else if (this.bot.autobot.smelting.active) activeFunction = "smelting";
		else if (this.bot.autobot.stash.cachingChests) activeFunction = "cachingChests";
		else if (this.bot.autobot.stash.active) activeFunction = "stash";
		return activeFunction;
	}

	onGoalReached (goal) {
		let activeFunction = this.findActiveFunction();
		const goalVec3 = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalVec3.distanceTo(this.bot.entity.position));
		if (!this.bot.autobot.getUnstuck.checkGoalProgress(goal)) {
			this.bot.autobot.getUnstuck.selectOnStuckBehaviour(this.bot.autobot.getUnstuck.goalProgress, goal);
			return;
		}
		// navigating first
		if (activeFunction === "navigator") sleep(350).then(this.sendArrivedHome);
		// collect drops next
		else if (activeFunction === "collectDrops") sleep(350).then(this.bot.autobot.collectDrops.pickUpNext);
		// landscaping next
		else if (activeFunction === "landscaping.flatteningCube") {
			sleep(350).then(() => { this.bot.autobot.landscaping.flattenCallback(goalVec3); });
		}
		else if (activeFunction === "landscaping.digging") sleep(350).then(this.bot.autobot.landscaping.digNext);
		else if (activeFunction === "landscaping.placing") sleep(350).then(this.bot.autobot.landscaping.placeNext);
		else if (activeFunction === "landscaping.gettingDirt") sleep(350).then(this.bot.autobot.landscaping.dirtArrival);
		// then the rest
		else if (activeFunction === "autocraft") sleep(350).then(this.bot.autobot.autocraft.autoCraftNext);
		else if (activeFunction === "lumberjack") this.bot.autobot.lumberjack.cutTreeNext();
		else if (activeFunction === "mining") sleep(350).then(this.bot.autobot.mining.callback);
		else if (activeFunction === "smelting") sleep(350).then(this.bot.autobot.smelting.smeltingCallback);
		else if (activeFunction === "cachingChests") sleep(350).then(this.bot.autobot.stash.cacheChest);
		else if (activeFunction === "stash") sleep(350).then(this.bot.autobot.stash.chestArrival);
		this.sendReachedGoal(goalVec3, distanceFromGoal, activeFunction);
	}

	setGoal(goal, dynamic = false) {
		this.goal = goal;
		this.setGoalProgress();
		this.goalProgress.startTimestamp = Date.now();
		let goalPosition = goal ? new Vec3(goal.x, goal.y, goal.z) : null;
		this.goalProgress.distance = goalPosition ? this.bot.entity.position.distanceTo(goalPosition) : 0;
		this.goalProgress.movementLoopNotified = false;
		this.bot.pathfinder.setGoal(goal, dynamic);
	}

	isStuck() {
		return (
			this.goalProgress.position.distanceTo(this.bot.entity.position) < 2 &&
			Date.now() > (this.goalProgress.timestamp + (this.goalProgress.threshold * 1000))
		);
	}

	exceededTravelTimeLimit() {
		// Experiment: 3 * distance * (2*averageDigTime + moveOneBlockTime) === travelTimeLimit
		// Maybe it's a good limit, maybe not.
		// We're assuming an unmodified stone pickaxe as the tool and a stone block as the target (600 ms)
		if (this.goalProgress.distance > 0) {
			const stoneBlockDigTime = 600;
			const moveOneBlockTime = 500;
			const travelTimeLimit = 4 *	this.goalProgress.distance * (2*stoneBlockDigTime + moveOneBlockTime) + 10000;
			return this.goalProgress.startTimestamp + travelTimeLimit < Date.now();
		}
		return false;
	}

	testExcessiveBreakTime() {
		if (this.bot.targetDigBlock) {
			//if (!digging && bot.entity.onGround) {
			if (!this.digging) {
				this.digging = true
				const block = this.bot.targetDigBlock;
				const tool = bestHarvestTool(this.bot, block);
				const blockBreakTime = breakTime(this.bot, block, tool);
				this.goalProgress.threshold += (blockBreakTime / 1000);
				// Break time is in ms; Emit a message when breaking will take more than 3 seconds
				return blockBreakTime > 3000;
			}
		}
		else {
			this.digging = false;
		}
		return false;
	}

	canSeeBlockType(blockType) {
		let blocks = this.bot.findBlocks({
			point: this.bot.entity.position,
			matching: blockType,
			maxDistance: 3,
			count: 50
		});
		blocks = blocks.filter(p => {
			if (this.bot.entity.position.distanceTo(p) > 3) return false;
			const b = this.bot.blockAt(p);
			if (!this.bot.canSeeBlock(b)) return false;
			return true;
		});
		return blocks.length > 0;
	}

	canSeeWater() {
		if (this.active) return false;
		if (this.bot.autobot.landscaping.fillingWater) return false;
		return this.canSeeBlockType(this.bot.mcData.blocksByName.water.id);
	}

	handleWater() {
		let cobblestoneCount = this.bot.autobot.inventory.getInventoryDictionary().cobblestone || 0;
		if (cobblestoneCount === 0) return;
		this.bot.pathfinder.setGoal(null);
		this.bot.autobot.behaviourSelect.resetAllBehaviours(() => {
			this.bot.autobot.landscaping.fillWaterBody(this.bot.entity.position, this.returnHome);
		});
		
	}

	canSeeLava() {
		if (this.active) return false;
		if (this.bot.autobot.landscaping.fillingLava) return false;
		return this.canSeeBlockType(this.bot.mcData.blocksByName.lava.id);
	}

	handleLava() {
		let cobblestoneCount = this.bot.autobot.inventory.getInventoryDictionary().cobblestone || 0;
		if (cobblestoneCount === 0) return;
		const savedGoal = this.goal;
		this.bot.pathfinder.setGoal(null);
		this.bot.autobot.landscaping.fillLava(this.bot.entity.position, () => {
			this.bot.pathfinder.setGoal(savedGoal);
		});
	}

	canSeeCobwebs() {
		if (this.bot.autobot.landscaping.removingCobwebs) return false;
		return this.canSeeBlockType(this.bot.mcData.blocksByName.cobweb.id);
	}

	handleCobwebs() {
		const savedGoal = this.goal;
		this.bot.pathfinder.setGoal(null);
		this.bot.autobot.landscaping.removeCobwebs(() => {
			this.bot.pathfinder.setGoal(savedGoal);
		});
	}

	torchAtFeet() {
		const torchBlockTypes = [
			this.bot.mcData.blocksByName.torch.id,
			this.bot.mcData.blocksByName.wall_torch.id
		];
		const footBlock = this.bot.blockAt(this.bot.entity.position);
		return torchBlockTypes.includes(footBlock.type);
	}

	handleTorchFoot() {
		const savedGoal = this.goal;
		this.bot.pathfinder.setGoal(null);
		const footBlock = this.bot.blockAt(this.bot.entity.position);
		this.bot.dig(footBlock, true, (err) => {
			this.bot.pathfinder.setGoal(savedGoal);
		});
	}

	isInDarkness() {
		const footBlock = this.bot.blockAt(this.bot.entity.position);
		const torchBlockTypes = [
			this.bot.mcData.blocksByName.torch.id,
			this.bot.mcData.blocksByName.wall_torch.id
		];
		let torches = this.bot.findBlocks({
			point: bot.entity.position,
			matching: torchBlockTypes,
			maxDistance: 7,
			count: 50
		});
		torches = torches.filter(p => this.bot.canSeeBlock(this.bot.blockAt(p)));
		return (footBlock.skyLight === 0 && torches.length === 0);
	}

	isIdle() {
		if (this.idlePos.equals(this.bot.entity.position)) {
			if (Date.now() > this.idleTime + (120 * 1000)) {
				return true;
			}
		}
		else {
			this.idlePos = this.bot.entity.position;
			this.idleTime = Date.now();
		}
		return false;
	}

	monitorMovement () {
		// Check if the bot is idle for over one minute
		if (this.isIdle()) this.sendBotIdle();
		// Bail if not pathfinding
		if (!this.bot.pathfinder.isMoving() || !this.goal) return;
		// Test if stuck
		if (this.isStuck() && !this.goalProgress.notified) this.sendBotStuck();
		// Test if caught in a movement loop
		if (this.exceededTravelTimeLimit() && !this.goalProgress.movementLoopNotified) this.sendExceededTravelTimeLimit();
		// Test for excessive break time
		if (this.testExcessiveBreakTime()) this.sendExcessiveBreakTime();
		// Test for arrival at next point
		if (!this.goalProgress.position.equals(this.bot.entity.position.floored())) {
			this.sendReachedNextPoint();
			this.setGoalProgress();
			if (this.canSeeWater()) this.sendWaterNearby();
			if (this.canSeeLava()) this.sendLavaNearby();
			if (this.canSeeCobwebs()) this.sendCobwebsNearby();
			if (this.torchAtFeet()) this.sendTorchAtFeet();
		}
	}

	sendArrivedHome() {
		const eventName = 'autobot.navigator.arrivedHome';
		let result = {
			error: false,
			resultCode: "arrivedHome",
			description: "Bot arrived back at the home position."
		};
		this.bot.emit(eventName, result);
		this.active = false;
	}

	sendReachedGoal(goalVec3, distanceFromGoal, activeFunction) {
		const eventName = 'autobot.navigator.goalReached';
		let result = {
			error: false,
			resultCode: "reachedGoal",
			description: "Reached the target goal successfully.",
			goalPosition: goalVec3,
			distanceFromGoal: distanceFromGoal,
			activeFunction: activeFunction
		};
		this.bot.emit(eventName, result);
	}

	sendBotStuck() {
		this.bot.emit('autobot.navigator.botStuck', this.goalProgress, this.goal);
		this.goalProgress.notified = true;
	}

	sendExceededTravelTimeLimit() {
		this.bot.emit('autobot.navigator.exceededTravelTimeLimit', this.goalProgress, this.goal);
		this.goalProgress.movementLoopNotified = true;
	}

	sendExcessiveBreakTime() {
		const block = this.bot.targetDigBlock;
		const tool = bestHarvestTool(this.bot, block);
		const blockBreakTime = breakTime(this.bot, block, tool);
		this.bot.emit('autobot.navigator.excessiveBreakTime', block, blockBreakTime);
	}

	sendBotIdle() {
		if (!this.idleNotified) {
			this.idleNotifed = true;
			const eventName = 'autobot.navigator.botIdle';
			let result = {
				error: true,
				resultCode: "botIdle",
				description: "Bot has not moved in over one minute"
			};
			this.bot.emit(eventName, result);
		}
	}

	sendReachedNextPoint() {
		const eventName = 'autobot.navigator.progress';
		let result = {
			error: false,
			resultCode: "reachedNextPoint",
			description: "Bot reached the next point on its path"
		};
		this.bot.emit(eventName, result);
	}

	sendWaterNearby() {
		const eventName = 'autobot.navigator.progress';
		let result = {
			error: false,
			resultCode: "waterNearby",
			description: "Bot encountered water during pathfinding",
			goal: this.goal
		};
		this.bot.emit(eventName, result);
	}

	sendLavaNearby() {
		const eventName = 'autobot.navigator.progress';
		let result = {
			error: false,
			resultCode: "lavaNearby",
			description: "Bot encountered lava during pathfinding",
			goal: this.goal
		};
		this.bot.emit(eventName, result);
	}

	sendCobwebsNearby() {
		const eventName = 'autobot.navigator.progress';
		let result = {
			error: false,
			resultCode: "cobwebsNearby",
			description: "Bot encountered cobwebs during pathfinding",
			goal: this.goal
		};
		this.bot.emit(eventName, result);
	}

	sendTorchAtFeet() {
		const eventName = 'autobot.navigator.progress';
		let result = {
			error: false,
			resultCode: "torchAtFeet",
			description: "Bot has a torch in the foot block space",
			goal: this.goal
		};
		this.bot.emit(eventName, result);
	}
}

module.exports = Navigator;
