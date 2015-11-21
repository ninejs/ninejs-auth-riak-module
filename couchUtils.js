'use strict';
var cradle = require('cradle');

function mergeWithoutConflict(db, id, doc, callback, condition) {
	if ((id !== null) && (id !== undefined)) {
		id = id + '';
	}
	var myCallback = function(err/*, data*/) {
		if (err && err.error === 'conflict') {
//				console.log('update conflicted, retrying');
			setTimeout(function() {
				mergeWithoutConflict(db, id, doc, callback);
			}, 50);
		}
		else {
			callback.apply(null, arguments);
		}
	};
	if ((id !== null) && (id !== undefined)) {
		db.get(id, function(err, data) {
			if (err) {
				db.save(id, doc, myCallback);
			}
			else {
				if (!condition || condition(data)) {
					var merged = cradle.merge({}, data, doc);
					merged['_rev'] = data['_rev'];
					db.save(id,
						merged['_rev'],
						merged,
						myCallback);
				}
				else {
					callback({ error: 'notUpdated', message: 'update condition not met' }, data);
				}
			}
		});
	}
	else {
		delete doc._id;
		db.save(doc, myCallback);
	}
}
function removeWithoutConflict(db, id, callback) {
	var myCallback = function(err/*, data*/) {
		if (err && err.error === 'conflict') {
			//console.log('update conflicted, retrying');
			setTimeout(function() {
				removeWithoutConflict(db, id, callback);
			}, 50);
		}
		else {
			if (callback) {
				callback.apply(null, arguments);
			}
		}
	};
	db.get(id, function(err, data) {
		if (err) {
			console.log(err);
			myCallback.apply(null, arguments);
		}
		else {
			db.remove(id, data['_rev'], myCallback);
		}
	});
}

module.exports = { merge: mergeWithoutConflict, remove: removeWithoutConflict };