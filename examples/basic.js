const conveyor = require('../index');

(async () => {
    const c = conveyor.Client('localhost', 3000, false)

    console.log('Creating feed: /basic')
    await c.createFeed('/basic')
    
    const event1 = { type: 'basic', value: 42 }
    console.log(`Emitting event to /basic: ${JSON.stringify(event1)}`)
    await c.emitEvent('/basic', event1)

    console.log('Creating feed: /basic/sub-feed')
    await c.createFeed('/basic/sub-feed')

    const event2 = { type: 'basic', value: 17 }
    console.log(`Emitting event to /basic/sub-feed: ${JSON.stringify(event2)}`)
    await c.emitEvent('/basic/sub-feed', event2)

    console.log(`Getting events fom /basic`)
    const resp = await c.getEvents('/basic');
    console.log(JSON.stringify(resp.events, null, 3))
})();