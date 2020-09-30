/*
 * This script will automatically look at the closest entity.
 * It checks for a near entity every tick.
 */
"use strict";

const recipe = require("prismarine-recipe")("1.16.2").Recipe;
const mcData = require("minecraft-data")("1.16.2");
const fakeInventory = {
	37: 0
}
const fakeNearbyBlocks = {
	35: 10
}

function checkHaveIngredient(ingredient, count, inventory) {
	if (inventory[ingredient] >= count) {
		return true;
	}
	return false;
}

// Get a dictonary of ingredients from a recipe, regardless of shape
function getIngredients(recipe) {
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
			ingredients.push({ id: i, count: ingredientDict[i] });
		}
		return ingredients;
	}
}

function getCraftingTree(itemId, count) {
	if (mcData.items[itemId] === undefined) {
		return;
	}
	if (count === -1) {
		count = 1;
	}
	//console.log(`Finding crafting path for ${mcData.items[itemId].name}`);
	let craftQueue = Array();
	// Get a list of recipes
	const recipes = recipe.find(itemId);
	//console.log(`Has ${recipes.length} recipes`);
	if (recipes.length == 0) {
		// No recipe means the item needs to be acquired
		//console.log(`${mcData.items[itemId].name} must be acquired.`);
		const disposition = checkHaveIngredient(itemId, count, fakeInventory) ? "possess" : "missing";
		craftQueue.push({
			error: false,
			name: mcData.items[itemId].name,
			disposition: disposition,
			id: itemId,
			count: count,
		});
		return craftQueue;
	}
	else {
		//console.log(`${mcData.items[itemId].name} can be crafted.`);
		for (const recipe of recipes) {
			let queueBranch = Array();
			const ingredients = getIngredients(recipe);
			for (const ingredient of ingredients) {
				//if (!this.haveIngredient(ingredient.id, ingredient.count)) {
				//console.log(`${itemId} ingredients:`, ingredients)
				const parentQueue = getCraftingTree(
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
					error: false,
					name: mcData.items[itemId].name,
					recipe: recipe,
					disposition: "requires",
					requires: queueBranch,
				});
			}
			else {
				craftQueue.push(queueBranch[0]);
			}
		}
		return [
			{
				error: false,
				name: mcData.items[itemId].name,
				disposition: "craft",
				id: itemId,
				count: count,
				one_of: craftQueue,
			},
		];
	}
}

function unrollCraftingTree(itemId, count, craftingTree) {
	let possiblePaths = [];
	const craftTask = {
		id: itemId,
		name: craftingTree.name,
		count: count,
	};
	if (craftingTree["disposition"] === "craft") {
		for (const child of craftingTree["one_of"]) {
			possiblePaths = [craftTask];
			const subpaths = unrollCraftingTree(child.id, child.count, child);
			if (subpaths) {
				for (const subpath of subpaths) {
					possiblePaths.push(subpath);
				}
			}
			else {
				return subpaths;
			}
			if (possiblePaths[possiblePaths.length - 1].missing) {
				continue;
			}
			else {
				return possiblePaths;
			}
		}
		return null;
	}
	else if (craftingTree["disposition"] === "requires") {
		for (const subtree of craftingTree["requires"]) {
			const subpath = unrollCraftingTree(
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

function listMissing(craftingTree) {
	if (craftingTree.disposition === 'missing') {
		return [craftingTree.id];
	}
	else if (craftingTree.disposition === 'craft') {
		let missingList = Array();
		for (const path of craftingTree.one_of) {
			const missing = listMissing(path);
			if (missing) {
				missingList = [...missingList, ...missing];
			}
		}
		return missingList;
	}
	else if (craftingTree.disposition === 'requires') {
		let missingList = Array();
		for (const path of craftingTree.requires) {
			const missing = listMissing(path);
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

function getMissing(itemId) {
	const craftingTree = getCraftingTree(itemId, 1);
	const missing = listMissing(craftingTree[0]);
	const missingSet = new Set();
	for (const item of missing) {
		missingSet.add(parseInt(item));
	}
	return Array.from(missingSet).sort();
}

function checkMissingItemsNearby(itemList, nearbyBlocks) {
	for (const block in nearbyBlocks) {
		for (const drop in mcData.blocks[block].drops) {
			if (drop in itemList) {
				return block;
			}
		}
	}
	return false;
}

function getCraftingPath(itemId, count) {
	const craftingTree = getCraftingTree(itemId, count);
	const path = unrollCraftingTree(itemId, count, craftingTree[0]);
	return path;
}

//const recipes = recipe.find(613);
//console.log(JSON.stringify(getIngredients(recipes[0]), null, "\t"));

//console.log(JSON.stringify(craftingTree[0], null, "\t"));
const path = getCraftingPath(586, 1);
if (path) {
	console.log(JSON.stringify(path.reverse(), null, "\t"));
}
else {
	console.log(`No path to craft a ${mcData.items[586].displayName} due to lack of acquisition-obligate resources.`);
	const missing = getMissing(586);
	console.log("List of missing acquisition-obligate resources:", missing);
	const block = checkMissingItemsNearby(missing, fakeNearbyBlocks);
	if (block) {
		const blockObj = mcData.blocks[block];
		console.log(`There is a(n) ${blockObj.displayName} nearby, which would close the resource gap in crafting a(n) ${mcData.items[586].displayName}`);
		if (blockObj.harvestTools) {
			console.log(`Harvesting ${blockObj.displayName} requires specific tools.`);
		}
		else {
			console.log(`Harvesting ${blockObj.displayName} does not require specific tools.`);
		}
	}
}
