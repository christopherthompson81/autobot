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
const nbt = require('prismarine-nbt');
const pathfinder = require('./pathfinder/pathfinder').pathfinder;
const Movements = require('./pathfinder/pathfinder').Movements;
const { GoalBlock, GoalNear, GoalGetToBlock } = require('./pathfinder/pathfinder').goals;
const fs = require('fs');
let config = JSON.parse(fs.readFileSync('autobot_config.json'));
const minecraftData = require('minecraft-data');
const Vec3 = require('vec3').Vec3

const armorSlots = {
    head: 5,
    torso: 6,
    legs: 7,
	feet: 8,
	offHand: 45,
};

// materials are listed in decending order of bot prefererence
const toolItems = {
	names: [
		'sword',
		'pickaxe',
		'axe',
		'shovel',
		'hoe',
	],
	materials: [
		'iron',
		'stone',
		'wooden',
	],
	nonBotMaterials: [
		'diamond',
		'gold',
		'netherite',
	]
};

const armorItems = [
	{type: 'regex', regex: new RegExp('helmet$', 'i'), maxSlots: 1, requiredSlot: armorSlots.head},
	{type: 'regex', regex: new RegExp('chestplate$', 'i'), maxSlots: 1, requiredSlot: armorSlots.torso},
	{type: 'regex', regex: new RegExp('leggings$', 'i'), maxSlots: 1, requiredSlot: armorSlots.legs},
	{type: 'regex', regex: new RegExp('boots$', 'i'), maxSlots: 1, requiredSlot: armorSlots.feet},
	{type: 'name', name: 'shield', maxSlots: 1, requiredSlot: armorSlots.offHand},
];

const essentialItems = [
	{type: 'name', name: 'stick', maxSlots: 1},
	{type: 'regex', regex: new RegExp('planks$', 'i'), maxSlots: 1},
	{type: 'regex', regex: new RegExp('_log$', 'i'), maxSlots: 1},
	{type: 'name', name: 'dirt', maxSlots: 1},
	{type: 'name', name: 'cobblestone', maxSlots: 1},
	{type: 'name', name: 'iron_ingot', maxSlots: 1},
	{type: 'name', name: 'torch', maxSlots: 1},
	{type: 'name', name: 'coal', maxSlots: 1},
	{type: 'nameList', list: ['bucket', 'water_bucket', 'lava_bucket'], maxSlots: 1},
	{type: 'name', name: 'clock', maxSlots: 1},
	{
		type: 'nameList',
		list: [
			'apple',
			'baked_potato',
			'beetroot_soup',
			'bread',
			'carrot',
			'cooked_chicken',
			'cooked_cod',
			'cooked_mutton',
			'cooked_porkchop',
			'cooked_rabbit',
			'cooked_salmon',
			'dried_kelp',
			'honey_bottle',
			'melon_slice',
			'mushroom_stew',
			'pumpkin_pie',
			'rabbit_stew',
			'steak',
			'sweet_berries'
		],
		maxSlots: 1
	},
];

// reversable compressable items will cause an infinite recipe loop, so detect and break on them
const compressableItems = {
	bone_meal: "bone_block",
	coal: "coal_block",
	diamond: "diamond_block",
	dried_kelp: "dried_kelp_block",
	emerald: "emerald_block",
	gold_ingot: "gold_block",
	iron_ingot: "iron_block",
	iron_nugget: "iron_ingot",
	lapis_lazuli: "lapis_block",
	nether_wart: "nether_wart_block",
	redstone: "redstone_block",
	wheat: "hay_block",
};

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

class autoBot {
	constructor(botId) {
		botId = !botId ? '' : '_' + botId.toString();
		autoBind(this);
		this.bot = mineflayer.createBot({
			host: config.host,
			port: config.port,
			username: `${config.username}${botId}`,
			password: config.password
		});
		this.bot.loadPlugin(pathfinder);
		this.defaultMove = null;
		this.schedule = null;
		this.currentTask = null;
		this.currentTarget = {
			posHash: '',
			errorCount: 0
		};
		this.nearbyThreshold = 6;
		this.badTargets = [];
		this.bot.once('spawn', this.botLoop);
		this.bot.on('goal_reached', this.onGoalReached);
		this.bot.on('excessive_break_time', this.onExcessiveBreakTime);
		this.bot.on('bot_stuck', this.onBotStuck);
		this.chestMap = {};
	};

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

	botLoop() {
		this.mcData = minecraftData(this.bot.version);
		this.defaultMove = new Movements(this.bot, this.mcData);
		this.bot.pathfinder.setMovements(this.defaultMove);
		this.recipe = require("prismarine-recipe")(this.bot.version).Recipe;
		// Wait two seconds before starting to make sure blocks are loaded
		this.bot.waitForChunksToLoad(() => {
			console.log('Waiting for 5 seconds to allow world to load.');
			sleep(5000).then(() => {
				this.homePosition = this.setHomePosition();
				//this.homePosition = new Vec3(180, 68, 160);
				this.currentTarget = this.homePosition;
				console.log(`Home Position: ${this.homePosition}`);
				//this.harvestNearestTree();
				//this.mineNearestOreVein();
				this.stashNonEssentialInventory();
				//this.smeltOre();
				//this.pickUpBrokenBlocks();
			});
		});
	}

	onGoalReached (goal) {
		console.log("Goal Reached!", goal, this.currentTask, this.bot.entity.position);
		const goalVec3 = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalVec3.distanceTo(this.bot.entity.position));
		if (distanceFromGoal > (Math.sqrt(goal.rangeSq) || 3)) {
			console.log("An error happened in attempting to reach the goal. Distance", distanceFromGoal);
			const goalPos = new Vec3(goal.x, goal.y, goal.z);
			const posHash = goal.x + ',' + goal.y + ',' + goal.z;
			if (this.currentTarget.posHash === posHash) {
				this.currentTarget.errorCount++;
				if (this.currentTarget.errorCount > 5) {
					if (this.currentTask === 'mining') {
						this.badTargets.push(goalPos.clone());
					}
					this.returnHome();
					return
				}
			}
			else {
				this.currentTarget.posHash = posHash;
				this.currentTarget.errorCount = 1;
			}
			//const newGoal = new GoalNear(goal.x, goal.y, goal.z, (Math.sqrt(goal.rangeSq) || 3));
			this.backupBot(() => this.bot.pathfinder.setGoal(goal));
			return;
		}
		if (this.currentTask === 'cutTree') {
			console.log(`Cutting tree from bottom up.`);
			this.equipAxe(() => { this.cutTreeNext(this.remainder); });
		}
		else if (this.currentTask === 'collectDrops') {
			sleep(350).then(() => { this.pickUpNext(this.remainder); });
		}
		else if (this.currentTask === 'crafting') {
			sleep(350).then(() => { this.callback(); });
		}
		else if (this.currentTask === 'stashing') {
			sleep(350).then(() => { this.callback(); });
		}
		else if (this.currentTask === 'mineVein') {
			sleep(350).then(() => { this.mineVeinNext(this.remainder); });
		}
		else if (this.currentTask === 'smelting') {
			sleep(350).then(() => { this.callback(); });
		}
		else if (this.currentTask === 'flattenCube') {
			sleep(350).then(() => { this.callback(); });
		}
	}

	onExcessiveBreakTime(block, breakTime) {
		console.log(`Excessive break time (${breakTime}) trying to break ${block.displayName} at ${block.position}`);
		if (this.currentTask === 'mineVein') {
			this.bot.pathfinder.setGoal(null);
			this.currentTask = 'stashing';
			console.log('Excess break time forcing tool crafting. Mining Abandoned.');
			this.craftTools(this.harvestNearestTree);
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

	onBotStuck(goalProgress, path, goal) {
		console.log("Pathfinder indicates bot is stuck. Goal Progress: ", goalProgress);
		console.log("Path: ", path);
		console.log("Goal: ", goal);
		this.badTargets.push(new Vec3(goal.x, goal.y, goal.z));
		this.returnHome();
	}

	getPosHash(p) {
		return p.x + ',' + p.y + ',' + p.z;
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
			this.bot.hand = null;
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
					if (item.id < 0) {
						continue;
					}
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
		// Treat compressables as having no recipe
		//console.log(compressableItems.includes(this.mcData.items[itemId].name), this.mcData.items[itemId].name);
		if (recipes.length == 0 || Object.keys(compressableItems).includes(this.mcData.items[itemId].name)) {
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
			//console.log(`${this.mcData.items[itemId].displayName} has ${recipes.length} recipes`);
			for (const recipe of recipes) {
				let queueBranch = Array();
				const ingredients = this.getIngredients(recipe);
				for (const ingredient of ingredients) {
					/*
					if (!this.haveIngredient(ingredient.id, ingredient.count)) {
						console.log(`${itemId} missing ingredients:`, ingredients)
					}
					*/
					// I'm not sure what the best way to do this is yet
					const parentQueue = this.getCraftingTree(
						ingredient.id,
						//Math.ceil(Math.abs(ingredient.count) * count / recipe.result.count)
						Math.ceil((Math.abs(ingredient.count) * count) / recipe.result.count)
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
			return [];
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
			//console.log(`Crafting ${this.mcData.items[current.id].displayName}`);
			let recipe = this.findUsableRecipe(current.id);
			let targetCount = recipe ? recipe.result.count * current.count : current.count
			if (
				this.haveIngredient(current.id, targetCount) &&
				remainder.length > 0
			) {
				console.log(`Already have ${targetCount} ${this.mcData.items[current.id].displayName}(s)`);
				this.autoCraftNext(remainder, callback);
				return;
			}
			if (!recipe) {
				console.log(`Can't craft ${this.mcData.items[current.id].displayName} because there is no usable recipe`);
				callback(false);
				return;
			}
			// Fix for minecraft-data bug #231
			//https://github.com/PrismarineJS/minecraft-data/issues/231
			if (recipe.inShape) {
				recipe.inShape = recipe.inShape.reverse();
			}
			//console.log(JSON.stringify(recipe));
			let craftingTable = null;
			if (recipe.requiresTable) {
				console.log("Needs crafting table", this.homePosition);
				craftingTable = this.bot.findBlock({
					point: this.homePosition,
					matching: this.listBlocksByRegEx(/^crafting_table$/),
					maxDistance: 20,
					count: 10
				});
				if (!craftingTable) {
					// make one and put it on any block one move away that has the same Y value
					this.craftCraftingTable(() => {
						this.autoCraftNext(craftingQueue, callback);
					});
					return;
				}
				console.log("Found one:", craftingTable.position);
				const p = craftingTable.position;
				this.currentTarget = p;
				const goal = new GoalNear(p.x, p.y, p.z, 3);
				this.currentTask = "crafting";
				this.callback = () => {
					this.bot.craft(recipe, Math.ceil(current.count / recipe.result.count), craftingTable, (err) => {
						if (err) {
							console.log(err, JSON.stringify(recipe), current.count, craftingTable);
							callback(false);
							return;
						}
						else {
							console.log("Theoretical success!", this.bot.inventory.items().map(x => { return {name: x.name, count: x.count}; }));
							//console.log(JSON.stringify(recipe), current.count, craftingTable);
						}
						this.autoCraftNext(remainder, callback);
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
					callback(true);
				}
			});
		}
		else {
			callback(true);
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
			//console.log(block);
			if (['cave_air', 'air'].includes(block.name)) {
				//console.log(block, "is air");
				// block.material in ['rock', 'dirt', 'wood'] for target.y - 1
				const blockBelow = this.bot.blockAt(point.add(below));
				//console.log(`And below is `, blockBelow, blockBelow.material);
				if (['rock', 'dirt', 'wood'].includes(blockBelow.material)) {
					//console.log(`And below is ${blockBelow.material}`);
					return side;
				}
			}
		}
		//console.log("Could not find an adjacent space suitable for placement");
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
					(err) => {
						if (err) {
							console.log(err);
						}
						callBack();
					}
				)
			}
		);
	}

	craftCraftingTable(callback) {
		// TODO: This function doesn't actually make planks from logs if needed
		//  Things only work normally because of the typical order of operations in auto-crafting tools
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
			this.harvestNearestTree();
		}
	}

	// Recursively craft an item (craft parents if needed)
	autoCraft(itemId, count, callback) {
		const craftingQueue = this.getCraftingQueue(itemId, count);
		if (craftingQueue.length === 0) {
			console.log(`No path to craft a ${this.mcData.items[itemId].displayName} due to lack of acquisition-obligate resources.`);
			const missing = this.getMissing(itemId);
			console.log("List of missing acquisition-obligate resources:", missing);
			const inventoryDict = this.getInventoryDictionary();
			console.log(inventoryDict);
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
			callback(false);
			return;
		}
		const needsCraftingTable = this.checkNeedsCraftingTable(craftingQueue);
		let craftingTable = null;
		if (needsCraftingTable) {
			const craftingTableId = this.listItemsByRegEx(/^crafting_table$/)[0];
			craftingTable = this.bot.findBlock({
				point: this.homePosition,
				matching: this.listBlocksByRegEx(/^crafting_table$/),
				maxDistance: 20,
				count: 10
			});
			if (!craftingTable) {
				// If we have one, place it
				if (this.haveIngredient(craftingTableId)) {
					this.placeCraftingTable(() => { this.autoCraftNext(craftingQueue, callback); });
					return;
				}
				// make one and put it on any block one move away that has the same Y value
				this.craftCraftingTable(() => { this.autoCraftNext(craftingQueue, callback); });
				return;
			}
		}
		console.log("Calling autoCraftNext", craftingQueue);
		this.autoCraftNext(craftingQueue, callback);
	}

	autoCraftMultiple(itemList, callback) {
		// itemList looks like [{ id: 1, count: 1 }]
		const current = itemList[0];
		const remainder = craftingQueue.slice(1, craftingQueue.length);
		if (current) {
			this.autoCraft(current.id, current.count, () => {
				this.autoCraftMultiple(remainder, callback);
			});
		}
		else {
			callback(true);
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
		/*
		const sides = [
			new Vec3(1, 0, 0),
			new Vec3(-1, 0, 0),
			new Vec3(0, 0, 1),
			new Vec3(0, 0, -1)
		];
		
		let crown = true;
		// Check above the top
		for (var s = 0; s < sides.length; s++) {
			point = top.clone().offset(0, 1, 0).add(sides[s]);
			const block = this.bot.blockAt(point);
			//console.log(`Checking if ${block.name} is not like '%_leaves'`);
			if (!block.name.match(/_leaves$/)) {
				console.log(`Block: ${p} is not a tree because it does not have leaves surrounding it's crown`);
				crown = false;
				break;
			}
		}
		// do a double-check at the top if there's a problem
		if (!crown) {
			for (var s = 0; s < sides.length; s++) {
				point = top.clone().add(sides[s]);
				const block = this.bot.blockAt(point);
				//console.log(`Checking if ${block.name} is not like '%_leaves'`);
				if (!block.name.match(/_leaves$/)) {
					console.log(`Block: ${p} is not a tree because it does not have leaves surrounding it's crown`);
					return false;
				}
			}	
		}
		*/
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
		let logs = this.bot.findBlocks({
			point: this.homePosition,
			matching: logTypes,
			maxDistance: 128,
			count: 1000
		});
		// resort to distance from bot
		logs = logs.sort((a, b) => {
			const distA = this.bot.entity.position.distanceTo(new Vec3(a.x, a.y, a.z));
			const distB = this.bot.entity.position.distanceTo(new Vec3(b.x, b.y, b.z));
			return distA - distB;
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
		// If no valid trees were found, return one log
		console.log("No trees, cutting random log. I hope it's not someone's house.");
		return [this.bot.blockAt(logs[0])];
	}

	equipAxe(callback) {
		//console.log(this.bot.inventory);
		this.equipByName("_axe", () => {
			const hand = this.bot.heldItem;
			if (!hand) {
				this.autoCraft(586, 1, () => {
					sleep(350).then(() => { this.equipByName("_axe", callback); });
				});
			}
			else {
				console.log("Hand: ", hand.displayName);
				const regex = RegExp(`_axe$`, "i");
				const axes = this.listItemsByRegEx(regex);
				if (!axes.includes(hand.type)) {
					this.autoCraft(586, 1, () => {
						sleep(350).then(() => { this.equipByName("_axe", callback); });
					});
				}
				else {
					callback();
				}
			}
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
			console.log('Finished cutting. Waiting for drops.');
			this.currentTask = null;
			sleep(1500).then(() => {
				console.log('Picking up uncollected blocks.');
				this.pickUpBrokenBlocks();
			});
		}
	}

	cutTree(tree) {
		// Go to a tree and cut it down
		this.remainder = tree;
		const p = tree[0].position;
		this.currentTarget = p;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.pathfinder.setGoal(goal);
	}

	harvestNearestTree() {
		this.currentTask = 'cutTree';
		const tree = this.findNearestTree();
		if (tree) {
			console.log("Cutting tree: ", tree[0].position);
			this.cutTree(tree);
		}
		else {
			console.log("No valid trees located.");
		}
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
			const itemId = current.metadata[7].itemId;
			if (itemId) {
				console.log(`Picking Up:`, this.mcData.items[itemId].displayName);
			}
			else {
				console.log(`Picking Up:`, current);
			}
			const p = current.position;
			this.currentTarget = p;
			const goal = new GoalBlock(p.x, p.y, p.z);
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			console.log('Finished picking up drops.');
			//console.log('Stopping.');
			this.currentTask = null;
			sleep(350).then(this.stashNonEssentialInventory);
		}
	}

	pickUpBrokenBlocks() {
		this.currentTask = 'collectDrops';
		const drops = this.findNearbyDrops(10);
		console.log(`Found ${drops.length} broken blocks to collect.`)
		this.remainder = drops;
		this.pickUpNext(drops);
	}

	/**************************************************************************
	 * 
	 * Stash Inventory
	 * 
	 * * Check if any slots remain open (dump if no)
	 * 		* Possibly do this sooner - dump unneeded full stacks
	 * * Find chests
	 * * Craft & place chests
	 * * Empty unneeded items into chests
	 * * Compress items
	 * * Optimize and stort chest storage
	 * * Minimize chest diversity
	 * * Label single-type chests with a sign using the displayName for that item type
	 * 
	 **************************************************************************/

	getToolIds() {
		let toolIds = [];
		for (const toolName of toolItems.names) {
			const regex = new RegExp(`_${toolName}$`, "i");
			toolIds = [...toolIds, ...this.listItemsByRegEx(regex)];
		}
		return toolIds;
	}
	
	listNonEssentialInventory() {
		// Return a list of items in inventory that are non-essential (so as to stash them)
		// Deductive. Get inventory and then remove essential items.
		let inventory = this.bot.inventory.items();
		// sort descending by count to handle issue of heterogenous competing items (prefer retaining biggest stack)
		inventory = inventory.sort((a, b) => b.count - a.count);
		// Take out good tools, leave superfluous tools in
		for (const tool of toolItems.names) {
			let toolKeepCount = 2;
			for (const material of toolItems.materials) {
				if (toolKeepCount === 0) {
					break;
				}
				inventory = inventory.filter(item => {
					if (item.name === `${material}_${tool}` && toolKeepCount > 0) {
						toolKeepCount--;
						return false;
					}
					else {
						return true;
					}
				});
			}
		}
		// Then filter for essential
		for (const eItem of essentialItems) {
			const filtered = [];
			let count = 0;
			for (const item of inventory) {
				let essential = false;
				if (eItem.type === 'regex') {
					essential = item.name.match(eItem.regex);
				}
				else if (eItem.type === 'name') {
					essential = item.name === eItem.name;
				}
				else if (eItem.type === 'nameList') {
					essential = eItem.list.includes(item.name);
				}
				if (essential && count < eItem.maxSlots) {
					count++;
				}
				else {
					filtered.push(item);
				}
			}
			inventory = filtered;
		}
		return inventory;
	}
	
	checkInventoryToStash() {
		// This returns true when a non-essential item type shows as a full stack and therefore should be stashed
		//
		// revision or parameters might be useful, like:
		// * requiring no empty slots (that can be arbitrarily filled)
		// * requiring a certain number of full stacks
		const nonEssentialInventory = this.listNonEssentialInventory();
		//console.log(nonEssentialInventory);
		if (nonEssentialInventory.length > 0) {
			if (this.bot.entity.position.distanceTo(this.homePosition) < 5) {
				return true;
			}
			for (const item of nonEssentialInventory) {
				if (item.count === item.stackSize) {
					return true;
				}
			}
		}
		return false;
	}

	stashNext(chest, stashList) {
		const current = stashList[0];
		const remainder = stashList.slice(1, stashList.length);
		if (current) {
			chest.deposit(current.type, null, current.count, (err) => {
				if (err) {
					console.log(`Unable to stash ${current.count} ${current.name}`);
					this.placeNewChest();
					return;
				} else {
					console.log(`Stashed ${current.count} ${current.name}`);
				}
				this.stashNext(chest, remainder);
			});
		}
		else {
			chest.close();
			console.log('Finished stashing.');
			this.currentTask = null;
			sleep(1000).then(() => {
				// If we have logs, mine, if we don't lumberjack
				const inventoryDict = this.getInventoryDictionary();
				//console.log(inventoryDict, Object.keys(inventoryDict));
				if (Object.keys(inventoryDict).some(id => id.match(/_log$/))) {
					// Don't start mining without a full set of tools
					const missingTools = this.missingTools();
					if (missingTools.length > 0) {
						console.log('Returning to cutting trees because of missing tools.', missingTools);
						this.craftTools(this.harvestNearestTree);
					}
					else {
						console.log('Returning to mining.');
						this.craftTools(this.mineNearestOreVein);
					}
				}
				else {
					//console.log(inventoryDict);
					console.log('Returning to cutting trees.', inventoryDict);
					this.craftTools(this.harvestNearestTree);
				}
			});
		}
	}

	compressNext(compressList, callback) {
		const current = compressList[0];
		const remainder = compressList.slice(1, compressList.length);
		if (current) {
			console.log(`Compressing to ${this.mcData.items[current.id].displayName}`);
			this.autoCraft(current.id, current.count, (success) => {
				sleep(100).then(() => {
					this.compressNext(remainder, callback);
				});
			});	
		}
		else {
			callback(true);
		}
	}

	getCompressList() {
		const inventoryDict = this.getInventoryDictionary()
		// save some coal and iron ingots
		if (inventoryDict['coal']) inventoryDict['coal'] -= 32;
		if (inventoryDict['iron_ingot']) inventoryDict['iron_ingot'] -= 32;
		const compressList = [];
		for (const item in inventoryDict) {
			if (Object.keys(compressableItems).includes(item)) {
				if (inventoryDict[item] >= 9) {
					const targetId = this.mcData.itemsByName[compressableItems[item]].id;
					compressList.push({
						id: targetId,
						count: Math.floor(inventoryDict[item] / 9),
					});
				}
			}
		}
		return compressList;
	}

	compressItems(compressList) {
		this.compressNext(compressList, this.stashNonEssentialInventory);
	}

	saveChestWindow(position, chestWindow) {
		const p = position;
		const posHash = this.getPosHash(position);
		let contents;
		if (chestWindow.type === 'minecraft:generic_9x6') {
			contents = chestWindow.slots.slice(0, 54);
		}
		else {
			contents = chestWindow.slots.slice(0, 27);
		}
		this.chestMap[posHash] = {
			id: chestWindow.id,
			position: position,
			type: chestWindow.type,
			title: chestWindow.title,
			slots: contents,
			freeSlotCount: contents.filter((r) => r === null).length
		}
	}

	findChest() {
		for (const posHash in this.chestMap) {
			const chest = this.chestMap[posHash];
			if (chest.freeSlotCount > 0) {
				//console.log(`Known Chest: `, chest);
				return this.bot.blockAt(chest.position);
			}
		}
		let chestsToOpen = this.bot.findBlocks({
			point: this.homePosition,
			matching: this.listBlocksByRegEx(/^chest$/),
			maxDistance: 128,
			count: 100
		});
		// Only stash to surface / near surface chests
		chestsToOpen = chestsToOpen.filter((r) => {
			if (r.y < 60) return false;
			for (const posHash in this.chestMap) {
				if (r.equals(this.chestMap[posHash].position)) return false;
			}
			return true;
		});
		if (chestsToOpen.length > 0) {
			return this.bot.blockAt(chestsToOpen[0]);
		}
		else {
			return false;
		}
	}

	placeNext(placeQueue, callback) {
		const current = placeQueue[0];
		const remainder = placeQueue.slice(1, placeQueue.length);
		if (current) {
			const item = this.getInventoryItemById(this.mcData.itemsByName[current.name].id);
			const referenceBlock = this.bot.blockAt(current.position);
			const placementVector = new Vec3(1, 0, 0);
			this.bot.equip(item, 'hand', () => {
				this.bot.placeBlock(referenceBlock, placementVector, (err) => {
					if (err) {
						console.log("Placing error");
					}
					sleep(100).then(() => this.placeNext(remainder, callback));
				});
			});
		}
		else {
			callback(true);
		}
	}

	digNext(digQueue, callback) {
		const current = digQueue[0];
		const remainder = digQueue.slice(1, digQueue.length);
		if (current) {
			const block = this.bot.blockAt(current);
			if (!block.diggable || ['air', 'cave_air', 'void_air'].includes(block.name)) {
				this.digNext(remainder, callback);
				return;
			}
			const tool = this.bot.pathfinder.bestHarvestTool(block);
			this.bot.equip(tool, 'hand', () => {
				this.bot.dig(block, (err) => {
					if (err) {
						console.log("Digging error");
					}
					this.digNext(remainder, callback)
				});
			});
		}
		else {
			callback(true);
		}
	}

	flattenCube(position, callback) {
		const p = position;
		// Set a goal of exactly standing inside the block at foot level.
		const goal = new GoalBlock(p.x, p.y, p.z);
		this.currentTask = 'flattenCube';
		this.callback = () => {
			const clearPattern = [
				// Body space (probably unneeded)
				[0, 0, 0],
				[0, 1, 0],
				// Foot level
				[0, 0, -1], // N
				[1, 0, -1], // NE
				[1, 0, 0], // E
				[1, 0, 1], // SE
				[0, 0, 1], // S
				[-1, 0, 1], // SW
				[-1, 0, 0], // W
				[-1, 0, -1], // NW
				// Eye-level
				[0, 1, -1], // N
				[1, 1, -1], // NE
				[1, 1, 0], // E
				[1, 1, 1], // SE
				[0, 1, 1], // S
				[-1, 1, 1], // SW
				[-1, 1, 0], // W
				[-1, 1, -1], // NW
			];
			const dirtPattern = [
				[-1, -1, -1], // NW
				[0, -1, -1], // N
				[1, -1, -1], // NE
				[-1, -1, 0], // W
				[0, -1, 0], // center
				[1, -1, 0], // E
				[-1, -1, 1], // SW
				[0, -1, 1], // S
				[1, -1, 1], // SE
			];
			const digQueue = [];
			for (const offset of clearPattern) {
				const block = this.bot.blockAt(position.offset(...offset));
				if (block.boundingBox === 'block') digQueue.push(position.offset(...offset).clone());
			}
			const dirtPlaceQueue = []
			for (const offset of dirtPattern) {
				const block = this.bot.blockAt(position.offset(...offset));
				if (block.boundingBox === 'block' && !['grass_block', 'dirt'].includes(block.name)) {
					// Don't dig out the block we're standing on.
					if (JSON.stringify(offset) !== JSON.stringify([0, -1, 0])) {
						console.log(`Digging out ${block.name}`);
						digQueue.push(position.offset(...offset).clone());
						dirtPlaceQueue.push({
							position: position.offset(...offset).clone(),
							name: 'dirt',
						});
					}
				}
				else if (['void_air', 'cave_air', 'air'].includes(block.name)) {
					dirtPlaceQueue.push({
						position: position.offset(...offset).clone(),
						name: 'dirt',
					});
				}
			}
			this.digNext(digQueue, (success) => {
				// We need sufficient materials, otherwise fail. (9 dirt)
				// Add target space dirt to inventory dirt
				let dirtCount = this.getInventoryDictionary().dirt || 0;
				if (dirtCount < dirtPlaceQueue.length) {
					this.backupBot(() => callback(false));
					return;
				}
				this.placeNext(dirtPlaceQueue, () => {
					this.backupBot(() => callback(true));
				});
			});
		}
		this.bot.pathfinder.setGoal(goal);
	}

	placeNewChest() {
		/*
		craft chest if needed
		home position is anchor; chest grid is interpreted
		use a concentric growth pattern.
		rings are: [
			[x -2, z -2 to x 2, z 2]
			[x -4, z -4 to x 4, z 4]
			[x -6, z -6 to x 6, z 6]
			etc...
		]
		flatten surface surrounding target block. (3x3x3 cube) bottom: dirt, middle: air, top: air
		valid targets are:
			* air
			* block below having material "dirt" or "rock"
			* block above also being air
		Replicate orientation. If new, use -Z (North), X (East), Z (South), -X (West)
		directions [
			[0, 0, -1],
			[1, 0, 0],
			[0, 0, 1],
			[-1, 0, 0],
		]
		Opportunistically use direction as player standing position offset from target block.
		
		set a goal to the player standing position, then place
		*/
		const chestId = this.listItemsByRegEx(/^chest$/)[0];
		let chest = this.getInventoryItemById(chestId);
		if (!chest) {
			console.log('Autocrafting chest.');
			this.autoCraft(chestId, 1, (success) => {
				if (!success) {
					// Probably lack wood
					console.log('Failed to make chest.');
					this.harvestNearestTree();
				}
				else {
					this.placeNewChest();
				}
			});
			return;
		}
		let ringSize = 1;
		let buildPos = null;
		let targetPos = null;
		let x, z;
		while (!buildPos && ringSize < 5) {
			for (x = -2 * ringSize; x <= (2 * ringSize); x += 2) {
				for (z = -2 * ringSize; z <= (2 * ringSize); z += 2) {
					targetPos = this.homePosition.offset(x, 0, z);
					if (!['chest', 'crafting_table', 'furnace'].includes(this.bot.blockAt(targetPos).name)) {
						buildPos = targetPos.clone();
						break;
					}
				}
				if (buildPos != null) {
					console.log(`x: ${x}. z: ${z}`);
					break;
				}
			}
			ringSize++;
		}
		if (buildPos) {
			this.flattenCube(buildPos, (success) => {
				if (!success) {
					console.log('Error flattening');
					return;
				}
				chest = this.getInventoryItemById(chestId);
				this.bot.equip(chest, 'hand', (err) => {
					if (err) console.log('Error equipping chest');
					const referenceBlock = this.bot.blockAt(buildPos);
					sleep(350).then(() => {
						this.bot.placeBlock(referenceBlock, new Vec3(1, 0, 0), (err) => {
							if (err) console.log('Error placing chest', err);
							this.stashNonEssentialInventory();
						});
					});
				});
			});
		}
		else {
			console.log('Could not find a spot for a new chest.');
		}
	}

	stashNonEssentialInventory() {
		if (this.checkInventoryToStash()) {
			const inventoryDict = this.getInventoryDictionary();
			if (this.currentTask != 'smelting' && inventoryDict['iron_ore']) {
				this.smeltOre();
				return;
			}
			// Do compressables before stashing
			const compressList = this.getCompressList();
			if (compressList.length > 0) {
				this.compressItems(compressList);
				return;
			}
			console.log("Stashing non-essential inventory");
			const chestToOpen = this.findChest();
			if (chestToOpen) {
				console.log("Chest found. Moving to: ", chestToOpen.position);
				this.currentTask = 'stashing';
				const p = chestToOpen.position;
				const goal = new GoalNear(p.x, p.y, p.z, 3);
				this.callback = () => {
					console.log('Stashing callback.');
					const chest = this.bot.openChest(chestToOpen);
					chest.on('open', () => {
						console.log('Chest opened.');
						this.saveChestWindow(chestToOpen.position, chest.window);
						if (this.chestMap[this.getPosHash(chestToOpen.position)].freeSlotCount === 0) {
							// TODO: Do something if this chest is full
							console.log('Chest is full. Trying to find another');
							chest.close();
							this.stashNonEssentialInventory();
							return;
						}
						//console.log('chestWindow: ', chest.window);
						//console.log('chest.items(): ', chest.items());
						const itemsToStash = this.listNonEssentialInventory();
						this.stashNext(chest, itemsToStash);
					});
					chest.on('close', () => {
						console.log('Chest closed');
					});
				}
				this.bot.pathfinder.setGoal(goal);
			}
			else {
				console.log("No chest located.");
				this.placeNewChest();
			}
		}
		else {
			// If we have logs, mine, if we don't lumberjack
			const inventoryDict = this.getInventoryDictionary();
			//console.log(inventoryDict, Object.keys(inventoryDict));
			let logCount = 0;
			for (const item in inventoryDict) {
				if (item.match(/_log$/)) {
					logCount += inventoryDict[item];
				}
			}
			if (logCount > 0) {
				console.log(`Log Count: ${logCount}`);
				const missingTools = this.missingTools();
				// Don't start mining without a full set of tools
				if (missingTools.length > 0) {
					if (logCount > 32) {
						// Do a stashing loop
						this.craftTools(this.stashNonEssentialInventory);
					}
					else {
						console.log('Returning to cutting trees because of missing tools.', missingTools);
						this.craftTools(this.harvestNearestTree);
					}
				}
				else {
					console.log('Returning to mining.');
					this.craftTools(this.mineNearestOreVein);
				}
			}
			else {
				//console.log(inventoryDict);
				console.log('Returning to cutting trees.', inventoryDict);
				this.craftTools(this.harvestNearestTree);
			}
		}
	}

	restoke(furnace, callback) {
		const inventoryDict = this.getInventoryDictionary();
		const fuel = furnace.fuelItem();
		let fuelAmount = (inventoryDict['coal'] || 0) > 64 ? 64 : (inventoryDict['coal'] || 0);
		let fuelCount = fuel ? fuel.count : 0;
		if (fuelCount < 64 && inventoryDict["coal"] > 0) {
			if ((fuelCount + fuelAmount) > 64) {
				fuelAmount = 64 - fuelCount;
			}
			if (fuelAmount > 0) {
				//console.log(this.listItemsByRegEx(/^coal$/)[0], insertAmount);
				//console.log(inventoryDict);
				furnace.putFuel(
					this.listItemsByRegEx(/^coal$/)[0],
					null,
					fuelAmount,
					(err) => {
						if (err) {
							console.log(`Put fuel (adding ${fuelAmount} coal to ${fuel.count}): `, err)
						}
						callback();
					},
				);
			}
			else {
				callback();
			}
		}
		else {
			callback();
		}
	}

	resupplyFurnace(furnace) {
		const inventoryDict = this.getInventoryDictionary();
		if (inventoryDict["iron_ore"]) {
			let inputAmount = inventoryDict["iron_ore"];
			const currentInput = furnace.inputItem();
			if (currentInput) {
				if (currentInput.count + inputAmount > 64) {
					inputAmount = 64 - currentInput.count;
				}
			}
			furnace.putInput(
				this.listItemsByRegEx(/^iron_ore$/)[0],
				null,
				inputAmount,
				(err) => {
					if (err) {
						console.log("Put input", err);
					}
					furnace.close();
					console.log('Finished smelting.');
					this.stashNonEssentialInventory();
				},
			)
		}
		else {
			furnace.close();
			console.log('Finished smelting.');
			this.stashNonEssentialInventory();
		}		
	}

	smeltOre() {
		const furnaceBlock = this.bot.findBlock({
			point: this.homePosition,
			matching: this.listBlocksByRegEx(/^(furnace|lit_furnace)$/),
			maxDistance: 128
		});
		// Only stash to surface / near surface chests
		if (furnaceBlock) {
			console.log("Furnace found. Moving to: ", furnaceBlock.position);
			this.currentTask = 'smelting';
			const p = furnaceBlock.position;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.callback = () => {
				console.log('Smelting callback.');
				const inventoryDict = this.getInventoryDictionary();
				console.log(inventoryDict);
				const furnace = this.bot.openFurnace(furnaceBlock);
				furnace.on('open', () => {
					if (furnace.outputItem()) {
						furnace.takeOutput(() => {
							this.restoke(furnace, () => {
								this.resupplyFurnace(furnace)
							});
						});
					}
					else {
						this.restoke(furnace, () => {
							this.resupplyFurnace(furnace)
						});
					}
				});
				furnace.on('close', () => {
					console.log('Furnace closed');
				});
			}
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			console.log("No furnace located. Autocrafting.");
			const furnaceId = this.listItemsByRegEx(/^furnace$/)[0];
			this.autoCraft(furnaceId, 1, () => {
				sleep(350).then(() => {
					const furnace = this.getInventoryItemById(furnaceId);
					const placementVector = this.findPlacementVector();
					if (!placementVector) {
						this.stashNonEssentialInventory();
						return;
					}
					const referenceBlock = this.bot.blockAt(this.bot.entity.position.offset(
						placementVector.x || 0,
						placementVector.y || 0,
						placementVector.z || 0,
					));
					this.bot.equip(
						furnace,
						'hand',
						(err) => {
							if (err) {
								console.log(err);
							}
							this.bot.placeBlock(
								referenceBlock,
								placementVector,
								(err) => {
									if (err) {
										console.log(err);
									}
									this.smeltOre();
								}
							)
						}
					);
				});
			});
		}
	}

	craftToolNext(toolIds, callback) {
		const current = toolIds[0];
		const remainder = toolIds.slice(1, toolIds.length);
		if (current) {
			console.log(`Crafting ${this.mcData.items[current].displayName}`);
			this.autoCraft(current, 1, (success) => {
				sleep(100).then(() => {
					this.craftToolNext(remainder, callback);
				});
			});	
		}
		else {
			callback(true);
		}
	}

	missingTools() {
		// Prefer iron, to stone, to wood by inventory
		const toolIds = [];
		const inventoryDictionary = this.getInventoryDictionary();
		for (const tool of toolItems.names) {
			let toolId;
			let toolCount = 0;
			for (const item in inventoryDictionary) {
				if (item.match(new RegExp(`_${tool}`))) {
					toolCount += inventoryDictionary[item];
				}
			}
			if (inventoryDictionary[`iron_${tool}`] && toolCount >= 2) {
				continue;
			}
			else if (inventoryDictionary.iron_ingot > 3) {
				const regex = new RegExp(`iron_${tool}`);
				toolId = this.listItemsByRegEx(regex)[0];
			}
			else if (inventoryDictionary[`stone_${tool}`] && toolCount >= 2) {
				continue;
			}
			else if (inventoryDictionary.cobblestone > 3) {
				const regex = new RegExp(`stone_${tool}`);
				toolId = this.listItemsByRegEx(regex)[0];
			}
			else if (inventoryDictionary[`wooden_${tool}`] && toolCount >= 2) {
				continue;
			}
			else {
				const regex = new RegExp(`wooden_${tool}`);
				toolId = this.listItemsByRegEx(regex)[0];
			}
			toolIds.push(toolId);
		}
		return toolIds;
	}

	craftTools(callback) {
		// Prefer iron, to stone, to wood by inventory
		const toolIds = this.missingTools();
		this.craftToolNext(toolIds, callback);
	}

	/**************************************************************************
	 * 
	 * Miner - Prepare for Descent
	 * 
	 **************************************************************************/

	/*
	Return an array of blocks forming a contiguous ore vein (of combined types)

	const oreBlocks = [
		'coal_ore',
		'diamond_ore',
		'emerald_ore',
		'iron_ore',
		'gold_ore',
		'lapis_ore',
		'nether_gold_ore',
		'nether_quartz_ore',
		"redstone_ore",
	]
	*/
	blockToVein(p, oldVein) {
		// Scan the cube 9-8-9, all new positve cubes recursively scan. 
		let point = p.clone();
		let vein = [...oldVein];
		const oreBlocks = this.listBlocksByRegEx(/_ore$/);
		//console.log(oreBlocks);
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				for (let z = -1; z <= 1; z++) {
					if (x == 0 && y == 0 && z == 0) {
						continue;
					}
					const scanBlock = this.bot.blockAt(point.offset(x, y, z));
					//console.log(`scanblock: `, scanBlock);
					if (oreBlocks.includes(scanBlock.type)) {
						//console.log(`Adjacent block ${x} ${y} ${z} is also ore.`);
						let knownBlock = false;
						for (const known of vein) {
							if (known.position.equals(scanBlock.position)) {
								knownBlock = true;
								break;
							}
						}
						if (!knownBlock) {
							vein.push(scanBlock);
						}
					}
				}
			}
		}
		if (vein.length > oldVein.length) {
			const newLength = vein.length;
			for (let i = oldVein.length; i < newLength; i++) {
				vein = this.blockToVein(vein[i].position, vein);
			}
		}
		return vein;
	}

	findNearestCoalVein() {
		let coalBlocks = this.bot.findBlocks({
			point: this.homePosition,
			matching: this.listBlocksByRegEx(/_ore$/),
			maxDistance: 128,
			count: 1000,
		});
		// filter bad targets
		coalBlocks = coalBlocks.filter((p) => {
			for (const badTarget of this.badTargets) {
				if (p.equals(badTarget)) return false;
			}
			return true;
		});
		coalBlocks = coalBlocks.sort((a, b) => {
			const distA = this.bot.entity.position.distanceTo(new Vec3(a.x, a.y, a.z));
			const distB = this.bot.entity.position.distanceTo(new Vec3(b.x, b.y, b.z));
			return distA - distB;
		});
		let nearby = [];
		for (const p of coalBlocks) {
			if (this.bot.entity.position.distanceTo(new Vec3(p.x, p.y, p.z)) < 5) {
				nearby.push(p);
			}
		}
		if (nearby.length > 0) {
			console.log("Unmined ore close by. Cleaning it up.");
			nearby = nearby.sort((a, b) => {
				const distA = this.bot.entity.position.distanceTo(new Vec3(a.x, a.y, a.z));
				const distB = this.bot.entity.position.distanceTo(new Vec3(b.x, b.y, b.z));
				return distA - distB;
			});
			return this.blockToVein(nearby[0], [this.bot.blockAt(nearby[0])]);
		}
		//console.log('Nearby coal ore blocks are: ', coalBlocks);
		// If no coal ore was found, return false
		if (coalBlocks.length === 0) {
			return false;
		}
		// Resort by Y highest to lowest.
		//coalBlocks = coalBlocks.sort((a, b) => { return b.y - a.y });
		return this.blockToVein(coalBlocks[0], [this.bot.blockAt(coalBlocks[0])]);
	}

	findBestOreVein() {
		// First handle nearby cleanup
		// Very large number of blocks returned because otherwise many nearby blocks will be overlooked
		let oreBlocks = this.bot.findBlocks({
			point: this.homePosition,
			matching: this.listBlocksByRegEx(/_ore$/),
			maxDistance: 128,
			count: 10000,
		});
		// filter bad targets and y < 5 (Bots get stuck on unbreakables)
		//console.log(`Found ${oreBlocks.length}/1000 ore blocks in the search`);
		oreBlocks = oreBlocks.filter((p) => {
			if (p.y < 5) return false;
			if (this.bot.entity.position.distanceTo(p) > this.nearbyThreshold) return false;
			for (const badTarget of this.badTargets) {
				if (p.equals(badTarget)) return false;
			}
			return true;
		});
		oreBlocks = oreBlocks.sort((a, b) => {
			const distA = this.bot.entity.position.distanceTo(new Vec3(a.x, a.y, a.z));
			const distB = this.bot.entity.position.distanceTo(new Vec3(b.x, b.y, b.z));
			return distA - distB;
		});
		if (oreBlocks.length > 0) {
			console.log("Unmined ore close by. Cleaning it up.");
			return this.blockToVein(oreBlocks[0], [this.bot.blockAt(oreBlocks[0])]);
		}
		// Resort by desireability highest to lowest. (eliminate ones we don't have tools for right now)
		const desirable = [
			'ancient_debris',
			'diamond_ore',
			'emerald_ore',
			'gold_ore',
			'lapis_ore',
			'redstone_ore',
			'nether_gold_ore',
			'nether_quartz_ore',
			'iron_ore',
			'coal_ore',
		];
		const items = Object.keys(this.getInventoryDictionary());
		const harvestable = [];
		for (const material of desirable) {
			const harvestTools = Object.keys(this.mcData.blocksByName[material].harvestTools);
			const currentlyHarvestable = harvestTools.some(r => items.indexOf(r) >= 0);
			if (currentlyHarvestable) {
				harvestable.push(material);
			}
		}
		for (const targetType of harvestable) {
			oreBlocks = this.bot.findBlocks({
				point: this.homePosition,
				matching: this.mcData.blocksByName[targetType].id,
				maxDistance: 128,
				count: 1000,
			});
			// filter bad targets and y < 5 (Bots get stuck on unbreakables)
			console.log(`Found ${oreBlocks.length}/1000 ${targetType} blocks in the search`);
			oreBlocks = oreBlocks.filter((p) => {
				if (p.y < 5) return false;
				for (const badTarget of this.badTargets) {
					if (p.equals(badTarget)) return false;
				}
				return true;
			});
			oreBlocks = oreBlocks.sort((a, b) => {
				const distA = this.bot.entity.position.distanceTo(new Vec3(a.x, a.y, a.z));
				const distB = this.bot.entity.position.distanceTo(new Vec3(b.x, b.y, b.z));
				return distA - distB;
			});
			if (oreBlocks.length > 0) {
				const targetBlock = this.bot.blockAt(oreBlocks[0]);
				console.log(`Mining a(n) ${targetBlock.displayName} vein. Distance: ${Math.floor(this.bot.entity.position.distanceTo(oreBlocks[0]))}`);
				return this.blockToVein(oreBlocks[0], [targetBlock]);
			}
		}
		return false;
	}

	havePickaxe() {
		const inventoryDict = this.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/pickaxe$/))) {
			return true;
		}
		return false;
	}

	equipPickaxe(callback) {
		// There needs to be a way to prefer iron, to stone, to wood by inventory
		const inventoryDictionary = this.getInventoryDictionary();
		let pickaxe = "pickaxe";
		if (Object.keys(inventoryDictionary).includes('iron_pickaxe')) {
			pickaxe = "iron_pickaxe";
		}
		else if (Object.keys(inventoryDictionary).includes('stone_pickaxe')) {
			pickaxe = "stone_pickaxe";
		}
		else {
			pickaxe = "pickaxe";
		}
		if (this.bot.heldItem) {
			if (this.bot.heldItem.name.match(new RegExp(pickaxe, "i"))) {
				callback();
				return;
			}
		}
		let craftPickaxe = 585;
		if (Object.keys(inventoryDictionary).includes('iron_ingot')) {
			craftPickaxe = this.listItemsByRegEx(/iron_pickaxe/)[0];
		}
		else if (Object.keys(inventoryDictionary).includes('cobblestone')) {
			craftPickaxe = this.listItemsByRegEx(/stone_pickaxe/)[0];
		}
		else {
			craftPickaxe = this.listItemsByRegEx(/wooden_pickaxe/)[0];
		}
		this.equipByName(pickaxe, () => {
			const hand = this.bot.heldItem;
			//console.log(this.bot.heldItem);
			if (!hand) {
				this.autoCraft(craftPickaxe, 1, () => {
					sleep(350).then(() => { this.equipByName(this.mcData.items[craftPickaxe].name, callback); });
				});
			}
			else {
				console.log("Hand: ", hand.displayName);
				const regex = RegExp(`pickaxe$`, "i");
				const axes = this.listItemsByRegEx(regex);
				if (!axes.includes(hand.type)) {
					this.autoCraft(craftPickaxe, 1, () => {
						sleep(350).then(() => { this.equipByName(this.mcData.items[craftPickaxe].name, callback); });
					});
				}
				else {
					callback();
				}
			}
		});
	}

	mineVeinNext(vein) {
		const current = vein[0];
		this.remainder = vein.slice(1, vein.length);
		if (!this.havePickaxe()) {
			this.pickUpBrokenBlocks();
			return;
		}
		if (current) {
			if (!this.defaultMove.safeToBreak(current)) {
				console.log(`Target ${current.displayName} block is not safe to break. Skipping.`);
				this.badTargets.push(current.position.clone());
				this.mineVeinNext(this.remainder);
				return;
			}
			//console.log(`Current:`, current);
			this.equipPickaxe(() => {
				if (this.bot.entity.position.distanceTo(current.position) > 3) {
					console.log("The bot is too far from the object block to mine.");
					this.currentTask = 'mineVein';
					const p = current.position;
					const goal = new GoalGetToBlock(p.x, p.y, p.z);
					this.bot.pathfinder.setGoal(goal);
					return;
				}
				this.bot.dig(current, true, (err) => {
					this.mineVeinNext(this.remainder);
				});
			});
		}
		else {
			console.log('Finished mining. Waiting for drops.');
			this.currentTask = null;
			sleep(1000).then(() => {
				console.log('Picking up uncollected blocks.');
				this.pickUpBrokenBlocks();
			});
		}
	}

	mineVein(vein) {
		// Go to a tree and cut it down
		this.remainder = vein;
		const p = vein[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.pathfinder.setGoal(goal);
	}

	mineNearestOreVein() {
		this.currentTask = 'mineVein';
		//const vein = this.findNearestCoalVein();
		const vein = this.findBestOreVein();
		if (vein) {
			console.log("Mining Vein: ", vein[0].position);
			this.mineVein(vein);
		}
		else {
			console.log("No valid coal veins found.");
		}
	}
}

module.exports = autoBot;
