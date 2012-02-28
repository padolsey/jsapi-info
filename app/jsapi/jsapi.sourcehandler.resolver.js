var log = require('./jsapi.log.js'),
	relevancy = require('relevancy');

/**
 * SourceHandler.Resolver
 * Takes care of method/namespace resolving
 **/
module.exports = Resolver = function SHResolver(env, source, libConfig) {
	this.env = env;
	this.source = source;
	this.config = libConfig;
	this.namespaces = this.config.look_in;
};

Resolver.FN_RESOLVER = '\
for (var __r__, __i__ = -1, __l__ = __names__.length; ++__i__ < __l__;) {\
	try {\
		if ((__r__ = eval(__names__[__i__])) && typeof __r__ == "function") {\
			window.__fqName__ = __names__[__i__];\
			return __r__;\
		}\
	} catch(e) {}\
}';

Resolver.prototype = {
	
	resolve: function(method) {

		var window = this.env.window,
			fqName,
			namespaces = (this.namespaces && this.namespaces.slice()) || [],
			resolver = Resolver.FN_RESOLVER,
			resolved,
			resolvedNamespace;

		namespaces = namespaces.map(function(n){
			return n + '.' + method;
		});
			
		namespaces.unshift(method); // push meth on front so its tried first!
		
		resolved = window.Function('__names__', resolver.toString())(namespaces);

		fqName = window.__fqName__ && this.correctName(window.__fqName__);

		resolvedNamespace = fqName && fqName.replace(/\.([^.]+)$/, '');

		return {
			fullyQualifiedName: fqName,
			namespace: resolvedNamespace,
			method: resolved,
			methodName: resolved && fqName.split('.').pop(),
			string: resolved && resolved.toString(),
			location: resolved && this.getLocationInSource(resolved.toString())
		};

	},

	correctName: function(fqMethodName) {

		// Correct the fully-qualified name according to `mutate_names` rules spec'd in libs.json

		var nameRules = this.config.mutate_names;
		
		if (nameRules) {
			for (var i = -1, l = nameRules.length; ++i < l;) {
				fqMethodName = fqMethodName.replace( RegExp(nameRules[i][0]), nameRules[i][1] );
			}
		}

		return fqMethodName;

	},

	getLocationInSource: function(fnString) {

		var sansFunc = fnString.replace(/^function *\([^\)]*\) *\{/, ''),
			index = this.source.indexOf(sansFunc),
			start = index > -1 && (this.source.substring(0, index).match(/[\n\r]/g)||[]).length + 1,
			end = index > -1 && start + (sansFunc.match(/[\n\r]/g)||[]).length;

		if (!start) return false;

		return {
			start: start,
			end: end
		};

	},

	getMethods: function(relatedTo /* from `this.resolve` */, fnCheck) {
		
		log('Getting other fns from namespace', relatedTo.namespace);
		
		// Get other fns from namespace in [{link: '/lib/...', name: '...'}, ...] format

		var namespace = relatedTo.namespace,
			methodName = relatedTo.methodName,
			window = this.env.window,
			ret = [],
			obj = window.Function('try { return ' + namespace + '} catch(e) {}')(),
			hasOwn = window.Object().hasOwnProperty;

		log('LISTING METHODS', methodName);

		fnCheck = fnCheck || function(){ return true; };

		if (obj) for (var i in obj) {
			if (
				obj[i] &&
				hasOwn.call(obj, i) &&
				obj[i] instanceof window.Function &&
				fnCheck(obj[i]) &&
				!/\[native code\]/.test(obj[i].toString()) && 
				!/^function *\(\) *\{ *\}$/.test(obj[i].toString())
			) {
				ret.push({
					name: i,
					fullyQualifiedName: namespace + '.' + i,
					namespaces: namespace
				});
			}
		}

		return methodName ? relevancy.sort(
			ret.map(function(item){
				item.toString = function() {
					return this.name;
				};
				return item;
			}),
			methodName
		) : ret;

	}

};
