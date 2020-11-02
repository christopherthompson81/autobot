const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const blocks = require('./blocks.json');
fs.unlinkSync('minecraft_data.sqlite3');
const db = new sqlite3.Database('minecraft_data.sqlite3');

function getSQL(filename) {
	return fs.readFileSync(filename, 'utf8');
}

db.serialize(function generateDB() {
	db.run(getSQL('sql/create_table_blocks.sql'));
	db.run(getSQL('sql/create_table_block_drops.sql'));
	db.run(getSQL('sql/create_table_block_harvest_tools.sql'));
	db.run(getSQL('sql/create_table_block_states.sql'));
	const insertBlock = db.prepare(getSQL('sql/insert_block.sql'));
	const insertBlockDrop = db.prepare(getSQL('sql/insert_block_drop.sql'));
	const insertBlockHarvestTool = db.prepare(getSQL('sql/insert_block_harvest_tool.sql'));
	const insertBlockState = db.prepare(getSQL('sql/insert_block_state.sql'));
	for (const block of blocks) {
		insertBlock.run(
			block.id,
			block.displayName,
			block.name,
			block.hardness,
			block.minStateId,
			block.maxStateId,
			block.diggable,
			block.transparent,
			block.filterLight,
			block.emitLight,
			block.boundingBox,
			block.stackSize,
			block.material,
		);
		for (const drop of block.drops) {
			insertBlockDrop.run(block.id, drop);
		}
		for (const tool in block.harvestTools) {
			insertBlockHarvestTool.run(block.id, tool);
		}
		for (const state of block.states) {
			insertBlockState.run(
				block.id,
				state.name,
				state.type,
				JSON.stringify(state.values),
				state.num_values
			);
		}
	}
	insertBlock.finalize();
	insertBlockDrop.finalize();
	insertBlockHarvestTool.finalize();
	insertBlockState.finalize();
});

db.close();
