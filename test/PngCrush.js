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
});
