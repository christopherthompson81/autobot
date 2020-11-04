const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
const { GoalBlock } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;
const airBlocks = require('./constants').airBlocks;
const clearPattern = require('./constants').clearPattern;
const dirtPattern = require('./constants').dirtPattern;

class Landscaping {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.callback = () => {};
		this.digging = false;
		this.placing = false;
		this.flatteningCube = false;
	}

	resetBehaviour() {
		this.callback = () => {};
		this.digging = false;
		this.placing = false;
		this.flatteningCube = false;
	}

	placeNext(placeQueue, callback) {
		const eventName = 'autobot.landscaping.placeQueue.done';
		let result = {};
		if (!this.placing) this.placing = true;
		const current = placeQueue[0];
		const remainder = placeQueue.slice(1, placeQueue.length);
		if (current) {
			const item = this.bot.autobot.inventory.getInventoryItemById(this.bot.mcData.itemsByName[current.name].id);
			const referenceBlock = this.bot.blockAt(current.position);
			const placementVector = new Vec3(1, 0, 0);
			this.bot.equip(item, 'hand', () => {
				this.bot.placeBlock(referenceBlock, placementVector, (err) => {
					if (err) {
						result = {
							error: true,
							resultCode: "placingError",
							description: "Could not place block.",
							parentError: err,
							currentTarget: current,
							queueRemainder: remainder
						};
						if (callback) callback(result);
						this.bot.emit(eventName, result);
						this.placing = false;
					}
					else {
						sleep(100).then(() => this.placeNext(remainder, callback));
					}
				});
			});
		}
		else {
			result = {
				error: false,
				resultCode: "success",
				errorDecription: "Finished placing blocks"
			};
			if (callback) callback(result);
			this.bot.emit(eventName, result);
			this.placing = false;
		}
	}

	digNext(digQueue, callback) {
		const eventName = 'autobot.landscaping.digQueue.done';
		let result = {};
		if (!this.digging) this.digging = true;
		const current = digQueue[0];
		const remainder = digQueue.slice(1, digQueue.length);
		if (current) {
			const block = this.bot.blockAt(current);
			if (!block.diggable || ['air', 'cave_air', 'void_air'].includes(block.name)) {
				this.digNext(remainder, callback);
				return;
			}
			const tool = this.bot.pathfinder.bestHarvestTool(block);
			this.bot.equip(tool, 'hand', () => {
				this.bot.dig(block, (err) => {
					if (err) {
						result = {
							error: true,
							resultCode: "diggingError",
							description: "Could not dig block.",
							parentError: err,
							currentTarget: current,
							queueRemainder: remainder
						};
						if (callback) callback(result);
						this.bot.emit(eventName, result);
						this.digging = false;
					}
					this.digNext(remainder, callback)
				});
			});
		}
		else {
			result = {
				error: false,
				resultCode: "success",
				errorDecription: "Finished digging blocks"
			};
			if (callback) callback(result);
			this.bot.emit(eventName, result);
			this.digging = false;
		}
	}

	flattenCube(position, targetSubstrate, substrateList, callback) {
		const eventName = 'autobot.landscaping.flattenCube.done';
		let result = {};
		if (!this.flatteningCube) this.flatteningCube = true;
		if (!targetSubstrate) targetSubstrate = 'dirt';
		if (!substrateList) substrateList = ['dirt', 'grass_block'];
		const p = position;
		// Set a goal of exactly standing inside the block at foot level.
		const goal = new GoalBlock(p.x, p.y, p.z);
		//this.bot.autobot.currentTask = 'flattenCube';
		this.callback = () => {
			const digQueue = [];
			for (const offset of clearPattern) {
				const block = this.bot.blockAt(position.offset(...offset));
				if (!airBlocks.includes(block.name)) digQueue.push(position.offset(...offset).clone());
			}
			const dirtPlaceQueue = []
			for (const offset of dirtPattern) {
				const block = this.bot.blockAt(position.offset(...offset));
				if (airBlocks.includes(block.name)) {
					dirtPlaceQueue.push({
						position: position.offset(...offset).clone(),
						name: targetSubstrate,
					});
				}
				else if (!substrateList.includes(block.name)) {
					// Don't dig out the block we're standing on.
					if (JSON.stringify(offset) !== JSON.stringify([0, -1, 0])) {
						//console.log(`Digging out ${block.name}`);
						digQueue.push(position.offset(...offset).clone());
						dirtPlaceQueue.push({
							position: position.offset(...offset).clone(),
							name: targetSubstrate,
						});
					}
				}
			}
			this.digNext(digQueue, (success) => {
				// We need sufficient materials, otherwise fail. (9 dirt)
				// Add target space dirt to inventory dirt
				// TODO: add a collectBlocks routine
				let dirtCount = this.bot.autobot.inventory.getInventoryDictionary().dirt || 0;
				if (dirtCount < dirtPlaceQueue.length) {
					this.bot.autobot.navigator.backupBot(() => {
						result = {
							error: true,
							resultCode: "insufficientMaterials",
							description: "Insufficient materials to flatten with.",
							dirtCount: dirtCount,
							dirtPlaceQueue: dirtPlaceQueue
						};
						if (callback) callback(result);
						this.bot.emit(eventName, result);
						this.flatteningCube = false;
					});
					return;
				}
				this.placeNext(dirtPlaceQueue, () => {
					this.bot.autobot.navigator.backupBot(() => {
						result = {
							error: false,
							resultCode: "success",
							description: "Successfully flattened cube.",
						};
						if (callback) callback(result);
						this.bot.emit(eventName, result);
						this.flatteningCube = false;
					});
				});
			});
		}
		this.bot.pathfinder.setGoal(goal);
	}

	getNextStorageGridSpot() {
		let ringSize = 1;
		let buildPos = null;
		let targetPos = null;
		let x, z;
		while (!buildPos && ringSize < 5) {
			for (x = -2 * ringSize; x <= (2 * ringSize); x += 2) {
				for (z = -2 * ringSize; z <= (2 * ringSize); z += 2) {
					targetPos = this.bot.autobot.homePosition.offset(x, 0, z);
					if (!['chest', 'crafting_table', 'furnace'].includes(this.bot.blockAt(targetPos).name)) {
						return targetPos.clone();
					}
				}
			}
			ringSize++;
		}
		return false;
	}

	placeNewStorageObject(storageObjectName, callback) {
		const eventName = 'autobot.landscaping.newStorageObject';
		let result = {};
		const storageObjectType = this.bot.mcData.itemsByName[storageObjectName];
		let storageObject = this.bot.autobot.inventory.getInventoryItemById(storageObjectType.id);
		if (!storageObject) {
			//console.log('Autocrafting storageObject.');
			this.bot.autobot.autocraft.autoCraft(storageObjectType.id, 1, (cbResult) => {
				if (cbResult.error) {
					result = {
						error: true,
						resultCode: "storageObjectCraftingFailed",
						description: `Failed to make a new ${storageObjectType.displayName}.`,
						storageObjectType: storageObjectType,
						parentError: cbResult
					};
					if (callback) callback(result);
					this.bot.emit(eventName, result);
				}
				else {
					// Wait timing might need to be adjusted up
					sleep(350).then(() => {
						this.placeNewStorageObject(storageObjectName, callback);
					});
				}
			});
			return;
		}
		const buildPos = this.getNextStorageGridSpot();
		if (buildPos) {
			this.flattenCube(buildPos, null, null, (cbResult) => {
				if (cbResult.error) {
					if (callback) callback(cbResult);
					this.bot.emit(eventName, cbResult);
					return;
				}
				storageObject = this.bot.autobot.inventory.getInventoryItemById(storageObjectType.id);
				this.bot.equip(storageObject, 'hand', (err) => {
					if (err) {
						//console.log('Error equipping chest');
					}
					const referenceBlock = this.bot.blockAt(buildPos);
					sleep(350).then(() => {
						this.bot.placeBlock(referenceBlock, new Vec3(1, 0, 0), (err) => {
							if (err) {
								result = {
									error: true,
									resultCode: "storageObjectPlacingFailed",
									description: `Failed to place a new ${storageObjectType.displayName}.`,
									parentError: err
								};
							}
							else {
								result = {
									error: false,
									resultCode: "success",
									description: `Placed a new ${storageObjectType.displayName}.`
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
				resultCode: "noSpot",
				description: `Could not find a spot for a new ${storageObjectType.displayName}.`
			};
			if (callback) callback(result);
			this.bot.emit(eventName, result);
		}
	}
}

module.exports = Landscaping;
