const request = require('request-promise')
const Trie = require('ds-trie')

const DEFAULT_MAX_EVENTS_PER_BATCH = 20

function* chunk(xs, batchSize) {
    const clone = array.slice(0)
    while (clone.length > 0) {
        yield clone.splice(0, size)
    }
}

function maybeStripSlash(feed) {
    return (feed.charAt(0) === '/') ? feed.substring(1) : feed
}

function feedUrl(baseUrl, feed) {
    return `${baseUrl}/feeds/${maybeStripSlash(feed)}`
}

function subscriberUrl(baseUrl, subscriberUrl) {
    return `${baseUrl}/subscribers/${encodeURIComponent(subscriberUrl)}`
}

function subscriptionsUrl(baseUrl, feed = null) {
    return feed ?
        `${baseUrl}/subscriptions/${maybeStripSlash(feed)}` :
        `${baseUrl}/subscriptions`
}

function eventsUrl(baseUrl, feed) {
    return `${baseUrl}/events/${maybeStripSlash(feed)}`
}

function transactionsUrl(baseUrl) {
    return `${baseUrl}/transactions`
}

function transactionActionsUrl(baseUrl, txId) {
    return `${baseUrl}/transactions/${txId}/actions`
}

function parseIdFromLocation(loc, asInt = false) {
    const lastSegmentStart = loc.lastIndexOf('/') + 1
    const id = loc.substring(lastSegmentStart)

    return asInt ? parseInt(id) : id
}

async function httpGet(uri) {
    return await request({
        uri,
        method: 'GET',
        json: true,
        headers: {
            'Accept': 'application/json'
        }
    })
}

function reqForMethod(method, uri, body, opts) {
    const req = Object.assign({
        uri,
        method,
        headers: {
            'Accept': 'application/json'
        }
    }, opts)

    if (body) {
        req.body = JSON.stringify(body)
        req.headers['Content-Type'] = 'application/json'
    }

    return req
}

async function httpPost(uri, body = null, opts = {}) {
    return await request(reqForMethod('POST', uri, body, opts))
}

async function httpDelete(uri, body = null, opts = {}) {
    return await request(reqForMethod('DELETE', uri, body, opts))
}

function connection(host, port, isSecure) {
    const proto = 'http' + (isSecure ? 's' : '')

    return {
        host, port, isSecure,
        baseUrl: `${proto}://${host}:${port}`,
        subscribers: new Trie(),
        webhookUrl: null,
        maxEventsPerBatch: DEFAULT_MAX_EVENTS_PER_BATCH
    }
}

async function getFeed(conn, feed) {
    return await httpGet(feedUrl(conn.baseUrl, feed))
}

async function getEvents(conn, feed) {
    return await httpGet(eventsUrl(conn.baseUrl, feed))
}

async function createFeed(conn, feed) {
    return await httpPost(feedUrl(conn.baseUrl, feed))
}

async function emitToSubscribers(conn, event) {
    const path = maybeStripSlash(event.feed).split('/')
    const subscribers = conn.subscribers.collect(path)
    await Promise.all(subscribers.map(callback => callback(event)))
}

async function getWebhookSubscriptions(conn, url) {
    try {
        return await httpGet(subscriberUrl(conn.baseUrl, url))
    } catch (e) {
        return []
    }
}

async function registerSubscriptionWebhook(conn, feed) {
    return await httpPost(subscriptionsUrl(conn.baseUrl, feed), { url: conn.webhookUrl })
}

async function cancelSubscriptionWebhook(conn, feed) {
    return await httpDelete(subscriptionsUrl(conn.baseUrl, feed), { url: conn.webhookUrl })
}

async function cancelAllSubscriptionWebhook(conn) {
    return await httpDelete(subscriptionsUrl(conn.baseUrl), { url: conn.webhookUrl })
}

async function subscribe(conn, feed, callback) {
    const path = maybeStripSlash(feed).split('/')

    if (conn.webhookUrl && !conn.subscribers.contains(path)) {
        await registerSubscriptionWebhook(conn, feed)
    }
    conn.subscribers.addElement(path, callback)
}

async function unsubscribe(conn, feed, callback) {
    const path = maybeStripSlash(feed).split('/')
    conn.subscribers.removeElement(path, callback)
    // Remove webhook subscription when last subscriber for that feed has been unsubscribed
    if (conn.webhookUrl) {
        const nodeForPath = conn.subscribers.walk(path)

        if (!nodeForPath || // All subscribers for this feed and all sub-feeds have been removed
            nodeForPath.elements.length === 0 // All subscribers for this feed have been removed, but subscribers still exist for sub-feeds
        ) {
            await cancelSubscriptionWebhook(conn, feed)
        }
    }
}

/**
 * Register a subscription registration implementation
 *
 * @param conn connection
 * @param impl {Function} Factory function that takes the following functions
 * as positional arguments:
 * - emitToSubscribers(event): Callback to call when a message is received
 * - cancelAllSubscriptionWebhook(): Callback to call on clean-up to re-register clean-up
 * and returns a WebHook postback URL
 */
async function registerSubscriptionImpl(conn, impl) {
    conn.webhookUrl = impl(emitToSubscribers.bind(null, conn), cancelAllSubscriptionWebhook.bind(null, conn))
    const registeredFeeds = new Set()
    for (let subscriber of conn.subscribers.entriesIter()) {
        const [path, callback] = subscriber
        const feed = path.join('/')
        
        if (!registeredFeeds.has(feed)) {
            registeredFeeds.add(feed)
            await registerSubscriptionWebhook(conn, feed)
        }
    }
}

async function emitEvent(conn, feed, event) {
    const reqBody = {
        data: event
    }

    if (conn.txId) {
        reqBody['tx-id'] = conn.txId
    }

    // TODO: Support feed auto-creation via a query parameter inside Conveyor
    // then remove the following call to createFeed
    await createFeed(conn, feed)
    return await httpPost(eventsUrl(conn.baseUrl, feed), reqBody)
}

async function withTransaction(conn, fn) {
    const txResp = await httpPost(
        transactionsUrl(conn.baseUrl),
        null,
        { resolveWithFullResponse: true })

    if (txResp.statusCode > 299) {
        throw new Error({
            message: 'Could not create transaction',
            data: txResp.body
        })
    }
    const txId = parseIdFromLocation(txResp.headers.location, true)
    let action = 'commit'
    try {
        await fn(Object.assign({ txId }, conn))
    } catch (e) {
        console.warn('Error in transaction. Rolling back.', e)
        action = 'rollback'
    }
    
    await httpPost(transactionActionsUrl(conn.baseUrl, txId), { action })
}

/**
 * Emit a batch of events as a single transaction
 *
 * @param {Connection} conn Conveyor connection
 * @param {array} events Array of objects with `feed` and `event` keys
 */
async function emitEvents(conn, events) {
    await withTransaction(conn, async (tx) => {
        for (let batch of chunk(events, conn.maxEventsPerBatch)) {
            await Promise.all(batch.map(async ({ feed, event }) => {
                if (typeof feed === 'undefined' || typeof event === 'undefined') {
                    throw new Error('Each element in a emitEvents array must have `feed` and `event` properties')
                }
                await emitEvent(tx, feed, event)
            }))
        }
    })
}

module.exports = {
    connection,
    createFeed,
    getFeed,
    subscribe,
    unsubscribe,
    registerSubscriptionImpl,
    getEvents,
    emitEvent,
    emitEvents,
    withTransaction
}