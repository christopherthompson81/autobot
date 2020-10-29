const toolItems = require('./constants').toolItems;
const essentialItems = require('./constants').essentialItems;
const compressableItems = require('./constants').compressableItems;

class Smelting {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.callback = () => {};
	}

	restoke(furnace, callback) {
		const inventoryDict = this.getInventoryDictionary();
		const fuel = furnace.fuelItem();
		let fuelAmount = (inventoryDict['coal'] || 0) > 64 ? 64 : (inventoryDict['coal'] || 0);
		let fuelCount = fuel ? fuel.count : 0;
		if (fuelCount < 64 && inventoryDict["coal"] > 0) {
			if ((fuelCount + fuelAmount) > 64) {
				fuelAmount = 64 - fuelCount;
			}
			if (fuelAmount > 0) {
				//console.log(this.listItemsByRegEx(/^coal$/)[0], insertAmount);
				//console.log(inventoryDict);
				furnace.putFuel(
					this.listItemsByRegEx(/^coal$/)[0],
					null,
					fuelAmount,
					(err) => {
						if (err) {
							console.log(`Put fuel (adding ${fuelAmount} coal to ${fuel.count}): `, err)
						}
						sleep(350).then(callback);
					},
				);
			}
			else {
				callback();
			}
		}
		else {
			callback();
		}
	}

	resupplyFurnace(furnace) {
		const inventoryDict = this.getInventoryDictionary();
		if (inventoryDict["iron_ore"]) {
			let inputAmount = inventoryDict["iron_ore"];
			const currentInput = furnace.inputItem();
			if (currentInput) {
				if (currentInput.count + inputAmount > 64) {
					inputAmount = 64 - currentInput.count;
				}
			}
			furnace.putInput(
				this.listItemsByRegEx(/^iron_ore$/)[0],
				null,
				inputAmount,
				(err) => {
					if (err) {
						console.log("Put input", err);
					}
					furnace.close();
					console.log('Finished smelting.');
					this.stashNonEssentialInventory();
				},
			)
		}
		else {
			furnace.close();
			console.log('Finished smelting.');
			this.stashNonEssentialInventory();
		}		
	}

	smeltOre() {
		const furnaceBlock = this.bot.findBlock({
			point: this.homePosition,
			matching: this.listBlocksByRegEx(/^(furnace|lit_furnace)$/),
			maxDistance: 128
		});
		// Only stash to surface / near surface chests
		if (furnaceBlock) {
			console.log("Furnace found. Moving to: ", furnaceBlock.position);
			//this.currentTask = 'smelting';
			const p = furnaceBlock.position;
			const goal = new GoalNear(p.x, p.y, p.z, 3);
			this.callback = () => {
				console.log('Smelting callback.');
				const inventoryDict = this.getInventoryDictionary();
				console.log(inventoryDict);
				const furnace = this.bot.openFurnace(furnaceBlock);
				furnace.on('open', () => {
					if (furnace.outputItem()) {
						furnace.takeOutput(() => {
							this.restoke(furnace, () => {
								this.resupplyFurnace(furnace)
							});
						});
					}
					else {
						this.restoke(furnace, () => {
							this.resupplyFurnace(furnace)
						});
					}
				});
				furnace.on('close', () => {
					console.log('Furnace closed');
				});
			}
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			console.log("No furnace located. Autocrafting.");
			const furnaceId = this.listItemsByRegEx(/^furnace$/)[0];
			this.autoCraft(furnaceId, 1, () => {
				sleep(350).then(() => {
					const furnace = this.getInventoryItemById(furnaceId);
					const placementVector = this.findPlacementVector();
					if (!placementVector) {
						this.stashNonEssentialInventory();
						return;
					}
					const referenceBlock = this.bot.blockAt(this.bot.entity.position.offset(
						placementVector.x || 0,
						placementVector.y || 0,
						placementVector.z || 0,
					));
					this.bot.equip(
						furnace,
						'hand',
						(err) => {
							if (err) {
								console.log(err);
							}
							this.bot.placeBlock(
								referenceBlock,
								placementVector,
								(err) => {
									if (err) {
										console.log(err);
									}
									this.smeltOre();
								}
							)
						}
					);
				});
			});
		}
	}
}

module.exports = Smelting;