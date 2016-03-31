/*global console*/
var childProcess = require('child_process'),
    Stream = require('stream').Stream,
    util = require('util'),
    which = require('which'),
    memoizeAsync = require('memoizeasync'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath');

function PngCrush(pngCrushArgs) {
    Stream.call(this);

    this.pngCrushArgs = pngCrushArgs || [];

    this.writable = true;
    this.readable = true;
    this.hasEnded = false;
}

util.inherits(PngCrush, Stream);

PngCrush.getBinaryPath = memoizeAsync(function (cb) {
    which('pngcrush', function (err, pngCrushBinaryPath) {
        if (err) {
            pngCrushBinaryPath = require('pngcrush-bin');
        }
        if (pngCrushBinaryPath) {
            cb(null, pngCrushBinaryPath);
        } else {
            cb(new Error('No pngcrush binary in PATH and pngcrush-bin does not provide a pre-built binary for your architecture'));
        }
    });
});

PngCrush.prototype._error = function (err) {
    if (!this.hasEnded) {
        this.hasEnded = true;
        this.cleanUp();
        this.emit('error', err);
    }
};

PngCrush.prototype.cleanUp = function () {
    if (this.readStream) {
        this.readStream.destroy();
        this.readStream = null;
    }
    if (this.writeStream) {
        this.writeStream.destroy();
        this.writeStream = null;
    }
    if (this.pngCrushProcess) {
        this.pngCrushProcess.kill();
        this.pngCrushProcess = null;
    }
    if (this.pngCrushOutputFilePath) {
        fs.unlink(this.pngCrushOutputFilePath, function () {});
        this.pngCrushOutputFilePath = null;
    }
    if (this.pngCrushInputFilePath) {
        fs.unlink(this.pngCrushInputFilePath, function () {});
        this.pngCrushInputFilePath = null;
    }
};

PngCrush.prototype.destroy = function () {
    this.cleanUp();
    this.hasEnded = true;
};

PngCrush.prototype.write = function (chunk) {
    if (this.hasEnded) {
        return;
    }
    if (!this.writeStream) {
        this.pngCrushInputFilePath = getTemporaryFilePath({suffix: '.png'});
        this.writeStream = fs.createWriteStream(this.pngCrushInputFilePath);
        this.writeStream.on('error', this._error.bind(this));
    }
    this.writeStream.write(chunk);
};

PngCrush.prototype.end = function (chunk) {
    if (this.hasEnded) {
        return;
    }
    if (chunk) {
        this.write(chunk);
    }
    this.writeStream.end();
    this.writable = false;
    this.writeStream.on('close', function () {
        PngCrush.getBinaryPath(function (err, pngCrushBinaryPath) {
            if (this.hasEnded) {
                return;
            }
            if (err) {
                return this._error(err);
            }
            this.pngCrushOutputFilePath = getTemporaryFilePath({suffix: '.png'});

            this.pngCrushArgs.push(this.pngCrushInputFilePath, this.pngCrushOutputFilePath);
            this.commandLine = pngCrushBinaryPath + (this.pngCrushArgs ? ' ' + this.pngCrushArgs.join(' ') : ''); // For debugging

            this.pngCrushProcess = childProcess.spawn(pngCrushBinaryPath, this.pngCrushArgs);
            var stdoutChunks = [];

            this.pngCrushProcess.stdout.on('data', function (chunk) {
                stdoutChunks.push(chunk);
            });

            this.pngCrushProcess.on('error', this._error.bind(this));

            this.pngCrushProcess.on('exit', function (exitCode) {
                this.pngCrushProcess = null;
                if (this.hasEnded) {
                    return;
                }
                if (exitCode > 0) {
                    return this._error(new Error('The pngcrush process exited with a non-zero exit code: ' + exitCode));
                }
                fs.unlink(this.pngCrushInputFilePath, function (err) {
                    if (err) {
                        console.error(err.stack);
                    }
                });
                this.pngCrushInputFilePath = null;
                fs.stat(this.pngCrushOutputFilePath, function (err, stats) {
                    if (err) {
                        return this._error(new Error('pngcrush did not write an output file, stdout output:\n' + Buffer.concat(stdoutChunks).toString('ascii')));
                    }
                    this.readStream = fs.createReadStream(this.pngCrushOutputFilePath);
                    if (this.isPaused) {
                        this.readStream.pause();
                    }
                    this.readStream.on('data', function (chunk) {
                        this.emit('data', chunk);
                    }.bind(this));
                    this.readStream.on('end', function () {
                        if (this.hasEnded) {
                            return;
                        }
                        this.hasEnded = true;
                        fs.unlink(this.pngCrushOutputFilePath, function (err) {
                            if (err) {
                                console.error(err.stack);
                            }
                        });
                        this.emit('end');
                    }.bind(this));
                }.bind(this));
            }.bind(this));
        }.bind(this));
    }.bind(this));
};

// Proxy pause and resume to the underlying readStream if it has been
// created, otherwise just keep track of the paused state:
PngCrush.prototype.pause = function () {
    this.isPaused = true;
    if (this.readStream) {
        this.readStream.pause();
    }
};

PngCrush.prototype.resume = function () {
    this.isPaused = false;
    if (this.readStream) {
        this.readStream.resume();
    }
};

module.exports = PngCrush;
