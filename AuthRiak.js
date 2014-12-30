'use strict';
var extend = require('ninejs/core/extend'),
	deferredUtils = require('ninejs/core/deferredUtils'),
	reeak = require('reeak'),
	crypto = require('crypto'),
	AuthRiak,
	usersBucket = 'auth';
AuthRiak = function(config, module) {
	var db,
		dbParams = {},
		riakConfig = config.riakConfig,
		logger = module.getUnit('ninejs').get('logger');
	function hash(src) {
		var md5sum = crypto.createHash('md5');
		md5sum.update(src);
		return md5sum.digest('hex');
	}
	usersBucket = ((config.options || {}).usersBucket) || usersBucket;
	if (riakConfig.servers && riakConfig.servers.length) {
		extend.mixinRecursive(dbParams, { pool: { servers: riakConfig.servers }});
	}
	db = new reeak.Db(riakConfig.default);
	this.login = function(username, password, domain) {
		/* jshint unused: true */
		var def = deferredUtils.defer(),
			self = this,
			bucket = db.bucket(usersBucket);
		if (domain) {
			username += '@' + domain;
		}
		bucket.objectsFromIndex('username', username).then (function (resp) {
			if ((resp.data.length === 0) || (resp.data.length > 1)) {
				def.resolve({ result: 'failed' });
			}
			var data = resp.data[0];
			if (password && data.active && data.username === username && data.password === hash(password)) {
				data.result = 'success';
				def.resolve(data);
			}
			else {
				def.resolve({ result: 'failed' });
			}
		}, function (err) {
			def.reject(err);
		});
		return def.promise;
	};
	function init() {
		deferredUtils.when(db.buckets.list(), function(data) {
			/* jshint unused: true */
			var createUser = false,
				bucket = db.bucket(usersBucket);
			if (!data || !data.some(function(item) { return item === usersBucket; })) {
				logger.info('ninejs/auth/impl (riak): NineJS could not find a "' + usersBucket + '" bucket. Attempting to create.');
				createUser = true;
			}
			else {
				var getUserDefer = deferredUtils.defer();
				createUser = getUserDefer.promise;
				bucket.keysFromIndex('username', 'admin')
					.then (function (resp) {
						getUserDefer.resolve(resp.data.length === 0);// resp.data === null);
					}, function (/* err */) {
						getUserDefer.resolve(false);
					});
			}
			deferredUtils.when(createUser, function(createUser) {
				if (createUser) {
					logger.info('ninejs/auth/impl (riak): Creating user "admin" with password "password".');
					bucket.save('admin', {
						type: 'user',
						username: 'admin',
						password: hash('password'),
						active: true,
						permissions: [
							'administrator'
						]
					}, {
						index: {
							username: 'admin'
						}
					}).then(function () {
						logger.info('ninejs/auth/impl (riak): user "admin" created successfully.');
					}, function (err) {
						logger.info(err);
					});
				}
			});
		},
		function (error) {
			logger.error('ninejs/auth/impl (riak): Error listing buckets.');
			console.error(error);
		});
	}
	function getUser(username) {
		var def = deferredUtils.defer();
		db.get(usersBucket, username, function(err, data) {
			if (err) {
				logger.info('ninejs/auth/impl (riak): ' + err);
			}
			else {
				def.resolve(data);
			}
		});
		return def.promise;
	}
	this.init = init;
	this.getUser = getUser;
};
module.exports = AuthRiak;