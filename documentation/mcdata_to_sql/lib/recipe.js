function computeRequiresTable (recipe) {
	let spaceLeft = 4;
	let x, y, row;
	if (recipe.inShape) {
		if (recipe.inShape.length > 2) return true;
		for (y = 0; y < recipe.inShape.length; ++y) {
			row = recipe.inShape[y];
			if (row.length > 2) return true;
			for (x = 0; x < row.length; ++x) {
				if (row[x]) spaceLeft -= 1;
			}
		}
	}
	if (recipe.ingredients) spaceLeft -= recipe.ingredients.length;
	return spaceLeft < 0;
}

// Get a dictonary of ingredients from a recipe, regardless of shape
function getIngredients(recipe) {
	const ingredientDict = {};
	if (recipe.ingredients) {
		for (const item of recipe.ingredients) {
			if (item < 0) continue;
			if (ingredientDict[item] === undefined) ingredientDict[item] = 0;
			ingredientDict[item]++;
		}
	}
	else {
		for (const row of recipe.inShape) {
			for (const item of row) {
				if (!item) continue;
				if (item < 0) continue;
				if (ingredientDict[item] === undefined) ingredientDict[item] = 0;
				ingredientDict[item]++;
			}
		}
	}
	const ingredients = Array();
	for (const i in ingredientDict) {
		ingredients.push({"id": i, "count": ingredientDict[i]});
	}
	return ingredients;
}

exports.computeRequiresTable = computeRequiresTable;
exports.getIngredients = getIngredients;
