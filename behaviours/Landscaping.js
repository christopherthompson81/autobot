const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
const { GoalBlock, GoalGetToBlock } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;
//const sortByDistanceFromBot = require('./autoBotLib').sortByDistanceFromBot;
const sortByDistanceFromHome = require('./autoBotLib').sortByDistanceFromHome;
const airBlocks = require('./constants').airBlocks;
const clearPattern = require('./constants').clearPattern;
const dirtPattern = require('./constants').dirtPattern;

class Landscaping {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.callback = () => {};
		this.dirtQueue = [];
		this.digging = false;
		this.placing = false;
		this.flatteningCube = false;
		this.gettingDirt = false;
		this.targetSubstrate = '';
		this.substrateList = [];
	}

	resetBehaviour() {
		this.callback = () => {};
		this.dirtQueue = [];
		this.digging = false;
		this.placing = false;
		this.flatteningCube = false;
		this.gettingDirt = false;
		this.targetSubstrate = '';
		this.substrateList = [];
	}

	placeNext(placeQueue, callback) {
		if (!this.placing) this.placing = true;
		const current = placeQueue[0];
		const remainder = placeQueue.slice(1, placeQueue.length);
		if (current) {
			const item = this.bot.autobot.inventory.getInventoryItemById(this.bot.mcData.itemsByName[current.name].id);
			const referenceBlock = this.bot.blockAt(current.position);
			const placementVector = new Vec3(1, 0, 0);
			this.bot.equip(item, 'hand', () => {
				this.bot.placeBlock(referenceBlock, placementVector, (err) => {
					if (err) this.sendPlacingError(err, current, remainder, callback);
					else sleep(100).then(() => this.placeNext(remainder, callback));
				});
			});
		}
		else this.sendPlacingSuccess(callback);
	}

	digNext(digQueue, callback) {
		const current = digQueue[0];
		const remainder = digQueue.slice(1, digQueue.length);
		if (current) {
			const block = this.bot.blockAt(current, false)
			if (!block.diggable || airBlocks.includes(block.name)) {
				this.digNext(remainder, callback);
				return;
			}
			const tool = this.bot.pathfinder.bestHarvestTool(block)
			if (block.harvestTools) {
				const harvestTools = Object.keys(block.harvestTools);
				if (!harvestTools.includes(tool)) {
					this.sendNoSuitableTool(block, tool);
					this.digNext(remainder, callback);
					return;
				}
			}
			if (!this.bot.defaultMove.safeToBreak(block)) {
				this.sendNotSafe(block);
				this.bot.autobot.mining.pushBadTarget(block.position.clone());
				this.digNext(remainder, callback);
				return;
			}
			if (Math.floor(this.bot.entity.position.distanceTo(current)) > 3) {
				this.sendTooFar(block);
				if (this.gettingDirt) this.dirtQueue = digQueue;
				const p = block.position;
				const goal = new GoalGetToBlock(p.x, p.y, p.z);
				this.bot.pathfinder.setGoal(goal);
				return;
			}
			this.bot.equip(tool, 'hand', () => {
				this.bot.dig(block, true, (err) => {
					this.digNext(remainder, callback);
				});
			});
		}
		else {
			// Timeout is for blocks to land on the ground
			sleep(1500).then(() => {
				this.sendDiggingSuccess(callback);
			});
		}
	}

	flattenCallback(position) {
		const targetSubstrate = this.targetSubstrate;
		const substrateList = this.substrateList;
		const callback = this.callback;
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
		this.digNext(digQueue, (result) => {
			// We need sufficient materials, otherwise fail. (9 dirt)
			// Add target space dirt to inventory dirt
			// TODO: add a collectBlocks routine
			let dirtCount = this.bot.autobot.inventory.getInventoryDictionary().dirt || 0;
			if (dirtCount < dirtPlaceQueue.length) {
				this.bot.autobot.navigator.backupBot(() => {
					this.sendInsufficientMaterials(dirtCount, dirtPlaceQueue, callback)
				});
				return;
			}
			this.placeNext(dirtPlaceQueue, () => {
				this.bot.autobot.navigator.backupBot(() => {
					this.sendFlatteningSuccess(callback);
				});
			});
		});
	}

	flattenCube(position, targetSubstrate, substrateList, callback) {
		if (!this.flatteningCube) this.flatteningCube = true;
		this.callback = callback;
		if (!targetSubstrate) {
			this.targetSubstrate = 'dirt';
		}
		else {
			this.targetSubstrate = targetSubstrate;
		}
		if (!substrateList) {
			this.substrateList = ['dirt', 'grass_block'];
		}
		else {
			this.substrateList = substrateList;
		}
		const p = position;
		if (this.bot.entity.position.floored().equals(p)) {
			this.flattenCallback(position);
		}
		else {
			// Set a goal of exactly standing inside the block at foot level.
			const goal = new GoalBlock(p.x, p.y, p.z);
			//this.bot.autobot.currentTask = 'flattenCube';
			this.bot.pathfinder.setGoal(goal);
		}
	}

	// Return an array of blocks forming a contiguous queue (of specified types)
	blockToQueue(p, oldQueue, blockTypes, limit) {
		// Scan the cube 9-8-9, all new positve cubes recursively scan. 
		let point = p.clone();
		let queue = [...oldQueue];
		//console.log(oreBlocks);
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				for (let z = -1; z <= 1; z++) {
					if (x == 0 && y == 0 && z == 0) {
						continue;
					}
					const scanBlock = this.bot.blockAt(point.offset(x, y, z));
					//console.log(`scanblock: `, scanBlock);
					if (blockTypes.includes(scanBlock.type)) {
						//console.log(`Adjacent block ${x} ${y} ${z} is also ore.`);
						let knownBlock = false;
						for (const known of queue) {
							if (known.equals(scanBlock.position)) {
								knownBlock = true;
								break;
							}
						}
						if (!knownBlock) queue.push(scanBlock.position);
					}
				}
			}
		}
		if (queue.length >= limit) {
			return queue.slice(0, limit);
		}
		if (queue.length > oldQueue.length) {
			const newLength = queue.length;
			for (let i = oldQueue.length; i < newLength; i++) {
				queue = this.blockToQueue(queue[i], queue, blockTypes, limit);
				if (queue.length >= limit) break;
			}
		}
		return queue;
	}

	findDirtQueue(limit) {
		let dirtQueue = [];
		const dirtTypes = [
			this.bot.mcData.blocksByName.dirt.id,
			this.bot.mcData.blocksByName.grass_block.id,
		];
		while (dirtQueue.length < limit) {
			let dirtBlocks = this.bot.findBlocks({
				point: this.bot.autobot.homePosition,
				matching: (b) => {
					if (dirtTypes.includes(b.type)) return true;
					return false;
				},
				maxDistance: 35,
				count: 5000,
			});
			// Only dirt above home
			//console.log(`Dirt Count: ${dirtBlocks.length}`);
			dirtBlocks = dirtBlocks.filter((b) => {
				if (b.y < this.bot.autobot.homePosition.y) return false;
				for (const q of dirtQueue) {
					if (b.equals(q)) {
						//console.log(`removing duplicate: ${b} / ${q}`);
						return false;
					}
				}
				return true;
			});
			//console.log(`Dirt Count above home Y: ${dirtBlocks.length}`);
			dirtBlocks = sortByDistanceFromHome(this.bot, dirtBlocks);
			// If no dirt was found, return false
			if (dirtBlocks.length === 0) {
				return false;
			}
			dirtQueue.push(dirtBlocks[0]);
			let newQueue = this.blockToQueue(
				dirtBlocks[0],
				dirtQueue,
				dirtTypes,
				limit
			);
			dirtQueue = newQueue;
			//dirtQueue = dirtBlocks.slice(0, limit);
		}
		return dirtQueue;
	}

	dirtArrival() {
		this.digNext(this.dirtQueue, () => {
			this.bot.autobot.collectDrops.pickUpBrokenBlocks(() => {
				this.gettingDirt = false;
				sleep(100).then(this.callback);
			});
		});
	}

	getDirt(limit, callback) {
		const dirtQueue = this.findDirtQueue(limit);
		if (dirtQueue) {
			this.gettingDirt = true;
			this.dirtQueue = dirtQueue;
			this.callback = callback;
			const p = dirtQueue[0];
			const goal = new GoalBlock(p.x, p.y, p.z);
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			console.log('No dirt');
			callback();
		}
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
		const storageObjectType = this.bot.mcData.itemsByName[storageObjectName];
		let storageObject = this.bot.autobot.inventory.getInventoryItemById(storageObjectType.id);
		if (!storageObject) {
			//console.log('Autocrafting storageObject.');
			this.bot.autobot.autocraft.autoCraft(storageObjectType.id, 1, (cbResult) => {
				if (cbResult.error) {
					this.sendStorageObjectCraftingFailed(storageObjectType, cbResult, callback);
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
					const eventName = 'autobot.landscaping.newStorageObject';
					if (callback) callback(cbResult);
					this.bot.emit(eventName, cbResult);
					return;
				}
				storageObject = this.bot.autobot.inventory.getInventoryItemById(storageObjectType.id);
				this.bot.equip(storageObject, 'hand', (err) => {
					const referenceBlock = this.bot.blockAt(buildPos);
					sleep(350).then(() => {
						this.bot.placeBlock(referenceBlock, new Vec3(1, 0, 0), (err) => {
							if (err) this.sendStorageObjectPlacingFailed(storageObjectType, err, callback);
							else this.sendNewStorageObjectSuccess(storageObjectType, callback);
						});
					});
				});
			});
		}
		else this.sendNoSpot(storageObjectType, callback);
	}

	sendPlacingError(parentError, currentTarget, queueRemainder, callback) {
		const eventName = 'autobot.landscaping.placeQueue.done';
		let result = {
			error: true,
			resultCode: "placingError",
			description: "Could not place block.",
			parentError: parentError,
			currentTarget: currentTarget,
			queueRemainder: queueRemainder
		};
		this.bot.emit(eventName, result);
		this.placing = false;
		if (callback) callback(result);
	}

	sendPlacingSuccess(callback) {
		const eventName = 'autobot.landscaping.placeQueue.done';
		let result = {
			error: false,
			resultCode: "success",
			decription: "Finished placing blocks"
		};
		this.bot.emit(eventName, result);
		this.placing = false;
		if (callback) callback(result);
	}

	sendNoSuitableTool(block, bestTool) {
		const eventName = 'autobot.landscaping.digQueue.digging';
		let result = {
			error: true,
			resultCode: "noSuitableTool",
			description: "The bot lacks a suitable tool to break a block in the queue",
			block: block,
			bestTool: bestTool
		}
		this.bot.emit(eventName, result);
	}
	
	sendNotSafe(block) {
		const eventName = 'autobot.landscaping.digQueue.digging';
		let result = {
			error: false,
			resultCode: "notSafe",
			description: `Target ${block.displayName} block is not safe to break. Skipping.`,
			block: block
		}
		this.bot.emit(eventName, result);
	}

	sendTooFar(block) {
		const eventName = 'autobot.landscaping.digQueue.digging';
		let result = {
			error: false,
			resultCode: "tooFar",
			description: `The bot is too far from the object block to mine.`,
			block: block
		}
		this.bot.emit(eventName, result);
	}

	sendDiggingSuccess(callback) {
		const eventName = 'autobot.landscaping.digQueue.done';
		let result = {
			error: false,
			resultCode: "success",
			errorDecription: "Finished digging blocks"
		};
		this.bot.emit(eventName, result);
		this.placing = false;
		if (callback) callback(result);
	}

	sendInsufficientMaterials(dirtCount, dirtPlaceQueue, callback) {
		const eventName = 'autobot.landscaping.flattenCube.done';
		let result = {
			error: true,
			resultCode: "insufficientMaterials",
			description: "Insufficient materials to flatten with.",
			dirtCount: dirtCount,
			dirtPlaceQueue: dirtPlaceQueue
		};
		this.bot.emit(eventName, result);
		this.flatteningCube = false;
		if (callback) callback(result);
	}

	sendFlatteningSuccess(callback) {
		console.log('flattenCallback - flatten success');
		const eventName = 'autobot.landscaping.flattenCube.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Successfully flattened cube.",
		};
		this.bot.emit(eventName, result);
		this.flatteningCube = false;
		if (callback) callback(result);
	}
	
	sendStorageObjectCraftingFailed(storageObjectType, parentError, callback) {
		const eventName = 'autobot.landscaping.newStorageObject';
		let result = {
			error: true,
			resultCode: "storageObjectCraftingFailed",
			description: `Failed to make a new ${storageObjectType.displayName}.`,
			storageObjectType: storageObjectType,
			parentError: parentError
		};
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendStorageObjectPlacingFailed(storageObjectType, parentError, callback) {
		const eventName = 'autobot.landscaping.newStorageObject';
		let result = {
			error: true,
			resultCode: "storageObjectPlacingFailed",
			description: `Failed to place a new ${storageObjectType.displayName}.`,
			parentError: parentError
		};
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendNewStorageObjectSuccess(storageObjectType, callback) {
		const eventName = 'autobot.landscaping.newStorageObject';
		let result = {
			error: false,
			resultCode: "success",
			description: `Placed a new ${storageObjectType.displayName}.`
		};
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	// nope
	sendNoSpot(storageObjectType, callback) {
		const eventName = 'autobot.landscaping.newStorageObject';
		let result = {
			error: true,
			resultCode: "noSpot",
			description: `Could not find a spot for a new ${storageObjectType.displayName}.`
		};
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}
}

module.exports = Landscaping;
