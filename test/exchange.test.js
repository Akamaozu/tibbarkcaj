'use strict';

require('dotenv').config();
const Assert = require('chai').assert;
const Amqp = require('amqplib/callback_api');
const Exchange = require('../lib/exchange');
const Sinon = require('sinon');
const { v4: Uuid } = require('uuid');

const { afterEach, beforeEach, describe, it } = require('mocha');

describe('exchange', () => {

    describe('constructor', () => {

        describe('with empty name (\'\') and direct type', () => {

            const e = Exchange('', 'direct');
            it('returns an exchange', () => {

                Assert.equal(e.name, '');
                Assert.equal(e.type, 'direct');
                Assert.ok(e.queue);
                Assert.ok(e.publish);
            });
        });

        describe('with no name', () => {

            describe('and a direct type', () => {

                const e = Exchange(undefined, 'direct');
                it('receives the default name amq.direct', () => {

                    Assert.equal(e.name, 'amq.direct');
                });
            });

            describe('and a fanout type', () => {

                const e = Exchange(undefined, 'fanout');
                it('receives the default name amq.fanout', () => {

                    Assert.equal(e.name, 'amq.fanout');
                });
            });

            describe('and a topic type', () => {

                const e = Exchange(undefined, 'topic');
                it('receives the default name amq.topic', () => {

                    Assert.equal(e.name, 'amq.topic');
                });
            });

            describe('and a headers type', () => {

                const e = Exchange(undefined, 'headers');
                it('receives the default name amq.headers', () => {

                    Assert.equal(e.name, 'amq.headers');
                });
            });

            describe('and no type', () => {

                it('throws an error', () => {

                    Assert.throws(Exchange.bind(this, undefined, undefined), 'missing exchange type');
                });
            });

            describe('and non-default (custom) type', () => {

                it('throws an error', () => {

                    Assert.throws(Exchange.bind(this, undefined, 'random'), 'missing exchange name');
                });
            });
        });
    });

    describe('#connect', () => {

        let connection;

        beforeEach((done) => {

            Amqp.connect(process.env.RABBIT_URL, (err, conn) => {

                Assert.ok(!err);
                connection = conn;
                done();
            });
        });

        afterEach((done) => {

            connection.close(done);
        });

        it('emits a "connected" event', (done) => {

            Exchange('', 'direct')
                .connect(connection)
                .once('connected', done);
        });

        const typeofExamplesMap = {
            string: {
                typeof: 'string',
                example: 'hello world',
            },
            number: {
                typeof: 'number',
                example: 100_000,
            },
            boolean: {
                typeof: 'boolean',
                example: true,
            },
            bigint: {
                typeof: 'bigint',
                example: 1n,
            },
            symbol: {
                typeof: 'symbol',
                example: Symbol(),
            },
            null: {
                typeof: 'null',
                example: null,
            },
            undefined: {
                typeof: 'undefined',
                example: undefined,
            },
            object: {
                typeof: 'object',
                example: { id: 'hello world' },
            },
            function: {
                typeof: 'function',
                example: () => 'hello world',
            },
        }

        const validTypeofExchangeNames = [ 'string' ]

        const typeofExampleKeys = Object.keys( typeofExamplesMap )

        const truthyTypeofExampleKeys = typeofExampleKeys.filter( key => {
            return (typeofExamplesMap[ key ].example && 'truthy') === 'truthy'
        })

        truthyTypeofExampleKeys.forEach( typeofKey => {
            if (validTypeofExchangeNames.indexOf( typeofKey ) === -1) {
                it(`closes exchange with TypeError if typeof exchange name is "${ typeofKey }"`, (done) => {
                    Exchange(typeofExamplesMap[ typeofKey ].example, 'direct')
                        .connect(connection)
                        .once('close', (error) => {
                            Assert(error instanceof TypeError, 'expected type error on Exchange close');
                            done();
                        });
                });
            }

            else {
                it(`emits a "ready" event if typeof exchange name is "${ typeofKey }"`, (done) => {
                    const exchangeName = typeofExamplesMap[ typeofKey ].example
                    const exchange = Exchange(exchangeName, 'direct')
                        .connect(connection)
                        .once('ready', () => {
                            const { channel } = exchange.getInternals()
                            channel.deleteExchange(exchangeName, {}, (error) => {
                                if (error) {
                                    console.log(`WARN: failed to delete exchange "${ exchangeName }" -- ${ error.stack ?? error.message ?? 'unspecified error' }`);
                                }

                                done();
                            });
                        });
                });
            }
        });
    });

    describe('#getWritableStream', () => {

        let connection;

        beforeEach((done) => {

            Amqp.connect(process.env.RABBIT_URL, (err, conn) => {

                Assert.ok(!err);
                connection = conn;
                done();
            });
        });

        afterEach((done) => {

            Sinon.restore();
            connection.close(done);
        });

        it('calls callback in nextTick if channel.publish returns true', async () => {

            const channel = await new Promise((resolve) => {

                connection.createChannel((_err, chan) => {

                    resolve(chan);
                });
            });

            Sinon.stub(channel, 'publish').returns(true);
            Sinon.stub(connection, 'createChannel').yields(null, channel);
            const clock = Sinon.useFakeTimers({
                now: 1483228800000,
                toFake: ['nextTick']
            });

            const exchange = Exchange('', 'direct').connect(connection);
            const stream = exchange.getWritableStream();
            const callbackSpy = Sinon.spy();

            stream.write({ key: 'key', headers: {}, data: {} }, '', callbackSpy);

            clock.runAll();
            Assert.isOk(callbackSpy.called);
        });

        it('waits for drain event if channel.publish returns false', async () => {

            const channel = await new Promise((resolve) => {

                connection.createChannel((_err, chan) => {

                    resolve(chan);
                });
            });

            Sinon.stub(channel, 'publish').returns(false);
            Sinon.stub(connection, 'createChannel').yields(null, channel);
            const clock = Sinon.useFakeTimers({
                now: 1483228800000,
                toFake: ['nextTick']
            });

            const exchange = Exchange('', 'direct').connect(connection);
            const stream = exchange.getWritableStream();
            const callbackSpy = Sinon.spy();

            stream.write({ key: 'key', headers: {}, data: {} }, '', callbackSpy);
            channel.emit('drain');

            clock.runAll();
            Assert.isOk(callbackSpy.called);
        });
    });

    describe('#queue', () => {

        let connection;

        beforeEach((done) => {

            Amqp.connect(process.env.RABBIT_URL, (err, conn) => {

                Assert.ok(!err);
                connection = conn;
                done();
            });
        });

        afterEach((done) => {

            connection.close(done);
        });

        describe('with no options', () => {

            it('returns a queue instance', (done) => {

                const queue = Exchange('', 'direct')
                    .connect(connection)
                    .queue({ exclusive: true });
                queue.on('connected', () => {

                    Assert.ok(queue.consume);
                    done();
                });
            });
        });

        describe('with key bindings', () => {

            it('does not create a reply queue by default', (done) => {

                const exchange = Exchange('test.topic.replyQueue', 'topic')
                    .connect(connection);

                exchange.on('ready', () => {

                    const channelWithReply = connection.connection.channels.filter((channel) => channel.channel.reply);
                    Assert.lengthOf(channelWithReply, 0);
                    done();
                });
            });

            it('creates a reply queue if configured', (done) => {

                const exchange = Exchange('test.topic.replyQueue', 'topic', { noReply: false })
                    .connect(connection);

                exchange.on('ready', () => {

                    const channelWithReply = connection.connection.channels.filter((channel) => channel.channel.reply);
                    Assert.lengthOf(channelWithReply, 1);
                    Assert.exists(channelWithReply[0].channel.reply);
                    done();
                });
            });

            it('emits a "bound" event when all routing keys have been bound to the queue', (done) => {

                const exchange = Exchange('test.topic.bindings', 'topic')
                    .connect(connection);

                const keys = 'abcdefghijklmnopqrstuvwxyz'.split('');
                const finalKey = keys[keys.length - 1];
                const message = Uuid();

                const queue = exchange.queue({ keys, exclusive: true });

                queue.consume((data, ack, nack, msg) => {

                    Assert.equal(message, data);
                    Assert.equal(msg.fields.routingKey, finalKey);
                    ack();
                    queue.cancel(done);
                });

                queue.once('bound', () => {

                    exchange.publish(message, { key: finalKey });
                });
            })
            .timeout( 10_000 );

            it('throws an error if rpcClient created with no replyQueue', () => {

                const exchange = Exchange('test.rpc', 'direct')
                    .connect(connection);

                Assert.throws(() => exchange.rpcClient('test', {}));
            });

            it('throws an error if rpcServer created with no replyQueue', () => {

                const exchange = Exchange('test.rpc', 'direct')
                    .connect(connection);

                Assert.throws(() => exchange.rpcServer('test', () => {}));
            });
        });
    });
});
