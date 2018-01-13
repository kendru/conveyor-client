const impl = require('./impl')

// Provide an object-oriented interface to the API
function Client(host, port, isSecure) {
    const conn = impl.connection(host, port, isSecure)

    return {
        getConnection: () => conn,
        createFeed: impl.createFeed.bind(null, conn),
        subscribe: impl.subscribe.bind(null, conn),
        unsubscribe: impl.unsubscribe.bind(null, conn),
        registerSubscriptionImpl: impl.registerSubscriptionImpl.bind(null, conn),
        getEvents: impl.getEvents.bind(null, conn),
        emitEvent: impl.emitEvent.bind(null, conn),
        withTransaction: impl.withTransaction.bind(null, conn)
    }
}

module.exports = Client