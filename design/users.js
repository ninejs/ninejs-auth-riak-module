'use strict';

var def = require('ninejs/core/deferredUtils'),
	cradle = require('cradle'),
	couchUtils = require('../couchUtils'),
	user,
	customers,
	emit; //just to pass linter

function getUserDesignDocument (config) {
	var documentName = config.documentName || 'user';
	return {
		'_id': '_design/' + documentName,
		'language': 'javascript',
		'views': {
			'active': {
				'map': function (doc) {
					if ((doc.type === 'user') && (doc.active)) {
						emit(doc.username, doc);
					}
					else if (doc.type === 'updateUser') {
						emit(doc.username, doc);
					}
				}.toString(),
				'reduce': function (keys, values, reReduce) {
					/* jshint unused: true */
					function isArray(v) {
						return Object.prototype.toString.call(v) === '[object Array]';
					}

					var r = values.sort(function (a, b) {
						if ((a.created || 0) < (b.created || 0)) {
							return -1;
						}
						else {
							return 1;
						}
					}).reduce(function (state, next) {
						if (next.type === 'user') {
							return next;
						}
						else if (next.type === 'updateUser') {
							var added = next.add || {},
								updated = next.update || {},
								deleted = next.delete || {},
								p,
								arr,
								arrPushI = function (i) {
									arr.push(i);
								},
								deleteReduce = function (st, nx) {
									return st.filter(function (i) {
										return i !== nx;
									});
								};
							for (p in added) {
								if (added.hasOwnProperty(p)) {
									if (isArray(added[p])) {
										arr = state[p] || [];
										added[p].forEach(arrPushI);
										state[p] = arr;
									}
									else {
										state[p] = added[p];
									}
								}
							}
							(function () {
								var p;
								for (p in updated) {
									if (updated.hasOwnProperty(p)) {
										state[p] = updated[p];
									}
								}
							})();
							(function () {
								var p;
								for (p in deleted) {
									if (isArray(deleted[p])) {
										state[p] = deleted[p].reduce(deleteReduce, state[p]);
									}
									else {
										delete state[p];
									}
								}
							})();
							return state;
						}
						else {
							return state;
						}
					}, {created: -1});
					return reReduce ? [r] : r;
				}.toString()
			},
			'byPermissions': {
				'map': function (doc) {
					if (doc.type === 'user') {
						(doc.permissions || []).forEach (function (p) {
							emit(p, { username: doc.username, created: doc.created, add: true });
						});
					}
					else if (doc.type === 'updateUser') {
						((doc.add || {}).permissions || []).forEach (function (p) {
							emit(p, { username: doc.username, created: doc.created, add: true });
						});
						((doc.delete || {}).permissions || []).forEach (function (p) {
							emit(p, { username: doc.username, created: doc.created, add: false });
						});
					}
				}.toString(),
				'reduce': function (keys, values, reReduce) {
					/* jshint unused: true */
					function isArray(v) {
						return Object.prototype.toString.call(v) === '[object Array]';
					}

					var r = values.sort(function (a, b) {
						if ((a.created || 0) < (b.created || 0)) {
							return -1;
						}
						else {
							return 1;
						}
					}).reduce(function (state, next) {
						if (next.add) {
							if (!state[next.username]) {
								state[next.username] = 0;
							}
							state[next.username] += 1;
						}
						else {
							if (!state[next.username]) {
								state[next.username] = 0;
							}
							state[next.username] -= 1;
						}
						return state;
					}, {});
					return Object.keys(r).filter (function (k) { return r[k] > 0; });
				}.toString()
			},
			'permissions': {
				'map': function (doc) {
					if (doc.type === 'user') {
						(doc.permissions || []).forEach (function (p) {
							emit(null, p);
						});
					}
					else if (doc.type === 'updateUser') {
						((doc.add || {}).permissions || []).forEach (function (p) {
							emit(null, p);
						});
						//((doc.delete || {}).permissions || []).forEach (function (p) {
						//	emit(null, p);
						//});
					}
				}.toString(),
				'reduce': function (keys, values, reReduce) {
					/* jshint unused: true */
					var r = {};
					values.forEach(function (v) {
						r[v] = true;
					});
					return Object.keys(r);
				}.toString()
			}
		}
	};
}

function differ(existing, data) {
	if ((existing._id === data._id) && (existing.language === data.language)) {
		return Object.keys(data.views).some(function(viewKey) {
			var existingView = existing.views[viewKey],
				dataView = data.views[viewKey];
			if (!existingView) {
				return true;
			}
			return Object.keys(dataView).some(function(propKey) {
				return dataView[propKey] !== existingView[propKey];
			});
		});
	} else {
		return false;
	}
}

function checkDb(db, log, config, justCreated) {
	var userDefer = def.defer(),
		createdDefer = def.defer(),
		config = config || {},
		options = config.options || {},
		documentName = options.documentName || 'user',
		defaultUserName = options.defaultUserName || 'admin',
		defaultPassword = options.defaultPassword || 'password',
		hash = require('../hashMethod')(options.hashMethod, options.hashEncoding);
	if (!justCreated) {
		createdDefer.resolve(true);
	}
	else {
		log.info('Creating auth\'s default user \"' + defaultUserName  + '\" with password \"' + defaultPassword + '\"');
		couchUtils.merge(db, undefined, {
			type: 'user',
			username: defaultUserName,
			password: hash(defaultUserName, defaultPassword),
			active: true
		}, function(err) {
			if (err) {
				log.error(err);
				createdDefer.reject(err);
			} else {
				createdDefer.resolve(true);
			}
		});
	}
	user = getUserDesignDocument (config);

	db.get('_design/' + documentName, function(err, data) {
		if (err) {
			log.info('Attempting to reconstruct _design/' + documentName);
			couchUtils.merge(db, '_design/' + documentName, user, function(err) {
				if (err) {
					log.error(err);
					userDefer.reject(err);
				} else {
					userDefer.resolve(true);
				}
			});
		} else {
			if (differ(data, user)) {
				log.info('Updating _design/' + documentName);
				couchUtils.merge(db, '_design/' + documentName, cradle.merge({}, data, user), function(err) {
					if (err) {
						userDefer.reject(err);
						log.info(err);
					} else {
						userDefer.resolve(true);
					}
				});
			} else {
				userDefer.resolve(true);
			}
		}
	});

	return def.all([userDefer, createdDefer]);
}

module.exports = checkDb;