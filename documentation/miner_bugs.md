# Miner Bugs

Tool selection doesn't filter by target block - so a wooden pickaxe could be used on iron ore, for instance. Needs to check the block.harvestTools property

Pathfinder is being modified to detect being stuck - That part (mostly) works, but getting unstuck is still an issue.

Digging during pathfinding is unreliable. Sometimes nothing happens, other times, an error occurs and the bot and the block desynchronize, rapid cycling can also occur

