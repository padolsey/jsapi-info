
var hl = require('highlight').Highlight,

	fs = require('fs'),
	url = require('url'),

	SourceLocator = require('./jsapi.sourcelocator.js'),
	log = require('./jsapi.log.js'),
	Docs = require('./jsapi.docs.js'),

	libs = JSON.parse(fs.readFileSync('libs.json', 'utf-8')),
	tmpl = fs.readFileSync('template.html', 'utf-8');



var JSAPI = SourceLocator.JSAPI = module.exports = {
	libs: libs,
	server: function(req, res) {

		var data = JSAPI.parseURL(req.url),
			lib,
			sl;

		if (data.lib in JSAPI.libs) {

			lib = JSAPI.libs[data.lib];

			if (data.ver == 'default' && lib.default_version) {
				data.ver = lib.default_version;
				res.writeHead(302, {
					Location: '/' + [data.lib, data.ver, data.meth].join('/')
				});
				res.end();
				return;
			}

			if (!/^[0-9A-Z.$_]+$/i.test(data.meth)) {
				res.end('Your API method/namespace must conform with /^[0-9A-Z.$_]+$/i');
				return;
			}

			if (data.ver !== 'default' && 'versions' in lib && !~lib.versions.indexOf(data.ver)) {
				res.end('Version ' + data.ver + ' not available');
				return;
			}

			sl = new SourceLocator(data.lib, data.ver, data.meth, lib);

			sl.on('success', function(d){
				JSAPI.output(d, res);
			});

			sl.on('failure', function(e){
				res.end('Error: \n' + e);
			});

		} else {
			res.end('Lib ' + data.lib + ' not available');
		}

		log('Request parsed:', req.url, data);

	},

	parseURL: function(u) {
		var parts = url.parse(u).pathname.replace(/^\//, '').split('/');
		return {
			lib: parts[0],
			ver: parts.length > 2 ? parts[1] : 'default',
			meth: parts[2] || parts[1] || '__all__'
		};
	},

	output: function(sourceData, res) {
		
		var data = sourceData,
			line = data.start - 1,
			end = data.end,
			source = hl( JSAPI.deTabSource(data.source) ),
			lineNumbers = '',
			tmplData,
			libData = data.data;

		while (++line <= end) {
			lineNumbers += line + '\n';
		}

		res.setHeader('Content-Type', 'text/html');

		new Docs()
			.on('failure', function(msg){
				res.end(msg);
			})
			.on('success', function(descHtml, docsLink){

				log('Callback from docs');
			
				tmplData = {
					title: data.name,
					name: docsLink ? '<a href="' + docsLink + '">' + data.name + '</a>' : '<span>' + data.name + '</span>',
					version: data.version,
					lineNumbers: lineNumbers,
					source: source,
					desc: descHtml,
					source_link: libData.url.replace('{VERSION}', data.version)
				};

				res.end(
					tmpl.replace(/\{\{([^\}]+)\}\}/g, function(m, token) {
						return tmplData[token] || '{{NOTFOUND:' + token + '}}';
					})
				);
				
			})
			.get(data.name, libData.documentation);

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

	getDescription: function(name, docsData) {
		return ;
	},

	jsdomFixes: [
		'navigator = window.navigator || {}',
		'navigator.language = "en-GB"'
	].join(';')

};
