'use strict';
var deferredUtils = require('ninejs/core/deferredUtils'),
	AuthCouchDb,
	cradle = require('cradle'),
	usersDb = 'users',
	Q = require('kew'),
	co = require('co'),
	dot = function (name) {
		return function (obj) {
			return obj[name];
		};
	},
	mapValue = dot('value');
AuthCouchDb = function(config, log, module) {
	var db,
		CradleConnection = cradle.Connection,
		storeConfig = config.storeConfig,
		storeConnection = new CradleConnection(storeConfig.host, storeConfig.port, storeConfig),
		logger = module.getUnit('ninejs').get('logger');

	usersDb = ((config.options || {}).usersDb) || usersDb;
	db = storeConnection.database(usersDb);
	this.login = function(username, password, domain) {
		/* jshint unused: true */
		var def = deferredUtils.defer();
		if (domain) {
			username += '@' + domain;
		}
		db.view(this.documentName + '/active', { key: username, reduce: true }, function (err, resp) {
			if (err) {
				def.reject(err);
			}
			else {
				if ((resp.length === 0) || (resp.length > 1)) {
					def.resolve({result: 'failed'});
				}
				var data = resp[0].value;
				if (password && data.active && data.username === username && data.password === hash(password)) {
					data.result = 'success';
					db.save({
						type: 'loginAttempt',
						username: data.username,
						loginDate: new Date(),
						result: 'success'
					}, function () {
					});
					delete data.password;
					def.resolve(data);
				}
				else {
					db.save({
						type: 'loginAttempt',
						username: username,
						loginDate: new Date(),
						result: 'failed'
					}, function () {
					});
					def.resolve({result: 'failed'});
				}
			}
		});
		return def.promise;
	};
	this.usersByPermission = function(permissions) {
		var self = this,
			args = { reduce: true },
			hasKeys = false;
		if (typeof(permissions) !== 'undefined') {
			args.keys = permissions;
			args.group = true;
			hasKeys = true;
		}
		return co(function* () {
			var users = yield Q.nfcall(db.view.bind(db), self.documentName + '/byPermissions', args);
			return users[0].value;
		}).then(null, function (err) {
			console.error(err);
		});
	};
	this.permissions = function() {
		var self = this;
		return co(function* () {
			var permissions = yield Q.nfcall(db.view.bind(db), self.documentName + '/permissions', { reduce: true, group: true });
			return permissions[0].value;
		}).then(function (data) {
			return data;
		}, function (err) {
			console.error(err);
		});
	};
	function init() {
		/* jshint unused: true */
		var createUser = false,
			options = config.options || {},
			documentName = options.documentName || 'user',
			defaultUserName = options.defaultUserName || 'admin',
			defaultPassword = options.defaultPassword || 'password',
			defaultPermissions = options.defaultPermissions || ['administrator'],
			hash = require('./hashMethod')(options.hashMethod, options.hashEncoding);
		this.documentName = documentName;

		return co(function* () {
			var dbExists = yield Q.nfcall(db.exists.bind(db));
			var justCreated = false;
			if (!dbExists) {
				yield db.create();
				justCreated = true;
			}
			yield require('./design/users')(db, log, config, justCreated);
			var user = yield Q.nfcall(db.view.bind(db), documentName + '/active', { key: defaultUserName, reduce: true });
			if (user.length === 0) {
				logger.info('ninejs/auth/impl (CouchDB): Creating user "' + defaultUserName + '" with password "' + defaultPassword + '".');
				yield Q.nfcall(db.save.bind(db), {
					type: 'user',
					username: defaultUserName,
					password: hash(defaultUserName, defaultPassword),
					active: true,
					created: (new Date()).getTime(),
					permissions: defaultPermissions
				});
				logger.info('ninejs/auth/impl (CouchDB): user "' + defaultUserName + '" created successfully.');
			}
		}).then (null, function (err) {
			console.error(err);
		});
	}
	function getUser(username) {
		return co(function* () {
			var data = yield Q.nfcall(db.view.bind(db), self.documentName + '/active', { key: username, reduce: true });
			return data[0].value;
		});
	}
	this.init = init;
	this.getUser = getUser;
};
module.exports = AuthCouchDb;