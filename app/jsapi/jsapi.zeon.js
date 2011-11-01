(function(){

	var fs = require('fs'),
		window = global;

	eval( fs.readFileSync('Zeon/zeparser/Tokenizer.js', 'utf8') );
	eval( fs.readFileSync('Zeon/zeparser/ZeParser.js', 'utf8') ),
	eval( fs.readFileSync('Zeon/Zeon.js', 'utf8') ),
	eval( fs.readFileSync('Zeon/Ast.js', 'utf8') );

	var input = 'a = new Image;';
	z = ZeParser.createParser(input);

	console.log(z);

//module.exports = function(text) {

//};

}());