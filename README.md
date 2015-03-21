# Parameters

* `options`:
	* `usersDb`: Name of the CouchDB database we will be using
	* `documentName`: Name of the CouchDB design document we will be querying to
	* `defaultUserName`: Default username in case the DB is not initialized
	* `defaultPassword`: Default password in case the DB is not initialized
	* `hashMethod`: hashing method, can be `md5`, `sha`, `sha256` or something that can be `require`'d
	* `hashEncofing`: can be `hex` or `base64`

* `storeConfig`: CouchDB store config. Example:
	