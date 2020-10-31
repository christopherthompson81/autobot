CREATE TABLE recipe_ingredients (
	recipe_ingredient_id INTEGER,
    recipe_id INTEGER,
	item_id INTEGER,
	ingredient_count INTEGER,
    PRIMARY KEY("recipe_ingredient_id" AUTOINCREMENT),
    FOREIGN KEY("recipe_id") REFERENCES "recipes"("recipe_id"),
	FOREIGN KEY("item_id") REFERENCES "items"("item_id")
)
