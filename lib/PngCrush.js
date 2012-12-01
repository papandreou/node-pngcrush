var childProcess = require('child_process'),
    Stream = require('stream').Stream,
    util = require('util'),
    fs = require('fs'),
    getTemporaryFilePath = require('gettemporaryfilepath');

function PngCrush(pngCrushArgs) {
    Stream.call(this);

    this.pngCrushArgs = pngCrushArgs || [];

    this.writable = this.readable = true;

    this.pngCrushInputFilePath = getTemporaryFilePath({suffix: '.png'});
    this.writeStream = fs.createWriteStream(this.pngCrushInputFilePath);
    this.writeStream.on('error', function (err) {
        this.emit('error', err);
    }.bind(this));
}

util.inherits(PngCrush, Stream);

PngCrush.prototype.write = function (chunk) {
    this.writeStream.write(chunk);
};

PngCrush.prototype.end = function (chunk) {
    if (chunk) {
        this.write(chunk);
    }
    this.writeStream.end();
    this.writable = false;
    this.writeStream.on('close', function () {
        var pngCrushOutputFilePath = getTemporaryFilePath({suffix: '.png'}),
            pngCrushProcess = childProcess.spawn('pngcrush', this.pngCrushArgs.concat(this.pngCrushInputFilePath, pngCrushOutputFilePath)),
            stdoutChunks = [];

        pngCrushProcess.stdout.on('data', function (chunk) {
            stdoutChunks.push(chunk);
        });

        pngCrushProcess.on('exit', function (exitCode) {
            if (exitCode > 0) {
                return this.emit('error', new Error('The pngcrush process exited with a non-zero exit code: ' + exitCode));
            }
            fs.unlink(this.pngCrushInputFilePath, function (err) {
                if (err) {
                    console.error(err.stack);
                }
            });
            fs.stat(pngCrushOutputFilePath, function (err, stats) {
                if (err) {
                    return this.emit('error', new Error('pngcrush did not write an output file, stdout output:\n' + Buffer.concat(stdoutChunks).toString('ascii')));
                }
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
