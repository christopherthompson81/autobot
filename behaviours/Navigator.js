const autoBind = require('auto-bind');
const { GoalNear } = require('./pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;

class Navigator {
	constructor(bot, mcData) {
		autoBind(this);
		this.bot = bot;
		this.mcData = mcData;
	}

	setHomePosition() {
		const craftingTables = this.bot.findBlocks({
			matching: this.mcData.blocksByName('crafting_table').id,
			maxDistance: 128,
			count: 10
		});
		// Only set home on near surface crafting tables
		let craftingTable = null;
		for (const point of craftingTables) {
			if (point.y >= 60) {
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
		sleep(350).then(() => {
			this.bot.clearControlStates();
			callback();
		});
	}

	returnHome() {
		//console.log("Returning to home position: ", this.bot.autobot.homePosition);
		this.bot.pathfinder.setGoal(null);
		this.backupBot(() => {
			const p = this.bot.autobot.homePosition;
			//this.currentTask = 'stashing';
			this.callback = this.bot.autobot.stash.stashNonEssentialInventory;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.bot.pathfinder.setGoal(goal);
		});
	}
}

module.exports = Navigator;
