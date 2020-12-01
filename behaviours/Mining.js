const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
const sortByDistanceFromBot = require('./autoBotLib').sortByDistanceFromBot;
const bestHarvestTool = require('./autoBotLib').bestHarvestTool;
const sleep = require('./autoBotLib').sleep;
const oreBlockTypes = require('./constants').oreBlocks;
const { GoalGetToBlock } = require('../pathfinder/pathfinder').goals;
const storage = require('node-persist');

class Mining {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.nearbyThreshold = 6;
		this.callback = () => {};
		this.active = false;
		this.havePickaxe = bot.autobot.inventory.havePickaxe;
		this.badTargets = [];
		storage.init().then(() => this.getBadTargets(badTargets => this.badTargets = badTargets));
	}

	resetBehaviour() {
		this.callback = () => {};
		this.active = false;
	}
	
	/**************************************************************************
	 * 
	 * Miner - Prepare for Descent
	 * 
	 **************************************************************************/

	equipBestHarvestTool(block, callback) {
		const tool = bestHarvestTool(this.bot, block);
		this.bot.equip(tool, 'hand', (err) => {
			if (err) {
				callback({
					error: true,
					resultCode: "equipError",
					description: `Failed to equip tool (${JSON.stringify(tool)}) for ${block.displayName}`,
					parentError: err
				});
			}
			else {
				callback({
					error: false,
					resultCode: "success",
					description: `Successfully equiped best harvest tool for ${block.displayName}`
				});
			}
		});
	}

	// Return an array of blocks forming a contiguous ore vein (of combined types)
	blockToVein(p, oldVein) {
		// Scan the cube 9-8-9, all new positve cubes recursively scan. 
		let point = p.clone();
		let vein = [...oldVein];
		//const oreBlocks = this.bot.autobot.inventory.listBlocksByRegEx(/_ore$/);
		//console.log(oreBlocks);
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				for (let z = -1; z <= 1; z++) {
					if (x == 0 && y == 0 && z == 0) {
						continue;
					}
					const scanBlock = this.bot.blockAt(point.offset(x, y, z));
					//console.log(`scanblock: `, scanBlock);
					if (oreBlockTypes.includes(scanBlock.name)) {
						//console.log(`Adjacent block ${x} ${y} ${z} is also ore.`);
						let knownBlock = false;
						for (const known of vein) {
							if (known.position.equals(scanBlock.position)) {
								knownBlock = true;
								break;
							}
						}
						if (!knownBlock) vein.push(scanBlock);
					}
				}
			}
		}
		if (vein.length > oldVein.length) {
			const newLength = vein.length;
			for (let i = oldVein.length; i < newLength; i++) {
				vein = this.blockToVein(vein[i].position, vein);
			}
		}
		return vein;
	}

	getCurrentlyHarvestableOres() {
		// Find viable ore types by eliminate ores we don't have tools for right now
		// In order of desirability
		const items = Object.keys(this.bot.autobot.inventory.getInventoryDictionary());
		const harvestable = [];
		for (const material of oreBlockTypes) {
			const harvestTools = Object.keys(this.bot.mcData.blocksByName[material].harvestTools);
			const currentlyHarvestable = harvestTools.some(r => items.indexOf(r) >= 0);
			if (currentlyHarvestable) {
				harvestable.push(material);
			}
		}
		return harvestable;
	}

	oreFilter(p) {
		if (p.y < 5) return false;
		for (const badTarget of this.badTargets) {
			if (p.equals(badTarget)) return false;
		}
		return true;
	}

	findNearestOreVein() {
		const harvestable = this.getCurrentlyHarvestableOres();
		let oreBlocks = this.bot.findBlocks({
			point: this.homePosition,
			matching: (b) => harvestable.includes(b.name),
			maxDistance: 128,
			count: 1000,
		});
		// filter bad targets
		oreBlocks = oreBlocks.filter(this.oreFilter);
		oreBlocks = sortByDistanceFromBot(this.bot, oreBlocks);
		// If no harvestable ore was found, return false
		if (oreBlocks.length === 0) {
			return false;
		}
		return this.blockToVein(oreBlocks[0], [this.bot.blockAt(oreBlocks[0])]);
	}

	findBestOreVein() {
		// First handle nearby cleanup
		// Very large number of blocks returned because otherwise many nearby blocks will be overlooked
		const harvestable = this.getCurrentlyHarvestableOres();
		let oreBlocks = this.bot.findBlocks({
			point: this.bot.autobot.homePosition,
			matching: (b) => harvestable.includes(b.name),
			maxDistance: 128,
			count: 10000,
		});
		// filter bad targets and y < 5 (Bots get stuck on unbreakables)
		oreBlocks = oreBlocks.filter(this.oreFilter);
		oreBlocks = oreBlocks.filter((p) => this.bot.entity.position.distanceTo(p) <= this.nearbyThreshold);
		oreBlocks = sortByDistanceFromBot(this.bot, oreBlocks);
		if (oreBlocks.length > 0) {
			//console.log("Unmined ore close by. Cleaning it up.");
			return this.blockToVein(oreBlocks[0], [this.bot.blockAt(oreBlocks[0])]);
		}
		// Otherwise, sequentially search by desirability
		for (const targetType of harvestable) {
			oreBlocks = this.bot.findBlocks({
				point: this.bot.autobot.homePosition,
				matching: this.bot.mcData.blocksByName[targetType].id,
				maxDistance: 128,
				count: 1000,
			});
			// filter bad targets and y < 5 (Bots get stuck on unbreakables)
			oreBlocks = oreBlocks.filter(this.oreFilter);
			oreBlocks = sortByDistanceFromBot(this.bot, oreBlocks);
			if (oreBlocks.length > 0) {
				const targetBlock = this.bot.blockAt(oreBlocks[0]);
				return this.blockToVein(oreBlocks[0], [targetBlock]);
			}
		}
		return false;
	}

	mineVeinNext(vein, callback) {
		const current = vein[0];
		const remainder = vein.slice(1, vein.length).sort((a, b) => {
			const [pA, pB] = [a.position, b.position];
			const distA = this.bot.entity.position.distanceTo(new Vec3(pA.x, pA.y, pA.z));
			const distB = this.bot.entity.position.distanceTo(new Vec3(pB.x, pB.y, pB.z));
			return distA - distB;
		});
		if (!this.havePickaxe()) {
			this.bot.autobot.collectDrops.pickUpBrokenBlocks(() => this.sendNoPickaxe(callback));
			return;
		}
		if (current) {
			const tool = this.bot.pathfinder.bestHarvestTool(current)
			if (current.harvestTools) {
				const harvestTools = Object.keys(current.harvestTools);
				if (!tool || !harvestTools.includes(tool.type.toString())) {
					this.sendNoSuitableTool(current, tool);
					this.mineVeinNext(remainder, callback);
					return;
				}
			}
			if (!this.bot.defaultMove.safeToBreak(current)) {
				this.sendNotSafe(current);
				this.pushBadTarget(current.position.clone());
				this.mineVeinNext(remainder, callback);
				return;
			}
			if (Math.floor(this.bot.entity.position.distanceTo(current.position)) > 3) {
				this.sendTooFar(current);
				const p = current.position;
				const goal = new GoalGetToBlock(p.x, p.y, p.z);
				this.bot.autobot.navigator.setGoal(goal);
				this.callback = () => this.mineVeinNext(vein, callback);
				return;
			}
			this.bot.equip(tool, 'hand', () => {
				this.bot.dig(current, true, (err) => {
					if (err) this.sendDigError(current, err);
					this.mineVeinNext(remainder, callback);
				});
			});
		}
		else {
			// Timeout is for blocks to land on the ground
			sleep(1000).then(() => {
				this.bot.autobot.collectDrops.pickUpBrokenBlocks(() => this.sendMiningSuccess(callback));
			});
		}
	}

	mineVein(vein, callback) {
		// Go to a tree and cut it down
		const p = vein[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.callback = () => {
			this.mineVeinNext(vein, callback);
		};
		this.bot.autobot.navigator.setGoal(goal);
	}

	mineNearestOreVein(callback) {
		this.active = true;
		const vein = this.findBestOreVein();
		if (vein) {
			this.sendFoundVein(vein);
			this.mineVein(vein, callback);
		}
		else this.sendNoVeinFound(callback);
	}

	mineBestOreVein(callback) {
		this.active = true;
		const vein = this.findBestOreVein();
		if (vein) {
			this.sendFoundVein(vein);
			this.mineVein(vein, callback);
		}
		else this.sendNoVeinFound(callback);
	}

	getBadTargets(callback) {
		storage.getItem('badTargets').then((pBadTargets) => {
			if (!pBadTargets) {
				pBadTargets = this.badTargets ? this.badTargets : [];
				storage.setItem('badTargets', pBadTargets);
			}
			const badTargets = pBadTargets.map(t => new Vec3(t.x, t.y, t.z));
			callback(badTargets);
		});
	}

	pushBadTarget(position) {
		this.badTargets.push(position);
		storage.setItem('badTargets', this.badTargets);
	}

	sendNoPickaxe(callback) {
		const eventName = 'autobot.mining.done';
		let result = {
			error: true,
			resultCode: "noPickaxe",
			description: "Bot can't continue mining ore without a pickaxe."
		};
		this.active = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendMiningSuccess(callback) {
		const eventName = 'autobot.mining.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Finished mining and collecting drops."
		};
		this.active = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendNoVeinFound(callback) {
		const eventName = 'autobot.mining.done';
		let result = {
			error: true,
			resultCode: "noVeinFound",
			description: `No valid ore veins found.`
		}
		this.active = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}

	sendNoSuitableTool(block, bestTool) {
		const eventName = 'autobot.mining.digging';
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
		const eventName = 'autobot.mining.digging';
		let result = {
			error: false,
			resultCode: "notSafe",
			description: `Target ${block.displayName} block is not safe to break. Skipping.`,
			block: block
		};
		this.bot.emit(eventName, result);
	}

	sendTooFar(block) {
		const eventName = 'autobot.mining.digging';
		let result = {
			error: false,
			resultCode: "tooFar",
			description: `The bot is too far from the object block to mine.`,
			block: block
		}
		this.bot.emit(eventName, result);
	}

	sendDigError(block, parentError) {
		const eventName = 'autobot.mining.digging';
		let result = {
			error: true,
			resultCode: "digError",
			description: `Digging error`,
			block: block,
			parentError: parentError
		}
		this.bot.emit(eventName, result);
	}

	sendFoundVein(vein) {
		const eventName = 'autobot.mining.digging';
		let result = {
			error: false,
			resultCode: "foundVein",
			description: `Found an ore vein`,
			vein: vein
		}
		this.bot.emit(eventName, result);
	}	
}


module.exports = Mining;