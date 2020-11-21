const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
const { GoalNear } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;

class Navigator {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.callback = () => {};
		this.active = false;
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
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
}

module.exports = Navigator;
