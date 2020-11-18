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
		this.chestMap = {};
		this.callback = () => {};
		this.active = false;
		this.cbChest = null;
		this.cachingChests = false;
		this.chestsToCache = [];
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
		this.cbChest = null;
		this.cachingChests = false;
		this.chestsToCache = [];
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
			if (this.bot.entity.position.distanceTo(this.bot.autobot.homePosition) < 16) return true;
			for (const item of nonEssentialInventory) {
				if (item.count === item.stackSize) return true;
			}
		}
		return false;
	}

	getRoomForItem(chestWindow, item) {
		if (!item) return 0;
		const itemData = this.bot.mcData.itemsByName[item.name];
		if (!itemData) return 0;
		let roomForItem = itemData.stackSize * chestWindow.freeSlotCount;
		for (const slot of chestWindow.slots) {
			if (slot === null) continue;
			if (slot.name !== item.name) continue;
			roomForItem += slot.stackSize - slot.count;
		}
		return roomForItem;
	}

	canStash(chestWindow, item) {
		const itemData = this.bot.mcData.itemsByName[item.name];
		let roomForItem = this.getRoomForItem(chestWindow, item);
		if (roomForItem > 0) this.sendItemDeposit(item, chestWindow, roomForItem);
		if (roomForItem >= item.count) return true;
		return false;
	}

	stashNext(chest, stashList, chestWindow, callback) {
		const current = stashList[0];
		const remainder = stashList.slice(1, stashList.length);
		if (current) {
			let roomForItem = this.getRoomForItem(chestWindow, current);
			if (roomForItem < current.count && roomForItem > 0) {
				remainder.push({type: current.type, count: current.count - roomForItem});
				current.count = roomForItem;
			}
			if (this.canStash(chestWindow, current)) {
				//console.log('Chest Not Full');
				chest.deposit(current.type, null, current.count, (err) => {
					this.saveChestWindow(chestWindow.position, chest.window);
					if (err) {
						if (err.message.startsWith('missing source item')) {
							// just move on.
							chestWindow = this.chestMap[getPosHash(chestWindow.position)];
							this.stashNext(chest, remainder, chestWindow, callback);
							return;
						}
						// Move on to the next item to stash.
						this.sendStashingError(chestWindow, current, err);
					}
					let newChest = remainder.length > 0 ? this.findChest(remainder[0]) : false;
					if (newChest) {
						if (!newChest.position.equals(chestWindow.position)) {
							this.sendChestEfficiency(remainder[0], newChest);
							chest.close();
							this.sendToChest(newChest);
							return;
						}
					}
					chestWindow = this.chestMap[getPosHash(chestWindow.position)];
					this.stashNext(chest, remainder, chestWindow, callback);
				});
			}
			else {
				this.sendCantStash(chestWindow, current);
				chest.close();
				let newChest = this.findChest(current);
				if (newChest) {
					if (!newChest.position.equals(chestWindow.position)) {
						this.sendToChest(newChest);
						return;
					}
					else {
						this.stashNext(chest, remainder, chestWindow, callback);
					}
				}
				this.stashNonEssentialInventory(callback);
			}
		}
		else {
			this.sendStashSuccess(callback);
			chest.close();
		}
	}

	compressNext(compressList, callback) {
		const current = compressList[0];
		const remainder = compressList.slice(1, compressList.length);
		if (current) {
			this.bot.autobot.autocraft.autoCraft(current.id, current.count, (craftResult) => {
				// Timout could possibly be removed - test
				sleep(100).then(() => {
					this.compressNext(remainder, callback);
				});
			});	
		}
		else this.sendCompressSuccess(callback);
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

	listUnknownStorageGridChests() {
		let chestsToOpen = this.bot.findBlocks({
			point: this.bot.autobot.homePosition,
			matching: this.bot.mcData.blocksByName['chest'].id,
			maxDistance: 16,
			count: 200
		});
		// Only stash to surface / near surface chests
		chestsToOpen = chestsToOpen.filter((r) => {
			if (r.y !== this.bot.autobot.homePosition.y) return false;
			for (const posHash in this.chestMap) {
				if (r.equals(this.chestMap[posHash].position)) return false;
			}
			return true;
		});
		return chestsToOpen;
	}

	findChest(item) {
		const itemsToStash = this.listNonEssentialInventory();
		// Check known chests by most full first
		const chestList = Object.values(this.chestMap).sort((a, b) => a.freeSlotCount - b.freeSlotCount);
		if (item) {
			for (const chest of chestList) {
				if (this.getRoomForItem(chest, item) > 0) {
					return this.bot.blockAt(chest.position);
				}
			}	
		}
		for (const chest of chestList) {
			if (this.getRoomForItem(chest, itemsToStash[0]) > 0) {
				return this.bot.blockAt(chest.position);
			}
		}
		let chestsToOpen = this.listUnknownStorageGridChests();
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

	validateChest(position) {
		return this.bot.blockAt(position).type === this.bot.mcData.blocksByName['chest'].id;
	}

	chestArrival() {
		if (!this.cbChest) {
			// Timeout is for pathfinder not being spammed
			sleep(100).then(() => { this.bot.autobot.lumberjack.harvestNearestTree(32); });
			return;
		}
		if (!this.validateChest(this.cbChest.position)) {
			delete this.chestMap[getPosHash(this.cbChest.position)];
			// Timeout is for pathfinder not being spammed
			sleep(100).then(() => { this.stashNonEssentialInventory(this.callback); });
			return;
		}
		if (Math.floor(this.bot.entity.position.distanceTo(this.cbChest.position)) > 3) {
			// Didn't actually arrive. Start over.
			// Timeout is for pathfinder not being spammed
			sleep(100).then(() => { this.stashNonEssentialInventory(this.callback); });
			return;
		}
		const chestToOpen = this.cbChest;
		const callback = this.callback;
		const chest = this.bot.openChest(chestToOpen);
		chest.on('open', () => {
			this.saveChestWindow(chestToOpen.position, chest.window);
			const chestWindow = this.chestMap[getPosHash(chestToOpen.position)];
			const itemsToStash = this.listNonEssentialInventory();
			// TODO: write a function to check the stashing queue against the chest
			// ...probably in the findChest function to return an appropriate chest
			this.stashNext(chest, itemsToStash, chestWindow, callback);
		});
		chest.on('close', () => {
			//console.log('Chest closed');
		});
	}

	sendToChest(chest) {
		//this.sendSendToChest(chest);
		const p = chest.position;
		const goal = new GoalNear(p.x, p.y, p.z, 3);
		this.cbChest = chest;
		// Timeout is for pathfinder not being spammed
		sleep(100).then(() => { this.bot.pathfinder.setGoal(goal); });
	}

	cacheChest() {
		const chestToOpen = this.bot.blockAt(this.chestsToCache[0]);
		this.chestsToCache = this.chestsToCache.slice(1, this.chestsToCache.length);
		const chest = this.bot.openChest(chestToOpen);
		chest.on('open', () => {
			this.saveChestWindow(chestToOpen.position, chest.window);
			chest.close();
			this.sendToPeekInChest();
		});
	}

	sendToPeekInChest() {
		if (this.chestsToCache.length > 0) {
			const p = this.chestsToCache[0];
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			// Timeout is for pathfinder not being spammed
			sleep(100).then(() => { this.bot.pathfinder.setGoal(goal); });
			return;
		}
		this.sendCachedAllChests(this.callback);
	}

	fillChestMap(callback) {
		this.chestsToCache = this.listUnknownStorageGridChests();
		if (this.chestsToCache.length > 0) {
			this.cachingChests = true;
			this.callback = callback;
			//this.sendCacheChests();
			this.sendToPeekInChest();
		}
	}

	stashNonEssentialInventory(callback) {
		this.active = true;
		if (this.checkInventoryToStash()) {
			const chest = this.findChest();
			if (chest) {
				this.callback = callback;
				this.sendToChest(chest);
			}
			else {
				this.sendPlaceNewChest();
				this.placeNewChest((result) => {
					if (this.findChest()) {
						this.stashNonEssentialInventory(callback);
						return;
					}
					if (result.error) {
						if (callback) callback(result);
						this.bot.emit('autobot.stashing.done', result);
					}
					else this.stashNonEssentialInventory(callback);
				});
			}
		}
		else this.sendStashSkipping(callback);
	}

	sendStashingError(chestWindow, item, parentError) {
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {
			error: true,
			resultCode: "stashingError",
			description: `Error while stashing.`,
			chestWindow: chestWindow,
			item: item,
			parentError: parentError
		};
		this.bot.emit(eventName, result);
	}

	sendCantStash(chestWindow, item) {
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {
			error: false,
			resultCode: "cantStash",
			description: `Can't stash an item in this chest. Finding another chest.`,
			chestWindow: chestWindow,
			item: item
		};
		this.bot.emit(eventName, result);
	}

	/*
	sendSendToChest(chest) {
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {
			error: false,
			resultCode: "sendToChest",
			description: `Bot is going to stash items in a chest`,
			chest: chest
		};
		this.bot.emit(eventName, result);
	}
	*/

	/*
	sendCacheChests() {
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {
			error: false,
			resultCode: "cacheChests",
			description: `The bot is going to cache the contents of any unknown storage grid chests.`
		};
		this.bot.emit(eventName, result);
	}
	*/

	sendPlaceNewChest() {
		const eventName = "autobot.stashing.behaviourSelect";
		let result = {
			error: false,
			resultCode: "placeNewChest",
			description: `Bot is going to place a new chest`
		};
		this.bot.emit(eventName, result);
	}

	sendItemDeposit(item, chestWindow, roomForItem) {
		const eventName = 'autobot.stashing.itemDeposit';
		let result = {
			error: false,
			resultCode: "itemDeposit",
			description: `Depositing ${item.count} ${item.name}(s) in chest at ${chestWindow.position}. Capacity for item: ${roomForItem}`,
			item: item,
			chestPosition: chestWindow.position,
			roomForItem: roomForItem
		};
		this.bot.emit(eventName, result);
	}

	sendChestEfficiency(item, newChest) {
		const eventName = 'autobot.stashing.chestEfficiency';
		let result = {
			error: false,
			resultCode: "chestEfficiency",
			description: `Chest Efficiency - Stashing to a different chest`,
			item: item,
			newChest: newChest
		};
		this.bot.emit(eventName, result);
	}

	sendStashSuccess(callback) {
		const eventName = 'autobot.stashing.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Successfully stashed unneeded items."
		};
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendCompressSuccess(callback) {
		const eventName = 'autobot.compression.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Successfully compressed all compressable items."
		};
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendCachedAllChests(callback) {
		const eventName = "autobot.stashing.cachingChests.done";
		let result = {
			error: false,
			resultCode: "cachedAllChests",
			description: `All the chests on the storage grid have been examined.`
		};
		this.cachingChests = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendStashSkipping(callback) {
		const eventName = 'autobot.stashing.done';
		let result = {
			error: false,
			resultCode: "skipping",
			description: "No non-essential inventory to stash."
		};
		this.active = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}
}

module.exports = Stash;
