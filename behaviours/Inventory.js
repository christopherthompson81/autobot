const autoBind = require('auto-bind');
const toolItems = require('./constants').toolItems;
const sleep = require('./autoBotLib').sleep;

class Inventory {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.craftingTools = false;
	}

	resetBehaviour() {
		this.craftingTools = false;
	}

	listBlocksByRegEx(regex) {
		const blockList = [];
		for (const i in this.bot.mcData.blocks) {
			const block = this.bot.mcData.blocks[i];
			if (block.name.match(regex)) {
				blockList.push(block.id);
			}
		}
		return blockList;
	}

	listItemsByRegEx(regex) {
		const itemList = [];
		for (const i in this.bot.mcData.items) {
			const item = this.bot.mcData.items[i];
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
		//console.log(`We do not have item(${itemId}): ${this.bot.mcData.items[itemId].displayName}`);
		return null;
	}

	haveSword() {
		const inventoryDict = this.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_sword$/))) {
			return true;
		}
		return false;
	}

	havePickaxe() {
		const inventoryDict = this.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_pickaxe$/))) {
			return true;
		}
		return false;
	}

	haveAxe() {
		const inventoryDict = this.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_axe$/))) {
			return true;
		}
		return false;
	}

	haveShovel() {
		const inventoryDict = this.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_shovel$/))) {
			return true;
		}
		return false;
	}

	haveHoe() {
		const inventoryDict = this.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_hoe$/))) {
			return true;
		}
		return false;
	}

	/*
	equipByName(itemName, callback) {
		//console.log(`Attempting to equip: ${itemName}.`);
		const regex = new RegExp(`${itemName}$`, "i");
		const itemList = this.listItemsByRegEx(regex);
		let item = null;
		for (const i of this.bot.inventory.items()) {
			if (itemList.includes(i.type)) {
				item = i;
				break;
			}
		}
		if (!item) {
			//console.log(`Fail. No ${itemName} found in inventory.`);
			this.bot.hand = null;
			callback(false);
		}
		else {
			this.bot.equip(item, 'hand', (err) => {
				if (err) {
					//console.log(err, item);
					this.bot.hand = null;
					callback(false);
				}
				else {
					this.bot.hand = item;
					callback(true);
				}
			});
		}
	}
	*/

	craftToolNext(toolIds, callback) {
		const current = toolIds[0];
		const remainder = toolIds.slice(1, toolIds.length);
		if (current) {
			this.sendCraftToolsCrafting(current);
			this.bot.autobot.autocraft.autoCraft(current, 1, (success) => {
				// Timeout is for pathfinder not being spammed
				// ...and possibly inventory updates.
				sleep(100).then(() => {
					this.craftToolNext(remainder, callback);
				});
			});	
		}
		else {
			this.sendCraftToolsSuccess(callback);
		}
	}

	missingTools() {
		// Prefer iron, to stone, to wood by inventory
		// POSSIBLE_TODO: If combined durability (of a tool type) is less than 10%, add another spare
		const toolIds = [];
		const inventoryDictionary = this.bot.autobot.inventory.getInventoryDictionary();
		for (const tool of toolItems.names) {
			let toolId;
			let toolCount = 0;
			for (const item in inventoryDictionary) {
				if (item.match(new RegExp(`_${tool}`))) {
					toolCount += inventoryDictionary[item];
				}
			}
			if (inventoryDictionary[`iron_${tool}`] && toolCount >= 2) continue;
			else if (inventoryDictionary.iron_ingot > 3) toolId = this.bot.mcData.itemsByName[`iron_${tool}`].id;
			else if (inventoryDictionary[`stone_${tool}`] && toolCount >= 2) continue;
			else if (inventoryDictionary.cobblestone > 3) toolId = this.bot.mcData.itemsByName[`stone_${tool}`].id;
			else if (inventoryDictionary[`wooden_${tool}`] && toolCount >= 2) continue;
			else toolId = this.bot.mcData.itemsByName[`wooden_${tool}`].id;
			toolIds.push(toolId);
		}
		return toolIds;
	}

	craftTools(callback) {
		// Prefer iron, to stone, to wood by inventory
		const toolIds = this.missingTools();
		if (toolIds.length === 0) {
			this.sendCraftToolsSkipping(callback);
			return;
		}
		this.craftingTools = true;
		// Emit a skipping message if no missing tools
		this.craftToolNext(toolIds, callback);
	}

	// TODO: Optimize inventory (merge duplicate stacks for max/min sizing)

	sendCraftToolsSkipping(callback) {
		const eventName = 'autobot.craftTools.done';
		let result = {
			error: false,
			resultCode: "skipping",
			description: "No missing tools.",
		};
		this.craftingTools = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendCraftToolsCrafting(currentTool) {
		const eventName = 'autobot.craftTools.crafting';
		let result = {
			error: false,
			resultCode: "craftingTool",
			description: `Crafting ${this.bot.mcData.items[currentTool].displayName}`,
			currentTool: currentTool
		};
		this.bot.emit(eventName, result);
	}

	sendCraftToolsSuccess(callback) {
		const eventName = 'autobot.craftTools.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Finished crafting tools.",
		};
		this.craftingTools = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}
}

module.exports = Inventory;
