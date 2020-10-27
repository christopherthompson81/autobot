const compressableItems = require('./constants').compressableItems;

class Autocraft {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.recipe = require("prismarine-recipe")(this.bot.version).Recipe;
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
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
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
			// Acquisition items can indicate more than necessary are needed (would require a new parameter to fix)
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
						Math.ceil((Math.abs(ingredient.count) * count) / recipe.result.count) * recipe.result.count
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

	getCraftingQueue(itemId, count) {
		const craftingTree = this.getCraftingTree(itemId, count);
		const path = this.unrollCraftingTree(itemId, count, craftingTree[0]);
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
			let targetCount = current.count;
			if (
				this.haveIngredient(current.id, targetCount) &&
				remainder.length > 0
			) {
				//console.log(`Already have ${targetCount} ${this.mcData.items[current.id].displayName}(s)`);
				this.autoCraftNext(remainder, callback);
				return;
			}
			if (!recipe) {
				//console.log(`Can't craft ${this.mcData.items[current.id].displayName} because there is no usable recipe`);
				callback({
					error: true,
					errorCode: 'noRecipe',
					errorDescription: `Can't craft ${this.mcData.items[current.id].displayName} because there is no usable recipe`
				});
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
				//console.log("Needs crafting table", this.bot.autobot.homePosition);
				craftingTable = this.bot.findBlock({
					point: this.bot.autobot.homePosition,
					matching: this.listBlocksByRegEx(/^crafting_table$/),
					maxDistance: 20,
					count: 10
				});
				if (!craftingTable) {
					// make one and put it on any block one move away that has the same Y value
					// TODO: rewrite this to place on homePosition
					this.craftCraftingTable(() => {
						this.autoCraftNext(craftingQueue, callback);
					});
					return;
				}
				//console.log("Found one:", craftingTable.position);
				const p = craftingTable.position;
				const goal = new GoalNear(p.x, p.y, p.z, 3);
				this.bot.autobot.currentTask = "crafting";
				this.callback = () => {
					const targetCount = Math.floor(current.count / recipe.result.count);
					this.bot.craft(recipe, targetCount, craftingTable, (err) => {
						if (err) {
							console.log(err, JSON.stringify(recipe), current.count, craftingTable);
							callback({
								error: true,
								errorCode: 'craftingError',
								parentError: err,
								recipe: JSON.stringify(recipe),
								targetCount: targetCount,
								craftingTable: JSON.stringify(craftingTable),
								errorDescription: `Error occurred on crafting call`
							});
							return;
						}
						/*
						else {
							//console.log("Theoretical success!", this.bot.inventory.items().map(x => { return {name: x.name, count: x.count}; }));
							//console.log(JSON.stringify(recipe), current.count, craftingTable);
						}
						*/
						this.autoCraftNext(remainder, callback);
					});
				}
				//console.log("Moving to crafting table");
				this.bot.pathfinder.setGoal(goal);
				return;
			}
			this.bot.craft(recipe, current.count, null, () => {
				this.autoCraftNext(remainder, callback)
			});
		}
		else {
			callback({
				error: false,
				errorDescription: `Successfully crafted a(n) ${this.mcData.items[current.id].displayName}`
			});
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
			const point = botPosition.offset(side).clone();
			const block = this.bot.blockAt(point);
			if (['cave_air', 'air'].includes(block.name)) {
				//console.log(block, "is air");
				const blockBelow = this.bot.blockAt(point.add(below));
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
		const craftingTableId = this.bot.autobot.inventory.listItemsByRegEx(/^crafting_table$/)[0];
		const craftingTable = this.bot.autobot.inventory.getInventoryItemById(craftingTableId);
		const placementVector = this.findPlacementVector();
		const referenceBlock = this.bot.blockAt(this.bot.entity.position.offset(
			placementVector.x || 0,
			placementVector.y || 0,
			placementVector.z || 0,
		));
		this.bot.equip(craftingTable, "hand", () => {
			this.bot.placeBlock(referenceBlock, placementVector, (err) => {
				if (err) {
					//console.log(err);
					this.bot.autobot.navigator.backupBot(() => {
						this.bot.placeBlock(referenceBlock, placementVector, (err) => {
							callback({
								error: true,
								parentError: err
							})
						});
					});
					return;
				}
				callBack({
					error: false
				});
			});
		});
	}

	craftCraftingTable(callback) {
		// TODO: This function doesn't actually make planks from logs if needed
		//  Things only work normally because of the typical order of operations in auto-crafting tools
		const craftingTableId = this.bot.autobot.inventory.listItemsByRegEx(/^crafting_table$/)[0];
		// If we have one, place it
		if (this.haveIngredient(craftingTableId, 1)) {
			this.placeCraftingTable(() => { callback(); });
			return;
		}
		const recipes = this.recipe.find(craftingTableId);
		const inventory = this.bot.autobot.inventory.getInventoryDictionary();
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
			this.bot.craft(usableRecipe, 1, null, () => {
				this.placeCraftingTable(() => {
					callback({
						error: false,
						errorDescription: "Successfully crafted the crafting table."
					});
				});
			});
		}
		else {
			//console.log("Could not create a crafting table because we lack the required resources.");
			callback({
				error: true,
				errorDescription: "Could not create a crafting table because we lack the required resources."
			});
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
			const craftingTableId = this.bot.autobot.inventory.listItemsByRegEx(/^crafting_table$/)[0];
			craftingTable = this.bot.findBlock({
				point: this.navigator.homePosition,
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
}

module.exports = Autocraft;