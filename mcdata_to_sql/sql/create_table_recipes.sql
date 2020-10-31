CREATE TABLE recipes (
	recipe_id INTEGER,
    item_id INTEGER,
    result_count INTEGER,
    in_shape TEXT,
    requires_table BOOLEAN,
    PRIMARY KEY("recipe_id" AUTOINCREMENT),
    FOREIGN KEY("item_id") REFERENCES "items"("item_id")
)
