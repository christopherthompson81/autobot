const autoBind = require('auto-bind');
const toolItems = require('./constants').toolItems;
const essentialItems = require('./constants').essentialItems;
const compressableItems = require('./constants').compressableItems;
const getPosHash = require('./autoBotLib').getPosHash;
const sleep = require('./autoBotLib').sleep;
const { GoalNear } = require('../pathfinder/pathfinder').goals;

class Stash {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.callback = () => {};
		this.active = false;
		this.smeltingCheck = false;
		this.chestMap = {};
		this.cbChest;
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
		this.smeltingCheck = false;
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
			const nextToolIds = this.bot.autobot.inventory.listItemsByRegEx(regex);
			toolIds = [...toolIds, ...nextToolIds];
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
				if (toolKeepCount === 0) break;
				inventory = inventory.filter(item => {
					if (item.name === `${material}_${tool}` && toolKeepCount > 0) {
						toolKeepCount--;
						return false;
					}
					else return true;
				});
			}
		}
		// Then filter for essential
		for (const eItem of essentialItems) {
			const filtered = [];
			let count = 0;
			for (const item of inventory) {
				let essential = false;
				if (eItem.type === 'regex') essential = item.name.match(eItem.regex);
				else if (eItem.type === 'name') essential = item.name === eItem.name;
				else if (eItem.type === 'nameList') essential = eItem.list.includes(item.name);
				if (essential && count < eItem.maxSlots) count++;
				else filtered.push(item);
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
			if (this.bot.entity.position.distanceTo(this.bot.autobot.homePosition) < 5) return true;
			for (const item of nonEssentialInventory) {
				if (item.count === item.stackSize) return true;
			}
		}
		return false;
	}

	defaultPostStashBehaviour() {
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {};
		// If we have logs, mine, if we don't lumberjack
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_log$/))) {
			// Don't start mining without a full set of tools
			const missingTools = this.bot.autobot.inventory.missingTools();
			if (missingTools.length > 0) {
				//console.log('Returning to cutting trees because of missing tools.', missingTools);
				result = {
					error: false,
					resultCode: "missingTools",
					description: `Returning to cutting trees because of missing tools. ${missingTools}`,
				};
				this.bot.emit(eventName, result);
				this.bot.autobot.inventory.craftTools((result) => {
					this.bot.autobot.lumberjack.harvestNearestTree(32);
				});
			}
			else {
				//console.log('Returning to mining.');
				result = {
					error: false,
					resultCode: "mining",
					description: `Returning to mining.`,
				};
				this.bot.emit(eventName, result);
				this.bot.autobot.inventory.craftTools((result) => {
					this.bot.autobot.mining.mineBestOreVein();
				});
			}
		}
		else {
			//console.log('Returning to cutting trees.', inventoryDict);
			result = {
				error: false,
				resultCode: "noLogs",
				description: `Returning to cutting trees.`,
			};
			this.bot.emit(eventName, result);
			this.bot.autobot.inventory.craftTools((result) => {
				this.bot.autobot.lumberjack.harvestNearestTree(32);
			});
		}
	}

	canStash(chestWindow, item) {
		const itemData = this.bot.mcData.itemsByName[item.name];
		if (chestWindow.freeSlotCount >= Math.ceil(item.count / itemData.stackSize)) {
			return true;
		}
		let roomForItem = itemData.stackSize * chestWindow.freeSlotCount;
		for (const slot of chestWindow.slots) {
			if (slot === null) continue;
			if (slot.name !== item.name) continue;
			roomForItem += slot.stackSize - slot.count;
		}
		if (roomForItem >= item.count) return true;
		return false;
	}

	stashNext(chest, stashList, chestWindow, callback) {
		let result = {};
		const eventName = 'autobot.stashing.done';
		const current = stashList[0];
		const remainder = stashList.slice(1, stashList.length);
		if (current) {
			if (this.canStash(chestWindow, current)) {
				//console.log('Chest Not Full');
				chest.deposit(current.type, null, current.count, (err) => {
					this.saveChestWindow(chestWindow.position, chest.window);
					if (err) {	
						// Find a different chest
						const eventName = "autobot.stashing.behaviourSelect";
						let result = {
							error: true,
							resultCode: "stashingError",
							description: `Error while stashing.`,
							chestWindow: chestWindow,
							item: current,
							parentError: err
						};
						this.bot.emit(eventName, result);
						chest.close();
						this.stashNonEssentialInventory(callback);
						return;
					}
					chestWindow = this.chestMap[getPosHash(chestWindow.position)];
					this.stashNext(chest, remainder, chestWindow, callback);
				});
			}
			else {
				const eventName = "autobot.stashing.behaviourSelect";
				let result = {
					error: false,
					resultCode: "cantStash",
					description: `Can't stash an item in this chest. Finding another chest.`,
					chestWindow: chestWindow,
					item: current
				};
				this.bot.emit(eventName, result);
				chest.close();
				this.stashNonEssentialInventory(callback);
			}
		}
		else {
			chest.close();
			result = {
				error: false,
				resultCode: "success",
				description: "Successfully stashed unneeded items."
			};
			if (callback) callback(result);
			this.bot.emit(eventName, result);
		}
	}

	compressNext(compressList, callback) {
		let result = {};
		const eventName = 'autobot.compression.done';
		const current = compressList[0];
		const remainder = compressList.slice(1, compressList.length);
		if (current) {
			//console.log(`Compressing to ${this.bot.mcData.items[current.id].displayName}`);
			this.bot.autobot.autocraft.autoCraft(current.id, current.count, (craftResult) => {
				sleep(100).then(() => {
					this.compressNext(remainder, callback);
				});
			});	
		}
		else {
			result = {
				error: false,
				resultCode: "success",
				description: "Successfully compressed all compressable items."
			}
			if (callback) callback(result);
			this.bot.emit(eventName, result);
		}
	}

	getCompressList() {
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary()
		// save some coal and iron ingots
		if (inventoryDict['coal']) inventoryDict['coal'] -= 32;
		if (inventoryDict['iron_ingot']) inventoryDict['iron_ingot'] -= 32;
		const compressList = [];
		for (const item in inventoryDict) {
			if (Object.keys(compressableItems).includes(item)) {
				if (inventoryDict[item] >= 9) {
					const targetId = this.bot.mcData.itemsByName[compressableItems[item]].id;
					compressList.push({
						id: targetId,
						count: Math.floor(inventoryDict[item] / 9),
					});
				}
			}
		}
		return compressList;
	}

	saveChestWindow(position, chestWindow) {
		const p = position;
		const posHash = getPosHash(position);
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
			if (chest.freeSlotCount > 0) return this.bot.blockAt(chest.position);
		}
		let chestsToOpen = this.bot.findBlocks({
			point: this.homePosition,
			matching: this.bot.mcData.blocksByName['chest'].id,
			maxDistance: 128,
			count: 200
		});
		// Only stash to surface / near surface chests
		chestsToOpen = chestsToOpen.filter((r) => {
			if (r.y < 60) return false;
			for (const posHash in this.chestMap) {
				if (r.equals(this.chestMap[posHash].position)) return false;
			}
			return true;
		});
		if (chestsToOpen.length > 0) return this.bot.blockAt(chestsToOpen[0]);
		else return false;
	}

	placeNewChest(callback) {
		const eventName = 'autobot.stashing.newChest';
		this.bot.autobot.landscaping.placeNewStorageObject('chest', (result) => {
			if (callback) callback(result);
			this.bot.emit(eventName, result);
		});
	}

	chestArrival() {
		const chestToOpen = this.cbChest;
		const callback = this.callback;
		const chest = this.bot.openChest(chestToOpen);
		chest.on('open', () => {
			//console.log('Chest opened.');
			this.saveChestWindow(chestToOpen.position, chest.window);
			const chestWindow = this.chestMap[getPosHash(chestToOpen.position)];
			if (chestWindow.freeSlotCount === 0) {
				const eventName = "autobot.stashing.behaviourSelect";
				let result = {
					error: false,
					resultCode: "chestFull",
					description: `Chest is full. Trying to find another`
				};
				this.bot.emit(eventName, result);
				chest.close();
				this.stashNonEssentialInventory(callback);
				return;
			}
			const itemsToStash = this.listNonEssentialInventory();
			// TODO: write a function to check the stashing queue against the chest
			// ...probably in the findChest function to return an appropriate chest
			this.stashNext(chest, itemsToStash, chestWindow, callback);
		});
		chest.on('close', () => {
			//console.log('Chest closed');
		});
	}

	/*
	The stashing routine involves several prerequisite tasks. I'm not sure if this will work well split out yet.
	*/
	stashNonEssentialInventory(callback) {
		this.active = true;
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {};
		if (this.checkInventoryToStash()) {
			const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
			// Smelt before stashing
			if (!this.smeltingCheck && inventoryDict['iron_ore']) {
				result = {
					error: false,
					resultCode: "smelting",
					description: `Bot is going to smelt ore`
				};
				this.bot.emit(eventName, result);
				this.smeltingCheck = true;
				this.bot.autobot.smelting.smeltOre(() => this.stashNonEssentialInventory(callback));
				return;
			}
			// Do compressables before stashing
			const compressList = this.getCompressList();
			if (compressList.length > 0) {
				result = {
					error: false,
					resultCode: "compressing",
					description: `Bot is going to compress compressable items`,
					compressList: compressList
				};
				this.bot.emit(eventName, result);
				this.compressNext(compressList, () => this.stashNonEssentialInventory(callback));
				return;
			}
			//console.log("Stashing non-essential inventory");
			const chest = this.findChest();
			if (chest) {
				//console.log("Chest found. Moving to: ", chest.position);
				result = {
					error: false,
					resultCode: "compressing",
					description: `Bot is going to stash items in a chest`,
					chest: chest
				};
				this.bot.emit(eventName, result);
				const p = chest.position;
				const goal = new GoalNear(p.x, p.y, p.z, 3);
				this.callback = callback;
				this.cbChest = chest;
				sleep(100).then(() => { this.bot.pathfinder.setGoal(goal); });
			}
			else {
				result = {
					error: false,
					resultCode: "placeNewChest",
					description: `Bot is going to place a new chest`
				};
				this.bot.emit(eventName, result);
				this.placeNewChest((result) => {
					if (this.findChest()) {
						this.stashNonEssentialInventory(callback);
						return;
					}
					if (result.error) {
						if (callback) callback(result);
						this.bot.emit('autobot.stashing.done', result);
					}
					else {
						this.stashNonEssentialInventory(callback);
					}
				});
			}
		}
		else {
			let result = {
				error: false,
				resultCode: "skipping",
				description: "No non-essential inventory to stash."
			}
			if (callback) callback(result);
			this.bot.emit('autobot.stashing.done', result);
			this.smeltingCheck = false;
			this.active = false;
		}
	}
}

module.exports = Stash;
