module.exports = function() {
	var args = [].slice.call(arguments);
	args.unshift('>> JSSRC:: ');
	console.log.apply(console, args);
};

