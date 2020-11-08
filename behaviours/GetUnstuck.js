const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
//const { GoalNear } = require('../pathfinder/pathfinder').goals;
const getPosHash = require('./autoBotLib').getPosHash;

class GetUnstuck {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.goalPosition = new Vec3(1, 0, 0);
		this.goalPosHash = '';
		this.errorPosition = new Vec3(1, 0, 0);
		this.distanceFromGoal = 0;
		this.errorCount = 0;
	}

	resetBehaviour() {
		this.goalPosition = new Vec3(1, 0, 0);
		this.goalPosHash = '';
		this.errorPosition = new Vec3(1, 0, 0);
		this.distanceFromGoal = 0;
		this.errorCount = 0;
	}

	/**************************************************************************
	 * 
	 * Get bot unstuck during pathfinding
	 * 
	 **************************************************************************/

	resetCurrentTarget() {
		this.goalPosition = new Vec3(1, 0, 0);
		this.goalPosHash = '';
		this.errorPosition = new Vec3(1, 0, 0);
		this.distanceFromGoal = 0;
		this.errorCount = 0;
	}

	checkGoalProgress(goal, stuck) {
		const goalPosition = new Vec3(goal.x, goal.y, goal.z);
		const distanceFromGoal = Math.floor(goalPosition.distanceTo(this.bot.entity.position));
		const errorPosition = this.bot.entity.position.clone();
		const distanceFromLastError = Math.floor(this.errorPosition.distanceTo(errorPosition));
		if (!stuck && distanceFromLastError > 3) {
			this.resetCurrentTarget();
			return true;
		}
		if (
			distanceFromGoal > (Math.sqrt(goal.rangeSq) || 3) ||
			stuck ||
			this.errorCount > 0
		) {
			const goalPosHash = getPosHash(goalPosition);
			if (this.goalPosHash === goalPosHash) {
				// If we're still within 3 of the last stuck position then it's the same thing that's getting us stuck.
				if (distanceFromLastError <= 3) {
					this.errorCount++;
				}
				else {
					this.goalPosHash = goalPosHash;
					this.errorPosition = errorPosition;
					this.errorCount = 1;	
				}
			}
			else {
				this.goalPosHash = goalPosHash;
				this.errorPosition = errorPosition;
				this.errorCount = 1;
			}
			this.distanceFromGoal = distanceFromGoal;
			return false;
		}
		else {
			this.resetCurrentTarget();
			return true;
		}
	}

	onExcessiveBreakTime(block, breakTime) {
		//console.log(`Excessive break time (${breakTime}) trying to break ${block.displayName} at ${block.position}`);
		if (this.bot.autobot.mining.active) {
			this.bot.pathfinder.setGoal(null);
			this.bot.autobot.mining.active = false;
			// TODO: Add an event for this
			//console.log('Excess break time forcing tool crafting. Mining Abandoned.');
			this.bot.autobot.inventory.craftTools();
		}
	}

	onBotStuck(goalProgress, path, goal) {
		if (!this.checkGoalProgress(goal, true)) {
			this.selectOnStuckBehaviour(goal);
		}
		else {
			this.backupAndContinue(goal);
		}
	}

	// Strategies to try, in order:
	// 1). Move backwards one block and then continue
	// 2). Flatten surroundings and then continue
	// 3). Mark the goal position as a bad target and go home
	// 4). Mark the goal position as a bad target, try to flatten surroundings, and go home
	// 5). All behaviours after 4 are the same as 4.
	selectOnStuckBehaviour(goal) {
		if (this.errorCount > 0 && this.errorCount <= 1) {
			this.backupAndContinue(goal);
		}
		else if (this.errorCount > 1 && this.errorCount <= 3) {
			this.flattenAndContinue(goal);
		}
		else if (this.errorCount > 3 && this.errorCount <= 4) {
			this.markBadAndGoHome();
		}
		else if (this.errorCount > 4) {
			this.flattenAndGoHome();
		}
		else {
			console.log('did not select a getUnstuck behaviour.');
		}
	}

	backupAndContinue(goal) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "tooFar",
			description: `An error happened in attempting to reach the goal. Distance: ${this.distanceFromGoal}`
		};
		this.bot.autobot.navigator.backupBot(() => this.bot.pathfinder.setGoal(goal));
		this.bot.emit(eventName, result);
	}
	
	flattenAndContinue(goal) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "tooFar",
			description: `Another error happened in attempting to reach the goal. Flattening Surroundings. Distance: ${this.distanceFromGoal}`
		};
		this.bot.pathfinder.setGoal(null);
		this.bot.clearControlStates();
		const stuckPosition = this.bot.entity.position.floored();
		this.bot.autobot.navigator.backupBot(() => {
			this.bot.autobot.landscaping.flattenCube(
				stuckPosition,
				'cobblestone',
				['stone', 'cobblestone', 'diorite', 'andesite', 'granite', 'sand', 'dirt', 'grass_block'],
				() => this.bot.pathfinder.setGoal(goal)
			);
		});
		this.bot.emit(eventName, result);
	}

	markBadAndGoHome() {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "badTarget",
			description: "Many successive pathfinding errors at this position. Target is possibly unreachable. Marking as a bad target and returning home"
		};
		if (this.bot.autobot.mining.active) {
			this.bot.autobot.mining.badTargets.push(currentTarget.goalPosition.clone());
		}
		this.bot.autobot.resetAllBehaviours(this.bot.autobot.navigator.returnHome);
		this.bot.emit(eventName, result);
	}

	flattenAndGoHome() {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "badTarget",
			description: "Very stuck. Target is possibly unreachable and the bot can't move. Marking as a bad target, flattening surroundings, and returning home"
		};
		if (this.bot.autobot.mining.active) {
			this.bot.autobot.mining.badTargets.push(currentTarget.goalPosition.clone());
		}
		this.bot.autobot.resetAllBehaviours(() => {
			this.bot.autobot.landscaping.flattenCube(
				this.bot.entity.position,
				'cobblestone',
				['stone', 'cobblestone', 'diorite', 'andesite', 'granite', 'sand', 'dirt', 'grass_block'],
				this.bot.autobot.navigator.returnHome
			);
		});
		this.bot.emit(eventName, result);
	}
}

module.exports = GetUnstuck;
