* make sure the block in the chest map still exists



GoalNear { x: 413, y: 75, z: 1258, rangeSq: 9 }
Reached the target goal successfully.
Goal position: Vec3 { x: 413, y: 75, z: 1258 }
Distance from goal: 2
Active Function: stash
(node:5896) UnhandledPromiseRejectionWarning: AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

  assert.ok(chestToOpen.type === mcData.blocksByName.chest.id ||
            chestToOpen.type === mcData.blocksByName.ender_chest.id ||
            chestToOpen.type === mcData.blocksByName.trapped_chest.id ||
            (mcData.blocksByName.barrel && chestToOpen.type === mcData.blocksByName.barrel.id))

    at Bot.openChest (/Users/christhompson/Actual_Documents/Programming/autobot/node_modules/mineflayer/lib/plugins/chest.js:12:14)
    at Stash.chestArrival (/Users/christhompson/Actual_Documents/Programming/autobot/behaviours/Stash.js:322:26)
(node:5896) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 1)
(node:5896) [DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code.