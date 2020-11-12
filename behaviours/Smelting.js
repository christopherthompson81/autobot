const autoBind = require('auto-bind');
const oreBlocks = require('./constants').oreBlocks;
const getPosHash = require('./autoBotLib').getPosHash;
const { GoalNear } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;

class Smelting {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.furnaceMap = {};
		this.cbFurnace = null;
		this.callback = () => {};
		this.active = false;
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
	}

	/**************************************************************************
	 * 
	 * Smelt Ore
	 * 
	 * * Find furnaces
	 * * Craft & place furnaces
	 * * Fill input, fuel; Take output
	 * 
	 **************************************************************************/


	listSmeltableOres() {
		// Return a list of items in inventory that can be smelted
		let inventory = this.bot.inventory.items();
		inventory = inventory.filter(i => oreBlocks.includes(i.name));
		return inventory;
	}

	saveFurnaceWindow(position, forOre, furnaceWindow) {
		const p = position;
		const posHash = getPosHash(position);
		this.chestMap[posHash] = {
			id: furnaceWindow.id,
			forOre: forOre,
			position: position,
			type: furnaceWindow.type,
			title: furnaceWindow.title,
			input: furnaceWindow.slots[0],
			output: furnaceWindow.slots[1],
			fuel: furnaceWindow.slots[2]
		}
	}

	listUnknownStorageGridFurnaces() {
		let furnacesToOpen = this.bot.findBlocks({
			point: this.bot.autobot.homePosition,
			matching: this.bot.mcData.blocksByName.furnace.id,
			maxDistance: 16,
			count: 20
		});
		// Only stash to surface / near surface chests
		furnacesToOpen = furnacesToOpen.filter((r) => {
			if (r.y !== this.bot.autobot.homePosition.y) return false;
			for (const posHash in this.furnaceMap) {
				if (r.equals(this.furnaceMap[posHash].position)) return false;
			}
			return true;
		});
		return furnacesToOpen;
	}

	findFurnace(item) {
		const furnaceList = Object.values(this.furnaceMap);
		if (item) {
			for (const furnace of furnaceList) {
				if (furnace.forOre === item.name) {
					return this.bot.blockAt(furnace.position);
				}
			}	
		}
		const oresToSmelt = this.listSmeltableOres();
		for (const furnace of furnaceList) {
			for (const ore of oresToSmelt) {
				if (ore.name === furnace.forOre) return this.bot.blockAt(furnace.position);
			}
		}
		let furnacesToOpen = this.listUnknownStorageGridFurnaces();
		if (furnacesToOpen.length > 0) return this.bot.blockAt(furnacesToOpen[0]);
		else return false;
	}


	restoke(furnace, callback) {
		let result = {};
		const eventName = 'autobot.smelting.restoke';
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		const fuel = furnace.fuelItem();
		let fuelAmount = (inventoryDict['coal'] || 0) >= 64 ? 64 : (inventoryDict['coal'] || 0);
		let fuelCount = fuel ? fuel.count : 0;
		if (fuelCount <= 64 && fuelAmount > 0) {
			if ((fuelCount + fuelAmount) >= 64) {
				fuelAmount = 64 - fuelCount;
			}
			if (fuelAmount > 0) {
				furnace.putFuel(
					this.bot.autobot.inventory.listItemsByRegEx(/^coal$/)[0],
					null,
					fuelAmount,
					(err) => {
						if (err) {
							result = {
								error: true,
								resultCode: "restokeFailed",
								description: `Error adding ${fuelAmount} coal to ${fuelCount}`,
								parentError: err
							};
						}
						else {
							result = {
								error: false,
								resultCode: "success",
								description: `Added ${fuelAmount} coal to ${fuelCount}`
							};
						}
						sleep(350).then(() => {
							if (callback) callback(result);
							this.bot.emit(eventName, result);
						});
					},
				);
				return;
			}
		}
		result = {
			error: false,
			resultCode: "skipped",
			description: `No fuel was added to the furnace.`
		};
		callback(result);
		this.bot.emit(eventName, result);
	}

	resupplyFurnace(furnace, callback) {
		let result = {};
		const eventName = 'autobot.smelting.resupply';
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		if (inventoryDict["iron_ore"]) {
			let inputAmount = inventoryDict["iron_ore"] || 0;
			const currentInput = furnace.inputItem();
			let inputCount = currentInput ? currentInput.count : 0;
			if (inputCount + inputAmount >= 64) {
				inputAmount = 64 - inputCount;
			}
			furnace.putInput(
				this.bot.autobot.inventory.listItemsByRegEx(/^iron_ore$/)[0],
				null,
				inputAmount,
				(err) => {
					if (err) {
						result = {
							error: true,
							resultCode: "resupplyFailed",
							description: `Error adding ${inputAmount} iron ore to input slot (${inputCount} currently)`,
							parentError: err
						};
					}
					else {
						result = {
							error: false,
							resultCode: "success",
							description: `Added ${inputAmount} iron ore to input slot (${inputCount} currently)`
						};
					}
					furnace.close();
					sleep(350).then(() => {
						if (callback) callback(result);
						this.bot.emit(eventName, result);
					});
				},
			)

		}
		else {
			furnace.close();
			result = {
				error: false,
				resultCode: "skipped",
				description: `No input was added to the furnace.`
			};
			sleep(350).then(() => {
				if (callback) callback(result);
				this.bot.emit(eventName, result);
			});
		}		
	}

	smeltingCallback() {
		let furnaceBlock = this.cbFurnace;
		let callback = this.callback;
		let result = {error: false};
		const eventName = 'autobot.smelting.done';
		const furnace = this.bot.openFurnace(furnaceBlock);
		furnace.on('open', () => {
			if (furnace.outputItem()) {
				furnace.takeOutput((err, item) => {
					this.restoke(furnace, (restokeResult) => {
						this.resupplyFurnace(furnace, (resupplyResult) => {
							if (err || restokeResult.error || resupplyResult.error) {
								result.error = true;
							}
							if (err) {
								result.takeOutputResult = {
									error: true,
									resultCode: "takeOutputError",
									description: "There was an error taking the output from the furnace.",
									parentError: err
								};
							}
							else {
								result.takeOutputResult = {
									error: false,
									resultCode: "tookOutput",
									description: `Took ${item.count} ${item.name} from the furnace`,
									item: item
								};
							}
							result.restokeResult = restokeResult;
							result.resupplyResult = resupplyResult;
							if (callback) callback(result);
							this.bot.emit(eventName, result);
							this.active = false;
						});
					});
				});
			}
			else {
				this.restoke(furnace, (restokeResult) => {
					this.resupplyFurnace(furnace, (resupplyResult) => {
						if (restokeResult.error || resupplyResult.error) {
							result.error = true;
						}
						result.takeOutputResult = {
							error: false,
							resultCode: "skipping",
							description: "No output in furnace to take"
						};
						result.restokeResult = restokeResult;
						result.resupplyResult = resupplyResult;
						if (callback) callback(result);
						this.bot.emit(eventName, result);
						this.active = false;
					});
				});
			}
		});
		furnace.on('close', () => {
			//console.log('Furnace closed');
		});
	}

	placeNewFurnace(callback) {
		const eventName = 'autobot.smelting.newFurnace';
		this.bot.autobot.landscaping.placeNewStorageObject('furnace', (result) => {
			if (callback) callback(result);
			this.bot.emit(eventName, result);
		});
	}

	validateFurnace(position) {
		return this.bot.blockAt(position).type === this.bot.mcData.blocksByName.furnace.id;
	}

	furnaceArrival() {
		if (!this.cbFurnace) {
			sleep(100).then(() => { this.bot.autobot.lumberjack.harvestNearestTree(32); });
			return;
		}
		if (!this.validateFurnace(this.cbFurnace.position)) {
			delete this.furnaceMap[getPosHash(this.cbFurnace.position)];
			sleep(100).then(() => { this.smeltOre(this.callback); });
			return;
		}
		if (Math.floor(this.bot.entity.position.distanceTo(this.cbFurnace.position)) > 3) {
			// Didn't actually arrive. Start over.
			sleep(100).then(() => { this.smeltOre(this.callback); });
			return;
		}
		const furnaceToOpen = this.cbFurnace;
		const callback = this.callback;
		const furnace = this.bot.openFurnace(furnaceToOpen);
		furnace.on('open', () => {
			this.saveFurnaceWindow(furnaceToOpen.position, furnace.window);
			const furnaceWindow = this.furnaceMap[getPosHash(furnaceToOpen.position)];
			const oresToSmelt = this.listSmeltableOres();
			// TODO: write a function to check the stashing queue against the chest
			// ...probably in the findChest function to return an appropriate chest
			this.smeltNext(furnace, oresToSmelt, furnaceWindow, callback);
		});
		furnace.on('close', () => {
			//console.log('Chest closed');
		});
	}

	sendToFurnace(furnace) {
		const eventName = "autobot.smelting.behaviourSelect";
		let result = {
			error: false,
			resultCode: "smelt",
			description: `Bot is going to smelt items in a furnace`,
			furnace: furnace
		};
		this.bot.emit(eventName, result);
		const p = furnace.position;
		const goal = new GoalNear(p.x, p.y, p.z, 3);
		this.cbFurnace = furnace;
		sleep(100).then(() => { this.bot.pathfinder.setGoal(goal); });
	}

	smeltOre(callback) {
		this.active = true;
		const furnaceBlock = this.findFurnace();
		// Only stash to surface / near surface chests
		if (furnaceBlock) {
			const p = furnaceBlock.position;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			//this.callback = () => { this.smeltingCallback(furnaceBlock, callback); };
			this.cbFurnace = furnaceBlock;
			this.callback = callback;
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			this.placeNewFurnace((result) => {
				if (result.error) {
					if (callback) callback(result);
					this.bot.emit('autobot.smelting.done', {
						error: true,
						resultCode: 'placingFurnaceError',
						description: 'There was an error while placing the new furnace',
						parentResult: result
					});
					this.active = false;
				}
				else {
					this.smeltOre(callback);
				}
			});
		}
	}
}

module.exports = Smelting;
