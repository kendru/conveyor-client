# Conveyor Client

This module provides a client to the [Conveyor event sourcing engine](https://gitlab.com/lambda-software-solutions/conveyor)'s
HTTP API. In order to use the subscriptions functionality, an adapter must
be used for your web framework of choice.

### Usage

```
const conveyor = require('../lib/index');

(async () => {
    const c = conveyor.Client('localhost', 3000, false)

    console.log('Creating feed: /basic')
    await c.createFeed('/basic')

    c.subscribe('/users', e => {
        console.log('I would be called if there was a subscription registration implementation')
    })
    
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
```