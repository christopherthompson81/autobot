Placing chest error - Can't craft chest ends up in an idling bot.
* need to distinguish between can't craft and failed to place for follow-up behaviour
* Induced by inventory desync

smelting error - Too much crap between the bot and the furnace, perhaps alter goal to be adjacent rather than near

-----

Caught in a stashing loop


Bot is going to stash items in a chest
GoalNear { x: 423, y: 71, z: 1261, rangeSq: 9 }
Reached the target goal successfully.
Goal position: Vec3 { x: 423, y: 71, z: 1261 }
Distance from goal: 2
Active Function: stash
Error while stashing.
{
  error: true,
  resultCode: 'stashingError',
  description: 'Error while stashing.',
  chestWindow: {
    id: 99,
    position: Vec3 { x: 423, y: 71, z: 1261 },
    type: 'minecraft:generic_9x3',
    title: '{"translate":"container.chest"}',
    slots: [
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], null,   null,   null,
      [Item], [Item], [Item]
    ],
    freeSlotCount: 3
  },
  item: Item {
    type: 321,
    count: 12,
    metadata: 0,
    nbt: null,
    name: 'redstone_block',
    displayName: 'Block of Redstone',
    stackSize: 64,
    slot: 26
  },
  parentError: Error: missing source item 321:null in (27,63) 
      at transferOne (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:277:36) 
      at Bot.transfer (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:266:5) 
      at Chest.deposit (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\chest.js:38:11)    
      at Stash.stashNext (C:\Users\chris\Documents\programming\autobot\behaviours\Stash.js:176:11)
      at Chest.<anonymous> (C:\Users\chris\Documents\programming\autobot\behaviours\Stash.js:342:9)
      at Chest.emit (events.js:314:20)
      at Bot.onWindowOpen (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:353:15)
      at Object.onceWrapper (events.js:421:26)
      at Bot.emit (events.js:314:20)
      at Bot.<anonymous> (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:628:13)
}
Bot is going to stash items in a chest
GoalNear { x: 423, y: 71, z: 1261, rangeSq: 9 }
Reached the target goal successfully.
Goal position: Vec3 { x: 423, y: 71, z: 1261 }
Distance from goal: 2
Active Function: stash
Error while stashing.
{
  error: true,
  resultCode: 'stashingError',
  description: 'Error while stashing.',
  chestWindow: {
    id: 100,
    position: Vec3 { x: 423, y: 71, z: 1261 },
    type: 'minecraft:generic_9x3',
    title: '{"translate":"container.chest"}',
    slots: [
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], [Item], [Item], [Item],
      [Item], null,   null,   null,
      [Item], [Item], [Item]
    ],
    freeSlotCount: 3
  },
  item: Item {
    type: 321,
    count: 12,
    metadata: 0,
    nbt: null,
    name: 'redstone_block',
    displayName: 'Block of Redstone',
    stackSize: 64,
    slot: 26
  },
  parentError: Error: missing source item 321:null in (27,63) 
      at transferOne (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:277:36) 
      at Bot.transfer (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:266:5) 
      at Chest.deposit (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\chest.js:38:11)    
      at Stash.stashNext (C:\Users\chris\Documents\programming\autobot\behaviours\Stash.js:176:11)
      at Chest.<anonymous> (C:\Users\chris\Documents\programming\autobot\behaviours\Stash.js:342:9)
      at Chest.emit (events.js:314:20)
      at Bot.onWindowOpen (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:353:15)
      at Object.onceWrapper (events.js:421:26)
      at Bot.emit (events.js:314:20)
      at Bot.<anonymous> (C:\Users\chris\Documents\programming\autobot\node_modules\mineflayer\lib\plugins\inventory.js:628:13)
}
Bot is going to stash items in a chest
GoalNear { x: 423, y: 71, z: 1261, rangeSq: 9 }
Reached the target goal successfully.
Goal position: Vec3 { x: 423, y: 71, z: 1261 }
Distance from goal: 2
Active Function: stash


- Still happens even after doing a lot of stuff in between. Need to force some sort of lower-level inventory resync.