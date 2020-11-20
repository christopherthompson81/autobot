//"entityMoved" (entity)
// Use this as a perimeter tripwire to switch to combat. If an enemy gets close enough, it should be analyzed and dealt with.

//"death"
// Reset some parameters on this.

//"health"
// Monitor your own health and eat or run away if low

//"entityGone" (entity)
// Use to determine if an entity has been killed

//"entityHurt" (entity)
// Use to monitor success in combat

//bot.nearestEntity(match = (entity) => { return true })
// Find opponents

//bot.attack(entity)
// Attack opponents