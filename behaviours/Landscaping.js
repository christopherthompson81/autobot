const toolItems = require('./constants').toolItems;
const essentialItems = require('./constants').essentialItems;
const compressableItems = require('./constants').compressableItems;

class Landscaping {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.callback = () => {};
	}

	placeNext(placeQueue, callback) {
		const current = placeQueue[0];
		const remainder = placeQueue.slice(1, placeQueue.length);
		if (current) {
			const item = this.bot.autobot.inventory.getInventoryItemById(this.mcData.itemsByName[current.name].id);
			const referenceBlock = this.bot.blockAt(current.position);
			const placementVector = new Vec3(1, 0, 0);
			this.bot.equip(item, 'hand', () => {
				this.bot.placeBlock(referenceBlock, placementVector, (err) => {
					if (err) {
						callback({
							error: true,
							errorDescription: "Could not place block.",
							parentError: err,
							currentTarget: current,
							queueRemainder: remainder
						});
					}
					else {
						sleep(100).then(() => this.placeNext(remainder, callback));
					}
				});
			});
		}
		else {
			callback({
				error: false,
				errorDecription: "Finished placing blocks"
			});
		}
	}

	digNext(digQueue, callback) {
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
						console.log("Digging error");
					}
					this.digNext(remainder, callback)
				});
			});
		}
		else {
			callback(true);
		}
	}

	flattenCube(position, callback, targetSubstrate, substrateList) {
		if (!targetSubstrate) targetSubstrate = 'dirt';
		if (!substrateList) substrateList = ['dirt', 'grass_block'];
		const p = position;
		// Set a goal of exactly standing inside the block at foot level.
		const goal = new GoalBlock(p.x, p.y, p.z);
		this.bot.autobot.currentTask = 'flattenCube';
		this.callback = () => {
			const clearPattern = [
				// Body space (probably unneeded)
				[0, 0, 0],
				[0, 1, 0],
				// Foot level
				[0, 0, -1], // N
				[1, 0, -1], // NE
				[1, 0, 0], // E
				[1, 0, 1], // SE
				[0, 0, 1], // S
				[-1, 0, 1], // SW
				[-1, 0, 0], // W
				[-1, 0, -1], // NW
				// Eye-level
				[0, 1, -1], // N
				[1, 1, -1], // NE
				[1, 1, 0], // E
				[1, 1, 1], // SE
				[0, 1, 1], // S
				[-1, 1, 1], // SW
				[-1, 1, 0], // W
				[-1, 1, -1], // NW
			];
			const dirtPattern = [
				[-1, -1, -1], // NW
				[0, -1, -1], // N
				[1, -1, -1], // NE
				[-1, -1, 0], // W
				[0, -1, 0], // center
				[1, -1, 0], // E
				[-1, -1, 1], // SW
				[0, -1, 1], // S
				[1, -1, 1], // SE
			];
			const digQueue = [];
			for (const offset of clearPattern) {
				const block = this.bot.blockAt(position.offset(...offset));
				if (block.boundingBox === 'block') digQueue.push(position.offset(...offset).clone());
			}
			const dirtPlaceQueue = []
			for (const offset of dirtPattern) {
				const block = this.bot.blockAt(position.offset(...offset));
				if (block.boundingBox === 'block' && !substrateList.includes(block.name)) {
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
				else if (['void_air', 'cave_air', 'air'].includes(block.name)) {
					dirtPlaceQueue.push({
						position: position.offset(...offset).clone(),
						name: targetSubstrate,
					});
				}
			}
			this.digNext(digQueue, (success) => {
				// We need sufficient materials, otherwise fail. (9 dirt)
				// Add target space dirt to inventory dirt
				// TODO: add a collectBlocks routine
				let dirtCount = this.bot.autobot.inventory.getInventoryDictionary().dirt || 0;
				if (dirtCount < dirtPlaceQueue.length) {
					this.backupBot(() => callback(false));
					return;
				}
				this.placeNext(dirtPlaceQueue, () => {
					this.backupBot(() => callback(true));
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
}

module.exports = Landscaping;
