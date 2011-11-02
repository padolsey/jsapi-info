
var fs = require('fs'),
	url = require('url'),

	SourceLocator = require('./jsapi.sourcelocator.js'),
	log = require('./jsapi.log.js'),
	Docs = require('./jsapi.docs.js'),
	tmpl = require('./jsapi.tmpl.js'),
	highlight = require('./jsapi.highlight.js'),

	libs = JSON.parse(fs.readFileSync('./libs.json', 'utf-8')),
	buildPage = tmpl( fs.readFileSync('./templates/source-page.html', 'utf-8') );

var JSAPI = SourceLocator.JSAPI = module.exports = {

	libs: libs,

	server: function(req, res) {
		new JSAPI.Request(req, res);
	}

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

		res.end('Lib ' + this.requestData.lib + ' not available');

	}

};

JSAPI.Request.prototype = {

	parseURL: function(u) {

		var parsed = url.parse(u),
			parts = parsed.pathname.replace(/^\//, '').split('/');

		return {
			lib: parts[0],
			ver: parts.length > 2 ? parts[1] : 'default',
			meth: parts[2] || parts[1] || '__all__',
			refresh: /refresh/.test(parsed.search)
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

		if (data.ver === 'default' && lib.default_version) {

			data.ver = lib.default_version;
			this.response.writeHead(302, {
				Location: '/' + [data.lib, data.ver, data.meth].join('/')
			});
			this.response.end();
			return false;

		}

		if (!/^[0-9A-Z.$_]+$/i.test(data.meth)) {
			this.response.end('Your API method/namespace must match /^[0-9A-Z.$_]+$/i');
			return false;
		}

		if (data.ver !== 'default' && 'versions' in lib && !~lib.versions.indexOf(data.ver)) {
			this.response.end('Version ' + data.ver + ' not available');
			return false;
		}

		return true;

	},

	output: function(sourceData) {
		if (sourceData.source) {
			this.outputSource(sourceData);
		}
	},

	outputMethodList: function(sourceData) {
		this.response.end('Method list');
	},

	outputSource: function(sourceData) {
		
		var line = sourceData.start - 1,
			end = sourceData.end,
			source = highlight( this.deTabSource(sourceData.source) ),
			lineNumbers = '';

		while (++line <= end) {
			lineNumbers += '<a id="L' + line + '" href="#L' + line + '">' + line + '</a>\n';
		}

		this.response.setHeader('Content-Type', 'text/html');

		source = this.linkifySource(source);

		this.response.end(

			buildPage({
				title: 			sourceData.name,
				version: 		sourceData.version,
				lineNumbers: 	lineNumbers,
				libName: 		this.lib.name,
				docLink: 		this.getDocumentationLink(sourceData.name),
				related: 		sourceData.related,
				namespace: 		sourceData.namespace,
				source: 		source,
				source_link: 	this.lib.url.replace('{VERSION}', sourceData.version),
				name: 			sourceData.name
			})

		);

	},

	linkifySource: function(source) {

		var me = this;
		
		return source.replace(
			RegExp(

				SourceLocator.LINKIFY_MARKER[0] +

				// avoid stuff with elements within (this should not happen anyway
				// since LINKIFY_MARKERs are not highlighted my `highlight`)
				'([^<>]+?)' + 

				SourceLocator.LINKIFY_MARKER[1],

				'g'
			),
			function($0, name) {
				return '<a href="/' + [me.requestData.lib, me.requestData.ver, name].join('/') + '">' + name + '</a>';
			}
		).replace(
			// Just in-case any LINKIFY_MARKERs are left, remove them:
			RegExp(SourceLocator.LINKIFY_MARKER[0] + '|' + SourceLocator.LINKIFY_MARKER[1], 'g'),
			''
		);

	},

	deTabSource: function(fnSource) {

		// deTab a function string repr using the max(first,last) line's tab as a guide

		var lines = fnSource.split(/[\r\n]/),
			lastTab = lines[lines.length-1].match(/^[\s\t ]+/),
			firstTab = lines[0].match(/^[\s\t ]+/),
			tabRegex = lastTab && RegExp('^(?:' + firstTab + '|' + lastTab + ')');

		if (lastTab) {
			for (var i = -1, l = lines.length; ++i < l;) {
				lines[i] = lines[i].replace(tabRegex, '');
			}
			return lines.join('\n');
		}
		return fnSource;
	},

	getDocumentationLink: function(fullyQualifiedMethodName) {

		var docData = this.lib.documentation,
			methodName = fullyQualifiedMethodName,
			link;
		
		for (var i in docData) {
			if (RegExp(i).test(methodName)) {
				log('Docs: Found matching documentation link: ', methodName, i);
				link = methodName.replace(RegExp(i), docData[i]);
				break;
			}
		}

		if (!link) {
			log('Docs: No documentation link found', methodName);
			return null;
		}

		return link;

	}

};