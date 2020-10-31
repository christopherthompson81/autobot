class Smelting {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.callback = () => {};
		this.active = false;
	}

	restoke(furnace, callback) {
		let result = {};
		const eventName = 'autobot.smelting.restoke';
		const inventoryDict = this.getInventoryDictionary();
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
							console.log(`Put fuel (adding ${fuelAmount} coal to ${fuel.count}): `, err)
							result = {
								error: true,
								errorCode: "restokeFailed",
								errorDescription: `Error adding ${fuelAmount} coal to ${fuel.count}`,
								parentError: err
							};
						}
						else {
							result = {
								error: false,
								errorCode: "success",
								errorDescription: `Added ${fuelAmount} coal to ${fuel.count}`
							};
						}
						sleep(350).then(() => {
							if (callback) callback(result);
							this.bot.emit(eventName, result);
						});
					},
				);
			}
		}
		result = {
			error: false,
			errorCode: "skipped",
			errorDescription: `No fuel was added to the furnace.`
		};
		callback(result);
		this.bot.emit(eventName, result);
	}

	resupplyFurnace(furnace, callback) {
		let result = {};
		const eventName = 'autobot.smelting.resupply';
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		if (inventoryDict["iron_ore"]) {
			let inputAmount = inventoryDict["iron_ore"];
			const currentInput = furnace.inputItem();
			let inputCount = currentInput.count || 0;
			if (inputCount + inputAmount >= 64) {
				inputAmount = 64 - currentInput.count;
			}
			furnace.putInput(
				this.listItemsByRegEx(/^iron_ore$/)[0],
				null,
				inputAmount,
				(err) => {
					if (err) {
						result = {
							error: true,
							errorCode: "resupplyFailed",
							errorDescription: `Error adding ${inputAmount} iron ore to ${inputCount}`,
							parentError: err
						};
					}
					else {
						result = {
							error: false,
							errorCode: "success",
							errorDescription: `Added ${inputAmount} iron ore to ${inputCount}`
						};
					}
					furnace.close();
					this.active = false;
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
				errorCode: "skipped",
				errorDescription: `No input was added to the furnace.`
			};
			sleep(350).then(() => {
				this.active = false;
				if (callback) callback(result);
				this.bot.emit(eventName, result);
			});
		}		
	}

	smeltingCallback(furnaceBlock, callback) {
		const furnace = this.bot.openFurnace(furnaceBlock);
		furnace.on('open', () => {
			if (furnace.outputItem()) {
				furnace.takeOutput(() => {
					this.restoke(furnace, () => {
						this.resupplyFurnace(furnace, (result) => {
							if (callback) callback(result);
						});
					});
				});
			}
			else {
				this.restoke(furnace, () => {
					this.resupplyFurnace(furnace, (result) => {
						if (callback) callback(result);
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
		let result = {};
		const furnaceId = this.mcData.itemsByName['furnace'].id;
		let furnace = this.bot.autobot.inventory.getInventoryItemById(furnaceId);
		if (!furnace) {
			//console.log('Autocrafting furnace.');
			this.autoCraft(furnaceId, 1, (cbResult) => {
				if (cbResult.error) {
					result = {
						error: true,
						errorCode: "furnaceCraftingFailed",
						errorDescription: "Failed to make a new furnace.",
						parentError: cbResult
					};
					if (callback) callback(result);
					this.bot.emit('autobot.smelting.newFurnace', result);
				}
				else {
					// Wait timing might need to be adjusted up
					sleep(350).then(() => {
						this.placeNewFurnace(callback);
					});
				}
			});
			return;
		}
		const buildPos = this.bot.autobot.landscaping.getNextStorageGridSpot();
		if (buildPos) {
			this.bot.autobot.landscaping.flattenCube(buildPos, null, null, (cbResult) => {
				if (cbResult.error) {
					if (callback) callback(cbResult);
					this.bot.emit(eventName, cbResult);
					return;
				}
				furnace = this.bot.autobot.inventory.getInventoryItemById(furnaceId);
				this.bot.equip(furnace, 'hand', (err) => {
					if (err) {
						//console.log('Error equipping chest');
					}
					const referenceBlock = this.bot.blockAt(buildPos);
					sleep(350).then(() => {
						this.bot.placeBlock(referenceBlock, new Vec3(1, 0, 0), (err) => {
							if (err) {
								result = {
									error: true,
									errorCode: "furnacePlacingFailed",
									errorDescription: "Failed to place a new furnace.",
									parentError: err
								};
							}
							else {
								result = {
									error: false,
									errorCode: "success",
									errorDescription: "Placed a new furnace."
								};
							}
							if (callback) callback(result);
							this.bot.emit(eventName, result);
						});
					});
				});
			});
		}
		else {
			result = {
				error: true,
				errorCode: "noSpot",
				errorDescription: "Could not find a spot for a new furnace."
			};
			if (callback) callback(result);
			this.bot.emit(eventName, result);
		}
	}

	smeltOre() {
		const self = this;
		const furnaceIds = [
			this.mcData.blocksByName['furnace'].id,
			this.mcData.blocksByName['lit_furnace'].id
		];
		const furnaceBlock = this.bot.findBlock({
			point: this.homePosition,
			matching: furnaceIds,
			maxDistance: 128
		});
		// Only stash to surface / near surface chests
		if (furnaceBlock) {
			//console.log("Furnace found. Moving to: ", furnaceBlock.position);
			//this.currentTask = 'smelting';
			const p = furnaceBlock.position;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.callback = () => { self.smeltingCallback(furnaceBlock) };
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			this.placeNewFurnace(this.smeltOre);
		}
	}
}

module.exports = Smelting;
