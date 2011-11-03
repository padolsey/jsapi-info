## JSAPI.info

A JS library source inspector. Libraries are specified in `libs.json`, e.g.

	{
		"jquery": {
			"url": "https://ajax.googleapis.com/ajax/libs/jquery/{VERSION}/jquery.js",
			"default_version": "1.6.4",
			"versions": ["1", "1.1", "1.2", "1.3", "1.3.2", "1.4", "1.5", "1.6", "1.6.2", "1.6.4"],
			"get_real_version": "v(\\d+\\.\\d+\\.\\d+)",
			"look_in": ["jQuery.fn", "jQuery"],
			"mutate_names": [
				["^\\$(?=\\.)", "jQuery"],
				["^jQuery\\.prototype", "jQuery.fn"]
			]
		} // ,...
	}

Given the above configuration, we can now access `/jquery/[VERSION/]METHOD_NAME` in our browser. JSAPI.info will only source the jQuery source file remotely (from googleapis) if it hasn't already cached it locally. 

THIS IS STILL UNDER DEVELOPMENT: Live @ [jsapi.info](http://jsapi.info).

### How does it work?

It works by loading the library you specify into an instance of [jsdom](https://github.com/tmpvar/jsdom), and then evaluating the method you specify (in fully qualified form, e.g. `jQuery.fn.css`) within that instance. It then matches the `toString()` representation of that function (thanks V8!!) against the source of the library, thus determining its location. It's all operating under node.js, running via a beautiful configuration of nginx (primed to microcache!) on a linode box somewhere in London.
