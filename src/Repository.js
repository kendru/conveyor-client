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

    get connection() {
        return this[connection_]
    }

    get name() {
        return this[name_]
    }

    get basePath() {
        return this[basePath_]
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

    async fetchAll(ModelClass) {
        const feed = await impl.getEvents(this[connection_], this[basePath_])
        const eventsById = feed.events.reduce((byId, evt) => {
            const path = evt.feed.split('/')
            const id = path[path.length - 1]
            
            if (!byId[id]) {
                byId[id] = new ModelClass()
            }
            byId[id].handle(evt.data)

            return byId;
        }, {})

        return Object.values(eventsById)
    }
}

module.exports = Repository