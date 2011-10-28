
var highlight = require('highlight').Highlight,

	fs = require('fs'),
	url = require('url'),

	SourceLocator = require('./jsapi.sourcelocator.js'),
	log = require('./jsapi.log.js'),
	Docs = require('./jsapi.docs.js'),
	tmpl = require('./jsapi.tmpl.js'),

	libs = JSON.parse(fs.readFileSync('./libs.json', 'utf-8')),
	buildPage = tmpl( fs.readFileSync('./templates/source-page.html', 'utf-8') );


var JSAPI = SourceLocator.JSAPI = module.exports = {

	libs: libs,

	server: function(req, res) {
		new JSAPI.Request(req, res);
	},

	deTabSource: function(fnSource) {

		// deTab an function string repr using the last line's tab as a guide

		var lines = fnSource.split(/[\r\n]/),
			tab = lines[lines.length-1].match(/^[\s\t ]+/),
			tabRegex = tab && RegExp('^' + tab);

		if (tab) {
			for (var i = -1, l = lines.length; ++i < l;) {
				lines[i] = lines[i].replace(tabRegex, '');
			}
			return lines.join('\n');
		}
		return fnSource;
	},

	jsdomFixes: [
		'navigator = window.navigator || {}',
		'navigator.language = "en-GB"'
	].join(';')

};

JSAPI.Request = function Request(req, res) {

	var me = this;
	
	this.request = req;
	this.response = res;

	this.requestData = this.parseURL(req.url);
	this.lib = JSAPI.libs[this.requestData.lib];

	log('Request', new Date, this.requestData);

	if (this.lib) {

		if (this.validateRequest()) {

			this.sourceLocator = new SourceLocator(this.requestData, this.lib);

			this.sourceLocator
				.on('success', function(sourceData){
					me.output(sourceData);
				})
				.on('failure', function(e){
					res.end('Error: \n' + e);
				});

		}

	} else {

		res.end('Lib ' + data.lib + ' not available');

	}

};

JSAPI.Request.prototype = {

	parseURL: function(u) {

		var parts = url.parse(u).pathname.replace(/^\//, '').split('/');

		return {
			lib: parts[0],
			ver: parts.length > 2 ? parts[1] : 'default',
			meth: parts[2] || parts[1] || '__all__'
		};

	},
	validateRequest: function() {

		var data = this.requestData,
			lib = this.lib;

		if (typeof lib == 'string') {

			// If lib is just an alias, redirect to the real thing:
			this.response.writeHead(302, {
				Location: '/' + [lib, data.ver, data.meth].join('/')
			});
			this.response.end();
			return false;

		}

		if (data.ver == 'default' && lib.default_version) {

			data.ver = lib.default_version;
			this.response.writeHead(302, {
				Location: '/' + [data.lib, data.ver, data.meth].join('/')
			});
			this.response.end();
			return false;

		}

		if (!/^[0-9A-Z.$_]+$/i.test(data.meth)) {
			this.response.end('Your API method/namespace must conform with /^[0-9A-Z.$_]+$/i');
			return false;
		}

		if (data.ver !== 'default' && 'versions' in lib && !~lib.versions.indexOf(data.ver)) {
			this.response.end('Version ' + data.ver + ' not available');
			return false;
		}

		return true;

	},

	output: function(sourceData) {
		
		var line = sourceData.start - 1,
			end = sourceData.end,
			source = highlight( JSAPI.deTabSource(sourceData.source) ),
			lineNumbers = '';

		while (++line <= end) {
			lineNumbers += line + '\n';
		}

		this.response.setHeader('Content-Type', 'text/html');

		this.response.end(

			buildPage({
				title: 			sourceData.name,
				version: 		sourceData.version,
				lineNumbers: 	lineNumbers,
				libName: 		this.lib.name,
				source: 		source,
				source_link: 	this.lib.url.replace('{VERSION}', sourceData.version),
				name: 			'<span>' + sourceData.name + '</span>'
			})

		);

	}

};