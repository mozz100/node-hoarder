var prefixes = [];
var hoard = require('hoard');
var mkdirp = require('mkdirp');
var path = require('path');

unixTime = function() {
  return parseInt(new Date().getTime() / 1000);
};

exports.init = function(url_path, prefixes, express, app, fldr_path) {
    prefixes = prefixes;
    app.use(url_path, express.bodyParser());
    mkdirp(fldr_path, function (err) {
        if (err) console.error(err)
        else {
            prefixes.forEach(function(prefix) {

                app.get(url_path + "/" + prefix, function(req, res) {
                    var now = unixTime();
                    startTime = req.query.start ? parseInt(req.query.start) : now - 20;
                    endTime =   req.query.end   ? parseInt(req.query.end)   : now;

                    results = hoard.fetch(path.join(fldr_path, prefix + ".hoard"), startTime, endTime, function(err, timeInfo, values) {
                        res.send(values);
                    });
                });
            
            });

            app.post(url_path + "/publish", function(req, res) {
                var metric_name = req.body.metric;
                var measure_time = req.body.measure_time ? parseInt(req.body.measure_time) : unixTime();
                var value = req.body.value;

                if (prefixes.indexOf(metric_name) >= 0) {
                    hoard.update(path.join(fldr_path, metric_name + ".hoard"), value, measure_time, function(err) {
                        if (err) throw err;
                        res.send({"success": true});
                    });
                } else {
                    res.send(404, {"error": "invalid prefix"});
                }
            });
            
        }
    });
}