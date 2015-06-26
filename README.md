node-pngcrush
=============

[![NPM version](https://badge.fury.io/js/pngcrush.svg)](http://badge.fury.io/js/pngcrush)
[![Build Status](https://travis-ci.org/papandreou/node-pngcrush.svg?branch=master)](https://travis-ci.org/papandreou/node-pngcrush)
[![Coverage Status](https://coveralls.io/repos/papandreou/node-pngcrush/badge.svg)](https://coveralls.io/r/papandreou/node-pngcrush)
[![Dependency Status](https://david-dm.org/papandreou/node-pngcrush.svg)](https://david-dm.org/papandreou/node-pngcrush)

The pngcrush command line utility as a readable/writable stream. This
is handy for situations where you don't want to worry about writing
the input to disc and reading the output afterwards.

The constructor optionally takes an array of command line options for
the `pngcrush` binary:

```javascript
var PngCrush = require('pngcrush'),
    myCrusher = new PngCrush(['-res', 300, '-rle']);

sourceStream.pipe(myCrusher).pipe(destinationStream);
```

PngCrush as a web service (removes all ancillary chunks and does brute
force compression):

```javascript
var PngCrush = require('pngcrush'),
    http = require('http');

http.createServer(function (req, res) {
    if (req.headers['content-type'] === 'image/png') {
        res.writeHead(200, {'Content-Type': 'image/png'});
        req.pipe(new PngCrush(['-brute', '-rem', 'alla'])).pipe(res);
    } else {
        res.writeHead(400);
        res.end('Feed me a PNG!');
    }
}).listen(1337);
```

Installation
------------

Make sure you have node.js and npm installed, and that the `pngcrush` binary is in your PATH, then run:

    npm install pngcrush

License
-------

3-clause BSD license -- see the `LICENSE` file for details.
