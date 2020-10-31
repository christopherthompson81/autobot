const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const { exit } = require('process');
const minecraftData = require('minecraft-data')('1.16.3');
const Recipe = require("prismarine-recipe")("1.16.3").Recipe;
try { fs.unlinkSync('minecraft_data_1_16_3.sqlite3');} catch {}
const db = new sqlite3.Database('minecraft_data_1_16_3.sqlite3');
const computeRequiresTable = require('./lib/recipe').computeRequiresTable;
const getIngredients = require('./lib/recipe').getIngredients;

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
	for (const blockId in minecraftData.blocks) {
		const block = minecraftData.blocks[blockId];
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
	db.run(getSQL('sql/create_table_items.sql'));
	const insertItem = db.prepare(getSQL('sql/insert_item.sql'));
	for (const itemId in minecraftData.items) {
		const item = minecraftData.items[itemId];
		insertItem.run(item.id, item.displayName, item.name, item.stackSize);
	}
	insertItem.finalize();
	db.run(getSQL('sql/create_table_recipes.sql'));
	db.run(getSQL('sql/create_table_recipe_ingredients.sql'));
	const insertRecipe = db.prepare(getSQL('sql/insert_recipe.sql'));
	const insertRecipeIngredient = db.prepare(getSQL('sql/insert_recipe_ingredient.sql'));
	for (const itemId in minecraftData.recipes) {
		const recipes = minecraftData.recipes[itemId];
		for (const recipe of recipes) {
			insertRecipe.run(
				itemId,
				recipe.result.count,
				JSON.stringify(recipe.inShape),
				computeRequiresTable(recipe),
				function (err) {
					if (err) {
						console.log(err);
					}
					db.get(
						'SELECT recipe_id FROM recipes WHERE rowid = ?',
						this.lastID,
						(err, row) => {
							if (err) {
								console.log(err);
							}
							if (row) {
								const ingredients = getIngredients(recipe);
								for (const ingredient of ingredients) {
									insertRecipeIngredient.run(
										row.recipe_id,
										ingredient.id,
										ingredient.count
									);
								}
							}
						}
					);

				}
			);
		}
	}
	//insertRecipe.finalize();
	//insertRecipeIngredient.finalize();
});

//db.close();
