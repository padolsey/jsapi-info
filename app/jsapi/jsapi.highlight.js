var hljs = require("./highlight/highlight");

module.exports = function(text) {

	return hljs.highlight(
		'javascript', 
		text
	).value.replace(/\t/g, '    ');

};