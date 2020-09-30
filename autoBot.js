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
let config = JSON.parse(fs.readFileSync('autobot_config.json'));
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
		this.recipe = require("prismarine-recipe")(this.bot.version).Recipe;
		// lookAt-Bot Code
		//this.schedule = setInterval(this.stare, 50);
		// lumberjack-Bot Code
		// Wait two seconds before starting to make sure blocks are loaded
		sleep(2000).then(() => {
			console.log(this.bot.inventory);
			this.harvestNearestTree(); 
		});
		// Collect broken blocks
		//this.pickUpBrokenBlocks();
	}

	onGoalReached (goal) {
		console.log("Goal Reached!", goal, this.currentTask);
		if (this.currentTask === 'cutTree') {
			console.log(`Path followed to one block from ${goal.position}.`);
			console.log(`Cutting tree from bottom up.`);
			this.cutTreeNext(this.remainder);
		}
		else if (this.currentTask === 'collectDrops') {
			sleep(350).then(() => { this.pickUpNext(this.remainder); });
		}
		else if (this.currentTask === 'crafting') {
			sleep(350).then(() => { this.callback(); } );
		}
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

	getInventoryDictionary() {
		const inventory = this.bot.inventory.items();
		const dictionary = {};
		for (const item of inventory) {
			dictionary[item.name] = (dictionary[item.name] || 0) + item.count;
			dictionary[item.type] = (dictionary[item.type] || 0) + item.count;
		}
		return dictionary;
	}

	getInventoryItemById(itemId) {
		const inventory = this.bot.inventory.items();
		for (const item of inventory) {
			if (item.type == itemId) {
				return item;
			}
		}
		console.log(`We do not have item(${itemId}): ${this.mcData.items[itemId].displayName}`);
		return null;
	}

	equipByName(itemName, callback) {
		console.log(`Attempting to equip: ${itemName}.`);
		const regex = RegExp(`${itemName}$`, "i");
		//console.log(regex);
		const itemList = this.listItemsByRegEx(regex);
		//console.log(itemList);
		let item = null;
		for (const i of this.bot.inventory.items()) {
			if (itemList.includes(i.type)) {
				item = i;
				break;
			}
		}
		if (!item) {
			console.log(`Fail. No ${itemName} found in inventory.`);
			callback();
		}
		else {
			this.bot.equip(item, 'hand', (err) => {
				if (err) {
					console.log(err, item);
					callback();
				}
				else {
					this.bot.hand = item;
					callback();
				}
			});
		}
	}

	/**************************************************************************
	 * 
	 * Automatic Crafting
	 * 
	 **************************************************************************/

	// Get a dictonary of ingredients from a recipe, regardless of shape
	getIngredients(recipe) {
		if (recipe.ingredients) {
			return recipe.ingredients;
		}
		else {
			const ingredientDict = {};
			//console.log(recipe);
			for (const row of recipe.inShape) {
				for (const item of row) {
					if (ingredientDict[item.id] === undefined) {
						ingredientDict[item.id] = item.count;
					}
					else {
						ingredientDict[item.id] =
							ingredientDict[item.id] + item.count;
					}
				}
			}
			const ingredients = Array();
			for (const i in ingredientDict) {
				ingredients.push({"id": i, "count": ingredientDict[i]})
			}
			return ingredients;
		}
	}

	// Check if the bot has at least some number of an item in it's inventory
	haveIngredient(itemId, count) {
		if (itemId < 0) {
			return true;
		}
		const inventoryDict = this.getInventoryDictionary();
		if (inventoryDict[itemId] >= count) {
			return true;
		}
		else {
			//console.log(`itemId: ${itemId}; count: ${count}`, inventoryDict);
			return false;
		}
	}

	// Crafting possibilities are a tree.
	//
	// All possible recipe possibilities should be calculated
	//
	// Ones that are not currently possible should be marked as such
	//
	// Some metric for how easy it is to acquire missing ingredients should be
	// devised 
	getCraftingTree(itemId, count) {
		if (this.mcData.items[itemId] === undefined) {
			return;
		}
		if (count === -1) {
			count = 1;
		}
		//console.log(`Finding crafting path for ${this.mcData.items[itemId].name}`);
		let craftQueue = Array();
		// Get a list of recipes
		const recipes = this.recipe.find(itemId);
		//console.log(`Has ${recipes.length} recipes`);
		if (recipes.length == 0) {
			// No recipe means the item needs to be acquired
			//console.log(`${this.mcData.items[itemId].name} must be acquired.`);
			const disposition = this.haveIngredient(itemId, count) ? "possess" : "missing";
			craftQueue.push({
				error: false,
				name: this.mcData.items[itemId].name,
				disposition: disposition,
				id: itemId,
				count: count,
			});
			return craftQueue;
		}
		else {
			//console.log(`${this.mcData.items[itemId].name} can be crafted.`);
			for (const recipe of recipes) {
				let queueBranch = Array();
				const ingredients = this.getIngredients(recipe);
				for (const ingredient of ingredients) {
					/*
					if (!this.haveIngredient(ingredient.id, ingredient.count)) {
						console.log(`${itemId} missing ingredients:`, ingredients)
					}
					*/
					const parentQueue = this.getCraftingTree(
						ingredient.id,
						ingredient.count
					);
					if (parentQueue) {
						for (const item of parentQueue) {
							queueBranch.push(item);
						}
					}
				}
				if (queueBranch.length > 1) {
					craftQueue.push({
						"error": false,
						"name": this.mcData.items[itemId].name,
						"recipe": recipe,
						"disposition": "requires",
						"requires": queueBranch
					});	
				}
				else {
					craftQueue.push(queueBranch[0]);
				}
			}
			return [
				{
					"error": false,
					"name": this.mcData.items[itemId].name,
					"disposition": "craft",
					"id": itemId,
					"count": count,
					"one_of": craftQueue,
				}
			];
		}
	}

	unrollCraftingTree(itemId, count, craftingTree) {
		let possiblePaths = Array();
		const craftTask = {
			id: itemId,
			name: craftingTree.name,
			recipe: craftingTree.recipe,
			count: count,
		};
		if (craftingTree["disposition"] === "craft") {
			for (const child of craftingTree["one_of"]) {
				if (child.missing) {
					continue;
				}
				possiblePaths = [craftTask];
				const subpaths = this.unrollCraftingTree(child.id, child.count, child);
				if (subpaths) {
					for (const subpath of subpaths) {
						possiblePaths.push(subpath);
					}
				}
				else {
					continue;
				}
				if (possiblePaths[possiblePaths.length - 1].missing) {
					//console.log(possiblePaths[possiblePaths.length - 1]);
					continue;
				}
				else {
					return possiblePaths;
				}
			}
			//console.log(craftingTree["one_of"]);
			//exit();
			return null;
		}
		else if (craftingTree["disposition"] === "requires") {
			for (const subtree of craftingTree["requires"]) {
				const subpath = this.unrollCraftingTree(
					subtree.id,
					subtree.count,
					subtree
				);
				if (subpath) {
					possiblePaths.push(...subpath);
				}
				else {
					return subpath;
				}
			}
			return possiblePaths;
		}
		else if (craftingTree["disposition"] === "possess") {
			return [craftTask];
		}
		else {
			// "missing" item case.
			craftTask["missing"] = true;
			return [craftTask];
		}
	}

	listMissing(craftingTree) {
		if (craftingTree.disposition === 'missing') {
			return [craftingTree.id];
		}
		else if (craftingTree.disposition === 'craft') {
			let missingList = Array();
			for (const path of craftingTree.one_of) {
				const missing = this.listMissing(path);
				if (missing) {
					missingList = [...missingList, ...missing];
				}
			}
			return missingList;
		}
		else if (craftingTree.disposition === 'requires') {
			let missingList = Array();
			for (const path of craftingTree.requires) {
				const missing = this.listMissing(path);
				missingList = [...missingList, ...missing];
			}
			return missingList;
		}
		else {
			// possess case
			//console.log(craftingTree);
			return null;
		}
	}
	
	getMissing(itemId) {
		const craftingTree = this.getCraftingTree(itemId, 1);
		const missing = this.listMissing(craftingTree[0]);
		const missingSet = new Set();
		for (const item of missing) {
			missingSet.add(parseInt(item));
		}
		return Array.from(missingSet).sort();
	}
	
	itemsToBlocks(items) {
		// Find all blocks that drop any items from a list
		const blocks = [];
		for (const blockId in this.mcData.blocks) {
			const block = this.mcData.blocks[blockId];
			const found = block.drops.some(r => items.indexOf(r) >= 0);
			if (found) {
				blocks.push(block.id);
			}
		}
		return blocks;
	}

	findMissingItemsNearby(itemList) {
		return this.bot.findBlocks({
			matching: this.itemsToBlocks(itemList),
			maxDistance: 128,
			count: 10,
		});
	}

	getCraftingPath(itemId, count) {
		const craftingTree = this.getCraftingTree(itemId, count);
		//console.log(craftingTree[0]);
		const path = this.unrollCraftingTree(itemId, count, craftingTree[0]);
		return path;
	}

	getCraftingQueue(itemId, count) {
		const path = this.getCraftingPath(itemId, count);
		if (path) {
			return path.reverse();
		}
		else {
			return [];
		}
	}

	findUsableRecipe(itemId) {
		const recipes = this.recipe.find(itemId);
		for (const recipe of recipes) {
			const ingredients = this.getIngredients(recipe);
			let haveIngredients = true;
			for (const ingredient of ingredients) {
				if (!this.haveIngredient(ingredient.id, ingredient.count)) {
					haveIngredients = false;
				}
			}
			if (haveIngredients) {
				return recipe;
			}
		}
		return null;
	}

	// Recursively craft an item (craft parents if needed)
	autoCraftNext(craftingQueue, callback) {
		const current = craftingQueue[0];
		const remainder = craftingQueue.slice(1, craftingQueue.length);
		if (current) {
			console.log(`Crafting ${this.mcData.items[current.id].displayName}`);
			if (this.haveIngredient(current.id, current.count)) {
				console.log("Skipping");
				this.autoCraftNext(remainder, callback);
				return;
			}
			let recipe = current.recipe;
			if (!recipe) {
				recipe = this.findUsableRecipe(current.id);
				// Fix for minecraft-data bug #231
				//https://github.com/PrismarineJS/minecraft-data/issues/231
				if (recipe.inShape) {
					recipe.inShape = recipe.inShape.reverse();
				}
				//console.log(JSON.stringify(recipe));
			}
			let craftingTable = null;
			if (recipe.requiresTable) {
				console.log("Needs crafting table");
				craftingTable = this.bot.findBlock({
					matching: this.listBlocksByRegEx(/^crafting_table$/),
					maxDistance: 128,
					count: 10
				});
				if (!craftingTable) {
					// make one and put it on any block one move away that has the same Y value
					this.craftCraftingTable(() => {
						this.autoCraftNext(craftingQueue, callback);
					});
					return;
				}
				console.log("Found one:", craftingTable);
				const p = craftingTable.position;
				const goal = new GoalGetToBlock(p.x, p.y, p.z);
				this.currentTask = "crafting";
				this.callback = () => {
					this.bot.craft(recipe, current.count, craftingTable, (err) => {
						if (err) {
							console.log(err, JSON.stringify(recipe), current.count, craftingTable);
							exit();
						}
						else {
							console.log("Theoretical success!", this.bot.inventory.items());
							console.log(JSON.stringify(recipe), current.count, craftingTable);
						}
						if (remainder.length > 0) {
							this.autoCraftNext(remainder, callback)
						}
						else {
							callback();
						}
					});
				}
				console.log("Moving to crafting table");
				this.bot.pathfinder.setGoal(goal);
				return;
			}
			this.bot.craft(recipe, current.count, null, () => {
				if (remainder.length > 0) {
					this.autoCraftNext(remainder, callback)
				}
				else {
					callback();
				}
			});
		}
		else {
			callback();
		}
	}

	checkNeedsCraftingTable(craftingQueue) {
		for (const item of craftingQueue) {
			if (item.recipe) {
				if (item.recipe.requiresTable) {
					return true;
				}
			}
		}
		return false;
	}

	// Find an orientation / vector from the bot in which a block can be placed.
	// self.y == target.y
	// block.type == 'air' for target
	// block.material in ['rock', 'dirt', 'wood'] for target.y - 1
	findPlacementVector() {
		const sides = [
			new Vec3(1, 0, 0),
			new Vec3(-1, 0, 0),
			new Vec3(0, 0, 1),
			new Vec3(0, 0, -1)
		];
		const below = new Vec3(0, -1, 0);
		const botPosition = this.bot.entity.position.clone();
		for (const side of sides) {
			const point = botPosition.clone();
			point.add(side);
			const block = this.bot.blockAt(point);
			// block.type == 'air' for target
			if (block.name === 'air') {
				console.log(block, "is air");
				// block.material in ['rock', 'dirt', 'wood'] for target.y - 1
				const blockBelow = this.bot.blockAt(point.add(below));
				//console.log(`And below is `, blockBelow, blockBelow.material);
				if (['rock', 'dirt', 'wood'].includes(blockBelow.material)) {
					console.log(`And below is ${blockBelow.material}`);
					return side;
				}
			}
		}
		console.log("Could not find an adjacent space suitable for placement");
		return false;
	}

	placeCraftingTable(callBack) {
		const craftingTableId = this.listItemsByRegEx(/^crafting_table$/)[0];
		const craftingTable = this.getInventoryItemById(craftingTableId);
		const placementVector = this.findPlacementVector();
		const referenceBlock = this.bot.blockAt(this.bot.entity.position.offset(
			placementVector.x || 0,
			placementVector.y || 0,
			placementVector.z || 0,
		));
		this.bot.equip(
			craftingTable,
			'hand',
			() => {
				this.bot.placeBlock(
					referenceBlock,
					placementVector,
					() => { callBack(); }
				)
			}
		);
	}

	craftCraftingTable(callback) {
		const craftingTableId = this.listItemsByRegEx(/^crafting_table$/)[0];
		// If we have one, place it
		if (this.haveIngredient(craftingTableId, 1)) {
			this.placeCraftingTable(() => { callback(); });
			return;
		}
		const recipes = this.recipe.find(craftingTableId);
		const inventory = this.getInventoryDictionary();
		let usableRecipe = null;
		for (const recipe of recipes) {
			let haveIngredients = true;
			const ingredients = this.getIngredients(recipe);
			for (const ingredient of ingredients) {
				if (!inventory[ingredient.id] || inventory[ingredient.id] < ingredient.count) {
					// This recipe is no good
					haveIngredients = false;
					break;
				}
			}
			if (haveIngredients) {
				usableRecipe = recipe;
				break;
			}
		}
		if (usableRecipe) {
			this.bot.craft(usableRecipe, 1, null, () => this.placeCraftingTable(callback));
		}
		else {
			console.log("Could not create a crafting table because we lack the required resources.");
		}
	}

	// Recursively craft an item (craft parents if needed)
	autoCraft(itemId, count, callback) {
		const craftingQueue = this.getCraftingQueue(itemId, count);
		if (craftingQueue.length === 0) {
			console.log(`No path to craft a ${this.mcData.items[itemId].displayName} due to lack of acquisition-obligate resources.`);
			const missing = this.getMissing(itemId);
			console.log("List of missing acquisition-obligate resources:", missing);
			const blocks = this.findMissingItemsNearby(missing);
			if (blocks.length > 0) {
				const blockObj = this.bot.blockAt(blocks[0]);
				//console.log(blockObj);
				console.log(`There is a(n) ${blockObj.displayName} nearby, which would close the resource gap in crafting a(n) ${this.mcData.items[itemId].displayName}`);
				if (blockObj.harvestTools) {
					console.log(`Harvesting ${blockObj.displayName} requires specific tools.`);
				}
				else {
					console.log(`Harvesting ${blockObj.displayName} does not require specific tools.`);
				}
			}
		}
		const needsCraftingTable = this.checkNeedsCraftingTable(craftingQueue);
		let craftingTable = null;
		if (needsCraftingTable) {
			const craftingTableId = this.listItemsByRegEx(/^crafting_table$/)[0];
			craftingTable = this.bot.findBlock({
				matching: this.listBlocksByRegEx(/^crafting_table$/),
				maxDistance: 128,
				count: 10
			})[0];
			if (!craftingTable) {
				// If we have one, place it
				if (this.haveIngredient(craftingTableId)) {
					this.placeCraftingTable(() => { this.autoCraftNext(craftingQueue, callback); });
					return;
				}
				// make one and put it on any block one move away that has the same Y value
				this.craftCraftingTable(() => { this.autoCraftNext(craftingQueue, callback); });
			}
		}
		else {
			console.log("Calling autoCraftNext", craftingQueue);
			this.autoCraftNext(craftingQueue, callback);
		}
	}

	/**************************************************************************
	 * 
	 * Lumberjack / cutting down trees
	 * 
	 **************************************************************************/

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
			count: 100
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

	equipAxe(callback) {
		//console.log(this.bot.inventory);
		this.equipByName("axe", () => {
			console.log("Hand: ", this.bot.hand);
			this.autoCraft(586, 1, () => {
				sleep(350).then(() => { this.equipByName("axe", callback); });
			});
		});
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

	cutTree(tree) {
		// Go to a tree and cut it down
		this.remainder = tree;
		const p = tree[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.pathfinder.setGoal(goal);
	}

	harvestNearestTree() {
		this.equipAxe(() => {
			this.currentTask = 'cutTree';
			const tree = this.findNearestTree();
			if (tree) {
				console.log("Cutting tree: ", tree[0].position);
				this.cutTree(tree);
			}
			else {
				console.log("No valid trees located.");
			}
		});
		/*
		const tree = this.findNearestTree();
		if (tree) {
			console.log("Cutting tree: ", tree[0].position);
			this.cutTree(tree);
		}
		else {
			console.log("No valid trees located.");
		}
		*/
	}

	/**************************************************************************
	 * 
	 * Collect Items
	 * 
	 **************************************************************************/

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
