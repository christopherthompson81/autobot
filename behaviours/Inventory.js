const toolItems = require('./constants').toolItems;

class Inventory {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
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

	craftToolNext(toolIds, callback) {
		const eventName = 'autobot.craftTools.done';
		let result = {};
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
			result = {
				error: false,
				errorCode: "success",
				errorDescription: "Finished crafting tools.",
			};
			if (callback) callback(result);
			this.bot.emit(eventName, result);
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
			else if (inventoryDictionary.iron_ingot > 3) toolId = this.mcData.itemsByName[`iron_${tool}`].id;
			else if (inventoryDictionary[`stone_${tool}`] && toolCount >= 2) continue;
			else if (inventoryDictionary.cobblestone > 3) toolId = this.mcData.itemsByName[`stone_${tool}`].id;
			else if (inventoryDictionary[`wooden_${tool}`] && toolCount >= 2) continue;
			else toolId = this.mcData.itemsByName[`wooden_${tool}`].id;
			toolIds.push(toolId);
		}
		return toolIds;
	}

	craftTools(callback) {
		// Prefer iron, to stone, to wood by inventory
		const toolIds = this.missingTools();
		this.craftToolNext(toolIds, callback);
	}
}

module.exports = Inventory;
