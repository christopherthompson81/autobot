const toolItems = require('./constants').toolItems;
const essentialItems = require('./constants').essentialItems;
const compressableItems = require('./constants').compressableItems;

class Stash {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.callback = () => {};
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
			if (this.bot.entity.position.distanceTo(this.bot.autobot.homePosition) < 5) {
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

	defaultPostStashBehaviour() {
		// If we have logs, mine, if we don't lumberjack
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/_log$/))) {
			// Don't start mining without a full set of tools
			const missingTools = this.missingTools();
			if (missingTools.length > 0) {
				//console.log('Returning to cutting trees because of missing tools.', missingTools);
				this.bot.autobot.inventory.craftTools(this.harvestNearestTree);
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

	stashNext(chest, stashList) {
		const current = stashList[0];
		const remainder = stashList.slice(1, stashList.length);
		if (current) {
			chest.deposit(current.type, null, current.count, (err) => {
				if (err) {
					console.log(`Unable to stash ${current.count} ${current.name}`);
					chest.close();
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
		if (chestsToOpen.length > 0) {
			return this.bot.blockAt(chestsToOpen[0]);
		}
		else {
			return false;
		}
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
					// Wait timing might need to be adjusted up
					sleep(350).then(this.placeNewChest);
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
							console.log('Chest is full. Trying to find another');
							chest.close();
							this.stashNonEssentialInventory();
							return;
						}
						//console.log('chestWindow: ', chest.window);
						//console.log('chest.items(): ', chest.items());
						const itemsToStash = this.listNonEssentialInventory();
						// TODO: write a function to check the stashing queue against the chest... probably in the findChest function to return an appropriate chest
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
}

module.exports = Stash;
