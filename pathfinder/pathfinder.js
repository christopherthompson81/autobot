/*
Pathfinder Library

Exhibits issues in negative coordinates - investigate
*/
const { performance } = require('perf_hooks')

const AStar = require('./lib/astar')
const Move = require('./lib/move')

const Vec3 = require('vec3').Vec3

const { PlayerState } = require('prismarine-physics')
const nbt = require('prismarine-nbt')

function getToolDamage(tool) {
	return (tool && tool.nbt) ? tool.nbt.value.Damage.value : 0;
}

function inject (bot) {
	bot.pathfinder = {}

	bot.pathfinder.thinkTimeout = 40 // ms

	bot.pathfinder.bestHarvestTool = function (block) {
		const availableTools = bot.inventory.items();
		const effects = bot.entity.effects;
		// Baseline is an empty hand, not Number.MAX_VALUE
		let fastest = block.digTime(null, false, false, false, [], effects);
		let bestTool = null;
		for (const tool of availableTools) {
			const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : [];
			const damage = getToolDamage(tool);
			const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);
			// if tools are the same and picked, switch if the new tool is more damaged (use most damaged tool first).
			// 	This will prevent wear-evening, which would cause the time between tools breaking to be close together.
			//	We want to maximize the time gap between tools breaking.
			if (
				(digTime < fastest) ||
				(bestTool && bestTool.type === tool.type && damage > getToolDamage(bestTool))
			) {
				fastest = digTime;
				bestTool = tool;
			}
		}
		return bestTool;
	}

	bot.pathfinder.getPathTo = function (movements, goal, done, timeout) {
		const p = bot.entity.position
		const start = new Move(p.x, p.y, p.z, movements.countScaffoldingItems(), 0)
		done(new AStar(start, movements, goal, timeout || bot.pathfinder.thinkTimeout).compute())
	}

	let stateMovements = null
	let stateGoal = null
	let dynamicGoal = false
	let path = []
	let pathUpdated = false
	let digging = false
	let placing = false
	let placingBlock = null
	let thinking = false
	let lastNodeTime = performance.now()
	const goalProgress = {
		timestamp: Date.now(),
		position: new Vec3(0, 0, 0),
		threshold: 10,
		notified: false,
		startTimestamp: Date.now(),
		totalDistance: 0,
		movementLoopNotified: false,
	};

	function setGoalProgress() {
		goalProgress.timestamp = Date.now();
		goalProgress.position = bot.entity.position.floored();
		goalProgress.threshold = 10;
		goalProgress.notified = false;
	}

	function resetPath (clearStates = true) {
		path = []
		pathUpdated = false
		placing = false
		if (digging) {
			bot.stopDigging()
		}
		digging = false
		if (clearStates) {
			bot.clearControlStates()
		}
	}

	bot.pathfinder.setGoal = function (goal, dynamic = false) {
		setGoalProgress();
		goalProgress.startTimestamp = Date.now();
		let goalPosition = goal ? new Vec3(goal.x, goal.y, goal.z) : null;
		goalProgress.distance = goalPosition ? bot.entity.position.distanceTo(goalPosition) : 0;
		goalProgress.movementLoopNotified = false;
		stateGoal = goal
		dynamicGoal = dynamic
		resetPath()
	}

	bot.pathfinder.setMovements = function (movements) {
		stateMovements = movements
		resetPath()
	}

	bot.pathfinder.isMoving = function () {
		return path.length > 0 || thinking
	}

	bot.pathfinder.isMining = function () {
		return digging
	}

	bot.pathfinder.isBuilding = function () {
		return placing
	}

	bot.pathfinder.isThinking = function () {
		return thinking
	}

	bot.on('physicTick', monitorMovement)

	// Default leeway is (1, 2, 1). Possibly too narrow
	function isPositionNearPath (pos, path) {
		for (const i in path) {
			const node = path[i]
			const dx = Math.abs(node.x - pos.x)
			const dy = Math.abs(node.y - pos.y)
			const dz = Math.abs(node.z - pos.z)
			if (dx <= 2 && dy <= 3 && dz <= 2) return true
		}
		return false
	}

	// Return the average x/z position of the highest standing positions
	// in the block.
	function getPositionOnTopOf (block) {
		if (!block || block.shapes.length === 0) return null
		const p = new Vec3(0.5, 0, 0.5)
		let n = 1
		for (const shape of block.shapes) {
			const h = shape[4]
			if (h === p.y) {
				p.x += (shape[0] + shape[3]) / 2
				p.z += (shape[2] + shape[5]) / 2
				n++
			} else if (h > p.y) {
				n = 2
				p.x = 0.5 + (shape[0] + shape[3]) / 2
				p.y = h
				p.z = 0.5 + (shape[2] + shape[5]) / 2
			}
		}
		p.x /= n
		p.z /= n
		return block.position.plus(p)
	}

	function fullStop () {
		bot.clearControlStates()

		// Force horizontal velocity to 0 (otherwise inertia can move us too far)
		// Kind of cheaty, but the server will not tell the difference
		bot.entity.velocity.x = 0
		bot.entity.velocity.z = 0

		const blockX = Math.floor(bot.entity.position.x) + 0.5
		const blockZ = Math.floor(bot.entity.position.z) + 0.5

		// Make sure our bounding box don't collide with neighboring blocks
		// otherwise recenter the position
		if (Math.abs(bot.entity.position.x - blockX) > 0.2) { bot.entity.position.x = blockX }
		if (Math.abs(bot.entity.position.z - blockZ) > 0.2) { bot.entity.position.z = blockZ }
	}

	bot.on('blockUpdate', (oldBlock, newBlock) => {
		if (isPositionNearPath(oldBlock.position, path) && oldBlock.type !== newBlock.type) {
			resetPath(false)
		}
	})

	bot.on('chunkColumnLoad', (chunk) => {
		resetPath()
	})

	function canStraightPathTo (pos) {
		const state = new PlayerState(bot, {
			forward: true,
			back: false,
			left: false,
			right: false,
			jump: false,
			sprint: false,
			sneak: false
		})
		const delta = pos.minus(bot.entity.position)
		state.yaw = Math.atan2(-delta.x, -delta.z)
		const world = { getBlock: (pos) => { return bot.blockAt(pos, false) } }
		for (let step = 0; step < 1000; step++) {
			bot.physics.simulatePlayer(state, world)
			if (pos.distanceTo(state.pos) <= 2) return true
			// TODO: check blocks to avoid
			if (!state.onGround || state.isCollidedHorizontally) return false
		}
		return false
	}

	function breakTime(block, tool) {
		const enchants = (tool && tool.nbt) ? nbt.simplify(tool.nbt).Enchantments : [];
		const effects = bot.entity.effects;
		const digTime = block.digTime(tool ? tool.type : null, false, false, false, enchants, effects);
		return digTime;
	}

	function monitorMovement () {
		// Test freemotion
		if (stateMovements && stateMovements.allowFreeMotion && stateGoal && stateGoal.entity) {
			const target = stateGoal.entity
			if (canStraightPathTo(target.position)) {
				bot.lookAt(target.position.offset(0, 1.6, 0))

				if (target.position.distanceTo(bot.entity.position) > Math.sqrt(stateGoal.rangeSq)) {
					bot.setControlState('forward', true)
				} else {
					bot.clearControlStates()
				}
				return
			}
		}

		if (stateGoal && stateGoal.hasChanged()) {
			resetPath()
		}

		if (path.length === 0) {
			lastNodeTime = performance.now()
			if (stateGoal && stateMovements && !thinking) {
				if (stateGoal.isEnd(bot.entity.position.floored()) || pathUpdated) {
					if (!dynamicGoal) {
						bot.emit('goal_reached', stateGoal)
						stateGoal = null
					}
				} else {
					thinking = true
					bot.pathfinder.getPathTo(stateMovements, stateGoal, (results) => {
						bot.emit('path_update', results)
						path = results.path
						thinking = false
						pathUpdated = true
					})
				}
			}
			return
		}

		// Test if stuck
		if (
			goalProgress.position.distanceTo(bot.entity.position) < 2 &&
			Date.now() > (goalProgress.timestamp + (goalProgress.threshold * 1000)) &&
			!goalProgress.notified &&
			stateGoal
		) {
			bot.emit('autobot.pathfinder.botStuck', goalProgress, path, stateGoal)
			goalProgress.notified = true;
			//return
		}

		// Test if caught in a movement loop
		// Experiment: 3 * distance * (2*averageDigTime + moveOneBlockTime) === travelTimeLimit
		// Maybe it's a good limit, maybe not.
		// We're assuming an unmodified stone pickaxe as the tool and a stone block as the target (600 ms)
		if (stateGoal && goalProgress.distance > 0) {
			const stoneBlockDigTime = 600;
			const moveOneBlockTime = 500;
			const travelTimeLimit = 4 *	goalProgress.distance *	(2*stoneBlockDigTime + moveOneBlockTime) + 10000;
			if (
				goalProgress.startTimestamp + travelTimeLimit < Date.now() &&
				!goalProgress.movementLoopNotified
			) {
				//console.log(goalProgress);
				bot.emit('autobot.pathfinder.exceededTravelTimeLimit', goalProgress, path, stateGoal)
				goalProgress.movementLoopNotified = true;
			}
		}

		let nextPoint = path[0]
		const p = bot.entity.position

		if (nextPoint === undefined) {
			return
		}

		// Handle digging
		if (digging || nextPoint.toBreak.length > 0) {
			//if (!digging && bot.entity.onGround) {
			if (!digging) {
				digging = true
				const b = nextPoint.toBreak.shift()
				const block = bot.blockAt(new Vec3(b.x, b.y, b.z), false)
				const tool = bot.pathfinder.bestHarvestTool(block)
				const blockBreakTime = breakTime(block, tool);
				goalProgress.threshold += (blockBreakTime / 1000);
				// Break time is in ms; Emit a message when breaking will take more than 3 seconds
				if (blockBreakTime > 3000) {
					// TODO: Rewrite event in autobot event format
					bot.emit('autobot.pathfinder.excessiveBreakTime', block, blockBreakTime);
				}
				fullStop()
				bot.equip(tool, 'hand', function () {
					bot.dig(block, function (err) {
						lastNodeTime = performance.now()
						if (err) {
							// TODO: Convert to event
							process.stdout.write("*");
							//resetPath();
						}
						else {
							digging = false
						}
					})
				})
			}
			return
		}
		// Handle block placement
		// TODO: sneak when placing or make sure the block is not interactive
		if (placing || nextPoint.toPlace.length > 0) {
			if (!placing) {
				placing = true
				placingBlock = nextPoint.toPlace.shift()
				fullStop()
			}
			const block = stateMovements.getScaffoldingItem()
			if (!block) {
				resetPath()
				return
			}
			let canPlace = true
			if (placingBlock.jump) {
				bot.setControlState('jump', true)
				canPlace = placingBlock.y + 1 < bot.entity.position.y
			}
			if (canPlace) {
				bot.equip(block, 'hand', function () {
					const refBlock = bot.blockAt(new Vec3(placingBlock.x, placingBlock.y, placingBlock.z), false)
					bot.placeBlock(refBlock, new Vec3(placingBlock.dx, placingBlock.dy, placingBlock.dz), function (err) {
						placing = false
						lastNodeTime = performance.now()
						if (err) resetPath()
					})
				})
			}
			return
		}

		let np = getPositionOnTopOf(bot.blockAt(new Vec3(nextPoint.x, nextPoint.y, nextPoint.z)))
		if (np === null) np = getPositionOnTopOf(bot.blockAt(new Vec3(nextPoint.x, nextPoint.y - 1, nextPoint.z)))
		if (np) {
			nextPoint.x = np.x
			nextPoint.y = np.y
			nextPoint.z = np.z
		} else {
			nextPoint.x = Math.floor(nextPoint.x) + 0.5
			nextPoint.z = Math.floor(nextPoint.z) + 0.5
		}

		const dx = nextPoint.x - p.x
		const dy = nextPoint.y - p.y
		const dz = nextPoint.z - p.z
		if ((dx * dx + dz * dz) <= 0.15 * 0.15 && (bot.entity.onGround || bot.entity.isInWater)) {
			// arrived at next point
			if (bot.entity.isInWater) {
				const result = {
					error: false,
					resultCode: "inWater",
					description: "Bot entered water during pathfinding"
				};
				bot.emit('autobot.pathfinder.progress', result);
			}
			if (!goalProgress.position.equals(bot.entity.position.floored())) {
				//console.log('+');
				const result = {
					error: false,
					resultCode: "reachedNextPoint",
					description: "Pathfinder reached the next point on its path"
				};
				bot.emit('autobot.pathfinder.progress', result);
				setGoalProgress();
			}
			lastNodeTime = performance.now()
			path.shift()
			if (path.length === 0) { // done
				if (!dynamicGoal && stateGoal.isEnd(p.floored())) {
					bot.emit('goal_reached', stateGoal)
					stateGoal = null
				}
				fullStop()
				return
			}
			// not done yet
			nextPoint = path[0]
			if (nextPoint.toBreak.length > 0 || nextPoint.toPlace.length > 0) {
				fullStop()
			}
			return
		}
		let gottaJump = false
		const horizontalDelta = Math.sqrt(dx * dx + dz * dz)

		if (dy > 0.6) {
			// gotta jump up when we're close enough
			gottaJump = horizontalDelta < 1.75
		} else if (dy > -0.1 && nextPoint.parkour) {
			// possibly jump over a hole
			gottaJump = horizontalDelta > 1.5 && horizontalDelta < 2.5
		}
		gottaJump = gottaJump || bot.entity.isInWater
		bot.setControlState('jump', gottaJump)

		// run toward next point
		bot.look(Math.atan2(-dx, -dz), 0)

		const lx = -Math.sin(bot.entity.yaw)
		const lz = -Math.cos(bot.entity.yaw)

		const frontBackProj = lx * dx + lz * dz
		bot.setControlState('forward', frontBackProj > 0)
		bot.setControlState('back', frontBackProj < 0)

		// check for futility
		if (performance.now() - lastNodeTime > 1500) {
			// should never take this long to go to the next node
			resetPath()
		}
	}
}

module.exports = {
	pathfinder: inject,
	Movements: require('./lib/movements'),
	goals: require('./lib/goals')
}
