const armorSlots = {
    head: 5,
    torso: 6,
    legs: 7,
	feet: 8,
	offHand: 45,
};

// materials are listed in decending order of bot prefererence
const toolItems = {
	names: [
		'sword',
		'pickaxe',
		'axe',
		'shovel',
		'hoe',
	],
	materials: [
		'iron',
		'stone',
		'wooden',
	],
	nonBotMaterials: [
		'diamond',
		'gold',
		'netherite',
	]
};

const armorItems = [
	{type: 'regex', regex: new RegExp('helmet$', 'i'), maxSlots: 1, requiredSlot: armorSlots.head},
	{type: 'regex', regex: new RegExp('chestplate$', 'i'), maxSlots: 1, requiredSlot: armorSlots.torso},
	{type: 'regex', regex: new RegExp('leggings$', 'i'), maxSlots: 1, requiredSlot: armorSlots.legs},
	{type: 'regex', regex: new RegExp('boots$', 'i'), maxSlots: 1, requiredSlot: armorSlots.feet},
	{type: 'name', name: 'shield', maxSlots: 1, requiredSlot: armorSlots.offHand},
];

const essentialItems = [
	{type: 'name', name: 'stick', maxSlots: 1},
	{type: 'regex', regex: new RegExp('planks$', 'i'), maxSlots: 1},
	{type: 'regex', regex: new RegExp('_log$', 'i'), maxSlots: 1},
	{type: 'name', name: 'dirt', maxSlots: 1},
	{type: 'name', name: 'cobblestone', maxSlots: 1},
	{type: 'name', name: 'iron_ingot', maxSlots: 1},
	{type: 'name', name: 'torch', maxSlots: 1},
	{type: 'name', name: 'coal', maxSlots: 1},
	{type: 'nameList', list: ['bucket', 'water_bucket', 'lava_bucket'], maxSlots: 1},
	{type: 'name', name: 'clock', maxSlots: 1},
	{
		type: 'nameList',
		list: [
			'apple',
			'baked_potato',
			'beetroot_soup',
			'bread',
			'carrot',
			'cooked_chicken',
			'cooked_cod',
			'cooked_mutton',
			'cooked_porkchop',
			'cooked_rabbit',
			'cooked_salmon',
			'dried_kelp',
			'honey_bottle',
			'melon_slice',
			'mushroom_stew',
			'pumpkin_pie',
			'rabbit_stew',
			'steak',
			'sweet_berries'
		],
		maxSlots: 1
	},
];

// reversable compressable items will cause an infinite recipe loop, so detect and break on them
const compressableItems = {
	bone_meal: "bone_block",
	coal: "coal_block",
	diamond: "diamond_block",
	dried_kelp: "dried_kelp_block",
	emerald: "emerald_block",
	gold_ingot: "gold_block",
	iron_ingot: "iron_block",
	iron_nugget: "iron_ingot",
	lapis_lazuli: "lapis_block",
	nether_wart: "nether_wart_block",
	redstone: "redstone_block",
	wheat: "hay_block",
};

const airBlocks = ['void_air', 'cave_air', 'air'];
const liquidBlocks = ['water', 'lava'];
const dangerBlocks = [
	'campfire',
	'fire',
	'magma_block',
	'soul_campfire',
	'soul_fire',
	'spawner',
];
const unbreakable = [
	'bedrock',
	'command_block'
];
const gravityBlocks = [
	'gravel',
	'red_sand',
	'sand',
];
// oreBlocks is ordered by desirability
const oreBlocks = [
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
const utilityBlocks = [
	'anvil',
	'barrel',
	'blast_furnace',
	'brewing_stand',
	'cartography_table',
	'cauldron',
	'chest',
	'crafting_table',
	'enchanting_table',
	'fletching_table',
	'furnace',
	'target',
];
const machineBlocks = [
	'dropper',
	'hopper',
	'observer',
	'repeater',
	'smithing_table',
	'smoker',
	'stonecutter',
];
const crops = [
	'sugar_cane',
	'wheat',
	'pumpkin',
	'melon',
	'cocoa',
];
const food = [
	'cake',
];
const playerMadeBlocks = [
	'polished_*',
	'*cobblestone',
	'*_planks',
	'*glass*',
	'chiseled_*',
	'cut_*',
	'note_block',
	'*_bed',
	'*_rail',
	'*piston*',
	'*_wool',
	'diamond_block',
	'gold_block', 
	'iron_block',
	'*bricks',
	'tnt',
	'bookshelf',
	'*torch',
	'*stairs',
	'*chest',
	'redstone_wire',
	'*sign',
	'*door',
	'ladder',
	'lever',
	'*pressure_plate',
	'*button',
	'jukebox',
	'*fence', // consider separating some types
	'carved_pumpkin', // consider decorations
	'jack_o_lantern',
	'iron_bars',
	'chain',
	'*gate',
	'redstone_lamp',
	'tripwire_hook',
	'tripwire',
	'emerald_block',
	'beacon',
	'*wall',
	'flower_pot',
	'potted*',
	'',
	'',
	// All utility blocks
	// All food blocks / crops
];

exports.armorSlots = armorSlots;
exports.toolItems = toolItems;
exports.armorItems = armorItems;
exports.essentialItems = essentialItems;
exports.compressableItems = compressableItems;
exports.utilityBlocks = utilityBlocks;
exports.playerMadeBlocks = playerMadeBlocks;
