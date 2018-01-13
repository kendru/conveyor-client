const impl = require('./impl')

const connection_ = Symbol('connection')
const name_ = Symbol('name')
const basePath_ = Symbol('base-path')

class Repository {

    constructor(connectionOrClient, name, basePath) {
        if (connectionOrClient.getConnection) {
            // is Client
            this[connection_] = connectionOrClient.getConnection()
        } else {
            // is connection
            this[connection_] = connectionOrClient
        }
        this[name_] = name
        this[basePath_] = basePath
    }

    feedPath(id) {
        return `${this[basePath_]}/${id}`
    }

    async save(model) {
        if (!model.id) throw new Error('Cannot save model without id')

        const { id, unsavedEvents } = model

        await impl.withTransaction(this[connection_], async (tx) => {
            for (let evt of unsavedEvents) {
                await impl.emitEvent(tx, this.feedPath(id), evt)
            }
            
            model.flushEvents()
        })
    }

    async fetch(id, ModelClass) {
        const feed = await impl.getEvents(this[connection_], this.feedPath(id))
        if (!feed.events.length) {
            return null
        }

        const events = feed.events.map(e => e.data)
        const model = new ModelClass()
        
        model.apply(events)

        return model
    }
}

module.exports = Repository