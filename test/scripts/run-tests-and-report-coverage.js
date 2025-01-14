'use strict';

const Dotenv = require('dotenv');
const Path = require('node:path');
const ChildProcess = require('node:child_process');

Dotenv.config({ path: Path.join( __dirname, '../../.env' ) });

ChildProcess.exec( 'npm run test:coverage && nyc report --reporter=text-lcov | coveralls', ( error, stdout, stderr ) => {

    console.log( stdout );

    if (error) {
        console.log( stderr );
    }
});
