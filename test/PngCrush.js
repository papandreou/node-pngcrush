const expect = require('unexpected')
  .clone()
  .use(require('unexpected-stream'))
  .use(require('unexpected-sinon'));
const PngCrush = require('../lib/PngCrush');
const sinon = require('sinon');
const pathModule = require('path');
const fs = require('fs');

describe('PngCrush', () => {
  it('should produce a smaller file when run with -rem alla on a PNG with ancillary chunks', () =>
    expect(
      fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')),
      'when piped through',
      new PngCrush(['-rem', 'alla']),
      'to yield output satisfying',
      expect.it((resultPngBuffer) => {
        expect(resultPngBuffer.length, 'to be within', 0, 3711);
      })
    ));

  it('should not emit data events while paused', (done) => {
    const pngCrush = new PngCrush(['-rem', 'alla']);

    function fail() {
      done(new Error('PngCrush emitted data while it was paused!'));
    }
    pngCrush.pause();
    pngCrush.on('data', fail).on('error', done);

    fs.createReadStream(
      pathModule.resolve(__dirname, 'ancillaryChunks.png')
    ).pipe(pngCrush);

    setTimeout(() => {
      pngCrush.removeListener('data', fail);
      const chunks = [];

      pngCrush
        .on('data', (chunk) => {
          chunks.push(chunk);
        })
        .on('end', () => {
          const resultPngBuffer = Buffer.concat(chunks);
          expect(resultPngBuffer.length, 'to be within', 0, 3711);
          done();
        });

      pngCrush.resume();
    }, 1000);
  });

  it('should emit an error if an invalid image is processed', (done) => {
    const pngCrush = new PngCrush();

    pngCrush
      .on('error', () => {
        done();
      })
      .on('data', (chunk) => {
        done(new Error('PngCrush emitted data when an error was expected'));
      })
      .on('end', (chunk) => {
        done(new Error('PngCrush emitted end when an error was expected'));
      });

    pngCrush.end(Buffer.from('qwvopeqwovkqvwiejvq', 'utf-8'));
  });

  it('should emit a single error if an invalid command line is specified', (done) => {
    const pngCrush = new PngCrush(['-reduce', 'vqweqwvveqw']);

    let seenError = false;

    pngCrush
      .on('error', () => {
        expect(
          pngCrush.commandLine,
          'to match',
          /pngcrush -reduce vqweqwvveqw .*?\.png .*?\.png$/
        );
        if (seenError) {
          done(new Error('More than one error event was emitted'));
        } else {
          seenError = true;
          setTimeout(done, 100);
        }
      })
      .on('data', (chunk) => {
        done(new Error('PngCrush emitted data when an error was expected'));
      })
      .on('end', (chunk) => {
        done(new Error('PngCrush emitted end when an error was expected'));
      });

    pngCrush.end(Buffer.from('qwvopeqwovkqvwiejvq', 'utf-8'));
  });

  it("should not mangle the caller's object", () => {
    const pngCrushArgs = ['-reduce', 'vqweqwvveqw'];

    return expect(
      fs.createReadStream(pathModule.resolve(__dirname, 'ancillaryChunks.png')),
      'when piped through',
      new PngCrush(pngCrushArgs),
      'to error with',
      new Error('The pngcrush process exited with a non-zero exit code: 1')
    ).then(() => {
      return expect(pngCrushArgs, 'to equal', ['-reduce', 'vqweqwvveqw']);
    });
  });

  describe('#destroy', () => {
    describe('when called before the fs.WriteStream is created', () => {
      it('should not create the fs.WriteStream or launch the pngcrush process', () => {
        const pngcrush = new PngCrush();
        fs.createReadStream(
          pathModule.resolve(__dirname, 'ancillaryChunks.png')
        ).pipe(pngcrush);
        pngcrush.destroy();
        return expect.promise((run) => {
          setTimeout(
            run(() => {
              expect(pngcrush, 'to satisfy', {
                writeStream: expect.it('to be falsy'),
                pngcrushProcess: expect.it('to be falsy'),
              });
            }),
            10
          );
        });
      });
    });

    describe('when called while the fs.WriteStream is active', () => {
      it('should abort the fs.WriteStream and remove the temporary file', () => {
        const pngcrush = new PngCrush();
        fs.createReadStream(
          pathModule.resolve(__dirname, 'ancillaryChunks.png')
        ).pipe(pngcrush);

        return expect.promise((run) => {
          setTimeout(
            run(function waitForWriteStream() {
              const writeStream = pngcrush.writeStream;
              if (pngcrush.writeStream) {
                pngcrush.destroy();
                expect(pngcrush.writeStream, 'to be falsy');
                sinon.spy(writeStream, 'end');
                sinon.spy(writeStream, 'write');
                setTimeout(
                  run(() => {
                    expect(
                      [writeStream.end, writeStream.write],
                      'to have calls satisfying',
                      []
                    );
                  }),
                  10
                );
              } else {
                setTimeout(run(waitForWriteStream), 0);
              }
            }),
            0
          );
        });
      });
    });

    describe('when called while the pngcrush process is running', () => {
      it('should kill the pngcrush process and remove the temporary file', () => {
        const pngCrush = new PngCrush();
        fs.createReadStream(
          pathModule.resolve(__dirname, 'ancillaryChunks.png')
        ).pipe(pngCrush);

        sinon.spy(fs, 'unlink');
        return expect
          .promise((run) => {
            setTimeout(
              run(function waitForPngCrushProcess() {
                const pngCrushProcess = pngCrush.pngCrushProcess;
                if (pngCrush.pngCrushProcess) {
                  sinon.spy(pngCrushProcess, 'kill');
                  const pngCrushInputFilePath = pngCrush.pngCrushInputFilePath;
                  const pngCrushOutputFilePath =
                    pngCrush.pngCrushOutputFilePath;
                  expect(pngCrushInputFilePath, 'to be a string');
                  expect(pngCrushOutputFilePath, 'to be a string');
                  pngCrush.destroy();
                  expect(
                    [pngCrushProcess.kill, fs.unlink],
                    'to have calls satisfying',
                    () => {
                      pngCrushProcess.kill();
                      fs.unlink(
                        pngCrushOutputFilePath,
                        expect.it('to be a function')
                      );
                      fs.unlink(
                        pngCrushInputFilePath,
                        expect.it('to be a function')
                      );
                    }
                  );
                  expect(pngCrush.pngCrushProcess, 'to be falsy');
                } else {
                  setTimeout(run(waitForPngCrushProcess), 0);
                }
              }),
              0
            );
          })
          .finally(() => {
            fs.unlink.restore();
          });
      });
    });

    describe('when called while streaming from the temporary output file', () => {
      it('should kill the pngcrush process and remove the temporary output file', () => {
        const pngCrush = new PngCrush();
        fs.createReadStream(
          pathModule.resolve(__dirname, 'ancillaryChunks.png')
        ).pipe(pngCrush);
        pngCrush.pause();
        sinon.spy(fs, 'unlink');
        return expect
          .promise((run) => {
            setTimeout(
              run(function waitForReadStream() {
                const readStream = pngCrush.readStream;
                if (readStream) {
                  sinon.spy(readStream, 'destroy');
                  expect(pngCrush.pngCrushProcess, 'to be falsy');
                  expect(pngCrush.pngCrushInputFilePath, 'to be falsy');
                  const pngCrushOutputFilePath =
                    pngCrush.pngCrushOutputFilePath;
                  expect(pngCrushOutputFilePath, 'to be a string');
                  pngCrush.destroy();
                  expect(
                    [fs.unlink, readStream.destroy],
                    'to have calls satisfying',
                    () => {
                      fs.unlink(
                        expect.it('to be a string'),
                        expect.it('to be a function')
                      );
                      readStream.destroy();
                      fs.unlink(
                        pngCrushOutputFilePath,
                        expect.it('to be a function')
                      );
                    }
                  );
                } else {
                  setTimeout(run(waitForReadStream), 0);
                }
              }),
              0
            );
          })
          .finally(() => {
            fs.unlink.restore();
          });
      });
    });
  });
});
