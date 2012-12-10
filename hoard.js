// compiled and adapted from https://raw.github.com/ciaranj/hoard/master/src/hoard.coffee
var Binary, Buffer, Put, archiveInfoFormat, archiveInfoSize, async, create, fetch, floatFormat, floatSize, fs, info, longFormat, longSize, metadataFormat, metadataSize, pack, path, pointFormat, pointSize, propagate, timestampFormat, timestampSize, underscore, unixTime, update, updateMany, updateManyArchive, valueFormat, valueSize, _;

fs = require('fs');

Buffer = require('buffer').Buffer;

Binary = require('binary');

underscore = _ = require('./lib/underscore');

async = require('./lib/async');

pack = require('./lib/jspack').jspack;

path = require('path');

Put = require('put');

Number.prototype.mod = function(n) {
  return ((this % n) + n) % n;
};

longFormat = "!L";

longSize = pack.CalcLength(longFormat);

floatFormat = "!f";

floatSize = pack.CalcLength(floatFormat);

timestampFormat = "!L";

timestampSize = pack.CalcLength(timestampFormat);

valueFormat = "!d";

valueSize = pack.CalcLength(valueFormat);

pointFormat = "!Ld";

pointSize = pack.CalcLength(pointFormat);

metadataFormat = "!2LfL";

metadataSize = pack.CalcLength(metadataFormat);

archiveInfoFormat = "!3L";

archiveInfoSize = pack.CalcLength(archiveInfoFormat);

unixTime = function() {
  return parseInt(new Date().getTime() / 1000);
};

create = function(filename, archives, xFilesFactor, cb) {
  var a, archive, archiveOffset, buffer, encodeFloat, headerSize, oldest, points, secondsPerPoint, _i, _len;
  archives.sort(function(a, b) {
    return a[0] - b[0];
  });
  if (path.existsSync(filename)) {
    cb(new Error('File ' + filename + ' already exists'));
  }
  oldest = ((function() {
    var _i, _len, _results;
    _results = [];
    for (_i = 0, _len = archives.length; _i < _len; _i++) {
      a = archives[_i];
      _results.push(a[0] * a[1]);
    }
    return _results;
  })()).sort(function(a) {
    return Number(a);
  })[0];
  encodeFloat = function(value) {
    var buffer;
    buffer = new Buffer(4);
    require('./lib/buffer_ieee754').writeIEEE754(buffer, 0.5, 0, 'big', 23, 4);
    return buffer;
  };
  buffer = Put().word32be(unixTime()).word32be(oldest).put(encodeFloat(xFilesFactor)).word32be(archives.length);
  headerSize = metadataSize + (archiveInfoSize * archives.length);
  archiveOffset = headerSize;
  for (_i = 0, _len = archives.length; _i < _len; _i++) {
    archive = archives[_i];
    secondsPerPoint = archive[0];
    points = archive[1];
    buffer.word32be(archiveOffset);
    buffer.word32be(secondsPerPoint);
    buffer.word32be(points);
    archiveOffset += points * pointSize;
  }
  buffer.pad(archiveOffset - headerSize);
  return fs.writeFile(filename, buffer.buffer(), 'binary', cb);
};

propagate = function(fd, timestamp, xff, higher, lower, cb) {
  var lowerIntervalEnd, lowerIntervalStart, packedPoint, parseSeries;
  lowerIntervalStart = timestamp - timestamp.mod(lower.secondsPerPoint);
  lowerIntervalEnd = lowerIntervalStart + lower.secondsPerPoint;
  packedPoint = new Buffer(pointSize);
  try {
    fs.read(fd, packedPoint, 0, pointSize, higher.offset, function(err, written, buffer) {
      var byteDistance, firstSeriesSize, higherBaseInterval, higherBaseValue, higherEnd, higherFirstOffset, higherLastOffset, higherPoints, higherSize, pointDistance, relativeFirstOffset, relativeLastOffset, secondSeriesSize, seriesSize, seriesString, timeDistance, _ref;
      if (err) {
        cb(err);
      }
      _ref = pack.Unpack(pointFormat, packedPoint), higherBaseInterval = _ref[0], higherBaseValue = _ref[1];
      if (higherBaseInterval === 0) {
        higherFirstOffset = higher.offset;
      } else {
        timeDistance = lowerIntervalStart - higherBaseInterval;
        pointDistance = timeDistance / higher.secondsPerPoint;
        byteDistance = pointDistance * pointSize;
        higherFirstOffset = higher.offset + byteDistance.mod(higher.size);
      }
      higherPoints = lower.secondsPerPoint / higher.secondsPerPoint;
      higherSize = higherPoints * pointSize;
      relativeFirstOffset = higherFirstOffset - higher.offset;
      relativeLastOffset = (relativeFirstOffset + higherSize).mod(higher.size);
      higherLastOffset = relativeLastOffset + higher.offset;
      if (higherFirstOffset < higherLastOffset) {
        seriesSize = higherLastOffset - higherFirstOffset;
        seriesString = new Buffer(seriesSize);
        try {
          return fs.read(fd, seriesString, 0, seriesSize, higherFirstOffset, function(err, written, buffer) {
            return parseSeries(seriesString);
          });
        } catch (err) {
          return cb(err);
        }
      } else {
        higherEnd = higher.offset + higher.size;
        firstSeriesSize = higherEnd - higherFirstOffset;
        secondSeriesSize = higherLastOffset - higher.offset;
        seriesString = new Buffer(firstSeriesSize + secondSeriesSize);
        try {
          return fs.read(fd, seriesString, 0, firstSeriesSize, higherFirstOffset, function(err, written, buffer) {
            var ret;
            if (err) {
              cb(err);
            }
            if (secondSeriesSize > 0) {
              try {
                return fs.read(fd, seriesString, firstSeriesSize, secondSeriesSize, higher.offset, function(err, written, buffer) {
                  if (err) {
                    cb(err);
                  }
                  return parseSeries(seriesString);
                });
              } catch (err) {
                return cb(err);
              }
            } else {
              ret = new Buffer(firstSeriesSize);
              seriesString.copy(ret, 0, 0, firstSeriesSize);
              return parseSeries(ret);
            }
          });
        } catch (err) {
          return cb(err);
        }
      }
    });
  } catch (err) {
    cb(err);
  }
  return parseSeries = function(seriesString) {
    var aggregateValue, byteOrder, currentInterval, f, i, knownPercent, knownValues, myPackedPoint, neighborValues, pointTime, pointTypes, points, seriesFormat, step, sum, unpackedSeries, v, _i, _ref, _ref1;
    _ref = [pointFormat[0], pointFormat.slice(1)], byteOrder = _ref[0], pointTypes = _ref[1];
    points = seriesString.length / pointSize;
    seriesFormat = byteOrder + ((function() {
      var _i, _results;
      _results = [];
      for (f = _i = 0; 0 <= points ? _i < points : _i > points; f = 0 <= points ? ++_i : --_i) {
        _results.push(pointTypes);
      }
      return _results;
    })()).join("");
    unpackedSeries = pack.Unpack(seriesFormat, seriesString, 0);
    neighborValues = (function() {
      var _i, _results;
      _results = [];
      for (f = _i = 0; 0 <= points ? _i < points : _i > points; f = 0 <= points ? ++_i : --_i) {
        _results.push(null);
      }
      return _results;
    })();
    currentInterval = lowerIntervalStart;
    step = higher.secondsPerPoint;
    for (i = _i = 0, _ref1 = unpackedSeries.length; _i < _ref1; i = _i += 2) {
      pointTime = unpackedSeries[i];
      if (pointTime === currentInterval) {
        neighborValues[i / 2] = unpackedSeries[i + 1];
      }
      currentInterval += step;
    }
    knownValues = (function() {
      var _j, _len, _results;
      _results = [];
      for (_j = 0, _len = neighborValues.length; _j < _len; _j++) {
        v = neighborValues[_j];
        if (v !== null) {
          _results.push(v);
        }
      }
      return _results;
    })();
    if (knownValues.length === 0) {
      cb(null, false);
      return;
    }
    sum = function(list) {
      var s, x, _j, _len;
      s = 0;
      for (_j = 0, _len = list.length; _j < _len; _j++) {
        x = list[_j];
        s += x;
      }
      return s;
    };
    knownPercent = knownValues.length / neighborValues.length;
    if (knownPercent >= xff) {
      aggregateValue = sum(knownValues) / knownValues.length;
      myPackedPoint = pack.Pack(pointFormat, [lowerIntervalStart, aggregateValue]);
      packedPoint = new Buffer(pointSize);
      try {
        return fs.read(fd, packedPoint, 0, pointSize, lower.offset, function(err) {
          var byteDistance, lowerBaseInterval, lowerBaseValue, mypp, offset, pointDistance, timeDistance, _ref2;
          _ref2 = pack.Unpack(pointFormat, packedPoint), lowerBaseInterval = _ref2[0], lowerBaseValue = _ref2[1];
          if (lowerBaseInterval === 0) {
            offset = lower.offset;
          } else {
            timeDistance = lowerIntervalStart - lowerBaseInterval;
            pointDistance = timeDistance / lower.secondsPerPoint;
            byteDistance = pointDistance * pointSize;
            offset = lower.offset + byteDistance.mod(lower.size);
          }
          mypp = new Buffer(myPackedPoint);
          return fs.write(fd, mypp, 0, pointSize, offset, function(err) {
            return cb(null, true);
          });
        });
      } catch (err) {
        return cb(err);
      }
    } else {
      return cb(null, false);
    }
  };
};

update = function(filename, value, timestamp, cb) {
  info(filename, function(err, header) {
    var archive, diff, i, lowerArchives, now, _i, _ref;
    if (err) {
      cb(err);
    }
    now = unixTime();
    diff = now - timestamp;
    if (!(diff < header.maxRetention && diff >= 0)) {
      cb(new Error('Timestamp not covered by any archives in this database.'));
      return;
    }
    for (i = _i = 0, _ref = header.archives.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
      archive = header.archives[i];
      if (archive.retention < diff) {
        continue;
      }
      lowerArchives = header.archives.slice(i + 1);
      break;
    }
    return fs.open(filename, 'r+', function(err, fd) {
      var myInterval, myPackedPoint, packedPoint, propagateLowerArchives;
      if (err) {
        cb(err);
      }
      myInterval = timestamp - timestamp.mod(archive.secondsPerPoint);
      myPackedPoint = new Buffer(pack.Pack(pointFormat, [myInterval, value]));
      packedPoint = new Buffer(pointSize);
      propagateLowerArchives = function() {
        var alignedPoints, arc, callPropagate, fit, higher, interval, lower, lowerIntervals, p, propagateCalls, uniqueLowerIntervals, _j, _k, _len, _len1;
        alignedPoints = [[timestamp, value]];
        higher = archive;
        lowerArchives = (function() {
          var _j, _len, _ref1, _results;
          _ref1 = header.archives;
          _results = [];
          for (_j = 0, _len = _ref1.length; _j < _len; _j++) {
            arc = _ref1[_j];
            if (arc.secondsPerPoint > archive.secondsPerPoint) {
              _results.push(arc);
            }
          }
          return _results;
        })();
        if (lowerArchives.length > 0) {
          propagateCalls = [];
          for (_j = 0, _len = lowerArchives.length; _j < _len; _j++) {
            lower = lowerArchives[_j];
            fit = function(i) {
              return i - i.mod(lower.secondsPerPoint);
            };
            lowerIntervals = (function() {
              var _k, _len1, _results;
              _results = [];
              for (_k = 0, _len1 = alignedPoints.length; _k < _len1; _k++) {
                p = alignedPoints[_k];
                _results.push(fit(p[0]));
              }
              return _results;
            })();
            uniqueLowerIntervals = _.uniq(lowerIntervals);
            for (_k = 0, _len1 = uniqueLowerIntervals.length; _k < _len1; _k++) {
              interval = uniqueLowerIntervals[_k];
              propagateCalls.push({
                interval: interval,
                header: header,
                higher: higher,
                lower: lower
              });
            }
            higher = lower;
          }
          callPropagate = function(args, callback) {
            return propagate(fd, args.interval, args.header.xFilesFactor, args.higher, args.lower, function(err, result) {
              if (err) {
                cb(err);
              }
              return callback(err, result);
            });
          };
          return async.forEachSeries(propagateCalls, callPropagate, function(err, result) {
            if (err) {
              cb(err);
            }
            return fs.close(fd, cb);
          });
        } else {
          return fs.close(fd, cb);
        }
      };
      try {
        return fs.read(fd, packedPoint, 0, pointSize, archive.offset, function(err, bytesRead, buffer) {
          var baseInterval, baseValue, byteDistance, myOffset, pointDistance, timeDistance, _ref1;
          if (err) {
            cb(err);
          }
          _ref1 = pack.Unpack(pointFormat, packedPoint), baseInterval = _ref1[0], baseValue = _ref1[1];
          if (baseInterval === 0) {
            return fs.write(fd, myPackedPoint, 0, pointSize, archive.offset, function(err, written, buffer) {
              var _ref2;
              if (err) {
                cb(err);
              }
              _ref2 = [myInterval, value], baseInterval = _ref2[0], baseValue = _ref2[1];
              return propagateLowerArchives();
            });
          } else {
            timeDistance = myInterval - baseInterval;
            pointDistance = timeDistance / archive.secondsPerPoint;
            byteDistance = pointDistance * pointSize;
            myOffset = archive.offset + byteDistance.mod(archive.size);
            return fs.write(fd, myPackedPoint, 0, pointSize, myOffset, function(err, written, buffer) {
              if (err) {
                cb(err);
              }
              return propagateLowerArchives();
            });
          }
        });
      } catch (err) {
        return cb(err);
      }
    });
  });
};

updateMany = function(filename, points, cb) {
  points.sort(function(a, b) {
    return a[0] - b[0];
  }).reverse();
  return info(filename, function(err, header) {
    if (err) {
      cb(err);
    }
    return fs.open(filename, 'r+', function(err, fd) {
      var age, archives, currentArchive, currentArchiveIndex, currentPoints, now, point, updateArchiveCalls, _i, _len;
      now = unixTime();
      archives = header.archives;
      currentArchiveIndex = 0;
      currentArchive = header.archives[currentArchiveIndex];
      currentPoints = [];
      updateArchiveCalls = [];
      for (_i = 0, _len = points.length; _i < _len; _i++) {
        point = points[_i];
        age = now - point[0];
        while (currentArchive.retention < age) {
          if (currentPoints) {
            currentPoints.reverse();
            (function(header, currentArchive, currentPoints) {
              var f;
              f = function(cb) {
                return updateManyArchive(fd, header, currentArchive, currentPoints, cb);
              };
              return updateArchiveCalls.push(f);
            })(header, currentArchive, currentPoints);
            currentPoints = [];
          }
          if (currentArchiveIndex < (archives.length - 1)) {
            currentArchiveIndex++;
            currentArchive = archives[currentArchiveIndex];
          } else {
            currentArchive = null;
            break;
          }
        }
        if (!currentArchive) {
          break;
        }
        currentPoints.push(point);
      }
      return async.series(updateArchiveCalls, function(err, results) {
        if (err) {
          cb(err);
        }
        if (currentArchive && currentPoints.length > 0) {
          currentPoints.reverse();
          return updateManyArchive(fd, header, currentArchive, currentPoints, function(err) {
            if (err) {
              cb(err);
            }
            return fs.close(fd, cb);
          });
        } else {
          return fs.close(fd, cb);
        }
      });
    });
  });
};

updateManyArchive = function(fd, header, archive, points, cb) {
  var alignedPoints, ap, currentString, interval, numberOfPoints, p, packedBasePoint, packedStrings, previousInterval, startInterval, step, timestamp, value, _i, _j, _len, _len1;
  step = archive.secondsPerPoint;
  alignedPoints = [];
  for (_i = 0, _len = points.length; _i < _len; _i++) {
    p = points[_i];
    timestamp = p[0], value = p[1];
    alignedPoints.push([timestamp - timestamp.mod(step), value]);
  }
  packedStrings = [];
  previousInterval = null;
  currentString = [];
  for (_j = 0, _len1 = alignedPoints.length; _j < _len1; _j++) {
    ap = alignedPoints[_j];
    interval = ap[0], value = ap[1];
    if (!previousInterval || (interval === previousInterval + step)) {
      currentString.concat(pack.Pack(pointFormat, [interval, value]));
      previousInterval = interval;
    } else {
      numberOfPoints = currentString.length / pointSize;
      startInterval = previousInterval - (step * (numberOfPoints - 1));
      packedStrings.push([startInterval, new Buffer(currentString)]);
      currentString = pack.Pack(pointFormat, [interval, value]);
      previousInterval = interval;
    }
  }
  if (currentString.length > 0) {
    numberOfPoints = currentString.length / pointSize;
    startInterval = previousInterval - (step * (numberOfPoints - 1));
    packedStrings.push([startInterval, new Buffer(currentString, 'binary')]);
  }
  packedBasePoint = new Buffer(pointSize);
  try {
    return fs.read(fd, packedBasePoint, 0, pointSize, archive.offset, function(err) {
      var baseInterval, baseValue, propagateLowerArchives, writePackedString, _ref;
      if (err) {
        cb(err);
      }
      _ref = pack.Unpack(pointFormat, packedBasePoint), baseInterval = _ref[0], baseValue = _ref[1];
      if (baseInterval === 0) {
        baseInterval = packedStrings[0][0];
      }
      writePackedString = function(ps, callback) {
        var archiveEnd, byteDistance, bytesBeyond, myOffset, packedString, pointDistance, timeDistance;
        interval = ps[0], packedString = ps[1];
        timeDistance = interval - baseInterval;
        pointDistance = timeDistance / step;
        byteDistance = pointDistance * pointSize;
        myOffset = archive.offset + byteDistance.mod(archive.size);
        archiveEnd = archive.offset + archive.size;
        bytesBeyond = (myOffset + packedString.length) - archiveEnd;
        if (bytesBeyond > 0) {
          return fs.write(fd, packedString, 0, packedString.length - bytesBeyond, myOffset, function(err) {
            if (err) {
              cb(err);
            }
            assert.equal(archiveEnd, myOffset + packedString.length - bytesBeyond);
            return fs.write(fd, packedString, packedString.length - bytesBeyond, bytesBeyond, archive.offset, function(err) {
              if (err) {
                cb(err);
              }
              return callback();
            });
          });
        } else {
          return fs.write(fd, packedString, 0, packedString.length, myOffset, function(err) {
            return callback();
          });
        }
      };
      propagateLowerArchives = function() {
        var arc, callPropagate, fit, higher, lower, lowerArchives, lowerIntervals, propagateCalls, uniqueLowerIntervals, _k, _l, _len2, _len3;
        higher = archive;
        lowerArchives = (function() {
          var _k, _len2, _ref1, _results;
          _ref1 = header.archives;
          _results = [];
          for (_k = 0, _len2 = _ref1.length; _k < _len2; _k++) {
            arc = _ref1[_k];
            if (arc.secondsPerPoint > archive.secondsPerPoint) {
              _results.push(arc);
            }
          }
          return _results;
        })();
        if (lowerArchives.length > 0) {
          propagateCalls = [];
          for (_k = 0, _len2 = lowerArchives.length; _k < _len2; _k++) {
            lower = lowerArchives[_k];
            fit = function(i) {
              return i - i.mod(lower.secondsPerPoint);
            };
            lowerIntervals = (function() {
              var _l, _len3, _results;
              _results = [];
              for (_l = 0, _len3 = alignedPoints.length; _l < _len3; _l++) {
                p = alignedPoints[_l];
                _results.push(fit(p[0]));
              }
              return _results;
            })();
            uniqueLowerIntervals = _.uniq(lowerIntervals);
            for (_l = 0, _len3 = uniqueLowerIntervals.length; _l < _len3; _l++) {
              interval = uniqueLowerIntervals[_l];
              propagateCalls.push({
                interval: interval,
                header: header,
                higher: higher,
                lower: lower
              });
            }
            higher = lower;
          }
          callPropagate = function(args, callback) {
            return propagate(fd, args.interval, args.header.xFilesFactor, args.higher, args.lower, function(err, result) {
              if (err) {
                cb(err);
              }
              return callback(err, result);
            });
          };
          return async.forEachSeries(propagateCalls, callPropagate, function(err, result) {
            if (err) {
              cb(err);
            }
            return cb(null);
          });
        } else {
          return cb(null);
        }
      };
      return async.forEachSeries(packedStrings, writePackedString, function(err) {
        if (err) {
          cb(err);
        }
        return propagateLowerArchives();
      });
    });
  } catch (err) {
    return cb(err);
  }
};

info = function(path, cb) {
  fs.readFile(path, function(err, data) {
    var archives, metadata;
    if (err) {
      cb(err);
    }
    archives = [];
    metadata = {};
    return Binary.parse(data).word32bu('lastUpdate').word32bu('maxRetention').buffer('xff', 4).word32bu('archiveCount').tap(function(vars) {
      var index, _i, _ref, _results;
      metadata = vars;
      metadata.xff = pack.Unpack('!f', vars.xff, 0)[0];
      this.flush();
      _results = [];
      for (index = _i = 0, _ref = metadata.archiveCount; 0 <= _ref ? _i < _ref : _i > _ref; index = 0 <= _ref ? ++_i : --_i) {
        this.word32bu('offset').word32bu('secondsPerPoint').word32bu('points');
        _results.push(this.tap(function(archive) {
          this.flush();
          archive.retention = archive.secondsPerPoint * archive.points;
          archive.size = archive.points * pointSize;
          return archives.push(archive);
        }));
      }
      return _results;
    }).tap(function() {
      return cb(null, {
        maxRetention: metadata.maxRetention,
        xFilesFactor: metadata.xff,
        archives: archives
      });
    });
  });
};

fetch = function(path, from, to, cb) {
  info(path, function(err, header) {
    var archive, diff, fd, file, fromInterval, now, oldestTime, toInterval, unpack, _i, _len, _ref;
    now = unixTime();
    oldestTime = now - header.maxRetention;
    if (from < oldestTime) {
      from = oldestTime;
    }
    if (!(from < to)) {
      cb(new Error('Invalid time interval'));
    }
    if (to > now || to < from) {
      to = now;
    }
    diff = now - from;
    fd = null;
    _ref = header.archives;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      archive = _ref[_i];
      if (archive.retention >= diff) {
        break;
      }
    }
    fromInterval = parseInt(from - from.mod(archive.secondsPerPoint)) + archive.secondsPerPoint;
    toInterval = parseInt(to - to.mod(archive.secondsPerPoint)) + archive.secondsPerPoint;
    file = fs.createReadStream(path);
    Binary.stream(file).skip(archive.offset).word32bu('baseInterval').word32bu('baseValue').tap(function(vars) {
      var fromOffset, getOffset, n, points, step, timeInfo, toOffset, values;
      if (vars.baseInterval === 0) {
        step = archive.secondsPerPoint;
        points = (toInterval - fromInterval) / step;
        timeInfo = [fromInterval, toInterval, step];
        values = (function() {
          var _j, _results;
          _results = [];
          for (n = _j = 0; 0 <= points ? _j < points : _j > points; n = 0 <= points ? ++_j : --_j) {
            _results.push(null);
          }
          return _results;
        })();
        return cb(null, timeInfo, values);
      } else {
        getOffset = function(interval) {
          var a, byteDistance, pointDistance, timeDistance;
          timeDistance = interval - vars.baseInterval;
          pointDistance = timeDistance / archive.secondsPerPoint;
          byteDistance = pointDistance * pointSize;
          a = archive.offset + byteDistance.mod(archive.size);
          return a;
        };
        fromOffset = getOffset(fromInterval);
        toOffset = getOffset(toInterval);
        return fs.open(path, 'r', function(err, fd) {
          var archiveEnd, seriesBuffer, size, size1, size2;
          if (err) {
            cb(err);
          }
          if (fromOffset < toOffset) {
            size = toOffset - fromOffset;
            seriesBuffer = new Buffer(size);
            try {
              return fs.read(fd, seriesBuffer, 0, size, fromOffset, function(err, num) {
                if (err) {
                  cb(err);
                }
                return fs.close(fd, function(err) {
                  if (err) {
                    cb(err);
                  }
                  return unpack(seriesBuffer);
                });
              });
            } catch (err) {
              return cb(err);
            }
          } else {
            archiveEnd = archive.offset + archive.size;
            size1 = archiveEnd - fromOffset;
            size2 = toOffset - archive.offset;
            seriesBuffer = new Buffer(size1 + size2);
            try {
              return fs.read(fd, seriesBuffer, 0, size1, fromOffset, function(err, num) {
                if (err) {
                  cb(err);
                }
                try {
                  return fs.read(fd, seriesBuffer, size1, size2, archive.offset, function(err, num) {
                    if (err) {
                      cb(err);
                    }
                    unpack(seriesBuffer);
                    return fs.close(fd);
                  });
                } catch (err) {
                  return cb(err);
                }
              });
            } catch (err) {
              return cb(err);
            }
          }
        });
      }
    });
    return unpack = function(seriesData) {
      var currentInterval, f, i, numPoints, pointTime, pointValue, seriesFormat, step, timeInfo, unpackedSeries, valueList, _j, _ref1;
      numPoints = seriesData.length / pointSize;
      seriesFormat = "!" + ((function() {
        var _j, _results;
        _results = [];
        for (f = _j = 0; 0 <= numPoints ? _j < numPoints : _j > numPoints; f = 0 <= numPoints ? ++_j : --_j) {
          _results.push('Ld');
        }
        return _results;
      })()).join("");
      unpackedSeries = pack.Unpack(seriesFormat, seriesData);
      valueList = (function() {
        var _j, _results;
        _results = [];
        for (f = _j = 0; 0 <= numPoints ? _j < numPoints : _j > numPoints; f = 0 <= numPoints ? ++_j : --_j) {
          _results.push(null);
        }
        return _results;
      })();
      currentInterval = fromInterval;
      step = archive.secondsPerPoint;
      for (i = _j = 0, _ref1 = unpackedSeries.length; _j < _ref1; i = _j += 2) {
        pointTime = unpackedSeries[i];
        if (pointTime === currentInterval) {
          pointValue = unpackedSeries[i + 1];
          valueList[i / 2] = pointValue;
        }
        currentInterval += step;
      }
      timeInfo = [fromInterval, toInterval, step];
      return cb(null, timeInfo, valueList);
    };
  });
};

exports.create = create;

exports.update = update;

exports.updateMany = updateMany;

exports.info = info;

exports.fetch = fetch;
