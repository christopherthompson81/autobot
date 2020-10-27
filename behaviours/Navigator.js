class Navigator {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.bot.autobot.homePosition = this.setHomePosition();
	}

	getPosHash(p) {
		return p.x + ',' + p.y + ',' + p.z;
	}

	setHomePosition() {
		const craftingTables = this.bot.findBlocks({
			matching: this.listBlocksByRegEx(/^crafting_table$/),
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
		console.log("Returning to home position: ", this.homePosition);
		this.bot.pathfinder.setGoal(null);
		this.backupBot(() => {
			const p = this.homePosition;
			this.currentTarget = p;
			this.currentTask = 'stashing';
			this.callback = this.stashNonEssentialInventory;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.bot.pathfinder.setGoal(goal);
		});
	}
}

module.exports = Navigator;
