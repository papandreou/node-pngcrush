var expect = require('expect.js'),
    PngCrush = require('../lib/PngCrush'),
    Path = require('path'),
    fs = require('fs');

describe('PngCrush', function () {
    it('should produce a smaller file when run with -rem alla on a PNG with ancillary chunks', function (done) {
        var pngCrush = new PngCrush(['-rem', 'alla']),
            chunks = [];
        fs.createReadStream(Path.resolve(__dirname, 'ancillaryChunks.png'))
            .pipe(pngCrush)
            .on('data', function (chunk) {
                chunks.push(chunk);
            })
            .on('end', function () {
                var resultPngBuffer = Buffer.concat(chunks);
                expect(resultPngBuffer.length).to.be.greaterThan(0);
                expect(resultPngBuffer.length).to.be.lessThan(152);
                done();
            })
            .on('error', done);
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
                    expect(resultPngBuffer.length).to.be.greaterThan(0);
                    expect(resultPngBuffer.length).to.be.lessThan(152);
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
});
