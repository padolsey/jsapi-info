
var fs = require('fs'),
	url = require('url'),

	SourceHandler = require('./jsapi.sourcehandler.js'),
	log = require('./jsapi.log.js'),
	Docs = require('./jsapi.docs.js'),
	tmpl = require('./jsapi.tmpl.js'),
	highlight = require('./jsapi.highlight.js'),

	libs = JSON.parse(fs.readFileSync('./libs.json', 'utf-8')),
	buildMethodsPage = tmpl( fs.readFileSync('./templates/methods-page.html', 'utf-8') ),
	buildSourcePage = tmpl( fs.readFileSync('./templates/source-page.html', 'utf-8') );

var JSAPI = SourceHandler.JSAPI = module.exports = {

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

			this.sourceLocator = new SourceHandler(this.requestData, this.lib);

			this.sourceLocator
				.on('ready', function(){
					if (me.requestData.meth === '__all__') {
						this.findAllMethods();
					} else {
						this.findSingleMethod(me.requestData.meth);
					}
				})
				.on('sourceData', function(sourceData){
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
			ver: /^\d+/.test(parts[1]) ? parts[1] : 'default',
			meth: (/^\d+/.test(parts[1]) ? parts[2] : parts[1]) || '__all__',
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
		if (sourceData.from === 'findSingleMethod') {
			this.outputSource(sourceData);
		} else if (sourceData.from === 'findAllMethods') {
			this.outputMethodList(sourceData);
		}
	},

	outputMethodList: function(sourceData) {

		this.response.setHeader('Content-Type', 'text/html');

		this.response.end(

			buildMethodsPage({

				title: 			this.lib.name + ' API',
				version: 		sourceData.version,
				libName: 		this.lib.name,
				source_link: 	this.lib.url.replace('{VERSION}', sourceData.version),

				methods: 		sourceData.methods
				
			})

		);

	},

	outputSource: function(sourceData) {
		
		var me = this,
			line = sourceData.start - 1,
			end = sourceData.end,
			source = highlight( this.deTabSource(sourceData.source) ),
			lineNumbers = '';

		while (++line <= end) {
			lineNumbers += '<a id="L' + line + '" href="#L' + line + '">' + line + '</a>\n';
		}

		this.response.setHeader('Content-Type', 'text/html');

		source = this.linkifySource(source);

		sourceData.related.push({
			name: '(More...)',
			link: '/' + this.requestData.lib + '/' + this.requestData.ver
		});

		this.response.end(

			buildSourcePage({

				title: 			sourceData.name,
				version: 		sourceData.version,
				lineNumbers: 	lineNumbers,
				libName: 		this.lib.name,
				docLink: 		this.getDocumentationLink(sourceData.name),

				related: 		sourceData.related.map(function(item){

									if (!item.link) item.link =
										'/' + me.requestData.lib +
										'/' + me.requestData.ver +
										'/' + item.fullyQualifiedName;
									
									return item;
								}),

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

				SourceHandler.LINKIFY_MARKER[0] +

				// avoid stuff with elements within (this should not happen anyway
				// since LINKIFY_MARKERs are not highlighted my `highlight`)
				'([^<>]+?)' + 

				SourceHandler.LINKIFY_MARKER[1],

				'g'
			),
			function($0, name) {
				return '<a href="/' + [me.requestData.lib, me.requestData.ver, name].join('/') + '">' + name + '</a>';
			}
		).replace(
			// Just in-case any LINKIFY_MARKERs are left, remove them:
			RegExp(SourceHandler.LINKIFY_MARKER[0] + '|' + SourceHandler.LINKIFY_MARKER[1], 'g'),
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