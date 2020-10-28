class CollectDrops {
	constructor(bot, mcData) {
		this.bot = bot;
		this.mcData = mcData;
		this.callback = () => {};
		this.collected = {};
	}
	
	/**************************************************************************
	 * 
	 * Collect Items
	 * 
	 **************************************************************************/

	findNearbyDrops(maxDistance) {
		maxDistance = maxDistance || 10;
		const drops = Array();
		for (const i in this.bot.entities) {
			const entity = this.bot.entities[i];
			if (entity.type === "object") {
				const distance = this.bot.player.entity.position.distanceTo(entity.position);
				//console.log(`Distance: ${distance}`);
				if (distance > maxDistance) {
					//console.log(`Too Far`);
					continue;
				}
				//console.log(entity);
				//console.log(`Found a(n) ${this.mcData.items[entity.entityType].displayName}`);
				drops.push(entity);
			}
		}
		return drops;
	}

	pickUpNext(drops, callback) {
		const current = drops[0];
		const remainder = drops.slice(1, drops.length);
		if (current) {
			const itemId = current.metadata[7].itemId;
			if (itemId) {
				const name = this.mcData.items[itemId].name;
				if (!this.collected[name]) this.collected[name] = 0;
				this.collected[name]++;
			}
			else {
				if (!this.collected['unknown']) this.collected['unknown'] = 0;
				this.collected['unknown']++;
			}
			this.callback = () => { this.pickUpNext(remainder, callback); };
			const p = current.position;
			const goal = new GoalBlock(p.x, p.y, p.z);
			this.bot.pathfinder.setGoal(goal);
		}
		else {
			sleep(350).then(() => {
				this.bot.autobot.currentTask = null;
				callback({
					error: false,
					errorDescription: "Finished picking up drops.",
					collectedItems: this.collected
				});
			});
		}
	}

	pickUpBrokenBlocks(callback) {
		this.bot.autobot.currentTask = 'collectDrops';
		this.collected = {};
		const drops = this.findNearbyDrops(10);
		//console.log(`Found ${drops.length} broken blocks to collect.`)
		this.pickUpNext(drops, callback);
	}
}

module.exports = CollectDrops;
