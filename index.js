var prefixes = [];
var hoard = require('hoard');

unixTime = function() {
  return parseInt(new Date().getTime() / 1000);
};

exports.init = function(path, prefixes, express, app) {
	prefixes = prefixes;
	app.use(path, express.bodyParser());
	app.get(path, function(req, res) {
		res.send(prefixes);
	});
	app.post(path + "/publish", function(req, res) {
		var metric_name = req.body.metric;
		if (prefixes.indexOf(metric_name) >= 0) {
			res.send("OK");
		} else {
			res.send(404, {"error": "invalid prefix"});
		}
	});
}