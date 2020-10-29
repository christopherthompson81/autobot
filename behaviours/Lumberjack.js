const sortByDistanceFromBot = require('./autoBotLib').sortByDistanceFromBot;
const bestHarvestTool = require('./autoBotLib').bestHarvestTool;

class Lumberjack {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.callback = () => {};
	}

	/**************************************************************************
	 * 
	 * Lumberjack / cutting down trees
	 * 
	 **************************************************************************/

	listOfLogs() {
		return this.bot.autobot.inventory.listBlocksByRegEx(/_log$/);
	}

	/*
	Return an array of blocks forming a tree based on a position
	Discriminates between tree and non-tree by checking if:
		* No dirt under bottom log
		* No Leaves above top log
	*/
	blockToTree(p) {
		let point = p.clone();
		const oldY = p.y;
		let bottom;
		let top;
		while (!bottom) {
			point.subtract(new Vec3(0, 1, 0));
			let block = this.bot.blockAt(point);
			//console.log(`Checking if ${block.name} is not like '%_log'`);
			if (!block.name.match(/_log$/)) {
				//console.log(`Checking if ${block.name} is not 'dirt'`);
				if (block.name === 'dirt') {
					bottom = block.position.clone().add(new Vec3(0, 1, 0));
				}
				else {
					//console.log(`Block: ${p} is not a tree because it does not have dirt below it's base`);
					return false;
				}
			}
		}
		point.y = oldY;
		while (!top) {
			point.add(new Vec3(0, 1, 0));
			const block = this.bot.blockAt(point);
			//console.log(`Checking if ${block.name} is not like '%_log'`);
			if (!block.name.match(/_log$/)) {
				//console.log(`Checking if ${block.name} is like '%_leaves'`);
				if (block.name.match(/_leaves$/)) {
					top = point.clone().subtract(new Vec3(0, 1, 0));
				}
				else {
					//console.log(`Block: ${p} is not a tree because it does not have leaves above it's top`);
					return false;
				}
			}
		}
		const tree = Array();
		for (var i = bottom.y; i <= top.y; i++) {
			const block = this.bot.blockAt(new Vec3(bottom.x, i, bottom.z));
			tree.push(block);
		}
		return tree;
	}

	findNearestTree() {
		let logs = this.bot.findBlocks({
			point: this.homePosition,
			matching: this.listOfLogs(),
			maxDistance: 128,
			count: 1000
		});
		// Fail if no logs found
		if (logs.length === 0) {
			return false;
		}
		// resort to distance from bot
		logs = sortByDistanceFromBot(this.bot, logs);
		//console.log('Nearby logs are: ', logs);
		// Discriminate between trees and non-trees
		for (const log of logs) {
			const tree = this.blockToTree(log);
			if (tree) {
				// Return the first (nearest) tree
				return tree;
			}
		}
		// If no valid trees were found, return one log
		//console.log("No trees, cutting random log. I hope it's not someone's house.");
		return [this.bot.blockAt(logs[0])];
	}

	cutTreeNext(tree, callback) {
		const current = tree[0];
		const remainder = tree.slice(1, tree.length);
		const block = this.bot.blockAt(current, false);
		const tool = bestHarvestTool(bot, block);
		if (current) {
			//console.log(`Current:`, current);
			this.bot.equip(tool, 'hand', function () {
				this.bot.dig(current, true, (err) => {
					this.cutTreeNext(remainder, callback);
				});
			});
		}
		else {
			//console.log('Finished cutting. Waiting for drops.');
			this.currentTask = null;
			sleep(1500).then(() => {
				//console.log('Picking up uncollected blocks.');
				this.bot.autobot.pickUpBrokenBlocks(callback);
			});
		}
	}

	cutTree(tree, callback) {
		// Go to a tree and cut it down
		this.callback = () => { this.cutTreeNext(tree, callback); };
		const p = tree[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.pathfinder.setGoal(goal);
	}

	harvestNearestTree(callback, threshold) {
		// count logs if a threshold was set
		if (threshold) {
			const inventoryDict = this.getInventoryDictionary();
			let logCount = 0;
			for (const item in inventoryDict) {
				if (item.match(/_log$/)) {
					logCount += inventoryDict[item];
				}
			}
			if (logCount > threshold) {
				callback({
					error: true,
					errorCode: "unnecessary",
					errorDescription: "The bot possesses sufficient logs"
				});
				return;
			}
		}
		//this.bot.autobot.currentTask = 'cutTree';
		const tree = this.findNearestTree();
		if (tree) {
			//console.log("Cutting tree: ", tree[0].position);
			this.cutTree(tree, callback);
		}
		else {
			callback({
				error: true,
				errorCode: "noTrees",
				errorDescription: "No valid trees located."
			});
		}
	}
}

module.exports = Lumberjack;
