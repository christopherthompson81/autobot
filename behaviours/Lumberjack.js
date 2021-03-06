const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
const sortByDistanceFromBot = require('./autoBotLib').sortByDistanceFromBot;
const bestHarvestTool = require('./autoBotLib').bestHarvestTool;
const { GoalGetToBlock } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;

class Lumberjack {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.tree = [];
		this.callback = () => {};
		this.active = false;
	}

	resetBehaviour() {
		this.tree = [];
		this.callback = () => {};
		this.active = false;
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
			if (!block.name.match(/_log$/)) {
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
			if (!block.name.match(/_log$/)) {
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

	cutTreeNext() {
		const current = this.tree[0];
		this.tree = this.tree.slice(1, this.tree.length);
		if (current) {
			//console.log(`Current:`, current);
			const tool = bestHarvestTool(this.bot, current);
			this.bot.equip(tool, 'hand', () => {
				this.bot.dig(current, true, (err) => {
					this.cutTreeNext();
				});
			});
		}
		else {
			// Timeout is for blocks to land on the ground
			sleep(1500).then(() => {
				this.bot.autobot.collectDrops.pickUpBrokenBlocks(() => {
					this.sendLumberJackSuccess(this.callback);
				});
			});
		}
	}

	cutTree(tree, callback) {
		// Go to a tree and cut it down
		this.tree = tree;
		this.callback = callback;
		const p = tree[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.autobot.navigator.setGoal(goal);
	}

	harvestNearestTree(threshold, callback) {
		this.active = true;
		// count logs in inventory if a threshold was set
		if (threshold) {
			const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
			let logCount = 0;
			for (const item in inventoryDict) {
				if (item.match(/_log$/)) {
					logCount += inventoryDict[item];
				}
			}
			if (logCount > threshold) {
				this.sendLumberJackSkipping(callback);
				return;
			}
		}
		const tree = this.findNearestTree();
		if (tree) {
			this.sendTreeFound(tree);
			this.cutTree(tree, callback);
		}
		else {
			this.sendNoTrees(callback);
		}
	}

	sendTreeFound(tree) {
		const eventName = 'autobot.lumberjack.treeFound';
		let result = {
			error: false,
			resultCode: "treeFound",
			description: "Found a tree to harvest.",
			tree: tree
		}
		this.bot.emit(eventName, result);
	}

	sendLumberJackSuccess(callback) {
		const eventName = 'autobot.lumberjack.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Finished cutting tree and collecting logs."
		}
		this.bot.emit(eventName, result);
		this.active = false;
		if (callback) callback(result);
	}

	sendLumberJackSkipping(callback) {
		const eventName = 'autobot.lumberjack.done';
		let result = {
			error: false,
			resultCode: "skipping",
			description: "The bot possesses sufficient logs and therefore harvesting a tree is unnecessary."
		};
		this.bot.emit(eventName, result);
		this.active = false;
		if (callback) callback(result);
	}

	sendNoTrees(callback) {
		const eventName = 'autobot.lumberjack.done';
		let result = {
			error: true,
			resultCode: "noTrees",
			description: "No valid trees located."
		};
		this.bot.emit(eventName, result);
		this.active = false;
		if (callback) callback(result);
	}
}

module.exports = Lumberjack;
