var childProcess = require('child_process'),
    Stream = require('stream').Stream,
    util = require('util'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath');

function PngCrush(pngCrushArgs) {
    Stream.call(this);

    this.pngCrushArgs = pngCrushArgs || [];

    this.writable = this.readable = true;
    this.incomingChunks = [];
}

util.inherits(PngCrush, Stream);

PngCrush.prototype.write = function (chunk) {
    this.incomingChunks.push(chunk);
};

PngCrush.prototype.end = function (chunk) {
    if (chunk) {
        this.write(chunk);
    }
    this.writable = false;
    var pngCrushInputFilePath = getTemporaryFilePath({suffix: '.png'});
    fs.writeFile(pngCrushInputFilePath, Buffer.concat(this.incomingChunks), function (err) {
        if (err) {
            this.emit(err);
        } else {
            var pngCrushOutputFilePath = getTemporaryFilePath({suffix: '.png'}),
                pngCrushProcess = childProcess.spawn('pngcrush', this.pngCrushArgs.concat(pngCrushInputFilePath, pngCrushOutputFilePath));
            pngCrushProcess.on('exit', function (exitCode) {
                fs.unlink(pngCrushInputFilePath, function (err) {
                    if (err) {
                        console.error(err.stack);
                    }
                });
                this.readStream = fs.createReadStream(pngCrushOutputFilePath);
                if (this.isPaused) {
                    this.readStream.pause();
                }
                this.readStream.on('data', function (chunk) {
                    this.emit('data', chunk);
                }.bind(this));
                this.readStream.on('end', function () {
                    fs.unlink(pngCrushOutputFilePath, function (err) {
                        if (err) {
                            console.error(err.stack);
                        }
                    });
                    this.emit('end');
                }.bind(this));
            }.bind(this));
        }
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
