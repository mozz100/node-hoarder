var EventEmitter = require('events').EventEmitter;
var app = {};

EventEmitter.call(app);

exports.init = function(path, express, app) {
	app.use(path, express.bodyParser());
	app.get(path, function(req, res) {
		res.send(req.query);
	});
}

