const sortByDistanceFromBot = require('./autoBotLib').sortByDistanceFromBot;
const bestHarvestTool = require('./autoBotLib').bestHarvestTool;

class Mining {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
	}
	
	/**************************************************************************
	 * 
	 * Miner - Prepare for Descent
	 * 
	 **************************************************************************/

	/*
	Return an array of blocks forming a contiguous ore vein (of combined types)

	const oreBlocks = [
		'coal_ore',
		'diamond_ore',
		'emerald_ore',
		'iron_ore',
		'gold_ore',
		'lapis_ore',
		'nether_gold_ore',
		'nether_quartz_ore',
		"redstone_ore",
	]
	*/
	blockToVein(p, oldVein) {
		// Scan the cube 9-8-9, all new positve cubes recursively scan. 
		let point = p.clone();
		let vein = [...oldVein];
		const oreBlocks = this.bot.autobot.inventory.listBlocksByRegEx(/_ore$/);
		//console.log(oreBlocks);
		for (let y = -1; y <= 1; y++) {
			for (let x = -1; x <= 1; x++) {
				for (let z = -1; z <= 1; z++) {
					if (x == 0 && y == 0 && z == 0) {
						continue;
					}
					const scanBlock = this.bot.blockAt(point.offset(x, y, z));
					//console.log(`scanblock: `, scanBlock);
					if (oreBlocks.includes(scanBlock.type)) {
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

	/*
	findNearestCoalVein() {
		let coalBlocks = this.bot.findBlocks({
			point: this.homePosition,
			matching: this.bot.autobot.inventory.listBlocksByRegEx(/_ore$/),
			maxDistance: 128,
			count: 1000,
		});
		// filter bad targets
		coalBlocks = coalBlocks.filter((p) => {
			for (const badTarget of this.badTargets) {
				if (p.equals(badTarget)) return false;
			}
			return true;
		});
		coalBlocks = sortByDistanceFromBot(coalBlocks);
		let nearby = [];
		for (const p of coalBlocks) {
			if (this.bot.entity.position.distanceTo(new Vec3(p.x, p.y, p.z)) < 5) {
				nearby.push(p);
			}
		}
		if (nearby.length > 0) {
			console.log("Unmined ore close by. Cleaning it up.");
			nearby = sortByDistanceFromBot(nearby);
			return this.blockToVein(nearby[0], [this.bot.blockAt(nearby[0])]);
		}
		//console.log('Nearby coal ore blocks are: ', coalBlocks);
		// If no coal ore was found, return false
		if (coalBlocks.length === 0) {
			return false;
		}
		// Resort by Y highest to lowest.
		//coalBlocks = coalBlocks.sort((a, b) => { return b.y - a.y });
		return this.blockToVein(coalBlocks[0], [this.bot.blockAt(coalBlocks[0])]);
	}
	*/

	findBestOreVein() {
		// First handle nearby cleanup
		// Very large number of blocks returned because otherwise many nearby blocks will be overlooked
		let oreBlocks = this.bot.findBlocks({
			point: this.bot.autobot.homePosition,
			matching: this.bot.autobot.inventory.listBlocksByRegEx(/_ore$/),
			maxDistance: 128,
			count: 10000,
		});
		// filter bad targets and y < 5 (Bots get stuck on unbreakables)
		//console.log(`Found ${oreBlocks.length}/1000 ore blocks in the search`);
		oreBlocks = oreBlocks.filter((p) => {
			if (p.y < 5) return false;
			if (this.bot.entity.position.distanceTo(p) > this.nearbyThreshold) return false;
			for (const badTarget of this.bot.autobot.badTargets) {
				if (p.equals(badTarget)) return false;
			}
			return true;
		});
		oreBlocks = sortByDistanceFromBot(oreBlocks);
		if (oreBlocks.length > 0) {
			console.log("Unmined ore close by. Cleaning it up.");
			return this.blockToVein(oreBlocks[0], [this.bot.blockAt(oreBlocks[0])]);
		}
		// Resort by desireability highest to lowest. (eliminate ones we don't have tools for right now)
		const desirable = [
			'ancient_debris',
			'diamond_ore',
			'emerald_ore',
			'gold_ore',
			'lapis_ore',
			'redstone_ore',
			'nether_gold_ore',
			'nether_quartz_ore',
			'iron_ore',
			'coal_ore',
		];
		const items = Object.keys(this.getInventoryDictionary());
		const harvestable = [];
		for (const material of desirable) {
			const harvestTools = Object.keys(this.mcData.blocksByName[material].harvestTools);
			const currentlyHarvestable = harvestTools.some(r => items.indexOf(r) >= 0);
			if (currentlyHarvestable) {
				harvestable.push(material);
			}
		}
		for (const targetType of harvestable) {
			oreBlocks = this.bot.findBlocks({
				point: this.homePosition,
				matching: this.mcData.blocksByName[targetType].id,
				maxDistance: 128,
				count: 1000,
			});
			// filter bad targets and y < 5 (Bots get stuck on unbreakables)
			//console.log(`Found ${oreBlocks.length}/1000 ${targetType} blocks in the search`);
			oreBlocks = oreBlocks.filter((p) => {
				if (p.y < 5) return false;
				for (const badTarget of this.bot.autobot.badTargets) {
					if (p.equals(badTarget)) return false;
				}
				return true;
			});
			oreBlocks = sortByDistanceFromBot(oreBlocks);
			if (oreBlocks.length > 0) {
				const targetBlock = this.bot.blockAt(oreBlocks[0]);
				//console.log(`Mining a(n) ${targetBlock.displayName} vein. Distance: ${Math.floor(this.bot.entity.position.distanceTo(oreBlocks[0]))}`);
				return this.blockToVein(oreBlocks[0], [targetBlock]);
			}
		}
		return false;
	}

	havePickaxe() {
		const inventoryDict = this.bot.autobot.inventory.getInventoryDictionary();
		if (Object.keys(inventoryDict).some(id => id.match(/pickaxe$/))) {
			return true;
		}
		return false;
	}

	equipPickaxe(callback) {
		// There needs to be a way to prefer iron, to stone, to wood by inventory
		const inventoryDictionary = this.bot.autobot.getInventoryDictionary();
		let pickaxe = "pickaxe";
		if (Object.keys(inventoryDictionary).includes('iron_pickaxe')) {
			pickaxe = "iron_pickaxe";
		}
		else if (Object.keys(inventoryDictionary).includes('stone_pickaxe')) {
			pickaxe = "stone_pickaxe";
		}
		else {
			pickaxe = "pickaxe";
		}
		if (this.bot.heldItem) {
			if (this.bot.heldItem.name.match(new RegExp(pickaxe, "i"))) {
				callback();
				return;
			}
		}
		let craftPickaxe = 585;
		if (Object.keys(inventoryDictionary).includes('iron_ingot')) {
			craftPickaxe = this.bot.autobot.inventory.listItemsByRegEx(/iron_pickaxe/)[0];
		}
		else if (Object.keys(inventoryDictionary).includes('cobblestone')) {
			craftPickaxe = this.bot.autobot.inventory.listItemsByRegEx(/stone_pickaxe/)[0];
		}
		else {
			craftPickaxe = this.bot.autobot.inventory.listItemsByRegEx(/wooden_pickaxe/)[0];
		}
		this.equipByName(pickaxe, () => {
			const hand = this.bot.heldItem;
			//console.log(this.bot.heldItem);
			if (!hand) {
				this.bot.autobot.autocraft.autoCraft(craftPickaxe, 1, () => {
					sleep(350).then(() => {
						this.bot.autobot.inventory.equipByName(
							this.mcData.items[craftPickaxe].name,
							callback
						);
					});
				});
			}
			else {
				console.log("Hand: ", hand.displayName);
				const regex = RegExp(`pickaxe$`, "i");
				const axes = thisbot.autobot.inventory.listItemsByRegEx(regex);
				if (!axes.includes(hand.type)) {
					this.bot.autobot.autocraft.autoCraft(craftPickaxe, 1, () => {
						sleep(350).then(() => {
							this.bot.autobot.inventory.equipByName(
								this.mcData.items[craftPickaxe].name,
								callback
							);
						});
					});
				}
				else {
					callback();
				}
			}
		});
	}

	mineVeinNext(vein, callback) {
		const current = vein[0];
		this.remainder = vein.slice(1, vein.length);
		if (!this.havePickaxe()) {
			this.bot.autobot.collectDrops.pickUpBrokenBlocks(callback);
			// emit
			return;
		}
		if (current) {
			if (!this.defaultMove.safeToBreak(current)) {
				console.log(`Target ${current.displayName} block is not safe to break. Skipping.`);
				this.badTargets.push(current.position.clone());
				this.mineVeinNext(this.remainder);
				return;
			}
			//console.log(`Current:`, current);
			this.equipPickaxe(() => {
				if (this.bot.entity.position.distanceTo(current.position) > 3) {
					console.log("The bot is too far from the object block to mine.");
					//this.currentTask = 'mineVein';
					const p = current.position;
					const goal = new GoalGetToBlock(p.x, p.y, p.z);
					this.bot.pathfinder.setGoal(goal);
					return;
				}
				this.bot.dig(current, true, (err) => {
					this.mineVeinNext(this.remainder);
				});
			});
		}
		else {
			console.log('Finished mining. Waiting for drops.');
			//this.currentTask = null;
			sleep(1000).then(() => {
				console.log('Picking up uncollected blocks.');
				this.pickUpBrokenBlocks();
			});
		}
	}

	mineVein(vein) {
		// Go to a tree and cut it down
		this.remainder = vein;
		const p = vein[0].position;
		const goal = new GoalGetToBlock(p.x, p.y, p.z);
		this.bot.pathfinder.setGoal(goal);
	}

	mineNearestOreVein() {
		//this.currentTask = 'mineVein';
		//const vein = this.findNearestCoalVein();
		const vein = this.findBestOreVein();
		if (vein) {
			console.log("Mining Vein: ", vein[0].position);
			this.mineVein(vein);
		}
		else {
			console.log("No valid coal veins found.");
		}
	}
}

module.exports = Mining;