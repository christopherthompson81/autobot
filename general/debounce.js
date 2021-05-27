/*
Use Example:

function saveInput(){
	console.log('Saving data');
}
const processChange = debounce(() => saveInput());
*/

function debounce(func, timeout = 300) {	
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => { func.apply(this, args); }, timeout);
	};
}

export { debounce as debounce };
