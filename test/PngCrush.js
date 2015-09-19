/*global describe, it, setTimeout, __dirname*/
var expect = require('unexpected').clone().use(require('unexpected-stream')),
    PngCrush = require('../lib/PngCrush'),
    Path = require('path'),
    fs = require('fs');

describe('PngCrush', function () {
    it('should produce a smaller file when run with -rem alla on a PNG with ancillary chunks', function () {
        return expect(
            fs.createReadStream(Path.resolve(__dirname, 'ancillaryChunks.png')),
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

        fs.createReadStream(Path.resolve(__dirname, 'ancillaryChunks.png')).pipe(pngCrush);

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
});
