/*global describe, it, setTimeout, __dirname*/
var expect = require('unexpected').clone()
    .use(require('unexpected-stream'))
    .use(require('unexpected-sinon'));
var PngCrush = require('../lib/PngCrush');
var sinon = require('sinon');
var pathModule = require('path');
var fs = require('fs');

describe('PngCrush', function () {
    it('should produce a smaller file when run with -rem alla on a PNG with ancillary chunks', function () {
        return expect(
            fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')),
            'when piped through',
            new PngCrush(['-rem', 'alla']),
            'to yield output satisfying',
            function (resultPngBuffer) {
                expect(resultPngBuffer.length, 'to be within', 0, 3711);
            }
        );
    });

    it('should not emit data events while paused', function (done) {
        var pngCrush = new PngCrush(['-rem', 'alla']);

        function fail() {
            done(new Error('PngCrush emitted data while it was paused!'));
        }
        pngCrush.pause();
        pngCrush.on('data', fail).on('error', done);

        fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')).pipe(pngCrush);

        setTimeout(function () {
            pngCrush.removeListener('data', fail);
            var chunks = [];

            pngCrush
                .on('data', function (chunk) {
                    chunks.push(chunk);
                })
                .on('end', function () {
                    var resultPngBuffer = Buffer.concat(chunks);
                    expect(resultPngBuffer.length, 'to be within', 0, 3711);
                    done();
                });

            pngCrush.resume();
        }, 1000);
    });

    it('should emit an error if an invalid image is processed', function (done) {
        var pngCrush = new PngCrush();

        pngCrush.on('error', function (err) {
            done();
        }).on('data', function (chunk) {
            done(new Error('PngCrush emitted data when an error was expected'));
        }).on('end', function (chunk) {
            done(new Error('PngCrush emitted end when an error was expected'));
        });

        pngCrush.end(new Buffer('qwvopeqwovkqvwiejvq', 'utf-8'));
    });

    it('should emit a single error if an invalid command line is specified', function (done) {
        var pngCrush = new PngCrush(['-reduce', 'vqweqwvveqw']),
            seenError = false;

        pngCrush.on('error', function (err) {
            expect(pngCrush.commandLine, 'to match', /pngcrush -reduce vqweqwvveqw .*?\.png .*?\.png$/);
            if (seenError) {
                done(new Error('More than one error event was emitted'));
            } else {
                seenError = true;
                setTimeout(done, 100);
            }
        }).on('data', function (chunk) {
            done(new Error('PngCrush emitted data when an error was expected'));
        }).on('end', function (chunk) {
            done(new Error('PngCrush emitted end when an error was expected'));
        });

        pngCrush.end(new Buffer('qwvopeqwovkqvwiejvq', 'utf-8'));
    });

    describe('#destroy', function () {
        describe('when called before the fs.WriteStream is created', function () {
            it('should not create the fs.WriteStream or launch the pngcrush process', function () {
                var pngcrush = new PngCrush();
                fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')).pipe(pngcrush);
                pngcrush.destroy();
                return expect.promise(function (run) {
                    setTimeout(run(function () {
                        expect(pngcrush, 'to satisfy', {
                            writeStream: expect.it('to be falsy'),
                            pngcrushProcess: expect.it('to be falsy')
                        });
                    }), 10);
                });
            });
        });

        describe('when called while the fs.WriteStream is active', function () {
            it('should abort the fs.WriteStream and remove the temporary file', function () {
                var pngcrush = new PngCrush();
                fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')).pipe(pngcrush);

                return expect.promise(function (run) {
                    setTimeout(run(function waitForWriteStream() {
                        var writeStream = pngcrush.writeStream;
                        if (pngcrush.writeStream) {
                            pngcrush.destroy();
                            expect(pngcrush.writeStream, 'to be falsy');
                            sinon.spy(writeStream, 'end');
                            sinon.spy(writeStream, 'write');
                            setTimeout(run(function () {
                                expect([writeStream.end, writeStream.write], 'to have calls satisfying', []);
                            }), 10);
                        } else {
                            setTimeout(run(waitForWriteStream), 0);
                        }
                    }), 0);
                });
            });
        });

        describe('when called while the pngcrush process is running', function () {
            it('should kill the pngcrush process and remove the temporary file', function () {
                var pngCrush = new PngCrush();
                fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')).pipe(pngCrush);

                sinon.spy(fs, 'unlink');
                return expect.promise(function (run) {
                    setTimeout(run(function waitForPngCrushProcess() {
                        var pngCrushProcess = pngCrush.pngCrushProcess;
                        if (pngCrush.pngCrushProcess) {
                            sinon.spy(pngCrushProcess, 'kill');
                            var pngCrushInputFilePath = pngCrush.pngCrushInputFilePath;
                            var pngCrushOutputFilePath = pngCrush.pngCrushOutputFilePath;
                            expect(pngCrushInputFilePath, 'to be a string');
                            expect(pngCrushOutputFilePath, 'to be a string');
                            pngCrush.destroy();
                            expect([pngCrushProcess.kill, fs.unlink], 'to have calls satisfying', function () {
                                pngCrushProcess.kill();
                                fs.unlink(pngCrushOutputFilePath, expect.it('to be a function'));
                                fs.unlink(pngCrushInputFilePath, expect.it('to be a function'));
                            });
                            expect(pngCrush.pngCrushProcess, 'to be falsy');
                        } else {
                            setTimeout(run(waitForPngCrushProcess), 0);
                        }
                    }), 0);
                }).finally(function () {
                    fs.unlink.restore();
                });
            });
        });

        describe('when called while streaming from the temporary output file', function () {
            it('should kill the pngcrush process and remove the temporary output file', function () {
                var pngCrush = new PngCrush();
                fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')).pipe(pngCrush);
                pngCrush.pause();
                sinon.spy(fs, 'unlink');
                return expect.promise(function (run) {
                    setTimeout(run(function waitForReadStream() {
                        var readStream = pngCrush.readStream;
                        if (readStream) {
                            sinon.spy(readStream, 'destroy');
                            expect(pngCrush.pngCrushProcess, 'to be falsy');
                            expect(pngCrush.pngCrushInputFilePath, 'to be falsy');
                            var pngCrushOutputFilePath = pngCrush.pngCrushOutputFilePath;
                            expect(pngCrushOutputFilePath, 'to be a string');
                            pngCrush.destroy();
                            expect([fs.unlink, readStream.destroy], 'to have calls satisfying', function () {
                                fs.unlink(expect.it('to be a string'), expect.it('to be a function'));
                                readStream.destroy();
                                fs.unlink(pngCrushOutputFilePath, expect.it('to be a function'));
                            });
                        } else {
                            setTimeout(run(waitForReadStream), 0);
                        }
                    }), 0);
                }).finally(function () {
                    fs.unlink.restore();
                });
            });
        });
    });
});
