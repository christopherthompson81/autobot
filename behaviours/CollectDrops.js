const autoBind = require('auto-bind');
const { GoalBlock } = require('../pathfinder/pathfinder').goals;
const sleep = require('./autoBotLib').sleep;

class CollectDrops {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.remainder = [];
		this.callback = () => {};
		this.collected = {};
		this.active = false;
	}

	resetBehaviour() {
		this.remainder = [];
		this.callback = () => {};
		this.collected = {};
		this.active = false;
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
				//console.log(`Found a(n) ${this.bot.mcData.items[entity.entityType].displayName}`);
				drops.push(entity);
			}
		}
		return drops;
	}

	pickUpNext() {
		let current = this.remainder[0];
		this.remainder = this.remainder.slice(1, this.remainder.length);
		if (current) {
			const itemId = current.metadata[7].itemId;
			if (itemId) {
				const name = this.bot.mcData.items[itemId].name;
				if (!this.collected[name]) this.collected[name] = 0;
				this.collected[name]++;
			}
			else {
				if (!this.collected['unknown']) this.collected['unknown'] = 0;
				this.collected['unknown']++;
			}
			const p = current.position;
			const goal = new GoalBlock(p.x, p.y, p.z);
			this.bot.autobot.navigator.setGoal(goal);
		}
		else {
			// Timeout is for pathfinder not being spammed
			sleep(350).then(() => {
				this.sendCollectDropsSuccess(this.callback);
			});
		}
	}

	pickUpBrokenBlocks(callback) {
		this.active = true;
		this.collected = {};
		this.callback = callback;
		this.remainder = this.findNearbyDrops(10);
		//console.log(`Found ${drops.length} broken blocks to collect.`)
		this.pickUpNext();
	}

	sendCollectDropsSuccess(callback) {
		const eventName = 'autobot.collectDrops.done';
		let result = {
			error: false,
			resultCode: "success",
			description: "Finished picking up drops.",
			collectedItems: this.collected
		};
		this.active = false;
		this.bot.emit(eventName, result);
		if (callback) callback(result);
	}
}

module.exports = CollectDrops;
