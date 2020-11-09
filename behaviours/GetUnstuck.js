const autoBind = require('auto-bind');
const Vec3 = require('vec3').Vec3;
//const { GoalNear } = require('../pathfinder/pathfinder').goals;
const getPosHash = require('./autoBotLib').getPosHash;

class GetUnstuck {
	constructor(bot) {
		autoBind(this);
		this.bot = bot;
		this.goalProgress = this.blankProgress();
		this.stuckProgress = this.blankProgress();
	}

	resetBehaviour() {
		this.goalProgress = this.blankProgress();
		this.stuckProgress = this.blankProgress();
	}

	/**************************************************************************
	 * 
	 * Get bot unstuck during pathfinding
	 * 
	 **************************************************************************/

	blankProgress() {
		let progress = {
			goalPosition: new Vec3(1, 0, 0),
			goalPosHash: '',
			errorPosition: new Vec3(1, 0, 0),
			distanceFromGoal: 0,
			errorCount: 0,
		};
		return progress;
	}

	checkGoalProgress(goal) {
		if (this.bot.autobot.landscaping.flatteningCube) {
			return true;
		}
		const goalPosition = new Vec3(goal.x, goal.y, goal.z);
		const goalPosHash = getPosHash(goalPosition);
		const errorPosition = this.bot.entity.position.clone();
		const distanceFromGoal = Math.floor(goalPosition.distanceTo(errorPosition));
		if (this.goalProgress.goalPosHash === '' || this.goalProgress.goalPosHash !== goalPosHash) {
			this.goalProgress.goalPosition = goalPosition;
			this.goalProgress.goalPosHash = goalPosHash;
			this.goalProgress.errorPosition = errorPosition;
			this.goalProgress.distanceFromGoal = distanceFromGoal;
			this.goalProgress.errorCount = 0;
		}
		const distanceFromLastError = Math.floor(this.goalProgress.errorPosition.distanceTo(errorPosition));
		if (distanceFromLastError > 3) {
			this.goalProgress.errorPosition = errorPosition;
			this.goalProgress.distanceFromGoal = distanceFromGoal;
			this.goalProgress.errorCount = 0;
			return true;
		}
		if (distanceFromGoal > (Math.sqrt(goal.rangeSq) || 3)) {
			if (distanceFromLastError <= 3) {
				this.goalProgress.errorCount++;
			}
			else {
				this.goalProgress.errorPosition = errorPosition;
				this.goalProgress.errorCount = 1;
			}
			this.goalProgress.distanceFromGoal = distanceFromGoal;
			return false;
		}
		else {
			this.goalProgress = this.blankProgress();
			return true;
		}
	}

	checkStuckProgress(goal) {
		const goalPosition = new Vec3(goal.x, goal.y, goal.z);
		const goalPosHash = getPosHash(goalPosition);
		const errorPosition = this.bot.entity.position.clone();
		const distanceFromGoal = Math.floor(goalPosition.distanceTo(errorPosition));
		if (this.stuckProgress.goalPosHash === '') {
			this.stuckProgress.goalPosition = goalPosition;
			this.stuckProgress.goalPosHash = goalPosHash;
			this.stuckProgress.errorPosition = errorPosition;
			this.stuckProgress.distanceFromGoal = distanceFromGoal;
			this.stuckProgress.errorCount = 0;
		}
		const distanceFromLastError = Math.floor(this.stuckProgress.errorPosition.distanceTo(errorPosition));
		if (distanceFromLastError <= 3) {
			this.stuckProgress.errorCount++;
		}
		else {
			this.stuckProgress.errorPosition = errorPosition;
			this.stuckProgress.errorCount = 1;
		}
		this.stuckProgress.distanceFromGoal = distanceFromGoal;
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
		this.checkStuckProgress(goal);
		this.selectOnStuckBehaviour(this.stuckProgress, goal);
	}

	// Strategies to try, in order:
	// 1). Move backwards one block and then continue
	// 2). Flatten surroundings and then continue
	// 3). Mark the goal position as a bad target and go home
	// 4). Mark the goal position as a bad target, try to flatten surroundings, and go home
	// 5). All behaviours after 4 are the same as 4.
	selectOnStuckBehaviour(progress, goal) {
		if (progress.errorCount > 0 && progress.errorCount <= 1) {
			this.backupAndContinue(goal, progress);
		}
		else if (progress.errorCount > 1 && progress.errorCount <= 3) {
			this.flattenAndContinue(goal, progress);
		}
		else if (progress.errorCount > 3 && progress.errorCount <= 4) {
			this.markBadAndGoHome(progress);
		}
		else if (progress.errorCount > 4) {
			this.flattenAndGoHome(progress);
		}
		else {
			console.log('did not select a getUnstuck behaviour.');
		}
	}

	backupAndContinue(goal, progress) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "tooFar",
			description: `An error happened in attempting to reach the goal. Distance: ${progress.distanceFromGoal}`
		};
		this.bot.autobot.navigator.backupBot(() => this.bot.pathfinder.setGoal(goal));
		this.bot.emit(eventName, result);
	}
	
	flattenAndContinue(goal, progress) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "tooFar",
			description: `Another error happened in attempting to reach the goal. Flattening Surroundings. Distance: ${progress.distanceFromGoal}`
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

	markBadAndGoHome(progress) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "badTarget",
			description: "Many successive pathfinding errors at this position. Target is possibly unreachable. Marking as a bad target and returning home"
		};
		if (this.bot.autobot.mining.active) {
			this.bot.autobot.mining.pushBadTarget(progress.goalPosition.clone());
		}
		this.bot.autobot.resetAllBehaviours(this.bot.autobot.navigator.returnHome);
		this.bot.emit(eventName, result);
	}

	flattenAndGoHome(progress) {
		const eventName = 'autobot.getUnstuck';
		let result = {
			error: true,
			resultCode: "badTarget",
			description: "Very stuck. Target is possibly unreachable and the bot can't move. Marking as a bad target, flattening surroundings, and returning home"
		};
		if (this.bot.autobot.mining.active) {
			this.bot.autobot.mining.pushBadTarget(progress.goalPosition.clone());
		}
		const stuckPosition = this.bot.entity.position.floored();
		this.bot.autobot.resetAllBehaviours(() => {
			this.bot.autobot.landscaping.flattenCube(
				stuckPosition,
				'cobblestone',
				['stone', 'cobblestone', 'diorite', 'andesite', 'granite', 'sand', 'dirt', 'grass_block'],
				this.bot.autobot.navigator.returnHome
			);
		});
		this.bot.emit(eventName, result);
	}
}

module.exports = GetUnstuck;
