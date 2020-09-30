/*
Experimental Minecraft Bot

The goal of this bot is to function independantly from an operator.

To be successful it must:
	* Bootstrap itself
		* Acquire resources
		* Craft needs
		* Equip itself with tools
		* Manage inventory
		* Have an understanding of where it's "base of operations" is.
	* Survive
		* Armour itself
		* Build shelter
		* Avoid Harm
		* Farm
		* Eat
	* Gain game achievements
		* Improve Tools
		* Diversify recipe book
*/
'use strict';

const autoBind = require('auto-bind');
const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalBlock, GoalNear, GoalGetToBlock } = require('mineflayer-pathfinder').goals;
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('lookerConfig.json'));
const minecraftData = require('minecraft-data');
const { exit } = require('process');
const { timeStamp } = require('console');
const Vec3 = require('vec3').Vec3

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class autoBot {
	constructor() {
		autoBind(this);
		this.bot = mineflayer.createBot({
			host: config.host,
			port: config.port,
			username: config.username,
			password: config.password
		});
		this.bot.loadPlugin(pathfinder);
		this.defaultMove = null;
		this.schedule = null;
		this.currentTask = null;
		this.bot.once('spawn', this.botLoop);
		this.bot.on('goal_reached', this.onGoalReached);
	};

	botLoop() {
		//console.log(this.bot);
		this.mcData = minecraftData(this.bot.version);
		this.defaultMove = new Movements(this.bot, this.mcData);
		this.bot.pathfinder.setMovements(this.defaultMove);
		// lookAt-Bot Code
		//this.schedule = setInterval(this.stare, 50);
		// lumberjack-Bot Code
		this.harvestNearestTree();
		// Collect broken blocks
		//this.pickUpBrokenBlocks();
	}

	stare() {
		const entity = this.bot.nearestEntity()
		if (entity !== null) {
			if (entity.type === 'player') {
				this.bot.lookAt(entity.position.offset(0, 1.6, 0))
			} else if (entity.type === 'mob') {
				this.bot.lookAt(entity.position)
			}
		}
	}

	// Recursively craft an item (craft parents if needed)
	async autoCraft(itemId, count, callBack) {
		const recipe = this.bot.recipesFor(itemId)[0];
		if (!recipe) {
			// No recipe means the item needs to be acquired by locating a source
			// (entity or block drop) and defeating/breaking
			//
			// CouldDo: acquire(bot, itemId, count);
			return false;
		}
		else {
			const ingredients = getRecipeIngredients(recipe);
			for (const ingredient in ingredients) {
				if (!haveIngredient(bot, ingredient.id, ingredient.count)) {
					const success = await autocraft(bot, ingredient.id, ingredient.count);
					if (!success) {
						console.log(
							'Error: Could not determine autocrafting strategy for ' +
							this.mcData.items[itemId].displayName +
							' because ingredient ' +
							this.mcData.items[ingredient.id].displayName +
							' needs to be acquired'
						);
						return false;
					}
				}
			}
			const repetitions = Math.ceil(count / recipe.result.count);
			await this.bot.craft(recipe, repetitions);
			return true;
		}
	}

	listBlocksByRegEx(regex) {
		const blockList = [];
		for (const i in this.mcData.blocks) {
			const block = this.mcData.blocks[i];
			if (block.name.match(regex)) {
				blockList.push(block.id);
			}
		}
		return blockList;
	}

	listItemsByRegEx(regex) {
		const itemList = [];
		for (const i in this.mcData.items) {
			const item = this.mcData.items[i];
			if (item.name.match(regex)) {
				itemList.push(item.id);
			}
		}
		return itemList;
	}

	listOfLogs() {
		return this.listBlocksByRegEx(/_log$/);
	}

	/*
	Return an array of blocks forming a tree based on a position

	Discriminates between tree and non-tree by checking if:
		* No dirt under bottom log
		* No Leaves above top log
		* Leaves do not surround the crown
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
					console.log(`Block: ${p} is not a tree because it does not have dirt below it's base`);
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
					console.log(`Block: ${p} is not a tree because it does not have leaves above it's top`);
					return false;
				}
			}
		}
		const sides = [
			new Vec3(1, 0, 0),
			new Vec3(-1, 0, 0),
			new Vec3(0, 0, 1),
			new Vec3(0, 0, -1)
		];
		for (var s = 0; s < sides.length; s++) {
			point = top.clone().add(sides[s]);
			const block = this.bot.blockAt(point);
			//console.log(`Checking if ${block.name} is not like '%_leaves'`);
			if (!block.name.match(/_leaves$/)) {
				console.log(`Block: ${p} is not a tree because it does not have leaves surrounding it's crown`);
				return false;
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
		// This list is sorted by distance
		const logTypes = this.listOfLogs();
		//console.log(logTypes);
		const logs = this.bot.findBlocks({
			matching: logTypes,
			maxDistance: 128,
			count: 10
		});
		//console.log('Nearby logs are: ', logs);
		// Discriminate between trees and non-trees
		for (const log of logs) {
			const tree = this.blockToTree(log);
			if (tree) {
				// Return the first (nearest) tree
				return tree;
			}
		}
		// If no valid trees were found, return false
		return false;
	}

	equipByName(itemName) {
		console.log(`Attempting to equip: ${itemName}.`);
		let item = null;
		const regex = RegExp(`/${itemName}$/`, "i");
		const itemList = this.listItemsByRegEx(regex);
		for (let i = 0; i < itemList.length; i++) {
			item = this.bot.inventory.findInventoryItem(itemList[i], null);
			if (item) {
				break;
			}
		}
		if (!item) {
			console.log(`Fail. No ${itemName} found in inventory.`);
			return false;
		}
		else {
			this.bot.equip(item, 'hand', (err) => {
				if (err) {
					console.log(err.stack);
				}
				else {
					this.bot.hand = item;
				}
			});
			//console.log(item);
			return true;
		}
	}

	async equipAxe() {
		let success = await this.equipByName("axe");
		if (!success) {
			await this.autoCraft(586);
			let success = await this.equipByName("axe");
		}
		return success;
	}

	onGoalReached (goal) {
		if (this.currentTask === 'cutTree') {
			console.log(`Path followed to one block from ${goal.position}.`);
			console.log(`Cutting tree from bottom up.`);
			this.cutTreeNext(this.remainder);
		}
		else if (this.currentTask === 'collectDrops') {
			sleep(350).then(() => { this.pickUpNext(this.remainder)} );
		}
	}

	cutTreeNext(tree) {
		const current = tree[0];
		const remainder = tree.slice(1, tree.length);
		if (current) {
			//console.log(`Current:`, current);
			this.bot.dig(current, true, (err) => {
				this.cutTreeNext(remainder);
			});
		}
		else {
			console.log('Finished cutting.');
			console.log('Picking up uncollected blocks.');
			this.currentTask = null;
			this.pickUpBrokenBlocks();
		}
	}

	cutTreeGoTo(tree) {
		this.remainder = tree;
		const p = tree[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.pathfinder.setGoal(goal);
	}

	async cutTree(tree) {
		// Go to a tree and cut it down
		this.cutTreeGoTo(tree);
	}

	async harvestNearestTree() {
		this.currentTask = 'cutTree';
		this.equipAxe();
		const tree = this.findNearestTree();
		if (tree) {
			console.log("Cutting tree: ", tree[0].position);
			this.cutTree(tree);
		}
		else {
			console.log("No valid trees located.");
		}
	}

	findNearbyDrops(maxDistance) {
		maxDistance = maxDistance | 10;
		const drops = Array();
		for (const i in this.bot.entities) {
			const entity = this.bot.entities[i];
			if (entity.type === "object") {
				const distance = this.bot.player.entity.position.distanceTo(entity.position);
				//console.log(`Distance: ${distance}`);
				if (distance > maxDistance) {
					//console.log(`Too Far`);
					continue;
				}
				//console.log(entity);
				//console.log(`Found a(n) ${this.mcData.items[entity.entityType].displayName}`);
				drops.push(entity);
			}
		}
		return drops;
	}

	pickUpNext(drops) {
		const current = drops[0];
		this.remainder = drops.slice(1, drops.length);
		if (current) {
			console.log(`Picking Up:`, current);
			const p = current.position;
			const goal = new GoalBlock(p.x, p.y, p.z);
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			console.log('Finished picking up drops.');
			//console.log('Stopping.');
			this.currentTask = null;
			sleep(350).then(this.harvestNearestTree);
		}
	}

	pickUpBrokenBlocks() {
		this.currentTask = 'collectDrops';
		const drops = this.findNearbyDrops(10);
		console.log(`Found ${drops.length} broken blocks to collect.`)
		this.remainder = drops;
		this.pickUpNext(drops);
	}
}

module.exports = autoBot;
