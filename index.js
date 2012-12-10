var prefixes = [];
var hoard = require('./hoard');
var mkdirp = require('mkdirp');
var path = require('path');
var fldr_path;

unixTime = function() {
  return parseInt(new Date().getTime() / 1000);
};

exports.hoard = hoard;
exports.save_metric_value = function(metric_name, metric_value, timestamp, callback) {
    var t = timestamp ? parseInt(timestamp) : unixTime();

    if (prefixes.indexOf(metric_name) >= 0) {
        hoard.update(path.join(fldr_path, metric_name + ".hoard"), metric_value, t, function(err) {
            if (err) throw err;
            if (callback) callback();
        });
    } else {
        callback("Invalid metric name");
    }
}

exports.init = function(url_path, p, express, app, fp) {
    prefixes = p;
    fldr_path = fp;
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
                var value = req.body.value;

                exports.save_metric_value(metric_name, value, req.body.measure_time, function(e) {
                    if (e) {
                        res.send(404, {"error": e});
                    } else {
                        res.send({"success": true});
                    }
                });
            });
            
        }
    });
}
