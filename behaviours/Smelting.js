const autoBind = require('auto-bind');
const { GoalNear } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;

class Smelting {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.callback = () => {};
		this.active = false;
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
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
			let inputAmount = inventoryDict["iron_ore"];
			const currentInput = furnace.inputItem();
			let inputCount = currentInput ? currentInput.count : 0;
			if (inputCount + inputAmount >= 64) {
				inputAmount = 64 - currentInput.count;
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

	smeltingCallback(furnaceBlock, callback) {
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

	smeltOre(callback) {
		this.active = true;
		const furnaceIds = [
			this.bot.mcData.blocksByName['furnace'].id,
			//this.bot.mcData.blocksByName['lit_furnace'].id
		];
		const furnaceBlock = this.bot.findBlock({
			point: this.homePosition,
			matching: furnaceIds,
			maxDistance: 128
		});
		// Only stash to surface / near surface chests
		if (furnaceBlock) {
			const p = furnaceBlock.position;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.callback = () => { this.smeltingCallback(furnaceBlock, callback); };
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
