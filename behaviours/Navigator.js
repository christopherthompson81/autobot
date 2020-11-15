const autoBind = require('auto-bind');
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
}

module.exports = Navigator;
