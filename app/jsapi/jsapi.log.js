module.exports = function() {
	var args = [].slice.call(arguments);
	args.unshift('>> JSAPI:: ');
	console.log.apply(console, args);
};

