'use strict';
var extend = require('ninejs/core/extend');
var Module = require('ninejs/modules/Module');
var Auth = require('./AuthRiak');
var result;
var AuthModule = extend(Module, {
	consumes: [
		{
			id: 'ninejs',
			version: '*',
			features: {}
		}
	],
	provides: [
		{
			id: 'ninejs/auth/impl',
			version: require('./package.json').version
		}
	],
	getProvides: function(name) {
		if (name === 'ninejs/auth/impl') {
			return this.auth;
		}
		return null;
	},
	init: extend.after(function(name, config) {
		var log;
		if (name === 'ninejs/auth/impl') {
			log = this.getUnit('ninejs').get('logger');
			log.info('ninejs/auth/impl (riak) module starting');
			this.auth = new Auth(config, this);
		}
	})
});
result = new AuthModule();
result.on('modulesEnabled', function() {
	process.nextTick(function() {
		result.auth.init();
	});
});
module.exports = result;